require('dotenv').config();

const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');

const app = express();

const NODE_ENV = String(process.env.NODE_ENV || 'development').trim();
const IS_PRODUCTION = NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 8787;
const APP_ORIGIN = String(process.env.APP_ORIGIN || '').trim();
const ALLOWED_ORIGINS_RAW = String(process.env.ALLOWED_ORIGINS || '').trim();
const ALLOWED_ORIGINS = (
  ALLOWED_ORIGINS_RAW
    ? ALLOWED_ORIGINS_RAW.split(',').map((item) => item.trim()).filter(Boolean)
    : [APP_ORIGIN || 'http://localhost:5173']
);
const ALLOWED_ORIGIN_SET = new Set(ALLOWED_ORIGINS);

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'library.json');
const LEGACY_USERS_FILE = path.join(DATA_DIR, 'users.json');
const WRITE_JSON_SPACES = 2;
const EMPTY_LIBRARY = {
  version: 1,
  animeList: [],
  bookmarkList: [],
  updatedAt: null,
};

const nowIso = () => new Date().toISOString();

const logInfo = (event, payload = {}) => {
  console.log(`[library-server] ${event} ${JSON.stringify(payload)}`);
};

const logError = (event, error, payload = {}) => {
  const message = String(error?.message || error || 'unknown error');
  console.error(`[library-server] ${event} ${message}`, payload);
  if (!IS_PRODUCTION && error?.stack) {
    console.error(error.stack);
  }
};

const parseOriginFromReferer = (referer) => {
  if (!referer) return '';
  try {
    return new URL(referer).origin;
  } catch (_) {
    return '';
  }
};

const sanitizeAnimeCollection = (list) => {
  if (!Array.isArray(list)) return [];
  const unique = new Set();
  const output = [];

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const id = Number(item.id);
    if (!Number.isFinite(id) || unique.has(id)) continue;
    unique.add(id);
    output.push({ ...item, id });
    if (output.length >= 5000) break;
  }

  return output;
};

const normalizeLibraryPayload = (animeList, bookmarkList) => {
  const safeAnimeList = sanitizeAnimeCollection(animeList);
  const watchedIds = new Set(safeAnimeList.map((item) => item.id));
  const safeBookmarkList = sanitizeAnimeCollection(bookmarkList)
    .filter((item) => !watchedIds.has(item.id));
  return { animeList: safeAnimeList, bookmarkList: safeBookmarkList };
};

const pickNewestLegacyRecord = (users) => {
  const records = Object.values(users || {}).filter((record) => record && typeof record === 'object');
  if (records.length === 0) return null;

  const toTime = (value) => {
    if (typeof value !== 'string' || !value.trim()) return 0;
    const time = Date.parse(value);
    return Number.isNaN(time) ? 0 : time;
  };

  let selected = null;
  let selectedTime = 0;
  for (const record of records) {
    const currentTime = Math.max(
      toTime(record.updatedAt),
      toTime(record.cloudInitializedAt),
      toTime(record.lastLoginAt)
    );
    const hasData = (Array.isArray(record.animeList) && record.animeList.length > 0)
      || (Array.isArray(record.bookmarkList) && record.bookmarkList.length > 0);
    if (!hasData) continue;

    if (!selected || currentTime >= selectedTime) {
      selected = record;
      selectedTime = currentTime;
    }
  }

  return selected;
};

const readLegacyLibraryStore = async () => {
  try {
    const raw = await fs.readFile(LEGACY_USERS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.users || typeof parsed.users !== 'object') {
      return null;
    }

    const latestRecord = pickNewestLegacyRecord(parsed.users);
    if (!latestRecord) return null;

    const normalized = normalizeLibraryPayload(latestRecord.animeList, latestRecord.bookmarkList);
    if (normalized.animeList.length === 0 && normalized.bookmarkList.length === 0) {
      return null;
    }

    return {
      animeList: normalized.animeList,
      bookmarkList: normalized.bookmarkList,
      updatedAt: typeof latestRecord.updatedAt === 'string' ? latestRecord.updatedAt : nowIso(),
    };
  } catch (_) {
    return null;
  }
};

const ensureDataFile = async () => {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch (_) {
    await fs.writeFile(DATA_FILE, JSON.stringify(EMPTY_LIBRARY, null, WRITE_JSON_SPACES), 'utf8');
  }
};

const readLibraryStore = async () => {
  await ensureDataFile();
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...EMPTY_LIBRARY };

    const normalizedStore = {
      version: Number(parsed.version) || 1,
      animeList: sanitizeAnimeCollection(parsed.animeList),
      bookmarkList: sanitizeAnimeCollection(parsed.bookmarkList),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
    };

    const hasLibraryData = normalizedStore.animeList.length > 0 || normalizedStore.bookmarkList.length > 0;
    if (!hasLibraryData) {
      const legacy = await readLegacyLibraryStore();
      if (legacy) {
        const migrated = {
          ...normalizedStore,
          animeList: legacy.animeList,
          bookmarkList: legacy.bookmarkList,
          updatedAt: legacy.updatedAt,
        };
        await writeLibraryStore(migrated);
        logInfo('legacy_migrated', {
          animeCount: migrated.animeList.length,
          bookmarkCount: migrated.bookmarkList.length,
        });
        return migrated;
      }
    }

    return normalizedStore;
  } catch (_) {
    return { ...EMPTY_LIBRARY };
  }
};

const writeLibraryStore = async (store) => {
  await ensureDataFile();
  await fs.writeFile(DATA_FILE, JSON.stringify(store, null, WRITE_JSON_SPACES), 'utf8');
};

let mutationQueue = Promise.resolve();
const mutateStore = (mutator) => {
  const operation = mutationQueue.then(async () => {
    const store = await readLibraryStore();
    const result = await mutator(store);
    await writeLibraryStore(store);
    return result;
  });
  mutationQueue = operation.then(() => undefined, () => undefined);
  return operation;
};

app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  const origin = String(req.headers.origin || '').trim();
  if (origin && ALLOWED_ORIGIN_SET.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');
  }

  if (req.method === 'OPTIONS') {
    if (origin && !ALLOWED_ORIGIN_SET.has(origin)) {
      res.status(403).json({ error: 'Origin not allowed.', code: 'CORS_ORIGIN_DENIED' });
      return;
    }
    res.sendStatus(204);
    return;
  }
  next();
});

const STATE_CHANGING_METHODS = new Set(['PUT']);
app.use((req, res, next) => {
  if (!STATE_CHANGING_METHODS.has(req.method)) {
    next();
    return;
  }

  const origin = String(req.headers.origin || '').trim();
  const refererOrigin = parseOriginFromReferer(String(req.headers.referer || ''));
  const allowed = (
    (origin && ALLOWED_ORIGIN_SET.has(origin))
    || (refererOrigin && ALLOWED_ORIGIN_SET.has(refererOrigin))
  );

  if (allowed) {
    next();
    return;
  }

  if (!IS_PRODUCTION && !origin && !refererOrigin) {
    next();
    return;
  }

  res.status(403).json({ error: 'CSRF validation failed.', code: 'CSRF_ORIGIN_MISMATCH' });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, at: nowIso() });
});

app.get('/api/library', async (_req, res, next) => {
  try {
    const store = await readLibraryStore();
    res.json({
      animeList: store.animeList,
      bookmarkList: store.bookmarkList,
      updatedAt: store.updatedAt,
    });
  } catch (error) {
    next(error);
  }
});

app.put('/api/library', async (req, res, next) => {
  try {
    const animeList = req.body?.animeList;
    const bookmarkList = req.body?.bookmarkList;
    const now = nowIso();

    const result = await mutateStore((store) => {
      const normalized = normalizeLibraryPayload(animeList, bookmarkList);
      store.animeList = normalized.animeList;
      store.bookmarkList = normalized.bookmarkList;
      store.updatedAt = now;
      return {
        animeList: store.animeList,
        bookmarkList: store.bookmarkList,
        updatedAt: store.updatedAt,
      };
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  logError('api_unhandled_error', error);
  const message = error?.message || 'Unexpected server error.';
  res.status(500).json({
    error: IS_PRODUCTION ? 'Unexpected server error.' : message,
    code: 'UNEXPECTED_SERVER_ERROR',
    ...(IS_PRODUCTION ? {} : { detail: String(error?.stack || message) }),
  });
});

app.listen(PORT, () => {
  logInfo('listening', {
    port: PORT,
    nodeEnv: NODE_ENV,
    allowedOrigins: ALLOWED_ORIGINS,
    dataFile: DATA_FILE,
  });
});
