const resolveTrailerValue = (animeOrTrailer) => (
  animeOrTrailer
  && typeof animeOrTrailer === 'object'
  && Object.prototype.hasOwnProperty.call(animeOrTrailer, 'trailer')
    ? animeOrTrailer.trailer
    : animeOrTrailer
);

const hasTrailerPayload = (value) => (
  Boolean(value)
  && typeof value === 'object'
  && (
    String(value.id ?? '').trim().length > 0
    || String(value.site ?? '').trim().length > 0
    || String(value.thumbnail ?? '').trim().length > 0
  )
);

const TRAILER_PLAYBACK_CACHE_KEY = 'animeTrailerPlaybackCache';
const PERSISTED_UNPLAYABLE_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const PERSISTED_UNPLAYABLE_ERROR_CODES = new Set([2, 100, 101, 150]);
const playableTrailerIds = new Set();
const unplayableTrailerMap = new Map();
const playbackStatusListeners = new Set();
let playbackCacheLoaded = false;

const hasLocalStorage = () => (
  typeof window !== 'undefined'
  && typeof window.localStorage !== 'undefined'
);

export const normalizeAnimeTrailer = (animeOrTrailer) => {
  const trailer = resolveTrailerValue(animeOrTrailer);
  if (!trailer || typeof trailer !== 'object') return null;

  const id = String(trailer.id ?? '').trim();
  const site = String(trailer.site ?? '').trim().toLowerCase();
  const thumbnail = String(trailer.thumbnail ?? '').trim();

  if (!id || site !== 'youtube') return null;

  return thumbnail
    ? { id, site, thumbnail }
    : { id, site };
};

export const isSameAnimeTrailer = (left, right) => {
  const leftRaw = resolveTrailerValue(left);
  const rightRaw = resolveTrailerValue(right);
  const leftNormalized = normalizeAnimeTrailer(leftRaw);
  const rightNormalized = normalizeAnimeTrailer(rightRaw);

  if (!leftNormalized || !rightNormalized) {
    if (!leftNormalized && !rightNormalized) {
      return !hasTrailerPayload(leftRaw) && !hasTrailerPayload(rightRaw);
    }
    return false;
  }

  return (
    leftNormalized.id === rightNormalized.id
    && leftNormalized.site === rightNormalized.site
    && String(leftNormalized.thumbnail || '') === String(rightNormalized.thumbnail || '')
  );
};

export const hasPlayableTrailer = (animeOrTrailer) => Boolean(normalizeAnimeTrailer(animeOrTrailer));

const emitPlaybackStatus = (videoId) => {
  const status = playableTrailerIds.has(videoId)
    ? 'playable'
    : unplayableTrailerMap.has(videoId)
      ? 'invalid'
      : 'unknown';

  playbackStatusListeners.forEach((listener) => {
    try {
      listener({ videoId, status });
    } catch (_) {
      // Ignore listener errors.
    }
  });
};

const loadPersistedPlaybackCache = () => {
  if (playbackCacheLoaded) return;
  playbackCacheLoaded = true;
  if (!hasLocalStorage()) return;

  try {
    const raw = window.localStorage.getItem(TRAILER_PLAYBACK_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    const now = Date.now();

    items.forEach((item) => {
      const [videoIdRaw, errorCodeRaw, checkedAtRaw] = Array.isArray(item) ? item : [];
      const videoId = String(videoIdRaw || '').trim();
      const checkedAt = Number(checkedAtRaw);
      const errorCode = Number(errorCodeRaw) || 0;
      if (!videoId || !Number.isFinite(checkedAt)) return;
      if ((now - checkedAt) > PERSISTED_UNPLAYABLE_TTL_MS) return;
      unplayableTrailerMap.set(videoId, { errorCode, checkedAt, persisted: true });
    });
  } catch (_) {
    // Ignore broken cache payloads.
  }
};

const persistPlaybackCache = () => {
  if (!hasLocalStorage()) return;

  try {
    const items = Array.from(unplayableTrailerMap.entries())
      .filter(([, value]) => value?.persisted)
      .map(([videoId, value]) => [videoId, Number(value.errorCode) || 0, Number(value.checkedAt) || Date.now()]);

    if (items.length === 0) {
      window.localStorage.removeItem(TRAILER_PLAYBACK_CACHE_KEY);
      return;
    }

    window.localStorage.setItem(TRAILER_PLAYBACK_CACHE_KEY, JSON.stringify({
      version: 1,
      items,
    }));
  } catch (_) {
    // Ignore storage failures.
  }
};

export const subscribeTrailerPlaybackStatus = (listener) => {
  if (typeof listener !== 'function') return () => {};
  playbackStatusListeners.add(listener);
  return () => {
    playbackStatusListeners.delete(listener);
  };
};

export const getAnimeTrailerPlaybackStatus = (animeOrTrailer) => {
  const trailer = normalizeAnimeTrailer(animeOrTrailer);
  if (!trailer) return 'absent';

  loadPersistedPlaybackCache();

  if (playableTrailerIds.has(trailer.id)) return 'playable';
  if (unplayableTrailerMap.has(trailer.id)) return 'invalid';
  return 'unknown';
};

export const isTrailerKnownUnplayable = (animeOrTrailer) => (
  getAnimeTrailerPlaybackStatus(animeOrTrailer) === 'invalid'
);

export const canAttemptTrailerPlayback = (animeOrTrailer) => {
  const status = getAnimeTrailerPlaybackStatus(animeOrTrailer);
  return status === 'playable' || status === 'unknown';
};

export const markAnimeTrailerPlayable = (animeOrTrailer) => {
  const trailer = normalizeAnimeTrailer(animeOrTrailer);
  if (!trailer) return;

  loadPersistedPlaybackCache();
  playableTrailerIds.add(trailer.id);
  const hadUnplayableEntry = unplayableTrailerMap.delete(trailer.id);
  if (hadUnplayableEntry) {
    persistPlaybackCache();
  }
  emitPlaybackStatus(trailer.id);
};

export const markAnimeTrailerUnplayable = (animeOrTrailer, options = {}) => {
  const trailer = normalizeAnimeTrailer(animeOrTrailer);
  if (!trailer) return;

  loadPersistedPlaybackCache();

  const errorCode = Number(options.errorCode ?? options.code) || 0;
  const persisted = options.persist === true || PERSISTED_UNPLAYABLE_ERROR_CODES.has(errorCode);
  playableTrailerIds.delete(trailer.id);
  unplayableTrailerMap.set(trailer.id, {
    errorCode,
    checkedAt: Date.now(),
    persisted,
  });
  if (persisted) {
    persistPlaybackCache();
  }
  emitPlaybackStatus(trailer.id);
};

export const getAnimeTrailerEmbedUrl = (animeOrTrailer, options = {}) => {
  const trailer = normalizeAnimeTrailer(animeOrTrailer);
  if (!trailer) return '';

  const params = new URLSearchParams({
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
  });

  if (options.controls === false) {
    params.set('controls', '0');
  }

  if (options.autoplay) {
    params.set('autoplay', '1');
  }

  if (options.muted) {
    params.set('mute', '1');
  }

  if (options.loop) {
    params.set('loop', '1');
    params.set('playlist', trailer.id);
  }

  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(trailer.id)}?${params.toString()}`;
};

export const getAnimeTrailerWatchUrl = (animeOrTrailer) => {
  const trailer = normalizeAnimeTrailer(animeOrTrailer);
  if (!trailer) return '';
  return `https://www.youtube.com/watch?v=${encodeURIComponent(trailer.id)}`;
};
