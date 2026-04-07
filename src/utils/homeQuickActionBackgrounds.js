export const HOME_QUICK_ACTION_BACKGROUND_STORAGE_KEY = 'homeQuickActionBackgrounds';

const HOME_QUICK_ACTION_BACKGROUND_DB_NAME = 'AniTriggerClientStorage';
const HOME_QUICK_ACTION_BACKGROUND_DB_VERSION = 1;
const HOME_QUICK_ACTION_BACKGROUND_STORE_NAME = 'settings';

export const HOME_QUICK_ACTION_KEYS = Object.freeze({
  myList: 'myList',
  bookmarks: 'bookmarks',
  currentSeason: 'currentSeason',
  nextSeason: 'nextSeason',
});

export const HOME_QUICK_ACTION_OVERLAY_TONES = Object.freeze({
  dark: 'dark',
  light: 'light',
});

const HOME_QUICK_ACTION_KEY_LIST = Object.values(HOME_QUICK_ACTION_KEYS);
const HOME_QUICK_ACTION_LIBRARY_KEYS = new Set([
  HOME_QUICK_ACTION_KEYS.myList,
  HOME_QUICK_ACTION_KEYS.bookmarks,
]);

const hasLocalStorage = () => (
  typeof window !== 'undefined'
  && typeof window.localStorage !== 'undefined'
);

const hasIndexedDb = () => (
  typeof window !== 'undefined'
  && typeof window.indexedDB !== 'undefined'
);

export const getDefaultHomeQuickActionOverlayTone = (key) => (
  HOME_QUICK_ACTION_LIBRARY_KEYS.has(key)
    ? HOME_QUICK_ACTION_OVERLAY_TONES.dark
    : HOME_QUICK_ACTION_OVERLAY_TONES.light
);

const normalizeOverlayTone = (value, key) => (
  value === HOME_QUICK_ACTION_OVERLAY_TONES.light
    ? HOME_QUICK_ACTION_OVERLAY_TONES.light
    : value === HOME_QUICK_ACTION_OVERLAY_TONES.dark
      ? HOME_QUICK_ACTION_OVERLAY_TONES.dark
      : getDefaultHomeQuickActionOverlayTone(key)
);

const createBackgroundEntry = (key, overrides = {}) => ({
  image: '',
  positionX: 50,
  positionY: 50,
  overlayTone: getDefaultHomeQuickActionOverlayTone(key),
  ...overrides,
});

const sanitizeBackgroundEntry = (key, value) => {
  if (typeof value === 'string') {
    return createBackgroundEntry(key, { image: value });
  }

  if (!value || typeof value !== 'object') {
    return createBackgroundEntry(key);
  }

  const image = typeof value.image === 'string'
    ? value.image
    : typeof value.url === 'string'
      ? value.url
      : '';

  const parsePosition = (candidate) => {
    const parsed = Number(candidate);
    if (!Number.isFinite(parsed)) return 50;
    return Math.min(100, Math.max(0, Math.round(parsed)));
  };

  return createBackgroundEntry(key, {
    image,
    positionX: parsePosition(value.positionX),
    positionY: parsePosition(value.positionY),
    overlayTone: normalizeOverlayTone(value.overlayTone ?? value.overlayColor, key),
  });
};

export const createEmptyHomeQuickActionBackgrounds = () => ({
  [HOME_QUICK_ACTION_KEYS.myList]: createBackgroundEntry(HOME_QUICK_ACTION_KEYS.myList),
  [HOME_QUICK_ACTION_KEYS.bookmarks]: createBackgroundEntry(HOME_QUICK_ACTION_KEYS.bookmarks),
  [HOME_QUICK_ACTION_KEYS.currentSeason]: createBackgroundEntry(HOME_QUICK_ACTION_KEYS.currentSeason),
  [HOME_QUICK_ACTION_KEYS.nextSeason]: createBackgroundEntry(HOME_QUICK_ACTION_KEYS.nextSeason),
});

export const sanitizeHomeQuickActionBackgrounds = (value) => {
  const base = createEmptyHomeQuickActionBackgrounds();
  const source = value && typeof value === 'object' ? value : {};

  HOME_QUICK_ACTION_KEY_LIST.forEach((key) => {
    base[key] = sanitizeBackgroundEntry(key, source[key]);
  });

  return base;
};

const createBackgroundEnvelope = (value, updatedAt = Date.now()) => ({
  updatedAt: Number.isFinite(Number(updatedAt)) ? Number(updatedAt) : Date.now(),
  value: sanitizeHomeQuickActionBackgrounds(value),
});

const parseBackgroundEnvelope = (raw) => {
  if (!raw) return null;

  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  if (
    parsed
    && typeof parsed === 'object'
    && !Array.isArray(parsed)
    && Object.prototype.hasOwnProperty.call(parsed, 'value')
  ) {
    return {
      updatedAt: Number.isFinite(Number(parsed.updatedAt)) ? Number(parsed.updatedAt) : 0,
      value: sanitizeHomeQuickActionBackgrounds(parsed.value),
    };
  }

  return {
    updatedAt: 0,
    value: sanitizeHomeQuickActionBackgrounds(parsed),
  };
};

const readHomeQuickActionBackgroundEnvelopeFromLocalStorage = () => {
  if (!hasLocalStorage()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(HOME_QUICK_ACTION_BACKGROUND_STORAGE_KEY);
    return parseBackgroundEnvelope(raw);
  } catch (_) {
    return null;
  }
};

const writeHomeQuickActionBackgroundEnvelopeToLocalStorage = (envelope) => {
  if (!hasLocalStorage()) return;

  try {
    window.localStorage.setItem(
      HOME_QUICK_ACTION_BACKGROUND_STORAGE_KEY,
      JSON.stringify(envelope)
    );
  } catch (_) {
    // Ignore storage write failures.
  }
};

const openHomeQuickActionBackgroundDatabase = () => new Promise((resolve, reject) => {
  if (!hasIndexedDb()) {
    resolve(null);
    return;
  }

  try {
    const request = window.indexedDB.open(
      HOME_QUICK_ACTION_BACKGROUND_DB_NAME,
      HOME_QUICK_ACTION_BACKGROUND_DB_VERSION
    );

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(HOME_QUICK_ACTION_BACKGROUND_STORE_NAME)) {
        database.createObjectStore(HOME_QUICK_ACTION_BACKGROUND_STORE_NAME, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed.'));
  } catch (error) {
    reject(error);
  }
});

const readHomeQuickActionBackgroundEnvelopeFromIndexedDb = async () => {
  const database = await openHomeQuickActionBackgroundDatabase();
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

    const transaction = database.transaction(HOME_QUICK_ACTION_BACKGROUND_STORE_NAME, 'readonly');
    const store = transaction.objectStore(HOME_QUICK_ACTION_BACKGROUND_STORE_NAME);
    const request = store.get(HOME_QUICK_ACTION_BACKGROUND_STORAGE_KEY);

    request.onsuccess = () => {
      finish(() => resolve(parseBackgroundEnvelope(request.result || null)));
    };
    request.onerror = () => {
      finish(() => reject(request.error || new Error('IndexedDB read failed.')));
    };
    transaction.onabort = () => {
      finish(() => reject(transaction.error || new Error('IndexedDB read aborted.')));
    };
  });
};

const writeHomeQuickActionBackgroundEnvelopeToIndexedDb = async (envelope) => {
  const database = await openHomeQuickActionBackgroundDatabase();
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

    const transaction = database.transaction(HOME_QUICK_ACTION_BACKGROUND_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(HOME_QUICK_ACTION_BACKGROUND_STORE_NAME);
    const request = store.put({
      key: HOME_QUICK_ACTION_BACKGROUND_STORAGE_KEY,
      updatedAt: envelope.updatedAt,
      value: envelope.value,
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

export const readHomeQuickActionBackgroundsFromStorage = () => {
  const envelope = readHomeQuickActionBackgroundEnvelopeFromLocalStorage();
  return envelope?.value || createEmptyHomeQuickActionBackgrounds();
};

export const writeHomeQuickActionBackgroundsToStorage = (value, updatedAt = Date.now()) => {
  const envelope = createBackgroundEnvelope(value, updatedAt);
  writeHomeQuickActionBackgroundEnvelopeToLocalStorage(envelope);
};

export const readHomeQuickActionBackgroundsFromPersistentStorage = async () => {
  const localEnvelope = readHomeQuickActionBackgroundEnvelopeFromLocalStorage();
  let indexedDbEnvelope = null;

  try {
    indexedDbEnvelope = await readHomeQuickActionBackgroundEnvelopeFromIndexedDb();
  } catch (_) {
    indexedDbEnvelope = null;
  }

  const preferredEnvelope = indexedDbEnvelope && (!localEnvelope || indexedDbEnvelope.updatedAt >= localEnvelope.updatedAt)
    ? indexedDbEnvelope
    : localEnvelope;

  return preferredEnvelope?.value || createEmptyHomeQuickActionBackgrounds();
};

export const writeHomeQuickActionBackgroundsToPersistentStorage = async (value) => {
  const envelope = createBackgroundEnvelope(value);
  writeHomeQuickActionBackgroundsToStorage(envelope.value, envelope.updatedAt);

  try {
    await writeHomeQuickActionBackgroundEnvelopeToIndexedDb(envelope);
  } catch (_) {
    // Ignore IndexedDB write failures and fall back to localStorage only.
  }
};
