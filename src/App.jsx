import { useState, useEffect, useMemo, useRef } from 'react';

// Services
import { buildFeaturedSliderState } from './services/animeService';
import { fetchLibrarySnapshot, saveLibrarySnapshot } from './services/libraryService';
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
import StatsSection from './components/Stats/StatsSection';
import HomeStatsCustomizeScreen from './components/Stats/HomeStatsCustomizeScreen';
import AddAnimeScreen from './components/AddAnime/AddAnimeScreen';
import BookmarkScreen from './components/Bookmarks/BookmarkScreen';
import ShareScreen from './components/Share/ShareScreen';
import AnimeFilterPanel from './components/Shared/AnimeFilterPanel';
import {
  readHomeStatsCardBackgroundsFromStorage,
  sanitizeHomeStatsCardBackgrounds,
  writeHomeStatsCardBackgroundsToStorage,
} from './utils/homeStatsBackgrounds';
import {
  buildFilteredAnimeList,
  normalizeAnimeRating,
} from './utils/animeList';

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

/**
 * Main App Component
 * Responsible for routing, global state management, and data orchestration.
 */
function App() {
  const sanitizeAnimeList = (list) => filterDisplayEligibleAnimeList(Array.isArray(list) ? list : [], {
    // Keep legacy items that do not include format/country metadata.
    allowUnknownFormat: true,
    allowUnknownCountry: true,
  }).map((anime) => {
    const normalizedRating = normalizeAnimeRating(anime?.rating);
    if ((anime?.rating ?? null) === normalizedRating) {
      return anime;
    }
    return { ...anime, rating: normalizedRating };
  });

  // Initialize state from localStorage if available
  const [animeList, setAnimeList] = useState(() => sanitizeAnimeList(readListFromStorage(ANIME_LIST_STORAGE_KEY)));
  const [bookmarkList, setBookmarkList] = useState(() => sanitizeAnimeList(readListFromStorage(BOOKMARK_LIST_STORAGE_KEY)));

  const [view, setView] = useState(() => {
    if (typeof window === 'undefined') return 'home';
    return getViewFromLocation(window.location.hash, window.location.pathname);
  });
  const [featuredSliderState, setFeaturedSliderState] = useState(() => buildFeaturedSliderState(animeList));
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [minRating, setMinRating] = useState('');
  const [sortKey, setSortKey] = useState("added"); // 'added', 'title', 'year', 'rating'
  const [sortOrder, setSortOrder] = useState("desc"); // 'desc', 'asc'
  const [homeStatsCardBackgrounds, setHomeStatsCardBackgrounds] = useState(() =>
    readHomeStatsCardBackgroundsFromStorage()
  );
  const [quickNavState, setQuickNavState] = useState({
    visible: false,
    mobile: false,
    nearTop: true,
    nearBottom: false,
  });
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedAnimeIds, setSelectedAnimeIds] = useState([]);
  const [sharePresetAnimeIds, setSharePresetAnimeIds] = useState([]);
  const [isOnboardingDismissed, setIsOnboardingDismissed] = useState(false);
  const [isOnboardingCurrentSeasonFlow, setIsOnboardingCurrentSeasonFlow] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [isRefreshingFeatured, setIsRefreshingFeatured] = useState(false);
  const [isServerLibraryReady, setIsServerLibraryReady] = useState(false);
  const navigationTypeRef = useRef('init');
  const serverSaveDebounceRef = useRef(null);
  const featuredRefreshTimerRef = useRef(null);
  const isOnboardingActive = animeList.length === 0 && !isOnboardingDismissed;

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

        const remoteAnimeList = sanitizeAnimeList(payload?.animeList);
        const remoteBookmarkList = sanitizeAnimeList(payload?.bookmarkList);
        const hasRemoteData = remoteAnimeList.length > 0 || remoteBookmarkList.length > 0;
        const hasLocalData = animeList.length > 0 || bookmarkList.length > 0;

        if (hasRemoteData) {
          setAnimeList(remoteAnimeList);
          setBookmarkList(remoteBookmarkList);
        } else if (hasLocalData) {
          await saveLibrarySnapshot({
            animeList: sanitizeAnimeList(animeList),
            bookmarkList: sanitizeAnimeList(bookmarkList),
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

  // 1. Storage Persistence
  useEffect(() => {
    writeListToStorage(ANIME_LIST_STORAGE_KEY, animeList);
  }, [animeList]);

  useEffect(() => {
    writeListToStorage(BOOKMARK_LIST_STORAGE_KEY, bookmarkList);
  }, [bookmarkList]);

  useEffect(() => {
    writeHomeStatsCardBackgroundsToStorage(homeStatsCardBackgrounds);
  }, [homeStatsCardBackgrounds]);

  useEffect(() => {
    if (!isServerLibraryReady) return;
    if (serverSaveDebounceRef.current) {
      clearTimeout(serverSaveDebounceRef.current);
    }

    serverSaveDebounceRef.current = setTimeout(() => {
      saveLibrarySnapshot({
        animeList: sanitizeAnimeList(animeList),
        bookmarkList: sanitizeAnimeList(bookmarkList),
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

  // 2. Featured Content Selection
  useEffect(() => {
    if (featuredRefreshTimerRef.current) {
      clearTimeout(featuredRefreshTimerRef.current);
      featuredRefreshTimerRef.current = null;
    }
    setIsRefreshingFeatured(false);
    setFeaturedSliderState(buildFeaturedSliderState(animeList));
  }, [animeList]);

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
  }, [view, animeList.length, minRating, searchQuery, selectedGenres, sortKey, sortOrder]);

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
      setFeaturedSliderState(buildFeaturedSliderState(animeList));
      setIsRefreshingFeatured(false);
      featuredRefreshTimerRef.current = null;
    }, 360);
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
    // Add timestamp for "added" sort
    const animeWithDate = { ...data, rating, addedAt: Date.now() };
    setAnimeList(prev => sanitizeAnimeList([animeWithDate, ...prev]));
    setBookmarkList(prev => sanitizeAnimeList(prev.filter((anime) => anime.id !== data.id)));
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
      setBookmarkList((prev) => sanitizeAnimeList(prev.filter((anime) => anime.id !== data.id)));
      return { success: true, action: 'removed' };
    }

    const bookmarkItem = { ...data, bookmarkedAt: Date.now() };
    setBookmarkList((prev) => sanitizeAnimeList([bookmarkItem, ...prev.filter((anime) => anime.id !== data.id)]));
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
    return handleAddAnime(anime, { rating: options?.rating });
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

  const handleOnboardingPrev = () => {
    setOnboardingStep((prev) => Math.max(0, prev - 1));
  };

  const handleOnboardingNext = () => {
    setOnboardingStep((prev) => Math.min(ONBOARDING_STEPS.length - 1, prev + 1));
  };

  const handleOnboardingAddCurrent = () => {
    setIsOnboardingDismissed(true);
    setIsOnboardingCurrentSeasonFlow(true);
    navigateTo('addCurrent', { force: true });
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

  const handleToggleMyListGenre = (genre) => {
    setSelectedGenres((prev) => (
      prev.includes(genre) ? prev.filter((item) => item !== genre) : [...prev, genre]
    ));
  };

  const handleClearMyListFilters = () => {
    setSelectedGenres([]);
    setMinRating('');
  };

  // 5. Data Derived States (Filters/Computed)
  const uniqueGenres = useMemo(() => {
    const genres = new Set();
    animeList.forEach(anime => {
      anime.genres?.forEach(g => genres.add(g));
    });
    return Array.from(genres).sort((a, b) => a.localeCompare(b));
  }, [animeList]);

  useEffect(() => {
    setSelectedGenres((prev) => prev.filter((genre) => uniqueGenres.includes(genre)));
  }, [uniqueGenres]);

  const filteredList = useMemo(() => {
    return buildFilteredAnimeList(animeList, {
      searchQuery,
      selectedGenres,
      minRating,
      sortKey,
      sortOrder,
    });
  }, [animeList, minRating, searchQuery, selectedGenres, sortKey, sortOrder]);
  const selectedAnimeIdSet = useMemo(() => new Set(selectedAnimeIds), [selectedAnimeIds]);
  const visibleAnimeIds = useMemo(() => filteredList.map((anime) => anime.id), [filteredList]);
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

  const isAddView = view === 'add' || view === 'addCurrent' || view === 'addNext';
  const isHomeView = view === 'home' || view === 'homeCustomize';
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
    : activeBrowsePreset
      ? 'bookmarks'
      : 'home';
  const addViewBackLabel = isOnboardingCurrentAddBackToHome
    ? '← ホームに戻る'
    : activeBrowsePreset
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
            onOpenCurrentSeasonAdd={() => navigateTo('addCurrent')}
            onOpenNextSeasonAdd={() => navigateTo('addNext')}
            onBackHome={() => navigateTo('home')}
            onToggleBookmark={handleToggleBookmark}
            onMarkWatched={handleMarkBookmarkAsWatched}
            onBulkRemoveBookmarks={handleBulkRemoveBookmarks}
          />
        </main>
      ) : view === 'homeCustomize' ? (
        <HomeStatsCustomizeScreen
          animeList={animeList}
          savedBackgrounds={homeStatsCardBackgrounds}
          onSave={handleSaveHomeStatsCardBackgrounds}
          onBackHome={() => navigateTo('home')}
        />
      ) : isShareView ? (
        <ShareScreen
          key={view}
          mode={view === 'shareImage' ? 'image' : view === 'shareText' ? 'text' : 'method'}
          animeList={animeList}
          initialSelectedAnimeIds={sharePresetAnimeIds}
          onUpdateRating={handleUpdateAnimeRating}
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
                <button className="bookmark-screen-add" onClick={() => navigateTo('add')}>
                  <span className="bookmark-screen-add-icon">＋</span>
                  <span>作品を追加</span>
                </button>
                <button
                  type="button"
                  className="mylist-share-button"
                  onClick={() => handleOpenShareMethod()}
                  disabled={animeList.length === 0}
                >
                  作品を共有
                </button>
              </div>
            </div>

            <div className="controls">
              <div className="search-box">
                <i className="search-icon">🔍</i>
                <input
                  type="text"
                  placeholder="登録された作品からタイトルを検索"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="sort-box">
                <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
                  <option value="added">追加順</option>
                  <option value="title">タイトル順</option>
                  <option value="year">放送年順</option>
                  <option value="rating">評価順</option>
                </select>
                <button
                  type="button"
                  className="sort-order-button"
                  onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                  title={sortOrder === 'asc' ? '昇順' : '降順'}
                  aria-label={sortOrder === 'asc' ? '昇順で並び替え' : '降順で並び替え'}
                >
                  {sortOrder === 'asc' ? '↑' : '↓'}
                </button>
              </div>

            </div>

            <AnimeFilterPanel
              uniqueGenres={uniqueGenres}
              selectedGenres={selectedGenres}
              minRating={minRating}
              onToggleGenre={handleToggleMyListGenre}
              onMinRatingChange={setMinRating}
              onClearFilters={handleClearMyListFilters}
              sectionClassName="mylist-genre-filter-section"
              title="絞り込み"
              contextId="mylist"
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
            onRefresh={handleRefreshFeaturedSlides}
            showRefreshButton={featuredSliderState.showRefreshButton}
            isRefreshing={isRefreshingFeatured}
          />

          <main className="main-content">
            <StatsSection animeList={animeList} cardBackgrounds={homeStatsCardBackgrounds} />

            <p className="page-guide-text">
              目的に合わせて移動できます。視聴済みは「マイリスト」、あとで見たい作品は「ブックマーク」で管理してください。
            </p>

            <div className="bookmark-entry-bar">
              <button
                type="button"
                className="bookmark-entry-main"
                onClick={() => navigateTo('mylist')}
              >
                マイリスト
                <span className="bookmark-entry-count">{animeList.length}</span>
              </button>
              <button
                type="button"
                className="bookmark-entry-add"
                onClick={() => navigateTo('add')}
                aria-label="マイリスト追加画面へ"
                title="マイリストに作品を追加"
              >
                ＋
              </button>
            </div>

            <div className="bookmark-entry-bar">
              <button
                type="button"
                className="bookmark-entry-main"
                onClick={() => navigateTo('bookmarks')}
              >
                ブックマーク
                <span className="bookmark-entry-count">{bookmarkList.length}</span>
              </button>
              <button
                type="button"
                className="bookmark-entry-add"
                onClick={() => navigateTo('add')}
                aria-label="作品追加画面へ"
                title="作品を追加"
              >
                ＋
              </button>
            </div>

            <button
              type="button"
              className="home-share-shortcut"
              onClick={() => handleOpenShareMethod()}
              disabled={animeList.length === 0}
            >
              作品を共有
            </button>

            <div className="home-stats-customize-launch">
              <button
                type="button"
                className="home-stats-customize-launch-button"
                onClick={() => navigateTo('homeCustomize')}
              >
                画像を選択してカスタマイズ
              </button>
            </div>
          </main>
        </>
      )}

      <footer className="app-footer">
        <p>AniTrigger &copy; 2025 - Data provided by AniList API</p>
      </footer>

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
