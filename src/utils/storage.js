export const ANIME_LIST_STORAGE_KEY = 'myAnimeList';
export const BOOKMARK_LIST_STORAGE_KEY = 'myAnimeBookmarkList';

const STORAGE_SCHEMA_VERSION = 3;
const MIN_SUPPORTED_STORAGE_SCHEMA_VERSION = 2;
const STORAGE_WRITE_VARIANTS = ['full', 'compact', 'minimal'];

const hasLocalStorage = () => (
  typeof window !== 'undefined'
  && typeof window.localStorage !== 'undefined'
);

const normalizeString = (value) => {
  if (typeof value !== 'string') return '';
  return value;
};

const normalizeFiniteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeStringArray = (value) => (
  Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.length > 0)
    : []
);

const serializeTag = (tag) => {
  if (!tag || typeof tag !== 'object') return null;

  const id = normalizeFiniteNumber(tag.id);
  const name = normalizeString(tag.name);
  if (!name) return null;

  return [id, name, tag.isMediaSpoiler ? 1 : 0];
};

const deserializeTag = (tag) => {
  if (Array.isArray(tag)) {
    const [id, name, isMediaSpoiler] = tag;
    const normalizedName = normalizeString(name);
    if (!normalizedName) return null;

    return {
      id: normalizeFiniteNumber(id),
      name: normalizedName,
      isMediaSpoiler: Boolean(isMediaSpoiler),
    };
  }

  if (!tag || typeof tag !== 'object') return null;
  const normalizedName = normalizeString(tag.name);
  if (!normalizedName) return null;

  return {
    id: normalizeFiniteNumber(tag.id),
    name: normalizedName,
    isMediaSpoiler: Boolean(tag.isMediaSpoiler),
  };
};

const serializeAnimeEntry = (anime, variant = 'full') => {
  if (!anime || typeof anime !== 'object') return null;

  const id = normalizeFiniteNumber(anime.id);
  if (!Number.isFinite(id)) return null;

  const isCompact = variant === 'compact' || variant === 'minimal';
  const isMinimal = variant === 'minimal';
  const title = anime.title && typeof anime.title === 'object' ? anime.title : {};
  const coverImage = anime.coverImage && typeof anime.coverImage === 'object' ? anime.coverImage : {};
  const startDate = anime.startDate && typeof anime.startDate === 'object' ? anime.startDate : {};
  const tags = Array.isArray(anime.tags)
    ? anime.tags.map(serializeTag).filter(Boolean)
    : [];

  return [
    id,
    normalizeString(title.native),
    normalizeString(title.romaji),
    normalizeString(title.english),
    normalizeString(coverImage.large),
    isMinimal ? '' : normalizeString(coverImage.extraLarge),
    normalizeString(anime.season),
    normalizeFiniteNumber(anime.seasonYear),
    isMinimal ? '' : normalizeString(anime.status),
    isCompact ? null : normalizeFiniteNumber(startDate.year),
    isCompact ? null : normalizeFiniteNumber(startDate.month),
    isCompact ? null : normalizeFiniteNumber(startDate.day),
    isCompact ? null : normalizeFiniteNumber(anime.averageScore),
    normalizeFiniteNumber(anime.episodes),
    normalizeStringArray(anime.genres),
    tags,
    normalizeString(anime.format),
    normalizeString(anime.countryOfOrigin),
    isMinimal ? '' : normalizeString(anime.bannerImage),
    isCompact ? '' : normalizeString(anime.description),
    normalizeFiniteNumber(anime.rating),
    normalizeFiniteNumber(anime.watchCount),
    normalizeFiniteNumber(anime.addedAt),
    normalizeFiniteNumber(anime.bookmarkedAt),
  ];
};

const deserializeAnimeEntry = (entry, schemaVersion = STORAGE_SCHEMA_VERSION) => {
  if (Array.isArray(entry)) {
    const isCurrentSchema = Number(schemaVersion) >= STORAGE_SCHEMA_VERSION;
    const [
      id,
      titleNative,
      titleRomaji,
      titleEnglish,
      coverLarge,
      coverExtraLarge,
      season,
      seasonYear,
      status,
      startYear,
      startMonth,
      startDay,
      averageScore,
      episodes,
      genres,
      tags,
      format,
      countryOfOrigin,
      bannerImage,
      description,
      rating,
      legacyOrWatchCount,
      legacyAddedAt,
      legacyBookmarkedAt,
    ] = entry;

    const watchCount = isCurrentSchema ? legacyOrWatchCount : null;
    const addedAt = isCurrentSchema ? legacyAddedAt : legacyOrWatchCount;
    const bookmarkedAt = isCurrentSchema ? legacyBookmarkedAt : legacyAddedAt;

    const anime = {
      id: normalizeFiniteNumber(id),
      title: {
        native: normalizeString(titleNative),
        romaji: normalizeString(titleRomaji),
        english: normalizeString(titleEnglish),
      },
      coverImage: {
        large: normalizeString(coverLarge),
        extraLarge: normalizeString(coverExtraLarge),
      },
      season: normalizeString(season),
      seasonYear: normalizeFiniteNumber(seasonYear),
      status: normalizeString(status),
      startDate: {
        year: normalizeFiniteNumber(startYear),
        month: normalizeFiniteNumber(startMonth),
        day: normalizeFiniteNumber(startDay),
      },
      averageScore: normalizeFiniteNumber(averageScore),
      episodes: normalizeFiniteNumber(episodes),
      genres: normalizeStringArray(genres),
      tags: Array.isArray(tags) ? tags.map(deserializeTag).filter(Boolean) : [],
      format: normalizeString(format),
      countryOfOrigin: normalizeString(countryOfOrigin),
      bannerImage: normalizeString(bannerImage),
      description: normalizeString(description),
      rating: normalizeFiniteNumber(rating),
      watchCount: normalizeFiniteNumber(watchCount),
      addedAt: normalizeFiniteNumber(addedAt),
      bookmarkedAt: normalizeFiniteNumber(bookmarkedAt),
    };

    if (!Number.isFinite(anime.id)) return null;
    return anime;
  }

  if (!entry || typeof entry !== 'object') return null;
  const id = normalizeFiniteNumber(entry.id);
  if (!Number.isFinite(id)) return null;
  return entry;
};

const serializeListPayload = (list, variant = 'full') => JSON.stringify({
  version: STORAGE_SCHEMA_VERSION,
  variant,
  items: (Array.isArray(list) ? list : [])
    .map((anime) => serializeAnimeEntry(anime, variant))
    .filter(Boolean),
});

const shouldUseCompactStoragePayload = (parsed) => (
  parsed
  && typeof parsed === 'object'
  && Number(parsed.version) >= MIN_SUPPORTED_STORAGE_SCHEMA_VERSION
  && Number(parsed.version) <= STORAGE_SCHEMA_VERSION
  && Array.isArray(parsed.items)
);

export const readListFromStorage = (key) => {
  if (!hasLocalStorage()) return [];

  try {
    const saved = window.localStorage.getItem(key);
    if (!saved) return [];
    const parsed = JSON.parse(saved);

    if (shouldUseCompactStoragePayload(parsed)) {
      return parsed.items
        .map((item) => deserializeAnimeEntry(item, parsed.version))
        .filter(Boolean);
    }

    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
};

export const writeListToStorage = (key, list) => {
  if (!hasLocalStorage()) return;

  try {
    if (!Array.isArray(list) || list.length === 0) {
      window.localStorage.removeItem(key);
      return;
    }

    const currentValue = window.localStorage.getItem(key);

    for (const variant of STORAGE_WRITE_VARIANTS) {
      try {
        const payload = serializeListPayload(list, variant);
        if (currentValue === payload) return;
        window.localStorage.setItem(key, payload);
        return;
      } catch (error) {
        if (variant === STORAGE_WRITE_VARIANTS[STORAGE_WRITE_VARIANTS.length - 1]) {
          console.warn(`Failed to persist ${key} to localStorage:`, error);
        }
      }
    }
  } catch (error) {
    console.warn(`Storage access failed for ${key}:`, error);
  }
};
