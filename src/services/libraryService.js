const resolveApiBase = () => {
  const raw = String(import.meta.env?.VITE_API_BASE_URL || '/api').trim();
  if (!raw) return '/api';
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
};

const API_BASE = resolveApiBase();
const IS_DEV = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV);

const joinApiPath = (path) => `${API_BASE}${path}`;

const sanitizeCollection = (list) => {
  if (!Array.isArray(list)) return [];
  const uniqueIds = new Set();
  const safe = [];

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const numericId = Number(item.id);
    if (!Number.isFinite(numericId) || uniqueIds.has(numericId)) continue;
    uniqueIds.add(numericId);
    safe.push({ ...item, id: numericId });
    if (safe.length >= 5000) break;
  }

  return safe;
};

const requestJson = async (path, options = {}) => {
  let response;
  try {
    response = await fetch(joinApiPath(path), {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    });
  } catch (networkError) {
    const error = new Error('保存サーバーに接続できませんでした。');
    error.code = 'LIBRARY_API_UNREACHABLE';
    error.cause = networkError;
    throw error;
  }

  let payload = null;
  let rawText = '';
  try {
    payload = await response.json();
  } catch (_) {
    try {
      rawText = await response.text();
    } catch (_) {
      rawText = '';
    }
  }

  if (!response.ok) {
    const message = payload?.error || `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.code = payload?.code || '';
    if (IS_DEV) {
      error.debugDetail = payload?.detail || rawText || '';
    }
    throw error;
  }

  return payload || {};
};

export const fetchLibrarySnapshot = async () => {
  const payload = await requestJson('/library', { method: 'GET' });
  return {
    animeList: sanitizeCollection(payload?.animeList),
    bookmarkList: sanitizeCollection(payload?.bookmarkList),
    updatedAt: payload?.updatedAt || null,
  };
};

export const saveLibrarySnapshot = async ({ animeList, bookmarkList }) => {
  const payload = await requestJson('/library', {
    method: 'PUT',
    body: JSON.stringify({
      animeList: sanitizeCollection(animeList),
      bookmarkList: sanitizeCollection(bookmarkList),
    }),
  });

  return {
    animeList: sanitizeCollection(payload?.animeList),
    bookmarkList: sanitizeCollection(payload?.bookmarkList),
    updatedAt: payload?.updatedAt || null,
  };
};
