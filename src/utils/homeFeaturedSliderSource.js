import { getSafeLocalStorage } from './browserStorage';

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
  value === HOME_FEATURED_SLIDER_SOURCES.currentSeason
    ? HOME_FEATURED_SLIDER_SOURCES.currentSeason
    : HOME_FEATURED_SLIDER_SOURCES.myList
);

export const getHomeFeaturedSliderSourceLabel = (value) => (
  HOME_FEATURED_SLIDER_SOURCE_LABELS[sanitizeHomeFeaturedSliderSource(value)]
);

export const readHomeFeaturedSliderSourceFromStorage = () => {
  const storage = getSafeLocalStorage();
  if (!storage) {
    return HOME_FEATURED_SLIDER_SOURCES.myList;
  }

  try {
    const raw = storage.getItem(HOME_FEATURED_SLIDER_SOURCE_STORAGE_KEY);
    return sanitizeHomeFeaturedSliderSource(raw);
  } catch (_) {
    return HOME_FEATURED_SLIDER_SOURCES.myList;
  }
};

export const writeHomeFeaturedSliderSourceToStorage = (value) => {
  const storage = getSafeLocalStorage();
  if (!storage) return;

  const normalized = sanitizeHomeFeaturedSliderSource(value);

  try {
    if (normalized === HOME_FEATURED_SLIDER_SOURCES.myList) {
      storage.removeItem(HOME_FEATURED_SLIDER_SOURCE_STORAGE_KEY);
      return;
    }

    storage.setItem(HOME_FEATURED_SLIDER_SOURCE_STORAGE_KEY, normalized);
  } catch (_) {
    // Ignore storage write failures (quota, private mode).
  }
};
