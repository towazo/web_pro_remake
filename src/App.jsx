import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';

import { startTransition } from 'react';

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
import CollectionPagination from './components/Shared/CollectionPagination';
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
  readHomeCurrentSeasonFeaturedAnimeListFromStorage,
  writeHomeCurrentSeasonFeaturedAnimeListToStorage,
} from './utils/homeCurrentSeasonFeaturedCache';
import {
  ANIME_SORT_OPTIONS,
  buildFilteredAnimeList,
  normalizeAnimeRating,
  normalizeAnimeWatchCount,
} from './utils/animeList';
import { warmAniListTagTranslations } from './services/tagCatalogService';
import useTagTranslationVersion from './hooks/useTagTranslationVersion';
import usePageScrollIdle from './hooks/usePageScrollIdle';
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

const scrollDocumentToTop = (behavior = 'auto') => {
  if (typeof window === 'undefined') return;

  window.scrollTo({ top: 0, left: 0, behavior });
  if (behavior !== 'smooth' && typeof document !== 'undefined') {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }
};

const sanitizeAppBackStack = (value) => {
  if (!Array.isArray(value)) return [];

  const stack = [];
  value.forEach((item) => {
    if (!APP_VIEW_SET.has(item)) return;
    if (stack.includes(item)) return;
    stack.push(item);
  });
  return stack;
};

const getInitialAppBackStack = (targetView) => (
  targetView === 'home' ? [] : ['home']
);

const buildNextAppBackStack = (currentStack, currentView, nextView, replace = false) => {
  if (nextView === 'home') return [];

  const stack = sanitizeAppBackStack(currentStack);
  const targetIndex = stack.lastIndexOf(nextView);
  if (targetIndex >= 0) {
    return stack.slice(0, targetIndex);
  }

  if (replace) {
    return stack.filter((item) => item !== nextView);
  }

  const currentIndex = stack.lastIndexOf(currentView);
  const baseStack = currentIndex >= 0 ? stack.slice(0, currentIndex) : stack;
  const nextStack = currentView === nextView ? baseStack : [...baseStack, currentView];
  return sanitizeAppBackStack(nextStack).filter((item) => item !== nextView);
};

const getAppBackTarget = (stack) => {
  const sanitizedStack = sanitizeAppBackStack(stack);
  return sanitizedStack.length > 0 ? sanitizedStack[sanitizedStack.length - 1] : null;
};

const ONBOARDING_STEPS = [
  {
    key: 'intro',
    eyebrow: 'WELCOME',
    title: 'AniTriggerへようこそ',
    description: 'このサイトでは、視聴したアニメをマイリストに登録し、記録・振り返り・共有をすることができます。',
    features: [
      '視聴した作品をマイリストで整理できます。',
      '気になる作品はブックマークに分けて残せます。',
      'あとから共有カードやテキストも作成できます。',
    ],
  },
  {
    key: 'mylist',
    eyebrow: 'MY LIST',
    title: 'マイリスト機能',
    description: '視聴した作品を登録して、評価や履歴を管理できます。',
    features: [
      '評価や視聴回数を作品ごとに記録できます。',
      '検索や絞り込みで見返したい作品を探せます。',
    ],
  },
  {
    key: 'bookmark',
    eyebrow: 'BOOKMARK',
    title: 'ブックマーク機能',
    description: '気になる作品や今期・来季のアニメをまとめて確認できます。',
    features: [
      '今すぐ見ない作品も候補として残せます。',
      'あとからマイリストへ移す導線も用意されています。',
    ],
  },
  {
    key: 'add',
    eyebrow: 'ADD',
    title: '作品追加機能',
    description: '検索・年代リストなどから作品を追加できます。',
    features: [
      'タイトル検索で見たい作品をすばやく探せます。',
      '年代や季節、ジャンルから一覧で追加することもできます。',
    ],
  },
  {
    key: 'share',
    eyebrow: 'SHARE',
    title: '共有機能',
    description: '登録した作品を共有カードやテキストでSNSなどへ共有できます。',
    features: [
      '共有したい作品だけを選んで出力できます。',
      '共有カードと文字共有を使い分けられます。',
    ],
  },
  {
    key: 'start',
    eyebrow: 'START',
    title: '作品を追加してみよう',
    description: '今季の作品をまとめて確認するか、タイトル検索で追加を始められます。',
    features: [
      '今季放送中の一覧からまとめて追加できます。',
      '見たい作品が決まっているなら検索追加が便利です。',
    ],
  },
];

const DETAIL_ENRICHMENT_BATCH_SIZE = 6;
const DETAIL_ENRICHMENT_VISIBLE_PRIORITY_LIMIT = 24;
const DETAIL_ENRICHMENT_BACKGROUND_LIMIT = 24;
const COLLECTION_PAGE_SIZE = 30;
const DETAIL_ENRICHMENT_RETRY_BASE_MS = 4000;
const DETAIL_ENRICHMENT_RETRY_MAX_MS = 60000;
const FEATURED_SLIDER_CURRENT_SEASON_FORMATS = Object.freeze(['TV', 'TV_SHORT', 'MOVIE', 'ONA']);
const PAGE_TRANSITION_FOOTER_HIDE_MS = 1200;

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
  const normalizeText = (value) => {
    if (typeof value !== 'string') return '';
    return value;
  };
  const normalizeFiniteNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const normalizeStringArray = (value) => (
    Array.isArray(value)
      ? value
        .map((item) => normalizeText(item).trim())
        .filter(Boolean)
      : []
  );
  const normalizeAnimeTitle = (value) => {
    if (typeof value === 'string') {
      return {
        native: value,
        romaji: value,
        english: '',
      };
    }

    const source = value && typeof value === 'object' ? value : {};
    return {
      native: normalizeText(source.native),
      romaji: normalizeText(source.romaji),
      english: normalizeText(source.english),
    };
  };
  const normalizeAnimeCoverImage = (value) => {
    if (typeof value === 'string') {
      return {
        large: value,
        extraLarge: value,
      };
    }

    const source = value && typeof value === 'object' ? value : {};
    return {
      large: normalizeText(source.large),
      extraLarge: normalizeText(source.extraLarge),
    };
  };
  const normalizeAnimeStartDate = (value) => {
    const source = value && typeof value === 'object' ? value : {};
    return {
      year: normalizeFiniteNumber(source.year),
      month: normalizeFiniteNumber(source.month),
      day: normalizeFiniteNumber(source.day),
    };
  };
  const sanitizeAnimeList = (list, options = {}) => filterDisplayEligibleAnimeList(Array.isArray(list) ? list : [], {
    // Keep legacy items that do not include format/country metadata.
    allowUnknownFormat: true,
    allowUnknownCountry: true,
  }).map((anime) => {
    const normalizedId = normalizeFiniteNumber(anime?.id);
    const normalizedTitle = normalizeAnimeTitle(anime?.title);
    const normalizedCoverImage = normalizeAnimeCoverImage(anime?.coverImage);
    const normalizedStartDate = normalizeAnimeStartDate(anime?.startDate);
    const normalizedGenres = normalizeStringArray(anime?.genres);
    const normalizedSeason = normalizeText(anime?.season);
    const normalizedStatus = normalizeText(anime?.status);
    const normalizedFormat = normalizeText(anime?.format);
    const normalizedCountryOfOrigin = normalizeText(anime?.countryOfOrigin);
    const normalizedBannerImage = normalizeText(anime?.bannerImage);
    const normalizedDescription = normalizeText(anime?.description);
    const normalizedAverageScore = normalizeFiniteNumber(anime?.averageScore);
    const normalizedEpisodes = normalizeFiniteNumber(anime?.episodes);
    const normalizedSeasonYear = normalizeFiniteNumber(anime?.seasonYear);
    const normalizedAddedAt = normalizeFiniteNumber(anime?.addedAt);
    const normalizedBookmarkedAt = normalizeFiniteNumber(anime?.bookmarkedAt);
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
      anime?.id === normalizedId
      && anime?.title?.native === normalizedTitle.native
      && anime?.title?.romaji === normalizedTitle.romaji
      && anime?.title?.english === normalizedTitle.english
      && anime?.coverImage?.large === normalizedCoverImage.large
      && anime?.coverImage?.extraLarge === normalizedCoverImage.extraLarge
      && anime?.startDate?.year === normalizedStartDate.year
      && anime?.startDate?.month === normalizedStartDate.month
      && anime?.startDate?.day === normalizedStartDate.day
      && anime?.season === normalizedSeason
      && anime?.seasonYear === normalizedSeasonYear
      && anime?.status === normalizedStatus
      && anime?.averageScore === normalizedAverageScore
      && anime?.episodes === normalizedEpisodes
      && Array.isArray(anime?.genres)
      && anime.genres.length === normalizedGenres.length
      && anime.genres.every((genre, index) => genre === normalizedGenres[index])
      && anime?.format === normalizedFormat
      && anime?.countryOfOrigin === normalizedCountryOfOrigin
      && anime?.bannerImage === normalizedBannerImage
      && anime?.description === normalizedDescription
      && anime?.addedAt === normalizedAddedAt
      && anime?.bookmarkedAt === normalizedBookmarkedAt
      && (anime?.rating ?? null) === normalizedRating
      && !hasTagList
      && currentWatchCount === normalizedWatchCount
      && (!hasTrailerField || isSameAnimeTrailer(anime?.trailer, normalizedTrailer))
      && (!hasTrailerCheckedField || anime?.trailerChecked === normalizedTrailerChecked)
    ) {
      return anime;
    }

    const nextAnime = {
      ...anime,
      id: normalizedId,
      title: normalizedTitle,
      coverImage: normalizedCoverImage,
      season: normalizedSeason,
      seasonYear: normalizedSeasonYear,
      status: normalizedStatus,
      startDate: normalizedStartDate,
      averageScore: normalizedAverageScore,
      episodes: normalizedEpisodes,
      genres: normalizedGenres,
      format: normalizedFormat,
      countryOfOrigin: normalizedCountryOfOrigin,
      bannerImage: normalizedBannerImage,
      description: normalizedDescription,
      rating: normalizedRating,
    };
    if (normalizedAddedAt === null) {
      delete nextAnime.addedAt;
    } else {
      nextAnime.addedAt = normalizedAddedAt;
    }
    if (normalizedBookmarkedAt === null) {
      delete nextAnime.bookmarkedAt;
    } else {
      nextAnime.bookmarkedAt = normalizedBookmarkedAt;
    }
    if (hasTagList) {
      nextAnime.tags = normalizeAnimeTags(anime.tags);
    } else if (Object.prototype.hasOwnProperty.call(nextAnime, 'tags')) {
      delete nextAnime.tags;
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
  const cachedCurrentSeasonFeaturedAnimeList = useMemo(() => (
    sanitizeAnimeList(readHomeCurrentSeasonFeaturedAnimeListFromStorage(currentSeasonInfo))
  ), [currentSeasonInfo]);
  const [homeFeaturedSliderSource, setHomeFeaturedSliderSource] = useState(() =>
    readHomeFeaturedSliderSourceFromStorage()
  );
  const [currentSeasonFeaturedAnimeList, setCurrentSeasonFeaturedAnimeList] = useState(() => cachedCurrentSeasonFeaturedAnimeList);
  const [isCurrentSeasonFeaturedLoading, setIsCurrentSeasonFeaturedLoading] = useState(false);
  const [hasCurrentSeasonFeaturedLoaded, setHasCurrentSeasonFeaturedLoaded] = useState(() => cachedCurrentSeasonFeaturedAnimeList.length > 0);
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
  const [myListPage, setMyListPage] = useState(1);
  const [homeStatsCardBackgrounds, setHomeStatsCardBackgrounds] = useState(() =>
    readHomeStatsCardBackgroundsFromStorage()
  );
  const [homeQuickActionBackgrounds, setHomeQuickActionBackgrounds] = useState(() =>
    readHomeQuickActionBackgroundsFromStorage()
  );
  const [isHomeQuickActionBackgroundsHydrated, setIsHomeQuickActionBackgroundsHydrated] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedAnimeIds, setSelectedAnimeIds] = useState([]);
  const [bookmarkVisibleAnimeIds, setBookmarkVisibleAnimeIds] = useState([]);
  const [sharePresetAnimeIds, setSharePresetAnimeIds] = useState([]);
  const [isOnboardingDismissed, setIsOnboardingDismissed] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [isRefreshingFeatured, setIsRefreshingFeatured] = useState(false);
  const [activeTrailerAnime, setActiveTrailerAnime] = useState(null);
  const [isServerLibraryReady, setIsServerLibraryReady] = useState(false);
  const [detailEnrichmentRetryTick, setDetailEnrichmentRetryTick] = useState(0);
  const [myListViewportPriorityMap, setMyListViewportPriorityMap] = useState({});
  const [addScreenResetNonce, setAddScreenResetNonce] = useState(0);
  const [showLaunchSplash, setShowLaunchSplash] = useState(true);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [isFooterHiddenDuringTransition, setIsFooterHiddenDuringTransition] = useState(false);
  const [isFooterTouchingViewport, setIsFooterTouchingViewport] = useState(false);
  const [globalBackFooterHeight, setGlobalBackFooterHeight] = useState(0);
  const [localBackAction, setLocalBackAction] = useState(null);
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
  const headerMenuRef = useRef(null);
  const footerRef = useRef(null);
  const hasCompletedInitialViewRenderRef = useRef(false);
  const pendingGlobalBackHomeScrollRef = useRef(false);
  const myListResultsRef = useRef(null);
  const pendingMyListPageScrollRef = useRef(false);
  const onboardingStepListRef = useRef(null);
  const onboardingStepItemRefs = useRef([]);
  const isOnboardingActive = animeList.length === 0 && !isOnboardingDismissed;
  const tagTranslationVersion = useTagTranslationVersion();
  const isPageScrollIdle = usePageScrollIdle();
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
  const shouldShowFeaturedSliderLoading = homeFeaturedSliderSource === HOME_FEATURED_SLIDER_SOURCES.currentSeason
    && !hasCurrentSeasonFeaturedLoaded;

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

    const { replace = false, force = false, scrollToTopOnSameView = false } = options;
    if (isOnboardingActive && !force && nextView !== 'home') {
      return;
    }
    const targetHash = APP_VIEW_HASHES[nextView] || '#/';
    const currentHash = window.location.hash || '#/';
    const isSameView = view === nextView && currentHash === targetHash;
    if (isSameView) {
      if (scrollToTopOnSameView) {
        scrollDocumentToTop('smooth');
      }
      return;
    }

    navigationTypeRef.current = 'push';
    const currentState = window.history.state || {};
    const appBackStack = buildNextAppBackStack(
      currentState.appBackStack,
      view,
      nextView,
      replace
    );
    const state = {
      ...currentState,
      appView: nextView,
      appBackStack,
      appBackTarget: getAppBackTarget(appBackStack),
    };
    if (replace) {
      window.history.replaceState(state, '', targetHash);
    } else {
      window.history.pushState(state, '', targetHash);
    }
    setView(nextView);
  };

  const replaceViewWithBackStack = (nextView, nextBackStack = []) => {
    if (!APP_VIEW_SET.has(nextView)) return;
    if (typeof window === 'undefined') {
      setView(nextView);
      return;
    }

    const appBackStack = sanitizeAppBackStack(nextBackStack);
    navigationTypeRef.current = 'pop';
    window.history.replaceState({
      ...(window.history.state || {}),
      appView: nextView,
      appBackStack,
      appBackTarget: getAppBackTarget(appBackStack),
    }, '', APP_VIEW_HASHES[nextView] || '#/');
    setView(nextView);
  };

  const navigateBackOneStep = () => {
    if (typeof window === 'undefined') {
      setView('home');
      return;
    }

    const currentStack = sanitizeAppBackStack(window.history.state?.appBackStack);
    while (currentStack.length > 0 && currentStack[currentStack.length - 1] === view) {
      currentStack.pop();
    }

    const targetView = currentStack.length > 0 ? currentStack[currentStack.length - 1] : 'home';
    if (!APP_VIEW_SET.has(targetView) || targetView === view) {
      pendingGlobalBackHomeScrollRef.current = true;
      replaceViewWithBackStack('home', []);
      return;
    }

    const appBackStack = targetView === 'home' ? [] : currentStack.slice(0, -1);
    pendingGlobalBackHomeScrollRef.current = targetView === 'home';
    replaceViewWithBackStack(targetView, appBackStack);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const previousScrollRestoration = window.history.scrollRestoration;
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }

    const normalizedView = getViewFromLocation(window.location.hash, window.location.pathname);
    const currentState = window.history.state || {};
    const currentBackStack = sanitizeAppBackStack(currentState.appBackStack);
    const appBackStack = currentBackStack.length > 0 || normalizedView === 'home'
      ? currentBackStack
      : getInitialAppBackStack(normalizedView);
    const state = {
      ...currentState,
      appView: normalizedView,
      appBackStack,
      appBackTarget: getAppBackTarget(appBackStack),
    };
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
      const eventBackStack = sanitizeAppBackStack(event?.state?.appBackStack);
      const appBackStack = eventBackStack.length > 0 || nextView === 'home'
        ? eventBackStack
        : getInitialAppBackStack(nextView);
      const state = {
        ...(event?.state || {}),
        appView: nextView,
        appBackStack,
        appBackTarget: getAppBackTarget(appBackStack),
      };
      window.history.replaceState(state, '', APP_VIEW_HASHES[nextView] || '#/');
      navigationTypeRef.current = 'pop';
      setView(nextView);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      if ('scrollRestoration' in window.history) {
        window.history.scrollRestoration = previousScrollRestoration;
      }
    };
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
    if (typeof window === 'undefined') {
      setShowLaunchSplash(false);
      return undefined;
    }

    const prefersReducedMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timeoutId = window.setTimeout(
      () => setShowLaunchSplash(false),
      prefersReducedMotion ? 1400 : 3200
    );

    return () => window.clearTimeout(timeoutId);
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

  useEffect(() => {
    if (!isHeaderMenuOpen || typeof document === 'undefined') return undefined;

    const handlePointerDown = (event) => {
      if (headerMenuRef.current?.contains(event.target)) return;
      setIsHeaderMenuOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsHeaderMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isHeaderMenuOpen]);

  useEffect(() => {
    setIsHeaderMenuOpen(false);
  }, [view]);

  const handleLocalBackActionChange = useCallback((nextAction) => {
    setLocalBackAction(() => {
      if (!nextAction || typeof nextAction.onBack !== 'function') return null;
      return {
        label: nextAction.label || '前の画面に戻る',
        onBack: nextAction.onBack,
      };
    });
  }, []);

  useLayoutEffect(() => {
    setLocalBackAction(null);
  }, [view]);

  useEffect(() => {
    if (!hasCompletedInitialViewRenderRef.current) {
      hasCompletedInitialViewRenderRef.current = true;
      return undefined;
    }

    if (
      typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setIsFooterHiddenDuringTransition(false);
      return undefined;
    }

    setIsFooterHiddenDuringTransition(true);
    const timeoutId = setTimeout(() => {
      setIsFooterHiddenDuringTransition(false);
    }, PAGE_TRANSITION_FOOTER_HIDE_MS);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [view]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    let animationFrameId = null;

    const updateFooterTouchState = () => {
      animationFrameId = null;
      const footerElement = footerRef.current;
      if (!footerElement) {
        setIsFooterTouchingViewport(false);
        setGlobalBackFooterHeight(0);
        return;
      }

      const footerRect = footerElement.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const isTouching = footerRect.top <= viewportHeight && footerRect.bottom >= 0;
      const nextFooterHeight = Math.max(0, Math.ceil(footerElement.offsetHeight || footerRect.height || 0));
      setIsFooterTouchingViewport((current) => (current === isTouching ? current : isTouching));
      setGlobalBackFooterHeight((current) => (
        current === nextFooterHeight ? current : nextFooterHeight
      ));
    };

    const scheduleFooterTouchStateUpdate = () => {
      if (animationFrameId !== null) return;
      animationFrameId = window.requestAnimationFrame(updateFooterTouchState);
    };

    updateFooterTouchState();
    window.addEventListener('scroll', scheduleFooterTouchStateUpdate, { passive: true });
    window.addEventListener('resize', scheduleFooterTouchStateUpdate);
    const resizeObserver = typeof window.ResizeObserver === 'function'
      ? new window.ResizeObserver(scheduleFooterTouchStateUpdate)
      : null;
    if (resizeObserver) {
      if (document.body) resizeObserver.observe(document.body);
      if (document.documentElement) resizeObserver.observe(document.documentElement);
      if (footerRef.current) resizeObserver.observe(footerRef.current);
    }

    return () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
      window.removeEventListener('scroll', scheduleFooterTouchStateUpdate);
      window.removeEventListener('resize', scheduleFooterTouchStateUpdate);
      resizeObserver?.disconnect();
    };
  }, [view, isFooterHiddenDuringTransition]);

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

        startTransition(() => {
          setCurrentSeasonFeaturedAnimeList(nextItems);
          setHasCurrentSeasonFeaturedLoaded(true);
          setHasCurrentSeasonFeaturedError(Boolean(result?.error) && nextItems.length === 0);
        });
        writeHomeCurrentSeasonFeaturedAnimeListToStorage(currentSeasonInfo, nextItems);
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
    currentSeasonInfo,
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
  useLayoutEffect(() => {
    navigationTypeRef.current = 'idle';

    scrollDocumentToTop();

    const scrollReset = () => {
      scrollDocumentToTop();
    };

    const animId = requestAnimationFrame(scrollReset);
    const timeoutId = setTimeout(scrollReset, 10);
    const lateTimeoutId = setTimeout(scrollReset, 120);

    return () => {
      cancelAnimationFrame(animId);
      clearTimeout(timeoutId);
      clearTimeout(lateTimeoutId);
    };
  }, [view]);

  useEffect(() => {
    if (view !== 'home' || !pendingGlobalBackHomeScrollRef.current) return undefined;
    pendingGlobalBackHomeScrollRef.current = false;

    scrollDocumentToTop();
    const frameId = requestAnimationFrame(() => {
      scrollDocumentToTop();
    });
    const timeoutId = setTimeout(() => {
      scrollDocumentToTop();
    }, 80);

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(timeoutId);
    };
  }, [view]);

  useEffect(() => {
    if (view !== 'mylist') {
      setIsSelectionMode(false);
      setSelectedAnimeIds([]);
    }
  }, [view]);

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
    const state = {
      ...(window.history.state || {}),
      appView: forcedHome,
      appBackStack: [],
      appBackTarget: null,
    };
    window.history.replaceState(state, '', APP_VIEW_HASHES[forcedHome] || '#/');
    navigationTypeRef.current = 'pop';
    setView(forcedHome);
  }, [isOnboardingActive, view]);

  // 3. Initial Data Acquisition (Hydration) - Empty for Clean Start

  // 4. Action Handlers
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

  const handleTutorialSliderAction = useCallback((actionId) => {
    switch (actionId) {
      case 'open-mylist':
        navigateTo('mylist');
        break;
      case 'open-bookmarks':
        navigateTo('bookmarks');
        break;
      case 'open-add':
        navigateTo('add');
        break;
      case 'open-home-featured-slider-settings':
        navigateTo('homeCustomizeSlider');
        break;
      default:
        break;
    }
  }, [navigateTo]);

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
    const isLikelyMobileTrailerEnvironment = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && (
        window.matchMedia('(pointer: coarse)').matches
        || window.matchMedia('(max-width: 768px)').matches
      );

    if (isLikelyMobileTrailerEnvironment) {
      setActiveTrailerAnime({ ...anime, trailer, trailerLoading: false });
      return true;
    }

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

  const openSeasonalAddView = (targetView, options = {}) => {
    navigateTo(targetView, options);
  };

  const handleOpenAddView = () => {
    if (view === 'add') {
      setAddScreenResetNonce((prev) => prev + 1);
      scrollDocumentToTop('smooth');
      return;
    }
    navigateTo('add');
  };

  const handleOnboardingPrev = () => {
    setOnboardingStep((prev) => Math.max(0, prev - 1));
  };

  const handleOnboardingNext = () => {
    setOnboardingStep((prev) => Math.min(ONBOARDING_STEPS.length - 1, prev + 1));
  };

  const handleOnboardingStepSelect = (nextStepIndex) => {
    const numericIndex = Number(nextStepIndex);
    if (!Number.isFinite(numericIndex)) return;
    setOnboardingStep(Math.min(ONBOARDING_STEPS.length - 1, Math.max(0, numericIndex)));
  };

  const handleOnboardingAddCurrent = () => {
    setIsOnboardingDismissed(true);
    openSeasonalAddView('addCurrent', { force: true });
  };

  const handleOnboardingSearchAdd = () => {
    setIsOnboardingDismissed(true);
    navigateTo('add', { force: true });
  };

  const handleOnboardingCancel = () => {
    setIsOnboardingDismissed(true);
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
    setMyListPage(1);
    setSelectedGenres(Array.isArray(nextFilters?.selectedGenres) ? nextFilters.selectedGenres : []);
    setSelectedTags(Array.isArray(nextFilters?.selectedTags) ? nextFilters.selectedTags : []);
    setSelectedYear(String(nextFilters?.selectedYear || '').trim());
    setMinRating(nextFilters?.minRating || '');
    setFilterMatchMode(nextFilters?.matchMode || 'and');
  };

  const handleClearMyListFilters = () => {
    setMyListPage(1);
    setSelectedGenres([]);
    setSelectedTags([]);
    setSelectedYear('');
    setMinRating('');
    setFilterMatchMode('and');
  };

  const queueMyListResultsScroll = useCallback(() => {
    pendingMyListPageScrollRef.current = true;
  }, []);

  const handleMyListSearchChange = useCallback((event) => {
    setMyListPage(1);
    setSearchQuery(event.target.value);
  }, []);

  const handleMyListSortKeyChange = useCallback((nextSortKey) => {
    setMyListPage(1);
    setSortKey(nextSortKey);
  }, []);

  const handleMyListSortOrderChange = useCallback((nextSortOrder) => {
    setMyListPage(1);
    setSortOrder(nextSortOrder);
  }, []);

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
  const myListPageCount = Math.max(1, Math.ceil(filteredList.length / COLLECTION_PAGE_SIZE));
  const safeMyListPage = Math.min(Math.max(1, myListPage), myListPageCount);
  const pagedFilteredList = useMemo(() => {
    const startIndex = (safeMyListPage - 1) * COLLECTION_PAGE_SIZE;
    return filteredList.slice(startIndex, startIndex + COLLECTION_PAGE_SIZE);
  }, [filteredList, safeMyListPage]);

  useEffect(() => {
    setMyListPage((prev) => Math.min(Math.max(1, prev), myListPageCount));
  }, [myListPageCount]);

  useEffect(() => {
    if (!pendingMyListPageScrollRef.current) return undefined;

    pendingMyListPageScrollRef.current = false;
    let firstFrameId = 0;
    let secondFrameId = 0;

    const performScroll = () => {
      const target = myListResultsRef.current;
      if (target?.scrollIntoView) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
        return;
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    firstFrameId = window.requestAnimationFrame(() => {
      secondFrameId = window.requestAnimationFrame(performScroll);
    });

    return () => {
      if (firstFrameId) {
        window.cancelAnimationFrame(firstFrameId);
      }
      if (secondFrameId) {
        window.cancelAnimationFrame(secondFrameId);
      }
    };
  }, [filteredList.length, safeMyListPage]);

  const selectedAnimeIdSet = useMemo(() => new Set(selectedAnimeIds), [selectedAnimeIds]);
  const visibleAnimeIds = useMemo(() => pagedFilteredList.map((anime) => anime.id), [pagedFilteredList]);
  const filteredAnimeIds = useMemo(() => filteredList.map((anime) => anime.id), [filteredList]);
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

    const myListPriorityIds = myListViewportAnimeIds.length > 0
      ? myListViewportAnimeIds
      : visibleAnimeIds.slice(0, DETAIL_ENRICHMENT_VISIBLE_PRIORITY_LIMIT);
    const bookmarkPriorityIds = bookmarkVisibleAnimeIds.slice(0, DETAIL_ENRICHMENT_VISIBLE_PRIORITY_LIMIT);

    if (view === 'mylist') {
      pushIds(myListPriorityIds);
    }
    if (view === 'bookmarks') {
      pushIds(bookmarkPriorityIds);
    }

    if (view !== 'mylist') {
      pushIds(animeList.slice(0, DETAIL_ENRICHMENT_BACKGROUND_LIMIT).map((anime) => anime?.id));
    }
    if (view !== 'bookmarks') {
      pushIds(bookmarkList.slice(0, DETAIL_ENRICHMENT_BACKGROUND_LIMIT).map((anime) => anime?.id));
    }
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

    const shouldDeferDetailEnrichment = !isPageScrollIdle
      && (view === 'mylist' || view === 'bookmarks');
    if (shouldDeferDetailEnrichment) {
      scheduleDetailEnrichmentRetry();
      return undefined;
    }

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
          startTransition(() => {
            setAnimeList((prev) => applyEnrichedDetails(prev, enrichedMap));
            setBookmarkList((prev) => applyEnrichedDetails(prev, enrichedMap));
          });
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
  }, [
    animeList,
    bookmarkList,
    detailEnrichmentRetryTick,
    isPageScrollIdle,
    prioritizedDetailAnimeIds,
    scheduleDetailEnrichmentRetry,
    view,
  ]);

  useEffect(() => {
    if (isPageScrollIdle) return;
    if (view !== 'mylist' && view !== 'bookmarks') return;
    detailEnrichmentAbortControllerRef.current?.abort?.();
  }, [isPageScrollIdle, view]);

  const isAllFilteredSelected = filteredAnimeIds.length > 0
    && filteredAnimeIds.every((id) => selectedAnimeIdSet.has(id));
  const hasMyListEntries = animeList.length > 0;
  const myListSubtitle = hasMyListEntries
    ? '登録済み作品の検索・絞り込み・並び替え'
    : '視聴した作品を追加して、記録を残せます。';

  const handleSelectAllVisibleAnime = () => {
    if (filteredAnimeIds.length === 0) return;
    setSelectedAnimeIds((prev) => {
      const nextSet = new Set(prev);
      filteredAnimeIds.forEach((id) => nextSet.add(id));
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
  const isMyListView = view === 'mylist';
  const shouldShowHomeOnboarding = view === 'home' && isOnboardingActive;
  const isOnboardingNavigationLocked = shouldShowHomeOnboarding;
  const isLastOnboardingStep = onboardingStep >= ONBOARDING_STEPS.length - 1;
  const activeOnboardingStep = ONBOARDING_STEPS[Math.min(onboardingStep, ONBOARDING_STEPS.length - 1)];
  const nextOnboardingStep = isLastOnboardingStep
    ? null
    : ONBOARDING_STEPS[Math.min(onboardingStep + 1, ONBOARDING_STEPS.length - 1)];
  const onboardingProgressPercent = ((Math.min(onboardingStep, ONBOARDING_STEPS.length - 1) + 1) / ONBOARDING_STEPS.length) * 100;
  const activeBrowsePreset = view === 'addCurrent'
    ? currentSeasonAddPreset
    : view === 'addNext'
      ? nextSeasonAddPreset
      : null;
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

  useEffect(() => {
    if (!shouldShowHomeOnboarding || typeof window === 'undefined') return undefined;

    const stepList = onboardingStepListRef.current;
    const activeStepItem = onboardingStepItemRefs.current[onboardingStep];
    if (!stepList || !activeStepItem) return undefined;

    const prefersReducedMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const behavior = prefersReducedMotion ? 'auto' : 'smooth';
    const rafId = window.requestAnimationFrame(() => {
      const maxScrollLeft = Math.max(0, stepList.scrollWidth - stepList.clientWidth);
      if (maxScrollLeft > 0) {
        const itemLeft = activeStepItem.offsetLeft;
        const itemWidth = activeStepItem.offsetWidth;
        const targetLeft = Math.min(
          maxScrollLeft,
          Math.max(0, itemLeft - ((stepList.clientWidth - itemWidth) / 2))
        );
        stepList.scrollTo({ left: targetLeft, behavior });
        return;
      }

      activeStepItem.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior,
      });
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [onboardingStep, shouldShowHomeOnboarding]);

  // 6. UI Render
  const pageTransitionDirection = navigationTypeRef.current === 'pop' ? 'backward' : 'forward';
  const shortcutItems = [
    {
      key: 'home',
      label: 'ホーム',
      active: isHomeView,
      onClick: () => navigateTo('home'),
      disabled: isOnboardingNavigationLocked,
    },
    {
      key: 'mylist',
      label: 'マイリスト',
      active: isMyListView,
      onClick: () => navigateTo('mylist'),
      disabled: isOnboardingNavigationLocked,
    },
    {
      key: 'bookmarks',
      label: 'ブックマーク',
      active: view === 'bookmarks',
      onClick: () => navigateTo('bookmarks'),
      disabled: isOnboardingNavigationLocked,
    },
    {
      key: 'add',
      label: '作品を追加',
      active: isAddView,
      onClick: handleOpenAddView,
      disabled: isOnboardingNavigationLocked,
    },
    {
      key: 'share',
      label: '共有',
      active: isShareView,
      onClick: () => handleOpenShareMethod(),
      disabled: isOnboardingNavigationLocked || animeList.length === 0,
      disabledReason: 'マイリストに作品を追加すると使えます',
    },
  ];
  const headerShortcutItems = shortcutItems;
  const footerShareDisabled = isOnboardingNavigationLocked || animeList.length === 0;
  const footerShareDisabledReason = 'マイリストに作品を追加すると使えます';
  const openFooterShareView = (nextShareView) => {
    if (footerShareDisabled) return;
    setSharePresetAnimeIds([]);
    navigateTo(nextShareView);
  };
  const footerShortcutGroups = [
    {
      key: 'main',
      title: 'メイン',
      items: [
        {
          key: 'home',
          label: 'ホーム',
          active: view === 'home',
          onClick: () => navigateTo('home', { scrollToTopOnSameView: true }),
          disabled: isOnboardingNavigationLocked,
        },
        {
          key: 'mylist',
          label: 'マイリスト',
          active: isMyListView,
          onClick: () => navigateTo('mylist', { scrollToTopOnSameView: true }),
          disabled: isOnboardingNavigationLocked,
        },
        {
          key: 'bookmarks',
          label: 'ブックマーク',
          active: view === 'bookmarks',
          onClick: () => navigateTo('bookmarks', { scrollToTopOnSameView: true }),
          disabled: isOnboardingNavigationLocked,
        },
      ],
    },
    {
      key: 'add',
      title: '作品追加',
      items: [
        {
          key: 'add-search',
          label: '検索して追加',
          active: view === 'add',
          onClick: handleOpenAddView,
          disabled: isOnboardingNavigationLocked,
        },
        {
          key: 'add-current',
          label: '今期放送中',
          active: view === 'addCurrent',
          onClick: () => openSeasonalAddView('addCurrent', { scrollToTopOnSameView: true }),
          disabled: isOnboardingNavigationLocked,
        },
        {
          key: 'add-next',
          label: '来季放送予定',
          active: view === 'addNext',
          onClick: () => openSeasonalAddView('addNext', { scrollToTopOnSameView: true }),
          disabled: isOnboardingNavigationLocked,
        },
      ],
    },
    {
      key: 'share',
      title: '共有',
      items: [
        {
          key: 'share-image',
          label: 'カードで共有',
          active: view === 'shareImage',
          onClick: () => openFooterShareView('shareImage'),
          disabled: footerShareDisabled,
          disabledReason: footerShareDisabledReason,
        },
        {
          key: 'share-text',
          label: '文字で共有',
          active: view === 'shareText',
          onClick: () => openFooterShareView('shareText'),
          disabled: footerShareDisabled,
          disabledReason: footerShareDisabledReason,
        },
      ],
    },
    {
      key: 'customize',
      title: '設定',
      items: [
        {
          key: 'customize-slider',
          label: 'ホームスライド',
          active: view === 'homeCustomizeSlider',
          onClick: () => navigateTo('homeCustomizeSlider', { scrollToTopOnSameView: true }),
          disabled: isOnboardingNavigationLocked,
        },
        {
          key: 'customize-stats',
          label: '統計カード',
          active: view === 'homeCustomizeStats',
          onClick: () => navigateTo('homeCustomizeStats', { scrollToTopOnSameView: true }),
          disabled: isOnboardingNavigationLocked,
        },
        {
          key: 'customize-quick',
          label: 'ショートカット背景',
          active: view === 'homeCustomizeQuick',
          onClick: () => navigateTo('homeCustomizeQuick', { scrollToTopOnSameView: true }),
          disabled: isOnboardingNavigationLocked,
        },
      ],
    },
  ];
  const hasLocalBackAction = typeof localBackAction?.onBack === 'function';
  const shouldShowOnboardingStepBack = shouldShowHomeOnboarding && onboardingStep > 0;
  const shouldShowGlobalBackButton = !isFooterHiddenDuringTransition
    && (view !== 'home' || hasLocalBackAction || shouldShowOnboardingStepBack);
  const globalBackLabel = localBackAction?.label || '前の画面に戻る';
  const handleGlobalBackClick = () => {
    if (hasLocalBackAction) {
      localBackAction.onBack();
      return;
    }

    if (shouldShowOnboardingStepBack) {
      handleOnboardingPrev();
      return;
    }

    navigateBackOneStep();
  };

  return (
    <div
      className={`app-container${isFooterTouchingViewport ? ' footer-touching-viewport' : ''}`}
      style={{ '--global-back-footer-height': `${globalBackFooterHeight}px` }}
    >
      {showLaunchSplash && (
        <div className="site-launch-splash" aria-hidden="true">
          <div className="site-launch-splash-stage">
            <img className="site-launch-splash-logo" src="/images/logo.png" alt="" />
            <p className="site-launch-splash-copy">
              あなたのアニメの記憶を呼び起こすトリガー
            </p>
          </div>
        </div>
      )}

      <header className="app-header">
        <div className="app-header-inner">
          <button
            type="button"
            className={`logo-button${isOnboardingNavigationLocked ? ' nav-locked' : ''}`}
            onClick={isOnboardingNavigationLocked ? undefined : () => navigateTo('home')}
            disabled={isOnboardingNavigationLocked}
            aria-label="ホームへ移動"
          >
            <img src="/images/logo.png" alt="AniTrigger" />
            <span className="logo-title" title="ホームへ移動">AniTrigger</span>
          </button>

          <div className="header-actions" ref={headerMenuRef}>
            <a
              className={`header-home-link ${isHomeView ? 'active' : ''}${isOnboardingNavigationLocked ? ' disabled' : ''}`}
              href={APP_VIEW_HASHES.home}
              onClick={(event) => {
                event.preventDefault();
                if (isOnboardingNavigationLocked) return;
                navigateTo('home', { scrollToTopOnSameView: true });
                setIsHeaderMenuOpen(false);
              }}
              aria-current={isHomeView ? 'page' : undefined}
              aria-disabled={isOnboardingNavigationLocked ? 'true' : undefined}
              aria-label="ホームへ移動"
              tabIndex={isOnboardingNavigationLocked ? -1 : undefined}
              title="ホーム"
            >
              <svg className="header-home-illustration" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
                <path d="M5 15.2 16 6l11 9.2" />
                <path d="M8.5 14.2v12.3h15V14.2" />
                <path d="M13 26.5v-7h6v7" />
              </svg>
            </a>

            <a
              className={`header-add-link ${isAddView ? 'active' : ''}${isOnboardingNavigationLocked ? ' disabled' : ''}`}
              href={APP_VIEW_HASHES.add}
              onClick={(event) => {
                event.preventDefault();
                if (isOnboardingNavigationLocked) return;
                handleOpenAddView();
                setIsHeaderMenuOpen(false);
              }}
              aria-current={isAddView ? 'page' : undefined}
              aria-disabled={isOnboardingNavigationLocked ? 'true' : undefined}
              aria-label="作品の追加へ移動"
              tabIndex={isOnboardingNavigationLocked ? -1 : undefined}
              title="作品を追加"
            >
              <svg className="header-search-illustration" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
                <circle cx="14" cy="14" r="7" />
                <path d="M19.4 19.4 26 26" />
                <path d="M14 10.6v6.8" />
                <path d="M10.6 14h6.8" />
              </svg>
            </a>

            <button
              type="button"
              className={`header-menu-trigger ${isHeaderMenuOpen ? 'active' : ''}`}
              onClick={() => setIsHeaderMenuOpen((current) => !current)}
              disabled={isOnboardingNavigationLocked}
              aria-label="ショートカットメニューを開く"
              aria-expanded={isHeaderMenuOpen}
              aria-controls="header-shortcut-menu"
              title="メニュー"
            >
              <span className="header-menu-line" aria-hidden="true" />
              <span className="header-menu-line" aria-hidden="true" />
              <span className="header-menu-line" aria-hidden="true" />
            </button>

            {isHeaderMenuOpen && (
              <nav id="header-shortcut-menu" className="header-shortcut-menu" aria-label="ヘッダーショートカット">
                {headerShortcutItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`header-shortcut-item ${item.active ? 'active' : ''}`}
                    onClick={() => {
                      item.onClick();
                      setIsHeaderMenuOpen(false);
                    }}
                    disabled={item.disabled}
                    aria-current={item.active ? 'page' : undefined}
                    title={item.disabled ? item.disabledReason : undefined}
                  >
                    {item.label}
                  </button>
                ))}
              </nav>
            )}
          </div>
        </div>
      </header>

      {/* Content Rendering Loop */}
      <div key={view} className={`app-view-stage view-transition-${pageTransitionDirection}`}>
        <div className="app-view-transition-overlay" aria-hidden="true">
          <div className="app-view-transition-illustration-shell">
            <img
              className="app-view-transition-illustration"
              src="/images/page-transition-illustration-v2.png"
              alt=""
            />
          </div>
        </div>
        {isAddView ? (
        <main className="main-content">
          <AddAnimeScreen
            key={`${view}:${addScreenResetNonce}`}
            onAdd={handleAddAnime}
            onRemove={handleRemoveAnime}
            onToggleBookmark={handleToggleBookmark}
            bookmarkList={bookmarkList}
            onPlayTrailer={handleOpenTrailer}
            animeList={animeList}
            screenTitle={addViewTitle}
            screenSubtitle={addViewSubtitle}
            initialEntryTab={activeBrowsePreset ? 'browse' : 'search'}
            browsePreset={activeBrowsePreset}
            onLocalBackStateChange={handleLocalBackActionChange}
          />
        </main>
      ) : view === 'bookmarks' ? (
        <main className="main-content">
          <BookmarkScreen
            bookmarkList={bookmarkList}
            watchedAnimeList={animeList}
            onOpenBookmarkAdd={() => handleOpenAddView('bookmarks')}
            onOpenCurrentSeasonAdd={() => openSeasonalAddView('addCurrent')}
            onOpenNextSeasonAdd={() => openSeasonalAddView('addNext')}
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
        />
      ) : view === 'homeCustomizeSlider' ? (
        <HomeFeaturedSliderCustomizeScreen
          selectedSource={homeFeaturedSliderSource}
          currentSeasonLabel={currentSeasonLabel}
          isCurrentSeasonLoading={isCurrentSeasonFeaturedLoading}
          isCurrentSeasonUnavailable={isCurrentSeasonFeaturedUnavailable}
          onChangeSource={setHomeFeaturedSliderSource}
        />
      ) : view === 'homeCustomizeStats' ? (
        <HomeStatsCustomizeScreen
          animeList={animeList}
          savedBackgrounds={homeStatsCardBackgrounds}
          onSave={handleSaveHomeStatsCardBackgrounds}
          onBackHome={navigateBackOneStep}
          onLocalBackStateChange={handleLocalBackActionChange}
        />
      ) : view === 'homeCustomizeQuick' ? (
        <HomeQuickActionsCustomizeScreen
          animeCount={animeList.length}
          bookmarkCount={bookmarkList.length}
          savedBackgrounds={homeQuickActionBackgrounds}
          onSave={handleSaveHomeQuickActionBackgrounds}
          onBackHome={navigateBackOneStep}
          onLocalBackStateChange={handleLocalBackActionChange}
        />
      ) : isShareView ? (
        <ShareScreen
          key={view}
          mode={view === 'shareImage' ? 'image' : view === 'shareText' ? 'text' : 'method'}
          animeList={animeList}
          initialSelectedAnimeIds={sharePresetAnimeIds}
          onUpdateRating={handleUpdateAnimeRating}
          onUpdateWatchCount={handleUpdateAnimeWatchCount}
          onSelectMode={(mode) => navigateTo(mode === 'image' ? 'shareImage' : 'shareText')}
        />
      ) : view === 'mylist' ? (
        <>
          <main className={`main-content mylist-page-main page-shell${isSelectionMode ? ' has-selection-dock' : ''}`}>
              <div className="mylist-section-header bookmark-screen-header">
                <div>
                  <h3 className="page-main-title">マイリスト</h3>
                  <p className="bookmark-screen-desc page-main-subtitle">{myListSubtitle}</p>
                </div>
                <div className="bookmark-screen-actions mylist-screen-actions">
                  <button
                    className="bookmark-screen-add page-action-button page-action-primary page-action-strong"
                    onClick={handleOpenAddView}
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

              {hasMyListEntries ? (
                <>
                  <div className="controls">
                    <div className="search-box">
                      <i className="search-icon" aria-hidden="true" />
                      <input
                        type="text"
                        placeholder="登録された作品からタイトルを検索"
                        value={searchQuery}
                        onChange={handleMyListSearchChange}
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
                        onSortKeyChange={handleMyListSortKeyChange}
                        onSortOrderChange={handleMyListSortOrderChange}
                        selectAriaLabel="マイリストの並び替え"
                      />
                    )}
                    onApply={handleApplyMyListFilters}
                    onClear={handleClearMyListFilters}
                  />

                  <div ref={myListResultsRef}>
                    <div className="results-count">
                      {filteredList.length} 作品が見つかりました
                    </div>
                    <CollectionPagination
                      currentPage={safeMyListPage}
                      totalPages={myListPageCount}
                      totalItems={filteredList.length}
                      itemsPerPage={COLLECTION_PAGE_SIZE}
                      onPageChange={(nextPage) => {
                        startTransition(() => {
                          setMyListPage(nextPage);
                        });
                        queueMyListResultsScroll();
                      }}
                    />
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
                    {pagedFilteredList.map(anime => (
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

                  <CollectionPagination
                    currentPage={safeMyListPage}
                    totalPages={myListPageCount}
                    totalItems={filteredList.length}
                    itemsPerPage={COLLECTION_PAGE_SIZE}
                    className="browse-pagination-bottom"
                    onPageChange={(nextPage) => {
                      startTransition(() => {
                        setMyListPage(nextPage);
                      });
                      queueMyListResultsScroll();
                    }}
                  />

                  {filteredList.length === 0 && (
                    <div className="empty-state">該当する作品がありません</div>
                  )}
                </>
              ) : (
                <div className="bookmark-empty mylist-empty-state">
                  マイリストはまだありません。視聴した作品を追加してください。
                </div>
              )}
            </main>

          {isSelectionMode && (
            <div className="selection-action-dock" role="region" aria-label="選択モード操作">
              <p className="selection-action-dock-count">{selectedAnimeIds.length} 件を選択中</p>
              <div className="selection-action-dock-buttons">
                <button
                  type="button"
                  className="selection-toolbar-select-all"
                  onClick={handleSelectAllVisibleAnime}
                  disabled={filteredAnimeIds.length === 0 || isAllFilteredSelected}
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
        </>
      ) : shouldShowHomeOnboarding ? (
        <main className="main-content onboarding-main page-shell">
          <section className="onboarding-panel">
            <div className="onboarding-layout">
              <div className="onboarding-primary">
                <div className="onboarding-panel-header">
                  <div className="onboarding-panel-meta">
                    <p className="onboarding-step-badge">
                      {activeOnboardingStep.eyebrow || 'GUIDE'}
                    </p>
                    <p className="onboarding-step-counter">
                      初回ガイド {onboardingStep + 1}/{ONBOARDING_STEPS.length}
                    </p>
                  </div>
                  <div className="onboarding-progress" aria-hidden="true">
                    <span
                      className="onboarding-progress-bar"
                      style={{ width: `${onboardingProgressPercent}%` }}
                    />
                  </div>
                </div>

                <div className="onboarding-copy-surface">
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
                  {nextOnboardingStep && (
                    <p className="onboarding-next-hint">
                      次のステップ: {nextOnboardingStep.title}
                    </p>
                  )}
                </div>

                {isLastOnboardingStep ? (
                  <div className="onboarding-actions final-step">
                    <button type="button" className="onboarding-action-primary" onClick={handleOnboardingAddCurrent}>
                      今季のアニメを追加
                    </button>
                    <button type="button" className="onboarding-action-secondary" onClick={handleOnboardingSearchAdd}>
                      検索して追加
                    </button>
                    <button type="button" className="onboarding-action-secondary onboarding-action-back" onClick={handleOnboardingPrev}>
                      戻る
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
              </div>

              <aside className="onboarding-sidebar" aria-label="ガイドの流れ">
                <div className="onboarding-sidebar-card">
                  <p className="onboarding-sidebar-title">ガイドの流れ</p>
                  <ol className="onboarding-step-list" ref={onboardingStepListRef}>
                    {ONBOARDING_STEPS.map((step, index) => {
                      const isActiveStep = index === onboardingStep;
                      const isCompletedStep = index < onboardingStep;
                      return (
                        <li
                          key={step.key}
                          ref={(element) => {
                            onboardingStepItemRefs.current[index] = element;
                          }}
                          className={`onboarding-step-item${isActiveStep ? ' active' : ''}${isCompletedStep ? ' completed' : ''}`}
                        >
                          <button
                            type="button"
                            className="onboarding-step-link"
                            onClick={() => handleOnboardingStepSelect(index)}
                            aria-current={isActiveStep ? 'step' : undefined}
                          >
                            <span className="onboarding-step-index">{String(index + 1).padStart(2, '0')}</span>
                            <span className="onboarding-step-link-copy">
                              {isActiveStep && (
                                <span className="onboarding-step-link-state">現在</span>
                              )}
                              <span className="onboarding-step-link-title">{step.title}</span>
                              <span className="onboarding-step-link-description">{step.description}</span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                  <p className="onboarding-sidebar-note">
                    気になる機能から先に見ても大丈夫です。最後の画面からすぐ追加を始められます。
                  </p>
                </div>
              </aside>
            </div>
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
            onTutorialAction={handleTutorialSliderAction}
            showRefreshButton={featuredSliderState.showRefreshButton}
            isRefreshing={isRefreshingFeatured}
            isLoading={shouldShowFeaturedSliderLoading}
          />

        <main className="main-content">
            <HomeQuickActionsSection
              animeCount={animeList.length}
              bookmarkCount={bookmarkList.length}
              backgrounds={homeQuickActionBackgrounds}
              onOpenMyList={() => navigateTo('mylist')}
              onOpenBookmarks={() => navigateTo('bookmarks')}
              onOpenCurrentSeason={() => openSeasonalAddView('addCurrent')}
              onOpenNextSeason={() => openSeasonalAddView('addNext')}
              onOpenShare={() => handleOpenShareMethod()}
              shareDisabled={animeList.length === 0}
            />

            <StatsSection animeList={animeList} cardBackgrounds={homeStatsCardBackgrounds} />

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
      </div>

      {shouldShowGlobalBackButton && (
        <button
          type="button"
          className="global-back-button"
          onClick={handleGlobalBackClick}
          aria-label={globalBackLabel}
          title={globalBackLabel}
        >
          <svg className="global-back-icon" viewBox="0 0 28 28" aria-hidden="true" focusable="false">
            <path d="M15.5 7.5 9 14l6.5 6.5" />
            <path d="M9.8 14H21" />
          </svg>
        </button>
      )}

      <footer ref={footerRef} className={`app-footer${isFooterHiddenDuringTransition ? ' hidden-during-transition' : ''}`}>
        <div className="app-footer-inner">
          <div className="app-footer-heading">
            <p className="app-footer-eyebrow">SHORTCUTS</p>
            <div className="app-footer-heading-main">
              <p className="app-footer-title">サイトマップ</p>
              <img className="app-footer-logo" src="/images/logo.png" alt="AniTrigger" />
            </div>
          </div>
          <nav className="app-footer-shortcut-groups" aria-label="フッターショートカット">
            {footerShortcutGroups.map((group) => (
              <div className="app-footer-shortcut-group" key={group.key}>
                <p className="app-footer-group-title">{group.title}</p>
                <div className="app-footer-shortcuts">
                  {group.items.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={`app-footer-shortcut ${item.active ? 'active' : ''}`}
                      onClick={item.onClick}
                      disabled={item.disabled}
                      aria-current={item.active ? 'page' : undefined}
                      title={item.disabled ? item.disabledReason : undefined}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>
          <p className="app-footer-copy">AniTrigger &copy; 2025 - Data provided by AniList API</p>
        </div>
      </footer>

      <TrailerModal anime={activeTrailerAnime} onClose={handleCloseTrailer} />
    </div>
  );
}

export default App;
