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
const ALLOWED_SHARE_IMAGE_HOST_SUFFIXES = ['.anilist.co', '.anili.st'];
const ANILIST_GRAPHQL_ENDPOINT = 'https://graphql.anilist.co';
const JIKAN_ANIME_SEARCH_ENDPOINT = 'https://api.jikan.moe/v4/anime';
const ANILIST_RATE_LIMIT_HEADERS = [
  'retry-after',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
  'x-ratelimit-reset-after',
];
const JIKAN_RATE_LIMIT_HEADERS = [
  'retry-after',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
];

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

const parseAllowedShareImageUrl = (rawUrl) => {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(String(rawUrl));
    const { protocol, hostname } = parsed;
    const normalizedHost = String(hostname || '').toLowerCase();
    if (!['https:', 'http:'].includes(protocol)) return null;
    const isAllowedHost = normalizedHost === 'anilist.co'
      || normalizedHost === 'anili.st'
      || ALLOWED_SHARE_IMAGE_HOST_SUFFIXES.some((suffix) => normalizedHost.endsWith(suffix));
    if (!isAllowedHost) return null;
    return parsed;
  } catch (_) {
    return null;
  }
};

const buildJikanAnimeSearchUrl = (rawQuery, rawLimit) => {
  const query = String(rawQuery || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!query || query.length > 160) return null;
  const limit = Math.max(1, Math.min(24, Number(rawLimit) || 12));
  const params = new URLSearchParams();
  params.set('q', query);
  params.set('limit', String(limit));
  params.set('sfw', 'true');
  return `${JIKAN_ANIME_SEARCH_ENDPOINT}?${params.toString()}`;
};

const forwardResponseHeaders = (source, target, headerNames) => {
  headerNames.forEach((name) => {
    const value = source.headers.get(name);
    if (value) target.setHeader(name, value);
  });
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

app.get('/api/jikan-anime-search', async (req, res) => {
  const targetUrl = buildJikanAnimeSearchUrl(req.query?.q, req.query?.limit);
  if (!targetUrl) {
    res.status(400).json({ error: 'Search query is required.', code: 'JIKAN_QUERY_REQUIRED' });
    return;
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'AniTriggerJikanProxy/1.0',
      },
    });

    const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
    forwardResponseHeaders(upstream, res, JIKAN_RATE_LIMIT_HEADERS);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.status(upstream.status).send(await upstream.text());
  } catch (error) {
    logError('jikan_proxy_failed', error);
    res.status(502).json({
      error: 'Jikan request failed.',
      code: 'JIKAN_PROXY_FAILED',
      detail: String(error?.message || error || 'unknown error'),
    });
  }
});

app.post(['/anilist', '/anilist/'], async (req, res, next) => {
  if (!req.body || typeof req.body !== 'object') {
    res.status(400).json({ error: 'GraphQL request body is required.', code: 'ANILIST_BODY_REQUIRED' });
    return;
  }

  try {
    const upstream = await fetch(ANILIST_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'AniTriggerAniListProxy/1.0',
      },
      body: JSON.stringify(req.body),
    });

    const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
    forwardResponseHeaders(upstream, res, ANILIST_RATE_LIMIT_HEADERS);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.status(upstream.status).send(await upstream.text());
  } catch (error) {
    logError('anilist_proxy_failed', error);
    res.status(502).json({
      error: 'AniList request failed.',
      code: 'ANILIST_PROXY_FAILED',
      detail: String(error?.message || error || 'unknown error'),
    });
  }
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

app.get('/api/share-image-proxy', async (req, res, next) => {
  const targetUrl = parseAllowedShareImageUrl(req.query?.url);
  if (!targetUrl) {
    res.status(400).json({ error: 'Invalid share image url.', code: 'INVALID_SHARE_IMAGE_URL' });
    return;
  }

  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'User-Agent': 'AniTriggerShareImageProxy/1.0',
        Referer: 'https://anilist.co/',
      },
    });

    if (!upstream.ok) {
      res.status(502).json({
        error: `Upstream image request failed (${upstream.status}).`,
        code: 'SHARE_IMAGE_UPSTREAM_FAILED',
      });
      return;
    }

    const contentType = String(upstream.headers.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('image/')) {
      res.status(415).json({
        error: 'Upstream response was not an image.',
        code: 'SHARE_IMAGE_INVALID_CONTENT_TYPE',
      });
      return;
    }

    const cacheControl = String(upstream.headers.get('cache-control') || '').trim();
    const buffer = Buffer.from(await upstream.arrayBuffer());

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', cacheControl || 'public, max-age=86400');
    res.send(buffer);
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
