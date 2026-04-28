import { getSafeLocalStorage } from './browserStorage';

const HOME_CURRENT_SEASON_FEATURED_CACHE_KEY = 'homeCurrentSeasonFeaturedCacheV2';
const HOME_CURRENT_SEASON_FEATURED_LEGACY_CACHE_KEY = 'homeCurrentSeasonFeaturedCacheV1';
const HOME_CURRENT_SEASON_FEATURED_CACHE_FRESH_TTL_MS = 1000 * 60 * 60 * 24;
const HOME_CURRENT_SEASON_FEATURED_CACHE_STALE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const HOME_CURRENT_SEASON_FEATURED_CACHE_MAX_ITEMS = 90;

const buildSeasonCacheKey = (seasonInfo) => {
  const year = Number(seasonInfo?.year);
  const season = String(seasonInfo?.season || '').trim().toUpperCase();
  if (!Number.isFinite(year) || !season) return '';
  return `${year}:${season}`;
};

const normalizeText = (value) => (typeof value === 'string' ? value : '');

const normalizeFiniteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeTitle = (value) => {
  const source = value && typeof value === 'object' ? value : {};
  if (typeof value === 'string') {
    return {
      native: value,
      romaji: value,
      english: '',
    };
  }

  return {
    native: normalizeText(source.native),
    romaji: normalizeText(source.romaji),
    english: normalizeText(source.english),
  };
};

const normalizeCoverImage = (value) => {
  const source = value && typeof value === 'object' ? value : {};
  if (typeof value === 'string') {
    return {
      large: value,
      extraLarge: value,
    };
  }

  return {
    large: normalizeText(source.large),
    extraLarge: normalizeText(source.extraLarge),
  };
};

const normalizeStartDate = (value) => {
  const source = value && typeof value === 'object' ? value : {};
  return {
    year: normalizeFiniteNumber(source.year),
    month: normalizeFiniteNumber(source.month),
    day: normalizeFiniteNumber(source.day),
  };
};

const normalizeStringArray = (value, limit = 12) => (
  Array.isArray(value)
    ? value
      .map((item) => normalizeText(item).trim())
      .filter(Boolean)
      .slice(0, Math.max(1, Number(limit) || 12))
    : []
);

const normalizeTrailer = (value) => {
  const source = value && typeof value === 'object' ? value : {};
  const id = normalizeText(source.id).trim();
  const site = normalizeText(source.site).trim();
  if (!id || !site) return null;

  return {
    id,
    site,
    thumbnail: normalizeText(source.thumbnail),
  };
};

const truncateText = (value, maxLength = 700) => {
  const text = normalizeText(value);
  const safeMaxLength = Math.max(120, Number(maxLength) || 700);
  return text.length > safeMaxLength ? `${text.slice(0, safeMaxLength).trim()}...` : text;
};

const sanitizeFeaturedAnimeForCache = (anime) => {
  if (!anime || typeof anime !== 'object') return null;
  const id = normalizeFiniteNumber(anime.id);
  if (!Number.isFinite(id)) return null;

  const cached = {
    id,
    title: normalizeTitle(anime.title),
    coverImage: normalizeCoverImage(anime.coverImage),
    bannerImage: normalizeText(anime.bannerImage),
    season: normalizeText(anime.season),
    seasonYear: normalizeFiniteNumber(anime.seasonYear),
    status: normalizeText(anime.status),
    startDate: normalizeStartDate(anime.startDate),
    averageScore: normalizeFiniteNumber(anime.averageScore),
    episodes: normalizeFiniteNumber(anime.episodes),
    genres: normalizeStringArray(anime.genres, 8),
    format: normalizeText(anime.format),
    countryOfOrigin: normalizeText(anime.countryOfOrigin),
    description: truncateText(anime.description),
  };

  const trailer = normalizeTrailer(anime.trailer);
  if (trailer) {
    cached.trailer = trailer;
    cached.trailerChecked = true;
  }

  return cached;
};

const sanitizeFeaturedAnimeCacheList = (animeList) => {
  if (!Array.isArray(animeList)) return [];

  const seenIds = new Set();
  const items = [];
  for (const anime of animeList) {
    const cached = sanitizeFeaturedAnimeForCache(anime);
    if (!cached) continue;
    if (seenIds.has(cached.id)) continue;
    seenIds.add(cached.id);
    items.push(cached);
    if (items.length >= HOME_CURRENT_SEASON_FEATURED_CACHE_MAX_ITEMS) break;
  }
  return items;
};

const readCachePayload = (storage, key) => {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
};

const normalizeCacheState = (payload, seasonKey) => {
  const cachedSeasonKey = String(payload?.seasonKey || '');
  const updatedAt = Number(payload?.updatedAt) || 0;
  const ageMs = Date.now() - updatedAt;
  if (cachedSeasonKey !== seasonKey) {
    return {
      items: [],
      updatedAt: 0,
      isFresh: false,
      isUsable: false,
    };
  }
  if (!updatedAt || ageMs < 0 || ageMs > HOME_CURRENT_SEASON_FEATURED_CACHE_STALE_TTL_MS) {
    return {
      items: [],
      updatedAt: 0,
      isFresh: false,
      isUsable: false,
    };
  }

  const items = sanitizeFeaturedAnimeCacheList(payload?.items);
  return {
    items,
    updatedAt,
    isFresh: ageMs <= HOME_CURRENT_SEASON_FEATURED_CACHE_FRESH_TTL_MS,
    isUsable: items.length > 0,
  };
};

export const readHomeCurrentSeasonFeaturedCacheStateFromStorage = (seasonInfo) => {
  const storage = getSafeLocalStorage();
  if (!storage) {
    return {
      items: [],
      updatedAt: 0,
      isFresh: false,
      isUsable: false,
    };
  }

  const seasonKey = buildSeasonCacheKey(seasonInfo);
  if (!seasonKey) {
    return {
      items: [],
      updatedAt: 0,
      isFresh: false,
      isUsable: false,
    };
  }

  const currentState = normalizeCacheState(
    readCachePayload(storage, HOME_CURRENT_SEASON_FEATURED_CACHE_KEY),
    seasonKey
  );
  if (currentState.isUsable) return currentState;

  const legacyState = normalizeCacheState(
    readCachePayload(storage, HOME_CURRENT_SEASON_FEATURED_LEGACY_CACHE_KEY),
    seasonKey
  );
  if (legacyState.isUsable) {
    try {
      storage.removeItem(HOME_CURRENT_SEASON_FEATURED_LEGACY_CACHE_KEY);
      storage.setItem(HOME_CURRENT_SEASON_FEATURED_CACHE_KEY, JSON.stringify({
        version: 2,
        seasonKey,
        updatedAt: legacyState.updatedAt,
        items: legacyState.items,
      }));
    } catch (_) {
      // Keep the in-memory legacy data for this session if migration fails.
    }
  }

  return legacyState;
};

export const readHomeCurrentSeasonFeaturedAnimeListFromStorage = (seasonInfo) => {
  return readHomeCurrentSeasonFeaturedCacheStateFromStorage(seasonInfo).items;
};

export const writeHomeCurrentSeasonFeaturedAnimeListToStorage = (seasonInfo, animeList) => {
  const storage = getSafeLocalStorage();
  if (!storage) return;

  const seasonKey = buildSeasonCacheKey(seasonInfo);
  if (!seasonKey) return;
  const items = sanitizeFeaturedAnimeCacheList(animeList);
  if (items.length === 0) return;

  try {
    storage.removeItem(HOME_CURRENT_SEASON_FEATURED_LEGACY_CACHE_KEY);
    storage.setItem(HOME_CURRENT_SEASON_FEATURED_CACHE_KEY, JSON.stringify({
      version: 2,
      seasonKey,
      updatedAt: Date.now(),
      items,
    }));
  } catch (_) {
    // Ignore storage write failures.
  }
};
