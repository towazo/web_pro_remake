export const getSafeLocalStorage = () => {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage || null;
  } catch (_) {
    return null;
  }
};

export const getSafeIndexedDb = () => {
  if (typeof window === 'undefined') return null;

  try {
    return window.indexedDB || null;
  } catch (_) {
    return null;
  }
};
