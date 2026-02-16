const fs = require('node:fs/promises');

const WRITE_JSON_SPACES = 2;
const EMPTY_LIBRARY = {
  version: 1,
  animeList: [],
  bookmarkList: [],
  updatedAt: null,
};

const nowIso = () => new Date().toISOString();

const sanitizeAnimeCollection = (list) => {
  if (!Array.isArray(list)) return [];
  const unique = new Set();
  const output = [];

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const id = Number(item.id);
    if (!Number.isFinite(id) || unique.has(id)) continue;
    unique.add(id);
    output.push({ ...item, id });
    if (output.length >= 5000) break;
  }

  return output;
};

const normalizeLibraryPayload = (animeList, bookmarkList) => {
  const safeAnimeList = sanitizeAnimeCollection(animeList);
  const watchedIds = new Set(safeAnimeList.map((item) => item.id));
  const safeBookmarkList = sanitizeAnimeCollection(bookmarkList)
    .filter((item) => !watchedIds.has(item.id));
  return { animeList: safeAnimeList, bookmarkList: safeBookmarkList };
};

const pickNewestLegacyRecord = (users) => {
  const records = Object.values(users || {}).filter((record) => record && typeof record === 'object');
  if (records.length === 0) return null;

  const toTime = (value) => {
    if (typeof value !== 'string' || !value.trim()) return 0;
    const time = Date.parse(value);
    return Number.isNaN(time) ? 0 : time;
  };

  let selected = null;
  let selectedTime = 0;
  for (const record of records) {
    const currentTime = Math.max(
      toTime(record.updatedAt),
      toTime(record.cloudInitializedAt),
      toTime(record.lastLoginAt)
    );
    const hasData = (Array.isArray(record.animeList) && record.animeList.length > 0)
      || (Array.isArray(record.bookmarkList) && record.bookmarkList.length > 0);
    if (!hasData) continue;

    if (!selected || currentTime >= selectedTime) {
      selected = record;
      selectedTime = currentTime;
    }
  }

  return selected;
};

const createLibraryStore = ({
  dataDir,
  dataFile,
  legacyUsersFile,
  onLegacyMigrated = () => {},
}) => {
  const ensureDataFile = async () => {
    await fs.mkdir(dataDir, { recursive: true });
    try {
      await fs.access(dataFile);
    } catch (_) {
      await fs.writeFile(dataFile, JSON.stringify(EMPTY_LIBRARY, null, WRITE_JSON_SPACES), 'utf8');
    }
  };

  const writeLibraryStore = async (store) => {
    await ensureDataFile();
    await fs.writeFile(dataFile, JSON.stringify(store, null, WRITE_JSON_SPACES), 'utf8');
  };

  const readLegacyLibraryStore = async () => {
    try {
      const raw = await fs.readFile(legacyUsersFile, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !parsed.users || typeof parsed.users !== 'object') {
        return null;
      }

      const latestRecord = pickNewestLegacyRecord(parsed.users);
      if (!latestRecord) return null;

      const normalized = normalizeLibraryPayload(latestRecord.animeList, latestRecord.bookmarkList);
      if (normalized.animeList.length === 0 && normalized.bookmarkList.length === 0) {
        return null;
      }

      return {
        animeList: normalized.animeList,
        bookmarkList: normalized.bookmarkList,
        updatedAt: typeof latestRecord.updatedAt === 'string' ? latestRecord.updatedAt : nowIso(),
      };
    } catch (_) {
      return null;
    }
  };

  const readLibraryStore = async () => {
    await ensureDataFile();
    try {
      const raw = await fs.readFile(dataFile, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return { ...EMPTY_LIBRARY };

      const normalizedStore = {
        version: Number(parsed.version) || 1,
        animeList: sanitizeAnimeCollection(parsed.animeList),
        bookmarkList: sanitizeAnimeCollection(parsed.bookmarkList),
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
      };

      const hasLibraryData = normalizedStore.animeList.length > 0 || normalizedStore.bookmarkList.length > 0;
      if (!hasLibraryData) {
        const legacy = await readLegacyLibraryStore();
        if (legacy) {
          const migrated = {
            ...normalizedStore,
            animeList: legacy.animeList,
            bookmarkList: legacy.bookmarkList,
            updatedAt: legacy.updatedAt,
          };
          await writeLibraryStore(migrated);
          onLegacyMigrated({
            animeCount: migrated.animeList.length,
            bookmarkCount: migrated.bookmarkList.length,
          });
          return migrated;
        }
      }

      return normalizedStore;
    } catch (_) {
      return { ...EMPTY_LIBRARY };
    }
  };

  let mutationQueue = Promise.resolve();
  const mutateStore = (mutator) => {
    const operation = mutationQueue.then(async () => {
      const store = await readLibraryStore();
      const result = await mutator(store);
      await writeLibraryStore(store);
      return result;
    });
    mutationQueue = operation.then(() => undefined, () => undefined);
    return operation;
  };

  return {
    dataFile,
    readLibraryStore,
    mutateStore,
    normalizeLibraryPayload,
  };
};

module.exports = {
  createLibraryStore,
};
