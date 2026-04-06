import {
  ANIME_SORT_OPTIONS,
  MIN_RATING_FILTER_OPTIONS,
  filterAnimeCollection,
  normalizeAnimeRating,
  normalizeAnimeWatchCount,
  normalizeMinRatingFilter,
  sortAnimeCollection,
} from './animeFilters';

export {
  ANIME_SORT_OPTIONS,
  MIN_RATING_FILTER_OPTIONS,
  normalizeAnimeRating,
  normalizeAnimeWatchCount,
  normalizeMinRatingFilter,
} from './animeFilters';

export const SHARE_IMAGE_SELECTION_LIMIT = 24;
export const SHARE_IMAGE_PAGE_SIZE = 6;
export const SHARE_IMAGE_MAX_PAGES = Math.ceil(SHARE_IMAGE_SELECTION_LIMIT / SHARE_IMAGE_PAGE_SIZE);

export const resolveAnimeTitle = (anime) => (
  anime?.title?.native || anime?.title?.romaji || anime?.title?.english || '作品'
);

export const buildFilteredAnimeList = (animeList, filters = {}) => {
  return sortAnimeCollection(filterAnimeCollection(animeList, filters), {
    sortKey: filters.sortKey,
    sortOrder: filters.sortOrder,
    addedAtFields: ['addedAt'],
  });
};

export const buildShareText = (animeList, options = {}) => {
  const items = Array.isArray(animeList) ? animeList : [];
  const includeRating = Boolean(options.includeRating);
  const heading = String(options.heading || '').trim();
  const lines = items.map((anime) => {
    const title = resolveAnimeTitle(anime);
    const rating = normalizeAnimeRating(anime?.rating);
    if (includeRating && rating !== null) {
      return `・${title} ★${rating}`;
    }
    return `・${title}`;
  });

  if (!heading) {
    return lines.join('\n');
  }

  return [heading, ...lines].join('\n');
};
