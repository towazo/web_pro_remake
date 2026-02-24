export const HOME_STATS_CARD_BACKGROUND_STORAGE_KEY = 'homeStatsCardBackgrounds';

export const HOME_STATS_CARD_KEYS = Object.freeze({
  totalAnime: 'totalAnime',
  totalEpisodes: 'totalEpisodes',
  topGenre: 'topGenre',
});

const HOME_STATS_CARD_KEY_LIST = Object.values(HOME_STATS_CARD_KEYS);

const DEFAULT_POSITION = 50;

const clampPosition = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_POSITION;
  return Math.min(100, Math.max(0, Math.round(parsed)));
};

const createCardBackgroundEntry = (overrides = {}) => ({
  image: '',
  positionX: DEFAULT_POSITION,
  positionY: DEFAULT_POSITION,
  ...overrides,
});

export const createEmptyHomeStatsCardBackgrounds = () => ({
  [HOME_STATS_CARD_KEYS.totalAnime]: createCardBackgroundEntry(),
  [HOME_STATS_CARD_KEYS.totalEpisodes]: createCardBackgroundEntry(),
  [HOME_STATS_CARD_KEYS.topGenre]: createCardBackgroundEntry(),
});

const sanitizeCardBackgroundEntry = (value) => {
  if (typeof value === 'string') {
    return createCardBackgroundEntry({ image: value });
  }

  if (!value || typeof value !== 'object') {
    return createCardBackgroundEntry();
  }

  const image = typeof value.image === 'string'
    ? value.image
    : typeof value.url === 'string'
      ? value.url
      : '';

  return createCardBackgroundEntry({
    image,
    positionX: clampPosition(value.positionX),
    positionY: clampPosition(value.positionY),
  });
};

export const sanitizeHomeStatsCardBackgrounds = (value) => {
  const base = createEmptyHomeStatsCardBackgrounds();
  const source = value && typeof value === 'object' ? value : {};

  HOME_STATS_CARD_KEY_LIST.forEach((key) => {
    base[key] = sanitizeCardBackgroundEntry(source[key]);
  });

  return base;
};

export const readHomeStatsCardBackgroundsFromStorage = () => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return createEmptyHomeStatsCardBackgrounds();
  }
  try {
    const raw = window.localStorage.getItem(HOME_STATS_CARD_BACKGROUND_STORAGE_KEY);
    if (!raw) return createEmptyHomeStatsCardBackgrounds();
    const parsed = JSON.parse(raw);
    return sanitizeHomeStatsCardBackgrounds(parsed);
  } catch (_) {
    return createEmptyHomeStatsCardBackgrounds();
  }
};

export const writeHomeStatsCardBackgroundsToStorage = (value) => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const normalized = sanitizeHomeStatsCardBackgrounds(value);
  const hasAnyBackground = HOME_STATS_CARD_KEY_LIST.some((key) => normalized[key].image.trim().length > 0);

  try {
    if (hasAnyBackground) {
      window.localStorage.setItem(HOME_STATS_CARD_BACKGROUND_STORAGE_KEY, JSON.stringify(normalized));
    } else {
      window.localStorage.removeItem(HOME_STATS_CARD_BACKGROUND_STORAGE_KEY);
    }
  } catch (_) {
    // Ignore storage write failures (quota, private mode).
  }
};
