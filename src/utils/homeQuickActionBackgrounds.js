export const HOME_QUICK_ACTION_BACKGROUND_STORAGE_KEY = 'homeQuickActionBackgrounds';

export const HOME_QUICK_ACTION_KEYS = Object.freeze({
  myList: 'myList',
  bookmarks: 'bookmarks',
  currentSeason: 'currentSeason',
  nextSeason: 'nextSeason',
});

const HOME_QUICK_ACTION_KEY_LIST = Object.values(HOME_QUICK_ACTION_KEYS);

const createBackgroundEntry = (overrides = {}) => ({
  image: '',
  positionX: 50,
  positionY: 50,
  ...overrides,
});

const sanitizeBackgroundEntry = (value) => {
  if (typeof value === 'string') {
    return createBackgroundEntry({ image: value });
  }

  if (!value || typeof value !== 'object') {
    return createBackgroundEntry();
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

  return createBackgroundEntry({
    image,
    positionX: parsePosition(value.positionX),
    positionY: parsePosition(value.positionY),
  });
};

export const createEmptyHomeQuickActionBackgrounds = () => ({
  [HOME_QUICK_ACTION_KEYS.myList]: createBackgroundEntry(),
  [HOME_QUICK_ACTION_KEYS.bookmarks]: createBackgroundEntry(),
  [HOME_QUICK_ACTION_KEYS.currentSeason]: createBackgroundEntry(),
  [HOME_QUICK_ACTION_KEYS.nextSeason]: createBackgroundEntry(),
});

export const sanitizeHomeQuickActionBackgrounds = (value) => {
  const base = createEmptyHomeQuickActionBackgrounds();
  const source = value && typeof value === 'object' ? value : {};

  HOME_QUICK_ACTION_KEY_LIST.forEach((key) => {
    base[key] = sanitizeBackgroundEntry(source[key]);
  });

  return base;
};

export const readHomeQuickActionBackgroundsFromStorage = () => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return createEmptyHomeQuickActionBackgrounds();
  }

  try {
    const raw = window.localStorage.getItem(HOME_QUICK_ACTION_BACKGROUND_STORAGE_KEY);
    if (!raw) return createEmptyHomeQuickActionBackgrounds();
    return sanitizeHomeQuickActionBackgrounds(JSON.parse(raw));
  } catch (_) {
    return createEmptyHomeQuickActionBackgrounds();
  }
};

export const writeHomeQuickActionBackgroundsToStorage = (value) => {
  if (typeof window === 'undefined' || !window.localStorage) return;

  const normalized = sanitizeHomeQuickActionBackgrounds(value);
  const hasAnyBackground = HOME_QUICK_ACTION_KEY_LIST.some((key) => normalized[key].image.trim().length > 0);

  try {
    if (hasAnyBackground) {
      window.localStorage.setItem(HOME_QUICK_ACTION_BACKGROUND_STORAGE_KEY, JSON.stringify(normalized));
    } else {
      window.localStorage.removeItem(HOME_QUICK_ACTION_BACKGROUND_STORAGE_KEY);
    }
  } catch (_) {
    // Ignore storage write failures.
  }
};
