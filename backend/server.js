require('dotenv').config();

const path = require('node:path');
const express = require('express');
const { createLibraryStore } = require('./libraryStore');

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
const libraryStore = createLibraryStore({
  dataDir: DATA_DIR,
  dataFile: path.join(DATA_DIR, 'library.json'),
  legacyUsersFile: path.join(DATA_DIR, 'users.json'),
  onLegacyMigrated: (payload) => {
    logInfo('legacy_migrated', payload);
  },
});

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
    const store = await libraryStore.readLibraryStore();
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

    const result = await libraryStore.mutateStore((store) => {
      const normalized = libraryStore.normalizeLibraryPayload(animeList, bookmarkList);
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
    dataFile: libraryStore.dataFile,
  });
});
