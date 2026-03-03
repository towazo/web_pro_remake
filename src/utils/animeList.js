export const SHARE_IMAGE_SELECTION_LIMIT = 24;
export const SHARE_IMAGE_PAGE_SIZE = 6;
export const SHARE_IMAGE_MAX_PAGES = Math.ceil(SHARE_IMAGE_SELECTION_LIMIT / SHARE_IMAGE_PAGE_SIZE);

export const MIN_RATING_FILTER_OPTIONS = [
  { value: '', label: '指定なし' },
  { value: '1', label: '1以上' },
  { value: '2', label: '2以上' },
  { value: '3', label: '3以上' },
  { value: '4', label: '4以上' },
  { value: '5', label: '5以上' },
];

export const normalizeAnimeRating = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return null;
  if (parsed < 1 || parsed > 5) return null;
  return parsed;
};

export const resolveAnimeTitle = (anime) => (
  anime?.title?.native || anime?.title?.romaji || anime?.title?.english || '作品'
);

export const normalizeMinRatingFilter = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return '';
  if (parsed < 1 || parsed > 5) return '';
  return String(parsed);
};

export const buildFilteredAnimeList = (animeList, filters = {}) => {
  const normalizedSearch = String(filters.searchQuery || '').trim().toLowerCase();
  const selectedGenres = Array.isArray(filters.selectedGenres) ? filters.selectedGenres : [];
  const minRating = Number(normalizeMinRatingFilter(filters.minRating)) || 0;
  const sortKey = String(filters.sortKey || 'added');
  const sortOrder = String(filters.sortOrder || 'desc') === 'asc' ? 'asc' : 'desc';
  const hasGenreFilter = selectedGenres.length > 0;

  const filtered = (Array.isArray(animeList) ? animeList : []).filter((anime) => {
    const titleNative = String(anime?.title?.native || '').toLowerCase();
    const titleRomaji = String(anime?.title?.romaji || '').toLowerCase();
    const titleEnglish = String(anime?.title?.english || '').toLowerCase();
    const animeGenres = Array.isArray(anime?.genres) ? anime.genres : [];
    const rating = normalizeAnimeRating(anime?.rating) || 0;

    const matchesSearch = normalizedSearch.length === 0
      || titleNative.includes(normalizedSearch)
      || titleRomaji.includes(normalizedSearch)
      || titleEnglish.includes(normalizedSearch);
    const matchesGenre = !hasGenreFilter || selectedGenres.every((genre) => animeGenres.includes(genre));
    const matchesRating = minRating === 0 || rating >= minRating;

    return matchesSearch && matchesGenre && matchesRating;
  });

  filtered.sort((a, b) => {
    let valueA;
    let valueB;

    switch (sortKey) {
      case 'title':
        valueA = resolveAnimeTitle(a).toLowerCase();
        valueB = resolveAnimeTitle(b).toLowerCase();
        break;
      case 'year':
        valueA = Number(a?.seasonYear) || 0;
        valueB = Number(b?.seasonYear) || 0;
        break;
      case 'rating':
        valueA = normalizeAnimeRating(a?.rating) || 0;
        valueB = normalizeAnimeRating(b?.rating) || 0;
        break;
      case 'added':
      default:
        valueA = Number(a?.addedAt) || 0;
        valueB = Number(b?.addedAt) || 0;
        break;
    }

    if (valueA < valueB) return sortOrder === 'asc' ? -1 : 1;
    if (valueA > valueB) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  return filtered;
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
