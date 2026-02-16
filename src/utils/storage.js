export const ANIME_LIST_STORAGE_KEY = 'myAnimeList';
export const BOOKMARK_LIST_STORAGE_KEY = 'myAnimeBookmarkList';

export const readListFromStorage = (key) => {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
};

export const writeListToStorage = (key, list) => {
  if (Array.isArray(list) && list.length > 0) {
    localStorage.setItem(key, JSON.stringify(list));
  } else {
    localStorage.removeItem(key);
  }
};
