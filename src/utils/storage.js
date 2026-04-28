import { normalizeAnimeTrailer } from './trailer';
import { getSafeIndexedDb, getSafeLocalStorage } from './browserStorage';

export const ANIME_LIST_STORAGE_KEY = 'myAnimeList';
export const BOOKMARK_LIST_STORAGE_KEY = 'myAnimeBookmarkList';
export const LIBRARY_SYNC_META_STORAGE_KEY = 'myAnimeLibraryMeta';

const STORAGE_SCHEMA_VERSION = 5;
const MIN_SUPPORTED_STORAGE_SCHEMA_VERSION = 2;
const LIBRARY_SYNC_META_SCHEMA_VERSION = 1;
const STORAGE_WRITE_VARIANTS = ['full', 'compact', 'minimal'];
const LIBRARY_PERSISTENT_DB_NAME = 'AniTriggerLibraryStorage';
const LIBRARY_PERSISTENT_DB_VERSION = 1;
const LIBRARY_PERSISTENT_STORE_NAME = 'librarySnapshots';
const LIBRARY_PERSISTENT_SNAPSHOT_KEY = 'main';

const normalizeString = (value) => {
  if (typeof value !== 'string') return '';
  return value;
};

const normalizeFiniteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeIsoDateString = (value) => {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
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

export const deriveLibraryUpdatedAtFromLists = (animeList, bookmarkList) => {
  const getLatestTimestamp = (list, fieldName) => {
    if (!Array.isArray(list)) return 0;

    let latestTimestamp = 0;
    list.forEach((item) => {
      const timestamp = normalizeFiniteNumber(item?.[fieldName]);
      if (Number.isFinite(timestamp) && timestamp > latestTimestamp) {
        latestTimestamp = timestamp;
      }
    });
    return latestTimestamp;
  };

  const latestTimestamp = Math.max(
    getLatestTimestamp(animeList, 'addedAt'),
    getLatestTimestamp(bookmarkList, 'bookmarkedAt')
  );

  return latestTimestamp > 0 ? new Date(latestTimestamp).toISOString() : null;
};

export const normalizeLibraryUpdatedAt = (value) => normalizeIsoDateString(value);

const getLibrarySnapshotUpdatedAtTime = (updatedAt) => {
  const normalizedUpdatedAt = normalizeLibraryUpdatedAt(updatedAt);
  if (!normalizedUpdatedAt) return 0;
  const parsed = Date.parse(normalizedUpdatedAt);
  return Number.isFinite(parsed) ? parsed : 0;
};

const buildLibrarySnapshotEntryKeySet = (animeList, bookmarkList) => {
  const keys = new Set();
  (Array.isArray(animeList) ? animeList : []).forEach((anime) => {
    const id = normalizeFiniteNumber(anime?.id);
    if (Number.isFinite(id)) keys.add(`anime:${id}`);
  });
  (Array.isArray(bookmarkList) ? bookmarkList : []).forEach((anime) => {
    const id = normalizeFiniteNumber(anime?.id);
    if (Number.isFinite(id)) keys.add(`bookmark:${id}`);
  });
  return keys;
};

const getLibrarySnapshotCoverage = (leftSnapshot, rightSnapshot) => {
  const leftKeys = buildLibrarySnapshotEntryKeySet(leftSnapshot?.animeList, leftSnapshot?.bookmarkList);
  const rightKeys = buildLibrarySnapshotEntryKeySet(rightSnapshot?.animeList, rightSnapshot?.bookmarkList);
  let leftHasExtra = false;
  let rightHasExtra = false;

  for (const key of leftKeys) {
    if (!rightKeys.has(key)) {
      leftHasExtra = true;
      break;
    }
  }

  for (const key of rightKeys) {
    if (!leftKeys.has(key)) {
      rightHasExtra = true;
      break;
    }
  }

  return {
    leftIsStrictSubset: !leftHasExtra && rightHasExtra,
    rightIsStrictSubset: !rightHasExtra && leftHasExtra,
  };
};

const openLibraryPersistentDatabase = () => new Promise((resolve, reject) => {
  const indexedDb = getSafeIndexedDb();
  if (!indexedDb) {
    resolve(null);
    return;
  }

  try {
    const request = indexedDb.open(
      LIBRARY_PERSISTENT_DB_NAME,
      LIBRARY_PERSISTENT_DB_VERSION
    );

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(LIBRARY_PERSISTENT_STORE_NAME)) {
        database.createObjectStore(LIBRARY_PERSISTENT_STORE_NAME, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed.'));
  } catch (error) {
    reject(error);
  }
});

const normalizeLibrarySnapshotEnvelope = (value) => {
  const animeList = Array.isArray(value?.animeList) ? value.animeList : [];
  const bookmarkList = Array.isArray(value?.bookmarkList) ? value.bookmarkList : [];
  return {
    animeList,
    bookmarkList,
    updatedAt: normalizeLibraryUpdatedAt(value?.updatedAt)
      || deriveLibraryUpdatedAtFromLists(animeList, bookmarkList),
  };
};

const readLibrarySnapshotFromIndexedDb = async () => {
  const database = await openLibraryPersistentDatabase();
  if (!database) return null;

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      try {
        callback();
      } finally {
        database.close();
      }
    };

    const transaction = database.transaction(LIBRARY_PERSISTENT_STORE_NAME, 'readonly');
    const store = transaction.objectStore(LIBRARY_PERSISTENT_STORE_NAME);
    const request = store.get(LIBRARY_PERSISTENT_SNAPSHOT_KEY);

    request.onsuccess = () => {
      finish(() => resolve(normalizeLibrarySnapshotEnvelope(request.result || null)));
    };
    request.onerror = () => {
      finish(() => reject(request.error || new Error('IndexedDB read failed.')));
    };
    transaction.onabort = () => {
      finish(() => reject(transaction.error || new Error('IndexedDB read aborted.')));
    };
  });
};

const writeLibrarySnapshotToIndexedDb = async ({ animeList, bookmarkList, updatedAt }) => {
  const database = await openLibraryPersistentDatabase();
  if (!database) return;

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      try {
        callback();
      } finally {
        database.close();
      }
    };

    const transaction = database.transaction(LIBRARY_PERSISTENT_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(LIBRARY_PERSISTENT_STORE_NAME);
    const request = store.put({
      key: LIBRARY_PERSISTENT_SNAPSHOT_KEY,
      animeList: Array.isArray(animeList) ? animeList : [],
      bookmarkList: Array.isArray(bookmarkList) ? bookmarkList : [],
      updatedAt: normalizeLibraryUpdatedAt(updatedAt)
        || deriveLibraryUpdatedAtFromLists(animeList, bookmarkList),
    });

    request.onerror = () => {
      finish(() => reject(request.error || new Error('IndexedDB write failed.')));
    };
    transaction.oncomplete = () => {
      finish(() => resolve());
    };
    transaction.onerror = () => {
      finish(() => reject(transaction.error || new Error('IndexedDB write failed.')));
    };
    transaction.onabort = () => {
      finish(() => reject(transaction.error || new Error('IndexedDB write aborted.')));
    };
  });
};

export const readLibrarySnapshotFromStorage = () => {
  const animeList = readListFromStorage(ANIME_LIST_STORAGE_KEY);
  const bookmarkList = readListFromStorage(BOOKMARK_LIST_STORAGE_KEY);
  const storage = getSafeLocalStorage();
  const fallbackUpdatedAt = deriveLibraryUpdatedAtFromLists(animeList, bookmarkList);

  if (!storage) {
    return {
      animeList,
      bookmarkList,
      updatedAt: fallbackUpdatedAt,
    };
  }

  try {
    const saved = storage.getItem(LIBRARY_SYNC_META_STORAGE_KEY);
    if (!saved) {
      return {
        animeList,
        bookmarkList,
        updatedAt: fallbackUpdatedAt,
      };
    }

    const parsed = JSON.parse(saved);
    const isSupported = (
      parsed
      && typeof parsed === 'object'
      && Number(parsed.version) >= 1
      && Number(parsed.version) <= LIBRARY_SYNC_META_SCHEMA_VERSION
    );

    return {
      animeList,
      bookmarkList,
      updatedAt: isSupported
        ? (normalizeLibraryUpdatedAt(parsed.updatedAt) || fallbackUpdatedAt)
        : fallbackUpdatedAt,
    };
  } catch (_) {
    return {
      animeList,
      bookmarkList,
      updatedAt: fallbackUpdatedAt,
    };
  }
};

export const readLibrarySnapshotFromPersistentStorage = async () => {
  const localSnapshot = readLibrarySnapshotFromStorage();
  let indexedDbSnapshot = null;

  try {
    indexedDbSnapshot = await readLibrarySnapshotFromIndexedDb();
  } catch (_) {
    indexedDbSnapshot = null;
  }

  const localUpdatedAtTime = getLibrarySnapshotUpdatedAtTime(localSnapshot?.updatedAt);
  const indexedDbUpdatedAtTime = getLibrarySnapshotUpdatedAtTime(indexedDbSnapshot?.updatedAt);
  const localHasData = (localSnapshot?.animeList?.length || 0) > 0 || (localSnapshot?.bookmarkList?.length || 0) > 0;
  const indexedDbHasData = (indexedDbSnapshot?.animeList?.length || 0) > 0 || (indexedDbSnapshot?.bookmarkList?.length || 0) > 0;
  const snapshotCoverage = getLibrarySnapshotCoverage(indexedDbSnapshot, localSnapshot);
  const shouldPreferIndexedDb = Boolean(indexedDbSnapshot) && (
    snapshotCoverage.rightIsStrictSubset
    || (
    indexedDbUpdatedAtTime > localUpdatedAtTime
    || (
      indexedDbUpdatedAtTime === localUpdatedAtTime
      && indexedDbHasData
      && !localHasData
    )
    )
  );

  return shouldPreferIndexedDb
    ? indexedDbSnapshot
    : localSnapshot;
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

export const writeLibrarySnapshotToStorage = ({ animeList, bookmarkList, updatedAt }) => {
  writeListToStorage(ANIME_LIST_STORAGE_KEY, animeList);
  writeListToStorage(BOOKMARK_LIST_STORAGE_KEY, bookmarkList);

  const storage = getSafeLocalStorage();
  if (!storage) return null;

  try {
    const normalizedUpdatedAt = (
      normalizeLibraryUpdatedAt(updatedAt)
      || deriveLibraryUpdatedAtFromLists(animeList, bookmarkList)
    );

    if (!normalizedUpdatedAt) {
      storage.removeItem(LIBRARY_SYNC_META_STORAGE_KEY);
      return null;
    }

    const payload = JSON.stringify({
      version: LIBRARY_SYNC_META_SCHEMA_VERSION,
      updatedAt: normalizedUpdatedAt,
    });

    if (storage.getItem(LIBRARY_SYNC_META_STORAGE_KEY) !== payload) {
      storage.setItem(LIBRARY_SYNC_META_STORAGE_KEY, payload);
    }

    return normalizedUpdatedAt;
  } catch (error) {
    console.warn('Storage access failed for library sync metadata:', error);
    return null;
  }
};

export const writeLibrarySnapshotToPersistentStorage = async ({ animeList, bookmarkList, updatedAt }) => {
  const normalizedUpdatedAt = writeLibrarySnapshotToStorage({
    animeList,
    bookmarkList,
    updatedAt,
  });

  try {
    await writeLibrarySnapshotToIndexedDb({
      animeList,
      bookmarkList,
      updatedAt: normalizedUpdatedAt || updatedAt,
    });
  } catch (_) {
    // Ignore IndexedDB write failures and keep the localStorage snapshot.
  }

  return normalizedUpdatedAt;
};
