const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const { OAuth2Client } = require('google-auth-library');

const app = express();

const PORT = Number(process.env.PORT) || 8787;
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';
const APP_ORIGIN = String(process.env.APP_ORIGIN || '').trim();
const GOOGLE_CLIENT_ID = String(process.env.GOOGLE_CLIENT_ID || '').trim();
const SESSION_COOKIE_NAME = 'anitrigger.sid';
const SESSION_SECRET = String(process.env.SESSION_SECRET || '').trim() || 'replace-this-dev-secret';

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'users.json');
const EMPTY_STORE = { version: 1, users: {} };
const WRITE_JSON_SPACES = 2;

if (IS_PRODUCTION && SESSION_SECRET === 'replace-this-dev-secret') {
  throw new Error('SESSION_SECRET must be configured in production.');
}

const oauthClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(session({
  name: SESSION_COOKIE_NAME,
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PRODUCTION,
    maxAge: 1000 * 60 * 60 * 24 * 14,
  },
}));

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
app.use((req, res, next) => {
  if (!STATE_CHANGING_METHODS.has(req.method)) {
    next();
    return;
  }

  if (!APP_ORIGIN) {
    next();
    return;
  }

  const origin = String(req.headers.origin || '');
  if (!origin || origin === APP_ORIGIN) {
    next();
    return;
  }

  res.status(403).json({ error: 'Origin not allowed.' });
});

const toPublicUser = (record = {}) => ({
  sub: String(record.sub || ''),
  name: String(record.name || ''),
  email: String(record.email || ''),
  picture: String(record.picture || ''),
});

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

const ensureDataFile = async () => {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch (_) {
    await fs.writeFile(DATA_FILE, JSON.stringify(EMPTY_STORE, null, WRITE_JSON_SPACES), 'utf8');
  }
};

const readStore = async () => {
  await ensureDataFile();
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...EMPTY_STORE };
    if (!parsed.users || typeof parsed.users !== 'object') {
      parsed.users = {};
    }
    return parsed;
  } catch (_) {
    return { ...EMPTY_STORE, users: {} };
  }
};

const writeStore = async (store) => {
  await ensureDataFile();
  await fs.writeFile(DATA_FILE, JSON.stringify(store, null, WRITE_JSON_SPACES), 'utf8');
};

let mutationQueue = Promise.resolve();
const mutateStore = (mutator) => {
  const operation = mutationQueue.then(async () => {
    const store = await readStore();
    const result = await mutator(store);
    await writeStore(store);
    return result;
  });
  mutationQueue = operation.then(() => undefined, () => undefined);
  return operation;
};

const ensureUserRecord = (store, user) => {
  const sub = String(user?.sub || '');
  if (!sub) return null;

  if (!store.users[sub]) {
    store.users[sub] = {
      profile: toPublicUser(user),
      animeList: [],
      bookmarkList: [],
      cloudInitializedAt: null,
      updatedAt: null,
      lastLoginAt: null,
    };
  }

  const record = store.users[sub];
  record.profile = toPublicUser({
    ...record.profile,
    ...user,
  });
  return record;
};

const requireAuth = (req, res, next) => {
  if (!req.session?.user?.sub) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
};

const regenerateSession = (req) => new Promise((resolve, reject) => {
  req.session.regenerate((error) => {
    if (error) reject(error);
    else resolve();
  });
});

const saveSession = (req) => new Promise((resolve, reject) => {
  req.session.save((error) => {
    if (error) reject(error);
    else resolve();
  });
});

const destroySession = (req) => new Promise((resolve) => {
  req.session.destroy(() => resolve());
});

const verifyGoogleIdToken = async (credential) => {
  if (!oauthClient || !GOOGLE_CLIENT_ID) {
    throw new Error('Google login is not configured.');
  }

  const ticket = await oauthClient.verifyIdToken({
    idToken: credential,
    audience: GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();

  if (!payload?.sub) {
    throw new Error('Invalid Google token.');
  }

  return {
    sub: payload.sub,
    name: String(payload.name || ''),
    email: String(payload.email || ''),
    picture: String(payload.picture || ''),
  };
};

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/auth/config', (_req, res) => {
  res.json({
    enabled: Boolean(GOOGLE_CLIENT_ID),
    clientId: GOOGLE_CLIENT_ID || '',
    reason: GOOGLE_CLIENT_ID ? '' : 'GOOGLE_CLIENT_ID is not configured.',
  });
});

app.get('/api/auth/session', (req, res) => {
  if (!req.session?.user?.sub) {
    res.json({ authenticated: false, user: null });
    return;
  }

  res.json({
    authenticated: true,
    user: toPublicUser(req.session.user),
  });
});

app.post('/api/auth/google', async (req, res) => {
  try {
    const credential = String(req.body?.credential || '').trim();
    if (!credential) {
      res.status(400).json({ error: 'Credential is required.', code: 'MISSING_CREDENTIAL' });
      return;
    }

    const user = await verifyGoogleIdToken(credential);
    await regenerateSession(req);
    req.session.user = toPublicUser(user);
    await saveSession(req);

    await mutateStore((store) => {
      const record = ensureUserRecord(store, user);
      if (!record) return;
      record.lastLoginAt = new Date().toISOString();
    });

    res.json({
      authenticated: true,
      user: toPublicUser(user),
    });
  } catch (error) {
    const rawMessage = String(error?.message || '');
    const isNotConfigured = rawMessage.toLowerCase().includes('not configured');
    const isTokenError = rawMessage.toLowerCase().includes('token') || rawMessage.toLowerCase().includes('jwt');
    const status = isNotConfigured ? 503 : 401;
    const code = isNotConfigured ? 'AUTH_NOT_CONFIGURED' : (isTokenError ? 'TOKEN_VERIFICATION_FAILED' : 'GOOGLE_AUTH_FAILED');
    const errorMessage = isNotConfigured
      ? 'Google login is not configured.'
      : 'Google login failed.';

    res.status(status).json({
      error: errorMessage,
      code,
      ...(IS_PRODUCTION ? {} : { detail: rawMessage }),
    });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  await destroySession(req);
  res.clearCookie(SESSION_COOKIE_NAME);
  res.json({ success: true });
});

app.get('/api/user/data', requireAuth, async (req, res) => {
  const sub = String(req.session.user.sub);
  const store = await readStore();
  const record = ensureUserRecord(store, req.session.user);
  const userRecord = record || store.users[sub];

  res.json({
    animeList: Array.isArray(userRecord?.animeList) ? userRecord.animeList : [],
    bookmarkList: Array.isArray(userRecord?.bookmarkList) ? userRecord.bookmarkList : [],
    cloudInitializedAt: userRecord?.cloudInitializedAt || null,
    updatedAt: userRecord?.updatedAt || null,
  });
});

app.post('/api/user/sync', requireAuth, async (req, res) => {
  const user = toPublicUser(req.session.user);
  const localAnimeList = req.body?.localAnimeList;
  const localBookmarkList = req.body?.localBookmarkList;
  const now = new Date().toISOString();

  const syncResult = await mutateStore((store) => {
    const record = ensureUserRecord(store, user);
    if (!record) {
      return {
        strategy: 'cloud_to_local',
        data: { animeList: [], bookmarkList: [] },
      };
    }

    let strategy = 'cloud_to_local';
    if (!record.cloudInitializedAt) {
      const initialized = normalizeLibraryPayload(localAnimeList, localBookmarkList);
      record.animeList = initialized.animeList;
      record.bookmarkList = initialized.bookmarkList;
      record.cloudInitializedAt = now;
      record.updatedAt = now;
      strategy = 'local_to_cloud';
    }

    return {
      strategy,
      data: {
        animeList: Array.isArray(record.animeList) ? record.animeList : [],
        bookmarkList: Array.isArray(record.bookmarkList) ? record.bookmarkList : [],
      },
      cloudInitializedAt: record.cloudInitializedAt || null,
      updatedAt: record.updatedAt || null,
    };
  });

  res.json(syncResult);
});

app.put('/api/user/data', requireAuth, async (req, res) => {
  const user = toPublicUser(req.session.user);
  const now = new Date().toISOString();
  const animeList = req.body?.animeList;
  const bookmarkList = req.body?.bookmarkList;

  const saveResult = await mutateStore((store) => {
    const record = ensureUserRecord(store, user);
    if (!record) {
      return {
        animeList: [],
        bookmarkList: [],
        cloudInitializedAt: null,
        updatedAt: null,
      };
    }

    const normalized = normalizeLibraryPayload(animeList, bookmarkList);
    record.animeList = normalized.animeList;
    record.bookmarkList = normalized.bookmarkList;
    if (!record.cloudInitializedAt) {
      record.cloudInitializedAt = now;
    }
    record.updatedAt = now;

    return {
      animeList: record.animeList,
      bookmarkList: record.bookmarkList,
      cloudInitializedAt: record.cloudInitializedAt,
      updatedAt: record.updatedAt,
    };
  });

  res.json(saveResult);
});

app.use((error, _req, res, _next) => {
  console.error('[api-error]', error);
  const message = error?.message || 'Unexpected server error.';
  res.status(500).json({
    error: IS_PRODUCTION ? 'Unexpected server error.' : message,
    code: 'UNEXPECTED_SERVER_ERROR',
    ...(IS_PRODUCTION ? {} : { detail: String(error?.stack || message) }),
  });
});

app.listen(PORT, () => {
  console.log(`[auth-server] listening on http://localhost:${PORT}`);
});
