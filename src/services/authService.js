const API_BASE = '/api';
const IS_DEV = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV);

const requestJson = async (path, options = {}) => {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    });
  } catch (networkError) {
    const error = new Error('認証サーバーに接続できませんでした。');
    error.code = 'API_UNREACHABLE';
    error.isNetworkError = true;
    error.cause = networkError;
    throw error;
  }

  let payload = null;
  let rawText = '';
  try {
    payload = await response.json();
  } catch (jsonError) {
    try {
      rawText = await response.text();
    } catch (_) {
      rawText = '';
    }
    payload = null;
  }

  if (!response.ok) {
    let message = payload?.error || `Request failed (${response.status})`;
    let code = payload?.code || '';

    if (!payload && response.status >= 500) {
      code = code || 'API_PROXY_ERROR';
      if (path === '/auth/config') {
        message = 'ログイン設定の取得に失敗しました。認証サーバーが起動していない可能性があります。';
      } else {
        message = 'サーバーエラーが発生しました。時間をおいて再試行してください。';
      }
    }

    const error = new Error(message);
    error.status = response.status;
    error.code = code;
    if (IS_DEV) {
      error.debugDetail = payload?.detail || rawText || '';
    }
    throw error;
  }

  return payload;
};

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
  }

  return safe;
};

export const fetchAuthConfig = async () => {
  return await requestJson('/auth/config', { method: 'GET' });
};

export const fetchSession = async () => {
  return await requestJson('/auth/session', { method: 'GET' });
};

export const loginWithGoogleCredential = async (credential) => {
  return await requestJson('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  });
};

export const logoutSession = async () => {
  return await requestJson('/auth/logout', { method: 'POST' });
};

export const syncLibraryAfterLogin = async ({ animeList, bookmarkList }) => {
  return await requestJson('/user/sync', {
    method: 'POST',
    body: JSON.stringify({
      localAnimeList: sanitizeCollection(animeList),
      localBookmarkList: sanitizeCollection(bookmarkList),
    }),
  });
};

export const saveLibraryToCloud = async ({ animeList, bookmarkList }) => {
  return await requestJson('/user/data', {
    method: 'PUT',
    body: JSON.stringify({
      animeList: sanitizeCollection(animeList),
      bookmarkList: sanitizeCollection(bookmarkList),
    }),
  });
};
