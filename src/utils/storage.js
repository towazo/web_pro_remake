import { normalizeAnimeTrailer } from './trailer';
import { getSafeLocalStorage } from './browserStorage';

export const ANIME_LIST_STORAGE_KEY = 'myAnimeList';
export const BOOKMARK_LIST_STORAGE_KEY = 'myAnimeBookmarkList';

const STORAGE_SCHEMA_VERSION = 5;
const MIN_SUPPORTED_STORAGE_SCHEMA_VERSION = 2;
const STORAGE_WRITE_VARIANTS = ['full', 'compact', 'minimal'];

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
  const trailer = normalizeAnimeTrailer(anime.trailer);
  const trailerChecked = anime?.trailerChecked === true ? 1 : 0;

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
    normalizeString(trailer?.id),
    normalizeString(trailer?.site),
    trailerChecked,
    normalizeFiniteNumber(anime.rating),
    normalizeFiniteNumber(anime.watchCount),
    normalizeFiniteNumber(anime.addedAt),
    normalizeFiniteNumber(anime.bookmarkedAt),
  ];
};

const deserializeAnimeEntry = (entry, schemaVersion = STORAGE_SCHEMA_VERSION) => {
  if (Array.isArray(entry)) {
    const numericSchemaVersion = Number(schemaVersion) || 0;
    const supportsTrailer = numericSchemaVersion >= 4;
    const supportsTrailerChecked = numericSchemaVersion >= 5;
    const supportsWatchCount = numericSchemaVersion >= 3;
    let trailerId = '';
    let trailerSite = '';
    let trailerChecked = false;
    let rating = null;
    let watchCount = null;
    let addedAt = null;
    let bookmarkedAt = null;

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
      extra0,
      extra1,
      extra2,
      extra3,
      extra4,
      extra5,
      extra6,
    ] = entry;

    if (supportsTrailerChecked) {
      trailerId = extra0;
      trailerSite = extra1;
      trailerChecked = Boolean(extra2);
      rating = extra3;
      watchCount = extra4;
      addedAt = extra5;
      bookmarkedAt = extra6;
    } else if (supportsTrailer) {
      trailerId = extra0;
      trailerSite = extra1;
      trailerChecked = false;
      rating = extra2;
      watchCount = extra3;
      addedAt = extra4;
      bookmarkedAt = extra5;
    } else {
      rating = extra0;
      watchCount = supportsWatchCount ? extra1 : null;
      addedAt = supportsWatchCount ? extra2 : extra1;
      bookmarkedAt = supportsWatchCount ? extra3 : extra2;
    }

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

    if (supportsTrailer) {
      anime.trailer = normalizeAnimeTrailer({
        id: trailerId,
        site: trailerSite,
      });
      anime.trailerChecked = trailerChecked;
    }

    if (!Number.isFinite(anime.id)) return null;
    return anime;
  }

  if (!entry || typeof entry !== 'object') return null;
  const id = normalizeFiniteNumber(entry.id);
  if (!Number.isFinite(id)) return null;
  const hasTrailerField = Object.prototype.hasOwnProperty.call(entry, 'trailer');
  const hasTrailerCheckedField = Object.prototype.hasOwnProperty.call(entry, 'trailerChecked');
  if (!hasTrailerField && !hasTrailerCheckedField) {
    return entry;
  }
  return {
    ...entry,
    ...(hasTrailerField ? { trailer: normalizeAnimeTrailer(entry.trailer) } : {}),
    trailerChecked: hasTrailerCheckedField ? entry.trailerChecked === true : false,
  };
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
  const storage = getSafeLocalStorage();
  if (!storage) return [];

  try {
    const saved = storage.getItem(key);
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
  const storage = getSafeLocalStorage();
  if (!storage) return;

  try {
    if (!Array.isArray(list) || list.length === 0) {
      storage.removeItem(key);
      return;
    }

    const currentValue = storage.getItem(key);

    for (const variant of STORAGE_WRITE_VARIANTS) {
      try {
        const payload = serializeListPayload(list, variant);
        if (currentValue === payload) return;
        storage.setItem(key, payload);
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
