export const HOME_FEATURED_SLIDER_SOURCE_STORAGE_KEY = 'homeFeaturedSliderSource';

export const HOME_FEATURED_SLIDER_SOURCES = Object.freeze({
  myList: 'mylist',
  currentSeason: 'currentSeason',
});

const HOME_FEATURED_SLIDER_SOURCE_LABELS = Object.freeze({
  [HOME_FEATURED_SLIDER_SOURCES.myList]: 'マイリスト',
  [HOME_FEATURED_SLIDER_SOURCES.currentSeason]: '今季放送中',
});

export const sanitizeHomeFeaturedSliderSource = (value) => (
  value === HOME_FEATURED_SLIDER_SOURCES.myList
    ? HOME_FEATURED_SLIDER_SOURCES.myList
    : HOME_FEATURED_SLIDER_SOURCES.currentSeason
);

export const getHomeFeaturedSliderSourceLabel = (value) => (
  HOME_FEATURED_SLIDER_SOURCE_LABELS[sanitizeHomeFeaturedSliderSource(value)]
);

export const readHomeFeaturedSliderSourceFromStorage = () => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return HOME_FEATURED_SLIDER_SOURCES.currentSeason;
  }

  try {
    const raw = window.localStorage.getItem(HOME_FEATURED_SLIDER_SOURCE_STORAGE_KEY);
    return sanitizeHomeFeaturedSliderSource(raw);
  } catch (_) {
    return HOME_FEATURED_SLIDER_SOURCES.currentSeason;
  }
};

export const writeHomeFeaturedSliderSourceToStorage = (value) => {
  if (typeof window === 'undefined' || !window.localStorage) return;

  const normalized = sanitizeHomeFeaturedSliderSource(value);

  try {
    if (normalized === HOME_FEATURED_SLIDER_SOURCES.currentSeason) {
      window.localStorage.removeItem(HOME_FEATURED_SLIDER_SOURCE_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(HOME_FEATURED_SLIDER_SOURCE_STORAGE_KEY, normalized);
  } catch (_) {
    // Ignore storage write failures (quota, private mode).
  }
};
