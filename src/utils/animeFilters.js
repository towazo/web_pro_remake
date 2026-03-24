import { translateGenre, translateTag } from '../constants/animeData';

export const MIN_RATING_FILTER_OPTIONS = [
  { value: '', label: '指定なし' },
  { value: '1', label: '1以上' },
  { value: '2', label: '2以上' },
  { value: '3', label: '3以上' },
  { value: '4', label: '4以上' },
  { value: '5', label: '5以上' },
];

export const FILTER_MATCH_MODE_OPTIONS = [
  { value: 'and', label: 'AND' },
  { value: 'or', label: 'OR' },
];

const normalizeStringArray = (values) => {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => String(value || '').trim())
    .filter((value, index, source) => value.length > 0 && source.indexOf(value) === index);
};

const normalizeTagEntry = (tag) => {
  if (typeof tag === 'string') {
    const name = tag.trim();
    return name ? { id: null, name, isMediaSpoiler: false } : null;
  }

  if (!tag || typeof tag !== 'object') return null;

  const name = String(tag.name || '').trim();
  if (!name) return null;

  const numericId = Number(tag.id);
  return {
    id: Number.isFinite(numericId) ? numericId : null,
    name,
    isMediaSpoiler: Boolean(tag.isMediaSpoiler),
  };
};

export const normalizeAnimeRating = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return null;
  if (parsed < 1 || parsed > 5) return null;
  return parsed;
};

export const normalizeMinRatingFilter = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return '';
  if (parsed < 1 || parsed > 5) return '';
  return String(parsed);
};

export const normalizeFilterMatchMode = (value) => (
  String(value || '').trim().toLowerCase() === 'or' ? 'or' : 'and'
);

export const hasAnimeTagMetadata = (anime) => normalizeAnimeTags(anime?.tags).length > 0;

export const normalizeAnimeTags = (tags) => {
  if (!Array.isArray(tags)) return [];

  const seen = new Set();
  const normalized = [];

  tags.forEach((tag) => {
    const entry = normalizeTagEntry(tag);
    if (!entry) return;

    const key = entry.name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(entry);
  });

  return normalized;
};

export const getAnimeTagNames = (anime, options = {}) => {
  const includeSpoilers = Boolean(options.includeSpoilers);
  return normalizeAnimeTags(anime?.tags)
    .filter((tag) => includeSpoilers || !tag.isMediaSpoiler)
    .map((tag) => tag.name);
};

export const getSeasonKeyForAnime = (anime) => {
  const seasonRaw = String(anime?.season || '').trim().toUpperCase();
  if (seasonRaw === 'WINTER') return 'winter';
  if (seasonRaw === 'SPRING') return 'spring';
  if (seasonRaw === 'SUMMER') return 'summer';
  if (seasonRaw === 'FALL') return 'autumn';

  const month = Number(anime?.startDate?.month) || 0;
  if (month >= 1 && month <= 3) return 'winter';
  if (month >= 4 && month <= 6) return 'spring';
  if (month >= 7 && month <= 9) return 'summer';
  if (month >= 10 && month <= 12) return 'autumn';
  return 'other';
};

export const collectAnimeFilterOptions = (animeList, options = {}) => {
  const includeSeasons = Boolean(options.includeSeasons);
  const genreSet = new Set();
  const tagCountMap = new Map();
  const yearSet = new Set();
  const seasonSet = new Set();

  (Array.isArray(animeList) ? animeList : []).forEach((anime) => {
    normalizeStringArray(anime?.genres).forEach((genre) => genreSet.add(genre));
    getAnimeTagNames(anime).forEach((tagName) => {
      tagCountMap.set(tagName, (tagCountMap.get(tagName) || 0) + 1);
    });

    const year = Number(anime?.seasonYear);
    if (Number.isFinite(year) && year > 0) {
      yearSet.add(year);
    }

    if (includeSeasons) {
      seasonSet.add(getSeasonKeyForAnime(anime));
    }
  });

  const genres = Array.from(genreSet)
    .sort((left, right) => translateGenre(left).localeCompare(translateGenre(right), 'ja'));
  const tags = Array.from(tagCountMap.entries())
    .sort((left, right) => {
      const countDiff = right[1] - left[1];
      if (countDiff !== 0) return countDiff;
      return translateTag(left[0]).localeCompare(translateTag(right[0]), 'ja');
    })
    .map(([name]) => name);
  const years = Array.from(yearSet).sort((left, right) => right - left);
  const seasons = includeSeasons ? Array.from(seasonSet) : [];

  return { genres, tags, years, seasons };
};

const resolveAnimeTitle = (anime) => (
  anime?.title?.native || anime?.title?.romaji || anime?.title?.english || '作品'
);

const matchesSearchQuery = (anime, searchQuery) => {
  const query = String(searchQuery || '').trim().toLowerCase();
  if (!query) return true;

  const titleNative = String(anime?.title?.native || '').toLowerCase();
  const titleRomaji = String(anime?.title?.romaji || '').toLowerCase();
  const titleEnglish = String(anime?.title?.english || '').toLowerCase();

  return titleNative.includes(query) || titleRomaji.includes(query) || titleEnglish.includes(query);
};

const matchesGenreAndTagFilters = (anime, filters = {}) => {
  const selectedGenres = normalizeStringArray(filters.selectedGenres);
  const selectedTags = normalizeStringArray(filters.selectedTags);
  if (selectedGenres.length === 0 && selectedTags.length === 0) return true;

  const animeGenres = normalizeStringArray(anime?.genres);
  const animeTagNames = getAnimeTagNames(anime);
  const matchMode = normalizeFilterMatchMode(filters.matchMode);

  if (matchMode === 'or') {
    return selectedGenres.some((genre) => animeGenres.includes(genre))
      || selectedTags.some((tag) => animeTagNames.includes(tag));
  }

  return selectedGenres.every((genre) => animeGenres.includes(genre))
    && selectedTags.every((tag) => animeTagNames.includes(tag));
};

export const filterAnimeCollection = (animeList, filters = {}) => {
  const normalizedYear = Number(filters.selectedYear);
  const selectedYear = Number.isFinite(normalizedYear) && normalizedYear > 0 ? normalizedYear : null;
  const selectedSeasons = normalizeStringArray(filters.selectedSeasons);
  const minRating = Number(normalizeMinRatingFilter(filters.minRating)) || 0;

  return (Array.isArray(animeList) ? animeList : []).filter((anime) => {
    if (!matchesSearchQuery(anime, filters.searchQuery)) return false;
    if (!matchesGenreAndTagFilters(anime, filters)) return false;

    if (selectedYear !== null && Number(anime?.seasonYear) !== selectedYear) {
      return false;
    }

    if (selectedSeasons.length > 0) {
      const seasonKey = getSeasonKeyForAnime(anime);
      if (!selectedSeasons.includes(seasonKey)) return false;
    }

    if (minRating > 0) {
      const rating = normalizeAnimeRating(anime?.rating) || 0;
      if (rating < minRating) return false;
    }

    return true;
  });
};

export const sortAnimeCollection = (animeList, options = {}) => {
  const sortKey = String(options.sortKey || 'added');
  const sortOrder = String(options.sortOrder || 'desc') === 'asc' ? 'asc' : 'desc';
  const addedAtFields = Array.isArray(options.addedAtFields) && options.addedAtFields.length > 0
    ? options.addedAtFields
    : ['addedAt'];
  const sorted = [...(Array.isArray(animeList) ? animeList : [])];

  const getAddedValue = (anime) => {
    for (const field of addedAtFields) {
      const value = Number(anime?.[field]);
      if (Number.isFinite(value) && value > 0) return value;
    }
    return 0;
  };

  sorted.sort((left, right) => {
    if (sortKey === 'title') {
      const compareResult = resolveAnimeTitle(left).toLowerCase()
        .localeCompare(resolveAnimeTitle(right).toLowerCase(), 'ja');
      return sortOrder === 'asc' ? compareResult : compareResult * -1;
    }

    let valueLeft = 0;
    let valueRight = 0;
    switch (sortKey) {
      case 'year':
        valueLeft = Number(left?.seasonYear) || 0;
        valueRight = Number(right?.seasonYear) || 0;
        break;
      case 'rating':
        valueLeft = normalizeAnimeRating(left?.rating) || 0;
        valueRight = normalizeAnimeRating(right?.rating) || 0;
        break;
      case 'added':
      default:
        valueLeft = getAddedValue(left);
        valueRight = getAddedValue(right);
        break;
    }

    if (valueLeft < valueRight) return sortOrder === 'asc' ? -1 : 1;
    if (valueLeft > valueRight) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  return sorted;
};

export const buildAppliedAnimeFilterChips = (filters = {}, options = {}) => {
  const selectedGenres = normalizeStringArray(filters.selectedGenres);
  const selectedTags = normalizeStringArray(filters.selectedTags);
  const selectedSeasons = normalizeStringArray(filters.selectedSeasons);
  const normalizedMinRating = normalizeMinRatingFilter(filters.minRating);
  const matchMode = normalizeFilterMatchMode(filters.matchMode);
  const selectedYear = Number(filters.selectedYear);
  const seasonLabelMap = new Map(
    (Array.isArray(options.availableSeasons) ? options.availableSeasons : [])
      .map((season) => [season.key, season.label])
  );
  const includeModeChip = options.includeModeChip !== false;
  const includeYearChip = options.includeYearChip !== false;
  const includeSeasonChip = options.includeSeasonChip !== false;
  const includeMinRatingChip = options.includeMinRatingChip !== false;
  const chips = [];

  if (includeModeChip && (selectedGenres.length > 0 || selectedTags.length > 0)) {
    chips.push({
      key: 'mode',
      label: matchMode.toUpperCase(),
      kind: 'meta',
      value: matchMode,
      removable: false,
    });
  }

  selectedGenres.forEach((genre) => {
    chips.push({
      key: `genre:${genre}`,
      label: translateGenre(genre),
      kind: 'genre',
      value: genre,
      removable: true,
    });
  });

  selectedTags.forEach((tag) => {
    chips.push({
      key: `tag:${tag}`,
      label: translateTag(tag),
      kind: 'tag',
      value: tag,
      removable: true,
    });
  });

  if (includeYearChip && Number.isFinite(selectedYear) && selectedYear > 0) {
    chips.push({
      key: `year:${selectedYear}`,
      label: `${selectedYear}年`,
      kind: 'year',
      value: String(selectedYear),
      removable: true,
    });
  }

  if (includeSeasonChip) {
    selectedSeasons.forEach((seasonKey) => {
      chips.push({
        key: `season:${seasonKey}`,
        label: seasonLabelMap.get(seasonKey) || seasonKey,
        kind: 'season',
        value: seasonKey,
        removable: true,
      });
    });
  }

  if (includeMinRatingChip && normalizedMinRating) {
    chips.push({
      key: `rating:${normalizedMinRating}`,
      label: `★${normalizedMinRating}以上`,
      kind: 'rating',
      value: normalizedMinRating,
      removable: true,
    });
  }

  return chips;
};
