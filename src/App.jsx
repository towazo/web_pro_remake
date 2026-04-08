import { useState, useEffect, useMemo, useRef, useCallback } from 'react';

// Services
import { buildFeaturedSliderState, fetchAnimeByYearAllPages, fetchAnimeDetailsByIds } from './services/animeService';
import { fetchLibrarySnapshot, saveLibrarySnapshot } from './services/libraryService';
import { loadYouTubeIframeApi } from './services/youtubePlayerService';
import { APP_VIEW_HASHES, APP_VIEW_SET, getViewFromLocation } from './utils/appView';
import {
  getCurrentSeasonInfo,
  getNextSeasonInfo,
  seasonToFilterKey,
  SEASON_LABELS,
} from './utils/season';
import {
  ANIME_LIST_STORAGE_KEY,
  BOOKMARK_LIST_STORAGE_KEY,
  readListFromStorage,
  writeListToStorage,
} from './utils/storage';
import {
  filterDisplayEligibleAnimeList,
  isDisplayEligibleAnime,
} from './utils/contentFilters';

// Components
import HeroSlider from './components/Hero/HeroSlider';
import AnimeCard from './components/Cards/AnimeCard';
import HomeCustomizeHubScreen from './components/Home/HomeCustomizeHubScreen';
import HomeFeaturedSliderCustomizeScreen from './components/Home/HomeFeaturedSliderCustomizeScreen';
import HomeQuickActionsCustomizeScreen from './components/Home/HomeQuickActionsCustomizeScreen';
import HomeQuickActionsSection from './components/Home/HomeQuickActionsSection';
import StatsSection from './components/Stats/StatsSection';
import WatchRankingSection from './components/Stats/WatchRankingSection';
import HomeStatsCustomizeScreen from './components/Stats/HomeStatsCustomizeScreen';
import AddAnimeScreen from './components/AddAnime/AddAnimeScreen';
import BookmarkScreen from './components/Bookmarks/BookmarkScreen';
import ShareScreen from './components/Share/ShareScreen';
import AnimeFilterDialog from './components/Shared/AnimeFilterDialog';
import AnimeSortControl from './components/Shared/AnimeSortControl';
import TrailerModal from './components/Shared/TrailerModal';
import {
  readHomeStatsCardBackgroundsFromStorage,
  sanitizeHomeStatsCardBackgrounds,
  writeHomeStatsCardBackgroundsToStorage,
} from './utils/homeStatsBackgrounds';
import {
  readHomeQuickActionBackgroundsFromStorage,
  readHomeQuickActionBackgroundsFromPersistentStorage,
  sanitizeHomeQuickActionBackgrounds,
  writeHomeQuickActionBackgroundsToPersistentStorage,
} from './utils/homeQuickActionBackgrounds';
import {
  HOME_FEATURED_SLIDER_SOURCES,
  getHomeFeaturedSliderSourceLabel,
  readHomeFeaturedSliderSourceFromStorage,
  writeHomeFeaturedSliderSourceToStorage,
} from './utils/homeFeaturedSliderSource';
import {
  ANIME_SORT_OPTIONS,
  buildFilteredAnimeList,
  normalizeAnimeRating,
  normalizeAnimeWatchCount,
} from './utils/animeList';
import { warmAniListTagTranslations } from './services/tagCatalogService';
import useTagTranslationVersion from './hooks/useTagTranslationVersion';
import {
  collectAnimeFilterOptions,
  normalizeAnimeTags,
} from './utils/animeFilters';
import {
  canAttemptTrailerPlayback,
  isSameAnimeTrailer,
  normalizeAnimeTrailer,
} from './utils/trailer';
import {
  probeAnimeTrailerPlayback,
  TRAILER_PROBE_PRIORITY_USER_INITIATED,
} from './hooks/useTrailerPlaybackStatus';

const ONBOARDING_STEPS = [
  {
    key: 'intro',
    title: 'AniTriggerへようこそ',
    description: 'このサイトでは、視聴したアニメをマイリストに登録し、記録・振り返り・共有をすることができます。',
  },
  {
    key: 'mylist',
    title: 'マイリスト機能',
    description: '視聴した作品を登録して、評価や履歴を管理できます。',
  },
  {
    key: 'bookmark',
    title: 'ブックマーク機能',
    description: '気になる作品や今期・来季のアニメをまとめて確認できます。',
  },
  {
    key: 'add',
    title: '作品追加機能',
    description: '検索・年代リストなどから作品を追加できます。',
  },
  {
    key: 'share',
    title: '共有機能',
    description: '登録した作品を画像やテキストでSNSなどへ共有できます。',
  },
  {
    key: 'start',
    title: '作品を追加してみよう',
    description: '今季の作品をまとめて確認するか、タイトル検索で追加を始められます。',
  },
];

const DETAIL_ENRICHMENT_BATCH_SIZE = 12;
const DETAIL_ENRICHMENT_RETRY_BASE_MS = 4000;
const DETAIL_ENRICHMENT_RETRY_MAX_MS = 60000;
const FEATURED_SLIDER_CURRENT_SEASON_FORMATS = Object.freeze(['TV', 'TV_SHORT', 'MOVIE', 'ONA']);

const getFeaturedSliderBuildOptions = (source) => (
  source === HOME_FEATURED_SLIDER_SOURCES.currentSeason
    ? {
      selectionReasonLabel: '今季放送中アニメ作品',
      staticSelectionReasonLabel: '今季放送中アニメ作品',
      sourceType: 'current-season-balanced-shuffle',
      emptyState: 'empty',
    }
    : {
      selectionReasonLabel: 'マイリスト登録作品',
      staticSelectionReasonLabel: 'マイリスト登録作品',
      sourceType: 'mylist-balanced-shuffle',
      emptyState: 'tutorial',
    }
);

const hasLoadedAnimeTagDetails = (anime) => Array.isArray(anime?.tags);
const hasLoadedAnimeDetailPayload = (anime) => (
  Boolean(anime)
  && hasLoadedAnimeTagDetails(anime)
  && anime?.trailerChecked === true
);

const getDetailEnrichmentRetryDelayMs = (attemptCount) => {
  const safeAttemptCount = Math.max(1, Number(attemptCount) || 1);
  const retryDelay = DETAIL_ENRICHMENT_RETRY_BASE_MS * (2 ** Math.max(0, safeAttemptCount - 1));
  return Math.min(DETAIL_ENRICHMENT_RETRY_MAX_MS, retryDelay);
};

/**
 * Main App Component
 * Responsible for routing, global state management, and data orchestration.
 */
function App() {
  const sanitizeAnimeList = (list, options = {}) => filterDisplayEligibleAnimeList(Array.isArray(list) ? list : [], {
    // Keep legacy items that do not include format/country metadata.
    allowUnknownFormat: true,
    allowUnknownCountry: true,
  }).map((anime) => {
    const normalizedRating = normalizeAnimeRating(anime?.rating);
    const hasTagList = Array.isArray(anime?.tags);
    const hasTrailerField = Object.prototype.hasOwnProperty.call(anime || {}, 'trailer');
    const hasTrailerCheckedField = Object.prototype.hasOwnProperty.call(anime || {}, 'trailerChecked');
    const hasDefaultWatchCount = Object.prototype.hasOwnProperty.call(options, 'defaultWatchCount');
    const normalizedWatchCount = normalizeAnimeWatchCount(anime?.watchCount, {
      minimum: options.minimumWatchCount ?? 0,
      ...(hasDefaultWatchCount ? { defaultValue: options.defaultWatchCount } : {}),
    });
    const normalizedTrailer = normalizeAnimeTrailer(anime?.trailer);
    const normalizedTrailerChecked = anime?.trailerChecked === true;
    const currentWatchCount = Object.prototype.hasOwnProperty.call(anime || {}, 'watchCount')
      ? anime.watchCount
      : hasDefaultWatchCount
        ? undefined
        : null;

    if (
      (anime?.rating ?? null) === normalizedRating
      && !hasTagList
      && currentWatchCount === normalizedWatchCount
      && (!hasTrailerField || isSameAnimeTrailer(anime?.trailer, normalizedTrailer))
      && (!hasTrailerCheckedField || anime?.trailerChecked === normalizedTrailerChecked)
    ) {
      return anime;
    }

    const nextAnime = { ...anime, rating: normalizedRating };
    if (hasTagList) {
      nextAnime.tags = normalizeAnimeTags(anime.tags);
    }
    if (normalizedWatchCount === null) {
      delete nextAnime.watchCount;
    } else {
      nextAnime.watchCount = normalizedWatchCount;
    }
    if (hasTrailerField) {
      nextAnime.trailer = normalizedTrailer;
    }
    if (hasTrailerCheckedField) {
      nextAnime.trailerChecked = normalizedTrailerChecked;
    }
    return nextAnime;
  });
  const sanitizeWatchedAnimeList = (list) => sanitizeAnimeList(list, {
    minimumWatchCount: 1,
    defaultWatchCount: 1,
  });
  const sanitizeBookmarkAnimeList = (list) => sanitizeAnimeList(list);

  // Initialize state from localStorage if available
  const [animeList, setAnimeList] = useState(() => sanitizeWatchedAnimeList(readListFromStorage(ANIME_LIST_STORAGE_KEY)));
  const [bookmarkList, setBookmarkList] = useState(() => sanitizeBookmarkAnimeList(readListFromStorage(BOOKMARK_LIST_STORAGE_KEY)));

  const [view, setView] = useState(() => {
    if (typeof window === 'undefined') return 'home';
    return getViewFromLocation(window.location.hash, window.location.pathname);
  });
  const currentSeasonInfo = useMemo(() => getCurrentSeasonInfo(), []);
  const nextSeasonInfo = useMemo(() => getNextSeasonInfo(currentSeasonInfo), [currentSeasonInfo]);
  const currentSeasonLabel = `${currentSeasonInfo.year}年${SEASON_LABELS[currentSeasonInfo.season] || ''}`;
  const nextSeasonLabel = `${nextSeasonInfo.year}年${SEASON_LABELS[nextSeasonInfo.season] || ''}`;
  const currentSeasonAddPreset = useMemo(() => ({
    year: currentSeasonInfo.year,
    mediaSeason: currentSeasonInfo.season,
    seasonKey: seasonToFilterKey(currentSeasonInfo.season),
    statusIn: ['RELEASING', 'NOT_YET_RELEASED', 'HIATUS'],
    statusNot: 'CANCELLED',
    title: `今期放送中アニメ (${currentSeasonLabel})`,
    description: '今期に放送中の作品を表示しています。ブックマークやマイリストに追加できます。',
    locked: true,
  }), [currentSeasonInfo, currentSeasonLabel]);
  const nextSeasonAddPreset = useMemo(() => ({
    year: nextSeasonInfo.year,
    mediaSeason: nextSeasonInfo.season,
    seasonKey: seasonToFilterKey(nextSeasonInfo.season),
    statusIn: ['NOT_YET_RELEASED', 'RELEASING'],
    statusNot: 'CANCELLED',
    title: `来季放送予定アニメ (${nextSeasonLabel})`,
    description: '来季に放送予定の作品を表示しています。気になる作品を先にブックマークできます。',
    locked: true,
  }), [nextSeasonInfo, nextSeasonLabel]);
  const [homeFeaturedSliderSource, setHomeFeaturedSliderSource] = useState(() =>
    readHomeFeaturedSliderSourceFromStorage()
  );
  const [currentSeasonFeaturedAnimeList, setCurrentSeasonFeaturedAnimeList] = useState([]);
  const [isCurrentSeasonFeaturedLoading, setIsCurrentSeasonFeaturedLoading] = useState(false);
  const [hasCurrentSeasonFeaturedLoaded, setHasCurrentSeasonFeaturedLoaded] = useState(false);
  const [hasCurrentSeasonFeaturedError, setHasCurrentSeasonFeaturedError] = useState(false);
  const [featuredSliderState, setFeaturedSliderState] = useState(() => (
    homeFeaturedSliderSource === HOME_FEATURED_SLIDER_SOURCES.currentSeason
      ? buildFeaturedSliderState([], getFeaturedSliderBuildOptions(HOME_FEATURED_SLIDER_SOURCES.currentSeason))
      : buildFeaturedSliderState(animeList, getFeaturedSliderBuildOptions(HOME_FEATURED_SLIDER_SOURCES.myList))
  ));
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [selectedYear, setSelectedYear] = useState('');
  const [minRating, setMinRating] = useState('');
  const [filterMatchMode, setFilterMatchMode] = useState('and');
  const [sortKey, setSortKey] = useState("added"); // 'added', 'title', 'year', 'rating'
  const [sortOrder, setSortOrder] = useState("desc"); // 'desc', 'asc'
  const [homeStatsCardBackgrounds, setHomeStatsCardBackgrounds] = useState(() =>
    readHomeStatsCardBackgroundsFromStorage()
  );
  const [homeQuickActionBackgrounds, setHomeQuickActionBackgrounds] = useState(() =>
    readHomeQuickActionBackgroundsFromStorage()
  );
  const [isHomeQuickActionBackgroundsHydrated, setIsHomeQuickActionBackgroundsHydrated] = useState(false);
  const [seasonalAddSource, setSeasonalAddSource] = useState('home');
  const [quickNavState, setQuickNavState] = useState({
    visible: false,
    mobile: false,
    nearTop: true,
    nearBottom: false,
  });
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedAnimeIds, setSelectedAnimeIds] = useState([]);
  const [bookmarkVisibleAnimeIds, setBookmarkVisibleAnimeIds] = useState([]);
  const [sharePresetAnimeIds, setSharePresetAnimeIds] = useState([]);
  const [isOnboardingDismissed, setIsOnboardingDismissed] = useState(false);
  const [isOnboardingCurrentSeasonFlow, setIsOnboardingCurrentSeasonFlow] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [isRefreshingFeatured, setIsRefreshingFeatured] = useState(false);
  const [activeTrailerAnime, setActiveTrailerAnime] = useState(null);
  const [isServerLibraryReady, setIsServerLibraryReady] = useState(false);
  const [detailEnrichmentRetryTick, setDetailEnrichmentRetryTick] = useState(0);
  const [myListViewportPriorityMap, setMyListViewportPriorityMap] = useState({});
  const navigationTypeRef = useRef('init');
  const serverSaveDebounceRef = useRef(null);
  const featuredRefreshTimerRef = useRef(null);
  const featuredShuffleTokenRef = useRef(0);
  const featuredSourceAnimeListRef = useRef(animeList);
  const currentSeasonFeaturedRequestIdRef = useRef(0);
  const detailEnrichmentStateRef = useRef(new Map());
  const detailEnrichmentRequestInFlightRef = useRef(false);
  const detailEnrichmentAbortControllerRef = useRef(null);
  const detailEnrichmentRetryTimerRef = useRef(null);
  const detailEnrichmentMountedRef = useRef(true);
  const trailerOpenRequestIdRef = useRef(0);
  const isOnboardingActive = animeList.length === 0 && !isOnboardingDismissed;
  const tagTranslationVersion = useTagTranslationVersion();
  const hasCurrentSeasonFeaturedSlides = currentSeasonFeaturedAnimeList.length > 0;
  const effectiveFeaturedSliderSource = homeFeaturedSliderSource;
  const featuredSourceAnimeList = useMemo(
    () => (effectiveFeaturedSliderSource === HOME_FEATURED_SLIDER_SOURCES.currentSeason
      ? currentSeasonFeaturedAnimeList
      : animeList),
    [animeList, currentSeasonFeaturedAnimeList, effectiveFeaturedSliderSource]
  );
  const featuredSliderSourceLabel = useMemo(
    () => getHomeFeaturedSliderSourceLabel(homeFeaturedSliderSource),
    [homeFeaturedSliderSource]
  );
  const myListIdSet = useMemo(
    () => new Set(animeList.map((anime) => Number(anime?.id)).filter(Number.isFinite)),
    [animeList]
  );
  const bookmarkIdSet = useMemo(
    () => new Set(bookmarkList.map((anime) => Number(anime?.id)).filter(Number.isFinite)),
    [bookmarkList]
  );
  const featuredSliderBuildOptions = useMemo(
    () => getFeaturedSliderBuildOptions(effectiveFeaturedSliderSource),
    [effectiveFeaturedSliderSource]
  );
  const featuredSliderAnimeKey = useMemo(
    () => `${effectiveFeaturedSliderSource}:${featuredSourceAnimeList.map((anime) => String(anime?.id ?? '')).join('|')}`,
    [effectiveFeaturedSliderSource, featuredSourceAnimeList]
  );
  const isCurrentSeasonFeaturedUnavailable = homeFeaturedSliderSource === HOME_FEATURED_SLIDER_SOURCES.currentSeason
    && hasCurrentSeasonFeaturedLoaded
    && !isCurrentSeasonFeaturedLoading
    && !hasCurrentSeasonFeaturedSlides
    && hasCurrentSeasonFeaturedError;

  const buildNextFeaturedSliderState = useCallback((options = {}) => {
    featuredShuffleTokenRef.current += 1;
    return buildFeaturedSliderState(featuredSourceAnimeListRef.current, {
      ...featuredSliderBuildOptions,
      shuffleToken: featuredShuffleTokenRef.current,
      avoidStartingAnimeId: options?.avoidStartingAnimeId,
    });
  }, [featuredSliderBuildOptions]);

  const scheduleDetailEnrichmentRetry = useCallback(() => {
    if (!detailEnrichmentMountedRef.current) return;

    if (detailEnrichmentRetryTimerRef.current) {
      clearTimeout(detailEnrichmentRetryTimerRef.current);
      detailEnrichmentRetryTimerRef.current = null;
    }

    const now = Date.now();
    let nextRetryAt = Infinity;
    detailEnrichmentStateRef.current.forEach((entry) => {
      if (!entry || entry.inFlight) return;

      const retryAt = Number(entry.retryAt) || 0;
      if (retryAt > now && retryAt < nextRetryAt) {
        nextRetryAt = retryAt;
      }
    });

    if (!Number.isFinite(nextRetryAt)) return;

    detailEnrichmentRetryTimerRef.current = setTimeout(() => {
      if (!detailEnrichmentMountedRef.current) return;
      detailEnrichmentRetryTimerRef.current = null;
      setDetailEnrichmentRetryTick((prev) => prev + 1);
    }, Math.max(0, nextRetryAt - now));
  }, []);

  const handleMyListViewportPriorityChange = useCallback((animeId, priority) => {
    const numericId = Number(animeId);
    if (!Number.isFinite(numericId)) return;

    const normalizedPriority = Math.max(0, Math.round(Number(priority) || 0));
    setMyListViewportPriorityMap((prev) => {
      const currentPriority = Number(prev[numericId] || 0);
      if (currentPriority === normalizedPriority) return prev;

      if (normalizedPriority <= 0) {
        if (!Object.prototype.hasOwnProperty.call(prev, numericId)) return prev;
        const next = { ...prev };
        delete next[numericId];
        return next;
      }

      return {
        ...prev,
        [numericId]: normalizedPriority,
      };
    });
  }, []);

  const navigateTo = (nextView, options = {}) => {
    if (!APP_VIEW_SET.has(nextView)) return;
    if (typeof window === 'undefined') {
      setView(nextView);
      return;
    }

    const { replace = false, force = false } = options;
    if (isOnboardingActive && !force && nextView !== 'home') {
      return;
    }
    const targetHash = APP_VIEW_HASHES[nextView] || '#/';
    const currentHash = window.location.hash || '#/';
    const isSameView = view === nextView && currentHash === targetHash;
    if (isSameView) return;

    navigationTypeRef.current = 'push';
    const state = { ...(window.history.state || {}), appView: nextView };
    if (replace) {
      window.history.replaceState(state, '', targetHash);
    } else {
      window.history.pushState(state, '', targetHash);
    }
    setView(nextView);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const normalizedView = getViewFromLocation(window.location.hash, window.location.pathname);
    const state = { ...(window.history.state || {}), appView: normalizedView };
    window.history.replaceState(state, '', APP_VIEW_HASHES[normalizedView] || '#/');
    if (normalizedView !== view) {
      navigationTypeRef.current = 'pop';
      setView(normalizedView);
    }

    const handlePopState = (event) => {
      const stateView = event?.state?.appView;
      const nextView = APP_VIEW_SET.has(stateView)
        ? stateView
        : getViewFromLocation(window.location.hash, window.location.pathname);
      navigationTypeRef.current = 'pop';
      setView(nextView);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const initializeServerLibrary = async () => {
      setIsServerLibraryReady(false);
      try {
        const payload = await fetchLibrarySnapshot();
        if (cancelled) return;

        const remoteAnimeList = sanitizeWatchedAnimeList(payload?.animeList);
        const remoteBookmarkList = sanitizeBookmarkAnimeList(payload?.bookmarkList);
        const hasRemoteData = remoteAnimeList.length > 0 || remoteBookmarkList.length > 0;
        const hasLocalData = animeList.length > 0 || bookmarkList.length > 0;

        if (hasRemoteData) {
          detailEnrichmentAbortControllerRef.current?.abort();
          detailEnrichmentAbortControllerRef.current = null;
          detailEnrichmentRequestInFlightRef.current = false;
          detailEnrichmentStateRef.current.clear();
          if (detailEnrichmentRetryTimerRef.current) {
            clearTimeout(detailEnrichmentRetryTimerRef.current);
            detailEnrichmentRetryTimerRef.current = null;
          }
          setAnimeList(remoteAnimeList);
          setBookmarkList(remoteBookmarkList);
        } else if (hasLocalData) {
          await saveLibrarySnapshot({
            animeList: sanitizeWatchedAnimeList(animeList),
            bookmarkList: sanitizeBookmarkAnimeList(bookmarkList),
          });
          if (cancelled) return;
        }

        setIsServerLibraryReady(true);
      } catch (syncError) {
        if (cancelled) return;
        console.error('Failed to initialize server library:', syncError);
        setIsServerLibraryReady(true);
      }
    };

    initializeServerLibrary();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    warmAniListTagTranslations().catch((error) => {
      console.error('Failed to warm AniList tag translations:', error);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    readHomeQuickActionBackgroundsFromPersistentStorage()
      .then((savedBackgrounds) => {
        if (cancelled) return;

        setHomeQuickActionBackgrounds((currentBackgrounds) => {
          const currentPayload = JSON.stringify(sanitizeHomeQuickActionBackgrounds(currentBackgrounds));
          const nextPayload = JSON.stringify(sanitizeHomeQuickActionBackgrounds(savedBackgrounds));
          return currentPayload === nextPayload ? currentBackgrounds : savedBackgrounds;
        });
      })
      .catch(() => {
        // Ignore hydration failures and keep the localStorage snapshot.
      })
      .finally(() => {
        if (!cancelled) {
          setIsHomeQuickActionBackgroundsHydrated(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const warmYouTubeApi = () => {
      loadYouTubeIframeApi().catch(() => {
        // Ignore prewarm failures and retry on demand.
      });
    };

    if (typeof window.requestIdleCallback === 'function') {
      const idleId = window.requestIdleCallback(warmYouTubeApi, { timeout: 2000 });
      return () => window.cancelIdleCallback?.(idleId);
    }

    const timeoutId = window.setTimeout(warmYouTubeApi, 900);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => () => {
    detailEnrichmentMountedRef.current = false;
    detailEnrichmentAbortControllerRef.current?.abort();
    detailEnrichmentAbortControllerRef.current = null;
    if (detailEnrichmentRetryTimerRef.current) {
      clearTimeout(detailEnrichmentRetryTimerRef.current);
      detailEnrichmentRetryTimerRef.current = null;
    }
  }, []);

  // 1. Storage Persistence
  useEffect(() => {
    writeListToStorage(ANIME_LIST_STORAGE_KEY, animeList);
  }, [animeList]);

  useEffect(() => {
    featuredSourceAnimeListRef.current = featuredSourceAnimeList;
  }, [featuredSourceAnimeList]);

  useEffect(() => {
    writeListToStorage(BOOKMARK_LIST_STORAGE_KEY, bookmarkList);
  }, [bookmarkList]);

  useEffect(() => {
    writeHomeFeaturedSliderSourceToStorage(homeFeaturedSliderSource);
  }, [homeFeaturedSliderSource]);

  useEffect(() => {
    writeHomeStatsCardBackgroundsToStorage(homeStatsCardBackgrounds);
  }, [homeStatsCardBackgrounds]);

  useEffect(() => {
    if (!isHomeQuickActionBackgroundsHydrated) return;

    writeHomeQuickActionBackgroundsToPersistentStorage(homeQuickActionBackgrounds)
      .catch(() => {
        // Ignore storage write failures and keep the in-memory state.
      });
  }, [homeQuickActionBackgrounds, isHomeQuickActionBackgroundsHydrated]);

  useEffect(() => {
    if (!isServerLibraryReady) return;
    if (serverSaveDebounceRef.current) {
      clearTimeout(serverSaveDebounceRef.current);
    }

    serverSaveDebounceRef.current = setTimeout(() => {
      saveLibrarySnapshot({
        animeList: sanitizeWatchedAnimeList(animeList),
        bookmarkList: sanitizeBookmarkAnimeList(bookmarkList),
      })
        .catch((syncError) => {
          console.error('Failed to save server library:', syncError);
        });
    }, 450);

    return () => {
      if (serverSaveDebounceRef.current) {
        clearTimeout(serverSaveDebounceRef.current);
      }
    };
  }, [animeList, bookmarkList, isServerLibraryReady]);

  // 2. Home Featured Source
  useEffect(() => {
    if (homeFeaturedSliderSource !== HOME_FEATURED_SLIDER_SOURCES.currentSeason) return undefined;
    if (hasCurrentSeasonFeaturedLoaded) return undefined;

    const controller = new AbortController();
    const requestId = currentSeasonFeaturedRequestIdRef.current + 1;
    currentSeasonFeaturedRequestIdRef.current = requestId;
    setIsCurrentSeasonFeaturedLoading(true);
    setHasCurrentSeasonFeaturedError(false);

    const run = async () => {
      try {
        const result = await fetchAnimeByYearAllPages(currentSeasonAddPreset.year, {
          perPage: 50,
          maxPages: 140,
          formatIn: FEATURED_SLIDER_CURRENT_SEASON_FORMATS,
          timeoutMs: 10000,
          maxAttempts: 4,
          baseDelayMs: 400,
          maxRetryDelayMs: 3000,
          interPageDelayMs: 140,
          stopOnRateLimit: true,
          firstPage429Retries: 0,
          firstPage429DelayMs: 1800,
          signal: controller.signal,
          season: currentSeasonAddPreset.mediaSeason,
          statusIn: currentSeasonAddPreset.statusIn,
          statusNot: currentSeasonAddPreset.statusNot,
        });

        if (controller.signal.aborted || currentSeasonFeaturedRequestIdRef.current !== requestId) return;

        const nextItems = filterDisplayEligibleAnimeList(
          Array.isArray(result?.items) ? result.items : [],
          {
            allowUnknownFormat: true,
            allowUnknownCountry: true,
          }
        );

        setCurrentSeasonFeaturedAnimeList(nextItems);
        setHasCurrentSeasonFeaturedLoaded(true);
        setHasCurrentSeasonFeaturedError(Boolean(result?.error) && nextItems.length === 0);
      } catch (error) {
        if (controller.signal.aborted || currentSeasonFeaturedRequestIdRef.current !== requestId) return;
        setCurrentSeasonFeaturedAnimeList([]);
        setHasCurrentSeasonFeaturedLoaded(true);
        setHasCurrentSeasonFeaturedError(true);
      } finally {
        if (!controller.signal.aborted && currentSeasonFeaturedRequestIdRef.current === requestId) {
          setIsCurrentSeasonFeaturedLoading(false);
        }
      }
    };

    run();

    return () => {
      controller.abort();
    };
  }, [
    currentSeasonAddPreset,
    hasCurrentSeasonFeaturedLoaded,
    homeFeaturedSliderSource,
  ]);

  // 3. Featured Content Selection
  useEffect(() => {
    if (featuredRefreshTimerRef.current) {
      clearTimeout(featuredRefreshTimerRef.current);
      featuredRefreshTimerRef.current = null;
    }
    setIsRefreshingFeatured(false);
    setFeaturedSliderState(buildNextFeaturedSliderState());
  }, [featuredSliderAnimeKey, buildNextFeaturedSliderState]);

  useEffect(() => {
    setFeaturedSliderState((currentState) => {
      if (!currentState?.slides?.length) return currentState;

      const latestAnimeMap = new Map(
        featuredSourceAnimeList
          .filter((anime) => Number.isFinite(Number(anime?.id)))
          .map((anime) => [Number(anime.id), anime])
      );

      let hasChanges = false;
      const nextSlides = currentState.slides.map((slide) => {
        if (!slide || slide.isTutorial) return slide;

        const latestAnime = latestAnimeMap.get(Number(slide.id));
        if (!latestAnime) return slide;

        const nextSlide = {
          ...latestAnime,
          selectionReason: slide.selectionReason,
          uniqueId: slide.uniqueId,
        };

        if (latestAnime !== slide) {
          hasChanges = true;
          return nextSlide;
        }

        return slide;
      });

      if (!hasChanges) return currentState;
      return {
        ...currentState,
        slides: nextSlides,
      };
    });
  }, [featuredSourceAnimeList]);

  useEffect(() => () => {
    if (featuredRefreshTimerRef.current) {
      clearTimeout(featuredRefreshTimerRef.current);
    }
  }, []);

  // 3. Scroll Reset on View Change
  useEffect(() => {
    if (navigationTypeRef.current === 'pop') {
      navigationTypeRef.current = 'idle';
      return;
    }
    navigationTypeRef.current = 'idle';

    // Immediate scroll
    window.scrollTo(0, 0);

    // Also try on the next animation frame to ensure layout has settled
    const scrollReset = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    const animId = requestAnimationFrame(scrollReset);

    // One more check after a short delay for good measure (some browsers/layouts need this)
    const timeoutId = setTimeout(scrollReset, 10);

    return () => {
      cancelAnimationFrame(animId);
      clearTimeout(timeoutId);
    };
  }, [view]);

  // 4. MyList Quick Navigation (Top/Bottom)
  useEffect(() => {
    if (view !== 'mylist') {
      setIsSelectionMode(false);
      setSelectedAnimeIds([]);
      setQuickNavState({
        visible: false,
        mobile: false,
        nearTop: true,
        nearBottom: false,
      });
      return;
    }

    let rafId = null;
    const updateQuickNav = () => {
      const scrollTop = window.scrollY || window.pageYOffset || 0;
      const viewportH = window.innerHeight || 0;
      const docH = Math.max(
        document.body?.scrollHeight || 0,
        document.documentElement?.scrollHeight || 0
      );
      const maxScroll = Math.max(0, docH - viewportH);
      const isMobile = window.matchMedia('(max-width: 768px)').matches;

      const nearTop = scrollTop <= 24;
      const nearBottom = maxScroll - scrollTop <= 24;
      const hasLongContent = maxScroll > 240;
      const visible = hasLongContent && (!isMobile || scrollTop > 140 || nearBottom);

      setQuickNavState((prev) => {
        if (
          prev.visible === visible &&
          prev.mobile === isMobile &&
          prev.nearTop === nearTop &&
          prev.nearBottom === nearBottom
        ) {
          return prev;
        }
        return { visible, mobile: isMobile, nearTop, nearBottom };
      });
    };

    const requestUpdate = () => {
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        updateQuickNav();
      });
    };

    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);
    updateQuickNav();

    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', requestUpdate);
      window.removeEventListener('resize', requestUpdate);
    };
  }, [view, animeList.length, minRating, searchQuery, selectedGenres, selectedTags, selectedYear, filterMatchMode, sortKey, sortOrder]);

  useEffect(() => {
    setSelectedAnimeIds((prev) => prev.filter((id) => animeList.some((anime) => anime.id === id)));
  }, [animeList]);

  useEffect(() => {
    setSharePresetAnimeIds((prev) => prev.filter((id) => animeList.some((anime) => anime.id === id)));
  }, [animeList]);

  useEffect(() => {
    if (animeList.length === 0) return;
    setIsOnboardingDismissed(false);
  }, [animeList.length]);

  useEffect(() => {
    trailerOpenRequestIdRef.current += 1;
    setActiveTrailerAnime(null);
  }, [view, isSelectionMode]);

  useEffect(() => {
    if (!isOnboardingActive || view === 'home' || typeof window === 'undefined') return;
    const forcedHome = 'home';
    const state = { ...(window.history.state || {}), appView: forcedHome };
    window.history.replaceState(state, '', APP_VIEW_HASHES[forcedHome] || '#/');
    navigationTypeRef.current = 'pop';
    setView(forcedHome);
  }, [isOnboardingActive, view]);

  useEffect(() => {
    if (view === 'addCurrent') return;
    setIsOnboardingCurrentSeasonFlow(false);
  }, [view]);

  // 3. Initial Data Acquisition (Hydration) - Empty for Clean Start

  // 4. Action Handlers
  const handleScrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleScrollToBottom = () => {
    const docH = Math.max(
      document.body?.scrollHeight || 0,
      document.documentElement?.scrollHeight || 0
    );
    window.scrollTo({ top: docH, behavior: 'smooth' });
  };

  const handleRefreshFeaturedSlides = () => {
    if (isRefreshingFeatured || !featuredSliderState.showRefreshButton) return;
    setIsRefreshingFeatured(true);
    if (featuredRefreshTimerRef.current) {
      clearTimeout(featuredRefreshTimerRef.current);
    }
    featuredRefreshTimerRef.current = setTimeout(() => {
      setFeaturedSliderState(buildNextFeaturedSliderState());
      setIsRefreshingFeatured(false);
      featuredRefreshTimerRef.current = null;
    }, 360);
  };

  const handleFeaturedSlideCycleComplete = useCallback((completedAnime) => {
    if (featuredSourceAnimeList.length <= 1) return;

    const completedAnimeId = Number(completedAnime?.id);
    setFeaturedSliderState(buildNextFeaturedSliderState({
      avoidStartingAnimeId: Number.isFinite(completedAnimeId) ? completedAnimeId : undefined,
    }));
  }, [buildNextFeaturedSliderState, featuredSourceAnimeList.length]);

  const handleOpenTrailer = async (anime) => {
    const trailer = normalizeAnimeTrailer(anime?.trailer);
    if (!anime || !trailer || !canAttemptTrailerPlayback(trailer)) return false;
    loadYouTubeIframeApi().catch(() => {
      // Ignore warmup failures and fall back to player-side loading.
    });
    const requestId = trailerOpenRequestIdRef.current + 1;
    trailerOpenRequestIdRef.current = requestId;
    setActiveTrailerAnime({ ...anime, trailer, trailerLoading: true });

    const playable = await probeAnimeTrailerPlayback(trailer, {
      timeoutMs: 5600,
      priority: TRAILER_PROBE_PRIORITY_USER_INITIATED,
    });
    if (trailerOpenRequestIdRef.current !== requestId) return false;
    if (!playable) {
      setActiveTrailerAnime(null);
      return false;
    }

    setActiveTrailerAnime({ ...anime, trailer, trailerLoading: false });
    return true;
  };

  const handleCloseTrailer = () => {
    trailerOpenRequestIdRef.current += 1;
    setActiveTrailerAnime(null);
  };

  const handleAddAnime = (data, options = {}) => {
    if (!data || typeof data.id !== 'number') {
      return { success: false, message: '作品情報を取得できませんでした。' };
    }
    if (!isDisplayEligibleAnime(data, { allowUnknownFormat: true, allowUnknownCountry: true })) {
      return { success: false, message: 'この作品は表示対象外です。' };
    }
    if (animeList.some(a => a.id === data.id)) {
      return { success: false, message: 'その作品は既に追加されています。' };
    }
    const rating = normalizeAnimeRating(options?.rating ?? data?.rating);
    const watchCount = normalizeAnimeWatchCount(options?.watchCount ?? data?.watchCount, {
      minimum: 1,
      defaultValue: 1,
    });
    // Add timestamp for "added" sort
    const animeWithDate = {
      ...data,
      rating,
      watchCount,
      addedAt: Date.now(),
      trailerChecked: data?.trailerChecked === true || Object.prototype.hasOwnProperty.call(data || {}, 'trailer'),
    };
    setAnimeList(prev => sanitizeWatchedAnimeList([animeWithDate, ...prev]));
    setBookmarkList(prev => sanitizeBookmarkAnimeList(prev.filter((anime) => anime.id !== data.id)));
    return { success: true };
  };

  const handleRemoveAnime = (id) => {
    setAnimeList(prev => {
      return prev.filter(anime => anime.id !== id);
    });
  };

  const handleUpdateAnimeRating = (id, rating) => {
    const normalizedRating = normalizeAnimeRating(rating);
    setAnimeList((prev) => {
      let changed = false;
      const next = prev.map((anime) => {
        if (anime.id !== id) return anime;
        const currentRating = normalizeAnimeRating(anime.rating);
        if (currentRating === normalizedRating) return anime;
        changed = true;
        return { ...anime, rating: normalizedRating };
      });
      return changed ? next : prev;
    });
  };

  const handleUpdateAnimeWatchCount = (id, watchCount) => {
    const normalizedWatchCount = normalizeAnimeWatchCount(watchCount, {
      minimum: 1,
      defaultValue: 1,
    });
    setAnimeList((prev) => {
      let changed = false;
      const next = prev.map((anime) => {
        if (anime.id !== id) return anime;
        const currentWatchCount = normalizeAnimeWatchCount(anime?.watchCount, {
          minimum: 1,
          defaultValue: 1,
        });
        if (currentWatchCount === normalizedWatchCount) return anime;
        changed = true;
        return { ...anime, watchCount: normalizedWatchCount };
      });
      return changed ? sanitizeWatchedAnimeList(next) : prev;
    });
  };

  const handleToggleBookmark = (data) => {
    if (!data || typeof data.id !== 'number') {
      return { success: false, message: '作品情報を取得できませんでした。' };
    }
    if (!isDisplayEligibleAnime(data, { allowUnknownFormat: true, allowUnknownCountry: true })) {
      return { success: false, action: 'blocked', message: 'この作品は表示対象外です。' };
    }

    if (animeList.some((anime) => anime.id === data.id)) {
      return { success: false, action: 'blocked', message: '視聴済み作品はブックマークできません。' };
    }

    const exists = bookmarkList.some((anime) => anime.id === data.id);
    if (exists) {
      setBookmarkList((prev) => sanitizeBookmarkAnimeList(prev.filter((anime) => anime.id !== data.id)));
      return { success: true, action: 'removed' };
    }

    const bookmarkItem = {
      ...data,
      bookmarkedAt: Date.now(),
      trailerChecked: data?.trailerChecked === true || Object.prototype.hasOwnProperty.call(data || {}, 'trailer'),
    };
    setBookmarkList((prev) => sanitizeBookmarkAnimeList([bookmarkItem, ...prev.filter((anime) => anime.id !== data.id)]));
    return { success: true, action: 'added' };
  };

  const handleBulkRemoveBookmarks = (ids) => {
    if (!Array.isArray(ids) || ids.length === 0) return;
    const removeIdSet = new Set(ids);
    setBookmarkList((prev) => prev.filter((anime) => !removeIdSet.has(anime.id)));
  };

  const handleMarkBookmarkAsWatched = (anime, options = {}) => {
    if (!anime || typeof anime.id !== 'number') {
      return { success: false, message: '作品情報を取得できませんでした。' };
    }
    return handleAddAnime(anime, { rating: options?.rating, watchCount: 1 });
  };

  const handleLongPressAnime = (id) => {
    setIsSelectionMode(true);
    setSelectedAnimeIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const handleToggleAnimeSelection = (id) => {
    if (!isSelectionMode) return;
    setSelectedAnimeIds((prev) =>
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
    );
  };

  const handleCancelSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedAnimeIds([]);
  };

  const handleOpenShareMethod = (initialIds = []) => {
    const mylistIdSet = new Set(animeList.map((anime) => anime.id));
    const normalizedIds = Array.from(new Set(
      (Array.isArray(initialIds) ? initialIds : []).filter((id) => mylistIdSet.has(id))
    ));
    setSharePresetAnimeIds(normalizedIds);
    navigateTo('shareMethod');
  };

  const openSeasonalAddView = (targetView, source = 'home', options = {}) => {
    setSeasonalAddSource(source);
    navigateTo(targetView, options);
  };

  const handleOnboardingPrev = () => {
    setOnboardingStep((prev) => Math.max(0, prev - 1));
  };

  const handleOnboardingNext = () => {
    setOnboardingStep((prev) => Math.min(ONBOARDING_STEPS.length - 1, prev + 1));
  };

  const handleOnboardingAddCurrent = () => {
    setIsOnboardingDismissed(true);
    setIsOnboardingCurrentSeasonFlow(true);
    openSeasonalAddView('addCurrent', 'home', { force: true });
  };

  const handleOnboardingSearchAdd = () => {
    setIsOnboardingDismissed(true);
    setIsOnboardingCurrentSeasonFlow(false);
    navigateTo('add', { force: true });
  };

  const handleOnboardingCancel = () => {
    setIsOnboardingDismissed(true);
    setIsOnboardingCurrentSeasonFlow(false);
    navigateTo('home', { replace: true, force: true });
  };

  const handleBulkRemoveSelected = () => {
    if (selectedAnimeIds.length === 0) return;

    if (!window.confirm(`選択した ${selectedAnimeIds.length} 件の作品を削除しますか？`)) {
      return;
    }

    setAnimeList((prev) => {
      const selectedSet = new Set(selectedAnimeIds);
      return prev.filter((anime) => !selectedSet.has(anime.id));
    });

    setIsSelectionMode(false);
    setSelectedAnimeIds([]);
  };

  const handleApplyMyListFilters = (nextFilters) => {
    setSelectedGenres(Array.isArray(nextFilters?.selectedGenres) ? nextFilters.selectedGenres : []);
    setSelectedTags(Array.isArray(nextFilters?.selectedTags) ? nextFilters.selectedTags : []);
    setSelectedYear(String(nextFilters?.selectedYear || '').trim());
    setMinRating(nextFilters?.minRating || '');
    setFilterMatchMode(nextFilters?.matchMode || 'and');
  };

  const handleClearMyListFilters = () => {
    setSelectedGenres([]);
    setSelectedTags([]);
    setSelectedYear('');
    setMinRating('');
    setFilterMatchMode('and');
  };

  // 5. Data Derived States (Filters/Computed)
  const myListFilterOptions = useMemo(
    () => collectAnimeFilterOptions(animeList),
    [animeList, tagTranslationVersion]
  );
  const uniqueGenres = myListFilterOptions.genres;
  const uniqueTags = myListFilterOptions.tags;
  const uniqueYears = myListFilterOptions.years;
  const isMyListTagInfoLoading = useMemo(
    () => animeList.some((anime) => anime?.id && !Array.isArray(anime?.tags)),
    [animeList]
  );

  useEffect(() => {
    setSelectedGenres((prev) => prev.filter((genre) => uniqueGenres.includes(genre)));
    setSelectedTags((prev) => prev.filter((tag) => uniqueTags.includes(tag)));
    setSelectedYear((prev) => {
      const year = Number(prev);
      if (!Number.isFinite(year)) return '';
      return uniqueYears.includes(year) ? String(year) : '';
    });
  }, [uniqueGenres, uniqueTags, uniqueYears]);

  const filteredList = useMemo(() => {
    return buildFilteredAnimeList(animeList, {
      searchQuery,
      selectedGenres,
      selectedTags,
      selectedYear,
      minRating,
      matchMode: filterMatchMode,
      sortKey,
      sortOrder,
    });
  }, [animeList, minRating, searchQuery, selectedGenres, selectedTags, selectedYear, filterMatchMode, sortKey, sortOrder]);
  const selectedAnimeIdSet = useMemo(() => new Set(selectedAnimeIds), [selectedAnimeIds]);
  const visibleAnimeIds = useMemo(() => filteredList.map((anime) => anime.id), [filteredList]);
  const visibleAnimeIdSet = useMemo(() => new Set(visibleAnimeIds), [visibleAnimeIds]);
  const myListViewportAnimeIds = useMemo(() => (
    Object.entries(myListViewportPriorityMap)
      .map(([id, priority]) => ({
        id: Number(id),
        priority: Number(priority) || 0,
      }))
      .filter((entry) => Number.isFinite(entry.id) && entry.priority > 0 && visibleAnimeIdSet.has(entry.id))
      .sort((left, right) => right.priority - left.priority)
      .map((entry) => entry.id)
  ), [myListViewportPriorityMap, visibleAnimeIdSet]);
  const prioritizedDetailAnimeIds = useMemo(() => {
    const orderedIds = [];
    const seenIds = new Set();
    const pushIds = (ids) => {
      ids.forEach((id) => {
        const numericId = Number(id);
        if (!Number.isFinite(numericId) || seenIds.has(numericId)) return;
        seenIds.add(numericId);
        orderedIds.push(numericId);
      });
    };

    if (view === 'mylist') {
      pushIds(myListViewportAnimeIds);
      pushIds(visibleAnimeIds);
    }
    if (view === 'bookmarks') {
      pushIds(bookmarkVisibleAnimeIds);
    }

    pushIds(animeList.map((anime) => anime?.id));
    pushIds(bookmarkList.map((anime) => anime?.id));
    return orderedIds;
  }, [view, myListViewportAnimeIds, visibleAnimeIds, bookmarkVisibleAnimeIds, animeList, bookmarkList]);

  useEffect(() => {
    const animeById = new Map();
    [...animeList, ...bookmarkList].forEach((anime) => {
      const animeId = Number(anime?.id);
      if (!Number.isFinite(animeId) || animeById.has(animeId)) return;
      animeById.set(animeId, anime);
    });

    let trackingChanged = false;
    detailEnrichmentStateRef.current.forEach((entry, id) => {
      const anime = animeById.get(id);
      if (!anime || hasLoadedAnimeDetailPayload(anime)) {
        detailEnrichmentStateRef.current.delete(id);
        trackingChanged = true;
      }
    });

    const now = Date.now();
    const pendingIds = prioritizedDetailAnimeIds.filter((id) => {
      const anime = animeById.get(id);
      if (!anime) return false;
      if (hasLoadedAnimeDetailPayload(anime)) return false;

      const tracking = detailEnrichmentStateRef.current.get(id);
      if (tracking?.inFlight) return false;
      return (Number(tracking?.retryAt) || 0) <= now;
    });

    if (pendingIds.length === 0) {
      scheduleDetailEnrichmentRetry();
      return undefined;
    }

    if (detailEnrichmentRequestInFlightRef.current) {
      scheduleDetailEnrichmentRetry();
      return undefined;
    }

    const batchIds = pendingIds.slice(0, DETAIL_ENRICHMENT_BATCH_SIZE);
    batchIds.forEach((id) => {
      const current = detailEnrichmentStateRef.current.get(id);
      detailEnrichmentStateRef.current.set(id, {
        attempts: Number(current?.attempts) || 0,
        retryAt: 0,
        inFlight: true,
      });
    });
    detailEnrichmentRequestInFlightRef.current = true;
    scheduleDetailEnrichmentRetry();
    const applyEnrichedDetails = (list, enrichedMap) => {
      let changed = false;
      const nextList = list.map((anime) => {
        const enriched = enrichedMap.get(anime.id);
        if (!enriched) return anime;

        const nextAnime = { ...anime };
        let hasChanges = false;

        if (!hasLoadedAnimeTagDetails(anime) && Array.isArray(enriched.tags)) {
          nextAnime.tags = normalizeAnimeTags(enriched.tags);
          hasChanges = true;
        }

        if (anime?.trailerChecked !== true
          && Object.prototype.hasOwnProperty.call(enriched, 'trailer')) {
          nextAnime.trailer = normalizeAnimeTrailer(enriched.trailer);
          nextAnime.trailerChecked = true;
          hasChanges = true;
        }

        if (!hasChanges) return anime;
        changed = true;
        return nextAnime;
      });
      return changed ? nextList : list;
    };

    const run = async () => {
      const abortController = new AbortController();
      detailEnrichmentAbortControllerRef.current = abortController;

      try {
        const results = await fetchAnimeDetailsByIds(batchIds, {
          timeoutMs: 12000,
          maxAttempts: 3,
          baseDelayMs: 400,
          maxRetryDelayMs: 1200,
          signal: abortController.signal,
        });
        if (!detailEnrichmentMountedRef.current || abortController.signal.aborted) return;

        const enrichedMap = new Map(
          results
            .filter((anime) => anime && Number.isFinite(Number(anime.id)))
            .map((anime) => [anime.id, anime])
        );
        const completedAt = Date.now();

        batchIds.forEach((id) => {
          const tracking = detailEnrichmentStateRef.current.get(id);
          if (enrichedMap.has(id)) {
            if (detailEnrichmentStateRef.current.delete(id)) {
              trackingChanged = true;
            }
            return;
          }

          const nextAttemptCount = (Number(tracking?.attempts) || 0) + 1;
          detailEnrichmentStateRef.current.set(id, {
            attempts: nextAttemptCount,
            inFlight: false,
            retryAt: completedAt + getDetailEnrichmentRetryDelayMs(nextAttemptCount),
          });
          trackingChanged = true;
        });

        if (enrichedMap.size > 0) {
          setAnimeList((prev) => applyEnrichedDetails(prev, enrichedMap));
          setBookmarkList((prev) => applyEnrichedDetails(prev, enrichedMap));
        }
      } finally {
        if (detailEnrichmentAbortControllerRef.current === abortController) {
          detailEnrichmentAbortControllerRef.current = null;
        }
        detailEnrichmentRequestInFlightRef.current = false;
        if (detailEnrichmentMountedRef.current) {
          scheduleDetailEnrichmentRetry();
          setDetailEnrichmentRetryTick((prev) => prev + 1);
        }
      }
    };

    run();
    return undefined;
  }, [animeList, bookmarkList, detailEnrichmentRetryTick, prioritizedDetailAnimeIds, scheduleDetailEnrichmentRetry]);

  const isAllVisibleSelected = visibleAnimeIds.length > 0
    && visibleAnimeIds.every((id) => selectedAnimeIdSet.has(id));

  const handleSelectAllVisibleAnime = () => {
    if (visibleAnimeIds.length === 0) return;
    setSelectedAnimeIds((prev) => {
      const nextSet = new Set(prev);
      visibleAnimeIds.forEach((id) => nextSet.add(id));
      return Array.from(nextSet);
    });
  };

  const isAddView = view === 'add' || view === 'addCurrent' || view === 'addNext';
  const isHomeView = view === 'home'
    || view === 'homeCustomize'
    || view === 'homeCustomizeSlider'
    || view === 'homeCustomizeStats'
    || view === 'homeCustomizeQuick';
  const isShareView = view === 'shareMethod' || view === 'shareImage' || view === 'shareText';
  const isMyListSectionView = view === 'mylist' || isShareView;
  const shouldShowHomeOnboarding = view === 'home' && isOnboardingActive;
  const isOnboardingNavigationLocked = shouldShowHomeOnboarding;
  const isLastOnboardingStep = onboardingStep >= ONBOARDING_STEPS.length - 1;
  const activeOnboardingStep = ONBOARDING_STEPS[Math.min(onboardingStep, ONBOARDING_STEPS.length - 1)];
  const activeBrowsePreset = view === 'addCurrent'
    ? currentSeasonAddPreset
    : view === 'addNext'
      ? nextSeasonAddPreset
      : null;
  const isOnboardingCurrentAddBackToHome = view === 'addCurrent' && isOnboardingCurrentSeasonFlow;
  const addViewBackTarget = isOnboardingCurrentAddBackToHome
    ? 'home'
    : activeBrowsePreset && seasonalAddSource === 'bookmarks'
      ? 'bookmarks'
      : 'home';
  const addViewBackLabel = isOnboardingCurrentAddBackToHome
    ? '← ホームに戻る'
    : activeBrowsePreset && seasonalAddSource === 'bookmarks'
      ? '← ブックマークへ戻る'
      : '← ホームへ戻る';
  const addViewTitle = view === 'addCurrent'
    ? '今期放送中作品の追加'
    : view === 'addNext'
      ? '来季放送予定作品の追加'
      : '作品の追加';
  const addViewSubtitle = view === 'addCurrent'
    ? `${currentSeasonLabel}の作品を確認して追加できます。`
    : view === 'addNext'
      ? `${nextSeasonLabel}の放送予定作品を先に追加できます。`
      : 'マイリストやブックマークに追加する作品を探せます。';

  const handleSaveHomeStatsCardBackgrounds = (nextBackgrounds) => {
    setHomeStatsCardBackgrounds(sanitizeHomeStatsCardBackgrounds(nextBackgrounds));
  };

  const handleSaveHomeQuickActionBackgrounds = (nextBackgrounds) => {
    setHomeQuickActionBackgrounds(sanitizeHomeQuickActionBackgrounds(nextBackgrounds));
  };

  useEffect(() => {
    if (!shouldShowHomeOnboarding) return;
    setOnboardingStep(0);
  }, [view, shouldShowHomeOnboarding]);

  // 6. UI Render
  return (
    <div className="app-container">
      {/* Navigation Header */}
      <header className="app-header">
        <div
          className={`logo${isOnboardingNavigationLocked ? ' nav-locked' : ''}`}
          onClick={isOnboardingNavigationLocked ? undefined : () => navigateTo('home')}
          style={{ cursor: isOnboardingNavigationLocked ? 'default' : 'pointer' }}
        >
          <img src="/images/logo.png" alt="AniTrigger" style={{ height: '120px' }} />
        </div>
      </header>

      <nav className="global-view-nav" aria-label="メインナビゲーション">
        <button
          type="button"
          className={`global-view-nav-button ${isHomeView ? 'active' : ''}`}
          onClick={() => navigateTo('home')}
          disabled={isOnboardingNavigationLocked}
        >
          ホーム
        </button>
        <button
          type="button"
          className={`global-view-nav-button ${isMyListSectionView ? 'active' : ''}`}
          onClick={() => navigateTo('mylist')}
          disabled={isOnboardingNavigationLocked}
        >
          マイリスト
        </button>
        <button
          type="button"
          className={`global-view-nav-button ${view === 'bookmarks' ? 'active' : ''}`}
          onClick={() => navigateTo('bookmarks')}
          disabled={isOnboardingNavigationLocked}
        >
          ブックマーク
        </button>
        <button
          type="button"
          className={`global-view-nav-button ${isAddView ? 'active' : ''}`}
          onClick={() => navigateTo('add')}
          disabled={isOnboardingNavigationLocked}
        >
          作品の追加
        </button>
      </nav>

      {/* Content Rendering Loop */}
      {isAddView ? (
        <main className="main-content">
          <AddAnimeScreen
            key={view}
            onAdd={handleAddAnime}
            onRemove={handleRemoveAnime}
            onToggleBookmark={handleToggleBookmark}
            bookmarkList={bookmarkList}
            onPlayTrailer={handleOpenTrailer}
            onBack={() => navigateTo(addViewBackTarget)}
            animeList={animeList}
            screenTitle={addViewTitle}
            screenSubtitle={addViewSubtitle}
            backButtonLabel={addViewBackLabel}
            initialEntryTab={activeBrowsePreset ? 'browse' : 'search'}
            browsePreset={activeBrowsePreset}
          />
        </main>
      ) : view === 'bookmarks' ? (
        <main className="main-content">
          <BookmarkScreen
            bookmarkList={bookmarkList}
            watchedAnimeList={animeList}
            onOpenBookmarkAdd={() => navigateTo('add')}
            onOpenCurrentSeasonAdd={() => openSeasonalAddView('addCurrent', 'bookmarks')}
            onOpenNextSeasonAdd={() => openSeasonalAddView('addNext', 'bookmarks')}
            onBackHome={() => navigateTo('home')}
            onToggleBookmark={handleToggleBookmark}
            onMarkWatched={handleMarkBookmarkAsWatched}
            onBulkRemoveBookmarks={handleBulkRemoveBookmarks}
            onPlayTrailer={handleOpenTrailer}
            onVisibleAnimeIdsChange={setBookmarkVisibleAnimeIds}
          />
        </main>
      ) : view === 'homeCustomize' ? (
        <HomeCustomizeHubScreen
          featuredSliderSourceLabel={featuredSliderSourceLabel}
          onOpenFeaturedSliderCustomize={() => navigateTo('homeCustomizeSlider')}
          onOpenStatsCustomize={() => navigateTo('homeCustomizeStats')}
          onOpenQuickActionsCustomize={() => navigateTo('homeCustomizeQuick')}
          onBackHome={() => navigateTo('home')}
        />
      ) : view === 'homeCustomizeSlider' ? (
        <HomeFeaturedSliderCustomizeScreen
          selectedSource={homeFeaturedSliderSource}
          currentSeasonLabel={currentSeasonLabel}
          isCurrentSeasonLoading={isCurrentSeasonFeaturedLoading}
          isCurrentSeasonUnavailable={isCurrentSeasonFeaturedUnavailable}
          onChangeSource={setHomeFeaturedSliderSource}
          onBackHome={() => navigateTo('homeCustomize')}
          backButtonLabel="設定に戻る"
        />
      ) : view === 'homeCustomizeStats' ? (
        <HomeStatsCustomizeScreen
          animeList={animeList}
          savedBackgrounds={homeStatsCardBackgrounds}
          onSave={handleSaveHomeStatsCardBackgrounds}
          onBackHome={() => navigateTo('homeCustomize')}
          backButtonLabel="設定に戻る"
        />
      ) : view === 'homeCustomizeQuick' ? (
        <HomeQuickActionsCustomizeScreen
          animeCount={animeList.length}
          bookmarkCount={bookmarkList.length}
          savedBackgrounds={homeQuickActionBackgrounds}
          onSave={handleSaveHomeQuickActionBackgrounds}
          onBackHome={() => navigateTo('homeCustomize')}
          backButtonLabel="設定に戻る"
        />
      ) : isShareView ? (
        <ShareScreen
          key={view}
          mode={view === 'shareImage' ? 'image' : view === 'shareText' ? 'text' : 'method'}
          animeList={animeList}
          initialSelectedAnimeIds={sharePresetAnimeIds}
          onUpdateRating={handleUpdateAnimeRating}
          onUpdateWatchCount={handleUpdateAnimeWatchCount}
          onBackToMyList={() => navigateTo('mylist')}
          onBackToMethod={() => navigateTo('shareMethod')}
          onSelectMode={(mode) => navigateTo(mode === 'image' ? 'shareImage' : 'shareText')}
        />
      ) : view === 'mylist' ? (
          <main className={`main-content mylist-page-main page-shell${isSelectionMode ? ' has-selection-dock' : ' has-bottom-home-nav'}`}>
            <div className="mylist-section-header bookmark-screen-header">
              <div>
                <h3 className="page-main-title">マイリスト</h3>
                <p className="bookmark-screen-desc page-main-subtitle">登録済み作品の検索・絞り込み・並び替え</p>
              </div>
              <div className="bookmark-screen-actions mylist-screen-actions">
                <button
                  className="bookmark-screen-add page-action-button page-action-primary page-action-strong"
                  onClick={() => navigateTo('add')}
                >
                  <span className="bookmark-screen-add-icon">＋</span>
                  <span>作品を追加</span>
                </button>
                <button
                  type="button"
                  className="mylist-share-button page-action-button page-action-secondary"
                  onClick={() => handleOpenShareMethod()}
                  disabled={animeList.length === 0}
                >
                  作品を共有
                </button>
              </div>
            </div>

            <div className="controls">
              <div className="search-box">
                <i className="search-icon" aria-hidden="true" />
                <input
                  type="text"
                  placeholder="登録された作品からタイトルを検索"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <AnimeFilterDialog
              contextId="mylist"
              title="絞り込み条件"
              emptySummaryText="ジャンル・タグ・放送年・評価を設定できます。"
              helperText="AND / OR はジャンルとタグの組み合わせに適用されます。放送年と評価は追加条件として扱います。"
              appliedGenres={selectedGenres}
              appliedTags={selectedTags}
              appliedYear={selectedYear}
              appliedMinRating={minRating}
              appliedMatchMode={filterMatchMode}
              availableGenres={uniqueGenres}
              availableTags={uniqueTags}
              availableYears={uniqueYears}
              isLoadingTags={isMyListTagInfoLoading}
              loadingTagsText="タグ候補を取得中です…"
              showSeasons={false}
              showMinRating
              toolbarSupplement={(
                <AnimeSortControl
                  sortKey={sortKey}
                  sortOrder={sortOrder}
                  options={ANIME_SORT_OPTIONS}
                  onSortKeyChange={setSortKey}
                  onSortOrderChange={setSortOrder}
                  selectAriaLabel="マイリストの並び替え"
                />
              )}
              onApply={handleApplyMyListFilters}
              onClear={handleClearMyListFilters}
            />

            <div className="results-count">
              {filteredList.length} 作品が見つかりました
            </div>

            {isSelectionMode && (
              <div className="selection-toolbar" role="region" aria-label="選択モード">
                <div className="selection-toolbar-info">
                  <p className="selection-toolbar-title">選択モード</p>
                  <p className="selection-toolbar-count">{selectedAnimeIds.length} 件を選択中</p>
                  <p className="selection-toolbar-sub">カードをタップして選択/解除できます</p>
                </div>
              </div>
            )}

            <div className="anime-grid">
              {filteredList.map(anime => (
                <AnimeCard
                  key={anime.id}
                  anime={anime}
                  onRemove={handleRemoveAnime}
                  isSelectionMode={isSelectionMode}
                  isSelected={selectedAnimeIdSet.has(anime.id)}
                  onToggleSelect={handleToggleAnimeSelection}
                  onLongPress={handleLongPressAnime}
                  onUpdateRating={handleUpdateAnimeRating}
                  onUpdateWatchCount={handleUpdateAnimeWatchCount}
                  onPlayTrailer={handleOpenTrailer}
                  onViewportPriorityChange={handleMyListViewportPriorityChange}
                />
              ))}
            </div>

            {filteredList.length === 0 && (
              <div className="empty-state">該当する作品がありません</div>
            )}
          </main>
      ) : shouldShowHomeOnboarding ? (
        <main className="main-content onboarding-main page-shell">
          <section className="onboarding-panel">
            <p className="onboarding-step-badge">
              初回ガイド {onboardingStep + 1}/{ONBOARDING_STEPS.length}
            </p>
            <h3 className="onboarding-title">{activeOnboardingStep.title}</h3>
            {activeOnboardingStep.description && (
              <p className="onboarding-description">{activeOnboardingStep.description}</p>
            )}
            {Array.isArray(activeOnboardingStep.features) && activeOnboardingStep.features.length > 0 && (
              <ul className="onboarding-feature-list">
                {activeOnboardingStep.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            )}

            {isLastOnboardingStep ? (
              <div className="onboarding-actions final-step">
                <button type="button" className="onboarding-action-primary" onClick={handleOnboardingAddCurrent}>
                  今季のアニメを追加
                </button>
                <button type="button" className="onboarding-action-secondary" onClick={handleOnboardingSearchAdd}>
                  検索して追加
                </button>
                <button type="button" className="onboarding-action-cancel" onClick={handleOnboardingCancel}>
                  キャンセル
                </button>
              </div>
            ) : (
              <div className="onboarding-actions">
                <button
                  type="button"
                  className="onboarding-action-secondary"
                  onClick={handleOnboardingPrev}
                  disabled={onboardingStep === 0}
                >
                  戻る
                </button>
                <button type="button" className="onboarding-action-primary" onClick={handleOnboardingNext}>
                  次へ
                </button>
              </div>
            )}
          </section>
        </main>
      ) : (
        <>
          <HeroSlider
            slides={featuredSliderState.slides}
            sourceType={featuredSliderState.sourceType}
            myListIdSet={myListIdSet}
            bookmarkIdSet={bookmarkIdSet}
            onAddAnime={handleAddAnime}
            onRemoveAnime={handleRemoveAnime}
            onToggleBookmark={handleToggleBookmark}
            onRefresh={handleRefreshFeaturedSlides}
            onPlayTrailer={handleOpenTrailer}
            onCycleComplete={handleFeaturedSlideCycleComplete}
            showRefreshButton={featuredSliderState.showRefreshButton}
            isRefreshing={isRefreshingFeatured}
          />

          <main className="main-content">
            <StatsSection animeList={animeList} cardBackgrounds={homeStatsCardBackgrounds} />

            <HomeQuickActionsSection
              animeCount={animeList.length}
              bookmarkCount={bookmarkList.length}
              backgrounds={homeQuickActionBackgrounds}
              onOpenMyList={() => navigateTo('mylist')}
              onOpenBookmarks={() => navigateTo('bookmarks')}
              onOpenCurrentSeason={() => openSeasonalAddView('addCurrent', 'home')}
              onOpenNextSeason={() => openSeasonalAddView('addNext', 'home')}
              onOpenShare={() => handleOpenShareMethod()}
              shareDisabled={animeList.length === 0}
            />

            <WatchRankingSection animeList={animeList} />

            <div className="home-stats-customize-launch">
              <button
                type="button"
                className="home-stats-customize-launch-button"
                onClick={() => navigateTo('homeCustomize')}
              >
                設定
              </button>
            </div>
          </main>
        </>
      )}

      <footer className="app-footer">
        <p>AniTrigger &copy; 2025 - Data provided by AniList API</p>
      </footer>

      <TrailerModal anime={activeTrailerAnime} onClose={handleCloseTrailer} />

      {view === 'mylist' && isSelectionMode && (
        <div className="selection-action-dock" role="region" aria-label="選択モード操作">
          <p className="selection-action-dock-count">{selectedAnimeIds.length} 件を選択中</p>
          <div className="selection-action-dock-buttons">
            <button
              type="button"
              className="selection-toolbar-select-all"
              onClick={handleSelectAllVisibleAnime}
              disabled={visibleAnimeIds.length === 0 || isAllVisibleSelected}
            >
              すべて選択
            </button>
            <button
              type="button"
              className="selection-toolbar-share"
              onClick={() => handleOpenShareMethod(selectedAnimeIds)}
              disabled={selectedAnimeIds.length === 0}
            >
              選択した作品を共有
            </button>
            <button
              type="button"
              className="selection-toolbar-delete"
              onClick={handleBulkRemoveSelected}
              disabled={selectedAnimeIds.length === 0}
            >
              選択した作品を削除
            </button>
            <button
              type="button"
              className="selection-toolbar-cancel"
              onClick={handleCancelSelectionMode}
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {view === 'mylist' && !isSelectionMode && (
        <nav className="screen-bottom-home-nav" aria-label="画面移動">
          <button type="button" className="screen-bottom-home-button" onClick={() => navigateTo('home')}>
            ← ホームへ戻る
          </button>
        </nav>
      )}

      {view === 'mylist' && !isSelectionMode && quickNavState.visible && (
        <aside className={`quick-nav-rail mylist-quick-nav ${quickNavState.mobile ? 'mobile' : ''}`} aria-label="ページ移動">
          <button
            type="button"
            className="quick-nav-button"
            onClick={handleScrollToTop}
            disabled={quickNavState.nearTop}
            aria-label="ページ最上部へ移動"
            title="最上部へ"
          >
            ↑
          </button>
          <button
            type="button"
            className="quick-nav-button"
            onClick={handleScrollToBottom}
            disabled={quickNavState.nearBottom}
            aria-label="ページ最下部へ移動"
            title="最下部へ"
          >
            ↓
          </button>
        </aside>
      )}
    </div>
  );
}

export default App;
