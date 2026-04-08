const HOME_CURRENT_SEASON_FEATURED_CACHE_KEY = 'homeCurrentSeasonFeaturedCacheV1';
const HOME_CURRENT_SEASON_FEATURED_CACHE_TTL_MS = 1000 * 60 * 60 * 6;

const hasLocalStorage = () => (
  typeof window !== 'undefined'
  && typeof window.localStorage !== 'undefined'
);

const buildSeasonCacheKey = (seasonInfo) => {
  const year = Number(seasonInfo?.year);
  const season = String(seasonInfo?.season || '').trim().toUpperCase();
  if (!Number.isFinite(year) || !season) return '';
  return `${year}:${season}`;
};

export const readHomeCurrentSeasonFeaturedAnimeListFromStorage = (seasonInfo) => {
  if (!hasLocalStorage()) return [];

  const seasonKey = buildSeasonCacheKey(seasonInfo);
  if (!seasonKey) return [];

  try {
    const raw = window.localStorage.getItem(HOME_CURRENT_SEASON_FEATURED_CACHE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    const cachedSeasonKey = String(parsed?.seasonKey || '');
    const updatedAt = Number(parsed?.updatedAt) || 0;
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    if (cachedSeasonKey !== seasonKey) return [];
    if (!updatedAt || (Date.now() - updatedAt) > HOME_CURRENT_SEASON_FEATURED_CACHE_TTL_MS) {
      return [];
    }
    return items;
  } catch (_) {
    return [];
  }
};

export const writeHomeCurrentSeasonFeaturedAnimeListToStorage = (seasonInfo, animeList) => {
  if (!hasLocalStorage()) return;

  const seasonKey = buildSeasonCacheKey(seasonInfo);
  if (!seasonKey) return;

  try {
    window.localStorage.setItem(HOME_CURRENT_SEASON_FEATURED_CACHE_KEY, JSON.stringify({
      version: 1,
      seasonKey,
      updatedAt: Date.now(),
      items: Array.isArray(animeList) ? animeList : [],
    }));
  } catch (_) {
    // Ignore storage write failures.
  }
};
