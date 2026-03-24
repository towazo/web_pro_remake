import {
  getDynamicTagTranslation,
  getStaticTagTranslation,
  mergeDynamicTagTranslations,
  translateTagFallback,
} from '../constants/animeData';
import { fetchAniListTagCatalog } from './animeService';
import { translateTexts } from './translationService';

const TAG_CATALOG_CACHE_KEY = 'anilist_tag_catalog_cache_v1';
const TAG_CATALOG_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const TAG_TRANSLATION_CHUNK_SIZE = 24;
const hasBrowserStorage = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

let warmTagTranslationPromise = null;

const normalizeTagName = (value) => String(value || '').trim();

const normalizeCatalogNames = (items) => {
  const seen = new Set();
  const normalized = [];

  (Array.isArray(items) ? items : []).forEach((item) => {
    const name = normalizeTagName(typeof item === 'string' ? item : item?.name);
    if (!name || seen.has(name)) return;
    seen.add(name);
    normalized.push(name);
  });

  return normalized.sort((left, right) => left.localeCompare(right, 'en'));
};

const readCachedTagCatalog = () => {
  if (!hasBrowserStorage) return { savedAt: 0, tags: [] };

  try {
    const raw = window.localStorage.getItem(TAG_CATALOG_CACHE_KEY);
    const parsed = JSON.parse(raw || '{}');
    return {
      savedAt: Number(parsed?.savedAt) || 0,
      tags: normalizeCatalogNames(parsed?.tags),
    };
  } catch (error) {
    console.error('Failed to read AniList tag catalog cache:', error);
    return { savedAt: 0, tags: [] };
  }
};

const writeCachedTagCatalog = (tags) => {
  if (!hasBrowserStorage) return;

  try {
    window.localStorage.setItem(TAG_CATALOG_CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      tags: normalizeCatalogNames(tags),
    }));
  } catch (error) {
    console.error('Failed to write AniList tag catalog cache:', error);
  }
};

const isCatalogCacheFresh = (savedAt) => (
  Number.isFinite(savedAt)
  && savedAt > 0
  && (Date.now() - savedAt) < TAG_CATALOG_TTL_MS
);

const loadAniListTagCatalog = async (options = {}) => {
  const cached = readCachedTagCatalog();
  if (!options.force && cached.tags.length > 0 && isCatalogCacheFresh(cached.savedAt)) {
    return cached.tags;
  }

  const fetchedTags = await fetchAniListTagCatalog(options);
  const fetchedNames = normalizeCatalogNames(fetchedTags);
  if (fetchedNames.length > 0) {
    writeCachedTagCatalog(fetchedNames);
    return fetchedNames;
  }

  return cached.tags;
};

const chunkArray = (items, size) => {
  const chunkSize = Math.max(1, Number(size) || TAG_TRANSLATION_CHUNK_SIZE);
  const chunks = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
};

const normalizeMachineTranslation = (source, translated) => {
  const sourceName = normalizeTagName(source);
  const translatedName = normalizeTagName(translated)
    .replace(/^[\s:：\-]+/, '')
    .replace(/\s+/g, ' ');

  if (!translatedName) {
    const fallback = translateTagFallback(sourceName);
    return fallback !== sourceName ? fallback : '';
  }

  if (translatedName === sourceName) {
    const fallback = translateTagFallback(sourceName);
    return fallback !== sourceName ? fallback : '';
  }

  return translatedName;
};

const shouldTranslateTag = (tagName) => {
  const normalizedName = normalizeTagName(tagName);
  if (!normalizedName) return false;
  if (!/[A-Za-z]/.test(normalizedName)) return false;
  if (getStaticTagTranslation(normalizedName)) return false;
  if (getDynamicTagTranslation(normalizedName)) return false;
  return true;
};

export const warmAniListTagTranslations = async (options = {}) => {
  if (warmTagTranslationPromise && !options.force) {
    return warmTagTranslationPromise;
  }

  const task = (async () => {
    const tagNames = await loadAniListTagCatalog(options);
    const missingTagNames = tagNames.filter(shouldTranslateTag);
    const chunks = chunkArray(missingTagNames, options.chunkSize || TAG_TRANSLATION_CHUNK_SIZE);
    let translatedCount = 0;

    for (const chunk of chunks) {
      const translatedList = await translateTexts(chunk, 'en', 'ja');
      const nextEntries = {};

      chunk.forEach((tagName, index) => {
        const translated = normalizeMachineTranslation(tagName, translatedList[index]);
        if (!translated) return;
        nextEntries[tagName] = translated;
      });

      const savedCount = Object.keys(nextEntries).length;
      if (savedCount > 0) {
        mergeDynamicTagTranslations(nextEntries);
        translatedCount += savedCount;
      }

      if (typeof options.onProgress === 'function') {
        try {
          options.onProgress({
            completed: Math.min(missingTagNames.length, translatedCount),
            total: missingTagNames.length,
            catalogSize: tagNames.length,
          });
        } catch (_) {
          // ignore callback errors
        }
      }
    }

    return {
      catalogSize: tagNames.length,
      translatedCount,
      pendingCount: tagNames.filter(shouldTranslateTag).length,
    };
  })();

  warmTagTranslationPromise = task.finally(() => {
    warmTagTranslationPromise = null;
  });

  return warmTagTranslationPromise;
};

export default warmAniListTagTranslations;
