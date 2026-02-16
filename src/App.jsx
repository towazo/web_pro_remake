import { useState, useEffect, useMemo, useRef, useCallback } from 'react';

// Constants & Multi-language data
import { WATCHED_TITLES, ANIME_DESCRIPTIONS, translateGenre } from './constants/animeData';

// Services
import { selectFeaturedAnimes } from './services/animeService';

// Components
import LoadingOverlay from './components/Common/LoadingOverlay';
import HeroSlider from './components/Hero/HeroSlider';
import AnimeCard from './components/Cards/AnimeCard';
import StatsSection from './components/Stats/StatsSection';
import AddAnimeScreen from './components/AddAnime/AddAnimeScreen';
import BookmarkScreen from './components/Bookmarks/BookmarkScreen';
import LoginScreen from './components/Auth/LoginScreen';
import {
  fetchSession,
  logoutSession,
  saveLibraryToCloud,
  syncLibraryAfterLogin,
} from './services/authService';

const APP_VIEW_HASHES = {
  home: '#/',
  mylist: '#/mylist',
  add: '#/add',
  addCurrent: '#/add/current-season',
  addNext: '#/add/next-season',
  bookmarks: '#/bookmarks',
  login: '#/login',
};

const APP_VIEW_SET = new Set(Object.keys(APP_VIEW_HASHES));

const SEASON_LABELS = {
  WINTER: '冬',
  SPRING: '春',
  SUMMER: '夏',
  FALL: '秋',
};

const getSeasonByMonth = (month) => {
  if (month >= 1 && month <= 3) return 'WINTER';
  if (month >= 4 && month <= 6) return 'SPRING';
  if (month >= 7 && month <= 9) return 'SUMMER';
  return 'FALL';
};

const getCurrentSeasonInfo = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return { year, season: getSeasonByMonth(month) };
};

const getNextSeasonInfo = ({ year, season }) => {
  if (season === 'WINTER') return { year, season: 'SPRING' };
  if (season === 'SPRING') return { year, season: 'SUMMER' };
  if (season === 'SUMMER') return { year, season: 'FALL' };
  return { year: year + 1, season: 'WINTER' };
};

const seasonToFilterKey = (season) => {
  if (season === 'WINTER') return 'winter';
  if (season === 'SPRING') return 'spring';
  if (season === 'SUMMER') return 'summer';
  if (season === 'FALL') return 'autumn';
  return '';
};

const getViewFromLocation = (hash = '', pathname = '') => {
  const route = (hash || '').replace(/^#/, '');
  if (route.startsWith('/login')) return 'login';
  if (route.startsWith('/add/current-season')) return 'addCurrent';
  if (route.startsWith('/add/next-season')) return 'addNext';
  if (route.startsWith('/bookmarks/add') || route.startsWith('/bookmark/add')) return 'add';
  if (route.startsWith('/mylist')) return 'mylist';
  if (route.startsWith('/bookmarks') || route.startsWith('/bookmark')) return 'bookmarks';
  if (route.startsWith('/add')) return 'add';
  if (pathname.startsWith('/login')) return 'login';
  if (pathname.startsWith('/add/current-season')) return 'addCurrent';
  if (pathname.startsWith('/add/next-season')) return 'addNext';
  if (pathname.startsWith('/bookmarks/add') || pathname.startsWith('/bookmark/add')) return 'add';
  if (pathname.startsWith('/mylist')) return 'mylist';
  if (pathname.startsWith('/bookmarks') || pathname.startsWith('/bookmark')) return 'bookmarks';
  if (pathname.startsWith('/add')) return 'add';
  return 'home';
};

const ANIME_LIST_STORAGE_KEY = 'myAnimeList';
const BOOKMARK_LIST_STORAGE_KEY = 'myAnimeBookmarkList';

/**
 * Main App Component
 * Responsible for routing, global state management, and data orchestration.
 */
function App() {
  // Initialize state from localStorage if available
  const [animeList, setAnimeList] = useState(() => {
    const saved = localStorage.getItem(ANIME_LIST_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [bookmarkList, setBookmarkList] = useState(() => {
    const saved = localStorage.getItem(BOOKMARK_LIST_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [authState, setAuthState] = useState({ loading: true, user: null });
  const [cloudSyncState, setCloudSyncState] = useState({
    ready: false,
    syncing: false,
    error: '',
  });
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [loginSwitchAccountMode, setLoginSwitchAccountMode] = useState(false);

  const [loadingStatus, setLoadingStatus] = useState({
    loaded: 0,
    total: 0,
    active: false
  });

  const [view, setView] = useState(() => {
    if (typeof window === 'undefined') return 'home';
    return getViewFromLocation(window.location.hash, window.location.pathname);
  });
  const [featuredSlides, setFeaturedSlides] = useState([]);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGenre, setSelectedGenre] = useState("All");
  const [sortKey, setSortKey] = useState("added"); // 'added', 'title', 'year'
  const [sortOrder, setSortOrder] = useState("desc"); // 'desc', 'asc'
  const [quickNavState, setQuickNavState] = useState({
    visible: false,
    mobile: false,
    nearTop: true,
    nearBottom: false,
  });
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedAnimeIds, setSelectedAnimeIds] = useState([]);
  const navigationTypeRef = useRef('init');
  const accountMenuRef = useRef(null);
  const cloudSaveDebounceRef = useRef(null);

  const navigateTo = (nextView, options = {}) => {
    if (!APP_VIEW_SET.has(nextView)) return;
    if (typeof window === 'undefined') {
      setView(nextView);
      return;
    }

    const { replace = false } = options;
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
    if (nextView !== 'login') {
      setLoginSwitchAccountMode(false);
    }
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
      if (nextView !== 'login') {
        setLoginSwitchAccountMode(false);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const performLoginSync = useCallback(async (localAnimeList, localBookmarkList) => {
    const syncResult = await syncLibraryAfterLogin({
      animeList: localAnimeList,
      bookmarkList: localBookmarkList,
    });
    const cloudAnimeList = Array.isArray(syncResult?.data?.animeList) ? syncResult.data.animeList : [];
    const cloudBookmarkList = Array.isArray(syncResult?.data?.bookmarkList) ? syncResult.data.bookmarkList : [];
    setAnimeList(cloudAnimeList);
    setBookmarkList(cloudBookmarkList);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const initializeSession = async () => {
      try {
        const session = await fetchSession();
        if (cancelled) return;

        if (session?.authenticated && session?.user) {
          setAuthState({ loading: false, user: session.user });
          setCloudSyncState({ ready: false, syncing: true, error: '' });
          try {
            await performLoginSync(animeList, bookmarkList);
            if (cancelled) return;
            setCloudSyncState({ ready: true, syncing: false, error: '' });
          } catch (syncError) {
            if (cancelled) return;
            setCloudSyncState({
              ready: false,
              syncing: false,
              error: syncError.message || 'クラウド同期に失敗しました。',
            });
          }
        } else {
          setAuthState({ loading: false, user: null });
          setCloudSyncState({ ready: false, syncing: false, error: '' });
        }
      } catch (_) {
        if (cancelled) return;
        setAuthState({ loading: false, user: null });
        setCloudSyncState({ ready: false, syncing: false, error: '' });
      }
    };

    initializeSession();
    return () => {
      cancelled = true;
    };
  }, [performLoginSync]);

  useEffect(() => {
    if (!accountMenuOpen) return;

    const handleClickOutside = (event) => {
      if (!accountMenuRef.current?.contains(event.target)) {
        setAccountMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    setAccountMenuOpen(false);
    if (view !== 'login' && loginSwitchAccountMode) {
      setLoginSwitchAccountMode(false);
    }
  }, [view, loginSwitchAccountMode]);

  // 1. Storage Persistence
  useEffect(() => {
    if (animeList.length > 0) {
      localStorage.setItem(ANIME_LIST_STORAGE_KEY, JSON.stringify(animeList));
    } else {
      localStorage.removeItem(ANIME_LIST_STORAGE_KEY);
    }
  }, [animeList]);

  useEffect(() => {
    if (bookmarkList.length > 0) {
      localStorage.setItem(BOOKMARK_LIST_STORAGE_KEY, JSON.stringify(bookmarkList));
    } else {
      localStorage.removeItem(BOOKMARK_LIST_STORAGE_KEY);
    }
  }, [bookmarkList]);

  useEffect(() => {
    if (!authState.user || !cloudSyncState.ready) return;
    if (cloudSaveDebounceRef.current) {
      clearTimeout(cloudSaveDebounceRef.current);
    }

    cloudSaveDebounceRef.current = setTimeout(() => {
      saveLibraryToCloud({ animeList, bookmarkList }).catch((syncError) => {
        setCloudSyncState((prev) => ({
          ...prev,
          error: syncError.message || 'クラウドへの保存に失敗しました。',
        }));
      });
    }, 450);

    return () => {
      if (cloudSaveDebounceRef.current) {
        clearTimeout(cloudSaveDebounceRef.current);
      }
    };
  }, [animeList, bookmarkList, authState.user, cloudSyncState.ready]);

  // 2. Featured Content Selection
  useEffect(() => {
    const slides = selectFeaturedAnimes(animeList);
    setFeaturedSlides(slides);
  }, [animeList]);

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
  }, [view, animeList.length, searchQuery, selectedGenre, sortKey, sortOrder]);

  useEffect(() => {
    setSelectedAnimeIds((prev) => prev.filter((id) => animeList.some((anime) => anime.id === id)));
  }, [animeList]);

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

  const ensureLoggedInForMutation = () => {
    if (authState.user) return true;
    handleOpenLogin(false);
    return false;
  };

  const handleAddAnime = (data) => {
    if (!ensureLoggedInForMutation()) {
      return { success: false, message: '追加操作はログイン後に利用できます。' };
    }
    if (animeList.some(a => a.id === data.id)) {
      return { success: false, message: 'その作品は既に追加されています。' };
    }
    // Add timestamp for "added" sort
    const animeWithDate = { ...data, addedAt: Date.now() };
    setAnimeList(prev => [animeWithDate, ...prev]);
    setBookmarkList(prev => prev.filter((anime) => anime.id !== data.id));
    return { success: true };
  };

  const handleRemoveAnime = (id) => {
    if (!ensureLoggedInForMutation()) return;
    setAnimeList(prev => {
      const updated = prev.filter(anime => anime.id !== id);
      if (updated.length === 0) {
        localStorage.removeItem(ANIME_LIST_STORAGE_KEY);
      }
      return updated;
    });
  };

  const handleToggleBookmark = (data) => {
    if (!ensureLoggedInForMutation()) {
      return { success: false, action: 'blocked', message: 'ブックマーク操作はログイン後に利用できます。' };
    }
    if (!data || typeof data.id !== 'number') {
      return { success: false, message: '作品情報を取得できませんでした。' };
    }

    if (animeList.some((anime) => anime.id === data.id)) {
      return { success: false, action: 'blocked', message: '視聴済み作品はブックマークできません。' };
    }

    const exists = bookmarkList.some((anime) => anime.id === data.id);
    if (exists) {
      setBookmarkList((prev) => prev.filter((anime) => anime.id !== data.id));
      return { success: true, action: 'removed' };
    }

    const bookmarkItem = { ...data, bookmarkedAt: Date.now() };
    setBookmarkList((prev) => [bookmarkItem, ...prev.filter((anime) => anime.id !== data.id)]);
    return { success: true, action: 'added' };
  };

  const handleBulkRemoveBookmarks = (ids) => {
    if (!ensureLoggedInForMutation()) return;
    if (!Array.isArray(ids) || ids.length === 0) return;
    const removeIdSet = new Set(ids);
    setBookmarkList((prev) => prev.filter((anime) => !removeIdSet.has(anime.id)));
  };

  const handleMarkBookmarkAsWatched = (anime) => {
    if (!ensureLoggedInForMutation()) {
      return { success: false, message: '追加操作はログイン後に利用できます。' };
    }
    if (!anime || typeof anime.id !== 'number') {
      return { success: false, message: '作品情報を取得できませんでした。' };
    }
    return handleAddAnime(anime);
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

  const handleBulkRemoveSelected = () => {
    if (!ensureLoggedInForMutation()) return;
    if (selectedAnimeIds.length === 0) return;

    if (!window.confirm(`選択した ${selectedAnimeIds.length} 件の作品を削除しますか？`)) {
      return;
    }

    setAnimeList((prev) => {
      const selectedSet = new Set(selectedAnimeIds);
      const updated = prev.filter((anime) => !selectedSet.has(anime.id));
      if (updated.length === 0) {
        localStorage.removeItem(ANIME_LIST_STORAGE_KEY);
      }
      return updated;
    });

    setIsSelectionMode(false);
    setSelectedAnimeIds([]);
  };

  const handleOpenLogin = (switchMode = false) => {
    setLoginSwitchAccountMode(Boolean(switchMode));
    navigateTo('login');
  };

  const handleLoginSuccess = async (user) => {
    setAuthState({ loading: false, user: user || null });
    setAccountMenuOpen(false);
    setCloudSyncState({ ready: false, syncing: true, error: '' });
    try {
      await performLoginSync(animeList, bookmarkList);
      setCloudSyncState({ ready: true, syncing: false, error: '' });
      setLoginSwitchAccountMode(false);
      navigateTo('home', { replace: true });
    } catch (syncError) {
      setCloudSyncState({
        ready: false,
        syncing: false,
        error: syncError.message || 'クラウド同期に失敗しました。',
      });
    }
  };

  const handleLogout = async () => {
    try {
      await logoutSession();
    } catch (_) {
      // Ignore logout API failures and clear local auth state.
    }
    setAccountMenuOpen(false);
    setLoginSwitchAccountMode(false);
    setAuthState({ loading: false, user: null });
    setCloudSyncState({ ready: false, syncing: false, error: '' });
  };

  const handleSwitchAccount = async () => {
    await handleLogout();
    handleOpenLogin(true);
  };

  // 5. Data Derived States (Filters/Computed)
  const uniqueGenres = useMemo(() => {
    const genres = new Set();
    animeList.forEach(anime => {
      anime.genres?.forEach(g => genres.add(g));
    });
    return ["All", ...Array.from(genres).sort()];
  }, [animeList]);

  const filteredList = useMemo(() => {
    let result = animeList.filter(anime => {
      const titleNative = (anime.title.native || "").toLowerCase();
      const titleRomaji = (anime.title.romaji || "").toLowerCase();
      const searchLower = searchQuery.toLowerCase();

      const matchesSearch = titleNative.includes(searchLower) || titleRomaji.includes(searchLower);
      const matchesGenre = selectedGenre === "All" || anime.genres.includes(selectedGenre);

      return matchesSearch && matchesGenre;
    });

    // Apply Sorting
    result.sort((a, b) => {
      let valA, valB;

      switch (sortKey) {
        case 'title':
          valA = (a.title.romaji || a.title.native || "").toLowerCase();
          valB = (b.title.romaji || b.title.native || "").toLowerCase();
          break;
        case 'year':
          valA = a.seasonYear || 0;
          valB = b.seasonYear || 0;
          break;
        case 'added':
        default:
          valA = a.addedAt || 0;
          valB = b.addedAt || 0;
          break;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [animeList, searchQuery, selectedGenre, sortKey, sortOrder]);

  const currentSeasonInfo = useMemo(() => getCurrentSeasonInfo(), []);
  const nextSeasonInfo = useMemo(() => getNextSeasonInfo(currentSeasonInfo), [currentSeasonInfo]);
  const currentSeasonLabel = `${currentSeasonInfo.year}年${SEASON_LABELS[currentSeasonInfo.season] || ''}`;
  const nextSeasonLabel = `${nextSeasonInfo.year}年${SEASON_LABELS[nextSeasonInfo.season] || ''}`;

  const currentSeasonAddPreset = useMemo(() => ({
    year: currentSeasonInfo.year,
    mediaSeason: currentSeasonInfo.season,
    seasonKey: seasonToFilterKey(currentSeasonInfo.season),
    statusIn: ['RELEASING'],
    statusNot: null,
    title: `今期放送中アニメ (${currentSeasonLabel})`,
    description: '今期に放送中の作品を表示しています。ブックマークやマイリストに追加できます。',
    locked: true,
  }), [currentSeasonInfo, currentSeasonLabel]);

  const nextSeasonAddPreset = useMemo(() => ({
    year: nextSeasonInfo.year,
    mediaSeason: nextSeasonInfo.season,
    seasonKey: seasonToFilterKey(nextSeasonInfo.season),
    statusIn: ['NOT_YET_RELEASED'],
    statusNot: null,
    title: `来季放送予定アニメ (${nextSeasonLabel})`,
    description: '来季に放送予定の作品を表示しています。気になる作品を先にブックマークできます。',
    locked: true,
  }), [nextSeasonInfo, nextSeasonLabel]);

  const isAddView = view === 'add' || view === 'addCurrent' || view === 'addNext';
  const activeBrowsePreset = view === 'addCurrent'
    ? currentSeasonAddPreset
    : view === 'addNext'
      ? nextSeasonAddPreset
      : null;
  const addViewBackTarget = activeBrowsePreset ? 'bookmarks' : 'home';
  const addViewBackLabel = activeBrowsePreset ? '← ブックマークへ戻る' : '← ホームへ戻る';
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
  const isLoggedIn = Boolean(authState.user);
  const accountDisplayName = authState.user?.name || authState.user?.email || 'アカウント';
  const accountInitial = accountDisplayName.charAt(0).toUpperCase();
  const showCloudSyncMessage = isLoggedIn && (cloudSyncState.syncing || cloudSyncState.error);

  // 6. UI Render
  return (
    <div className="app-container">
      {/* Overlay UI */}
      {loadingStatus.active && !error && (
        <LoadingOverlay loaded={loadingStatus.loaded} total={loadingStatus.total} />
      )}

      {error && (
        <div className="error-banner">
          ⚠️ {error}
        </div>
      )}

      {/* Navigation Header */}
      <header className="app-header">
        <div className="app-header-inner">
          <div className="logo" onClick={() => navigateTo('home')} style={{ cursor: 'pointer' }}>
            <img src="/images/logo.png" alt="AniTrigger" style={{ height: '120px' }} />
          </div>
          <div className="header-auth-slot">
            {authState.loading && (
              <span className="header-auth-loading">セッション確認中...</span>
            )}
            {!authState.loading && isLoggedIn && (
              <div className="header-account" ref={accountMenuRef}>
                <button
                  type="button"
                  className="header-account-trigger"
                  onClick={() => setAccountMenuOpen((prev) => !prev)}
                  aria-haspopup="menu"
                  aria-expanded={accountMenuOpen}
                  title={accountDisplayName}
                >
                  {authState.user?.picture ? (
                    <img
                      src={authState.user.picture}
                      alt=""
                      className="header-account-avatar"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="header-account-avatar-fallback">{accountInitial}</span>
                  )}
                </button>
                {accountMenuOpen && (
                  <div className="header-account-menu" role="menu">
                    <p className="header-account-name">{accountDisplayName}</p>
                    <button
                      type="button"
                      className="header-account-menu-item"
                      onClick={handleSwitchAccount}
                    >
                      アカウントを変更
                    </button>
                    <button
                      type="button"
                      className="header-account-menu-item danger"
                      onClick={handleLogout}
                    >
                      ログアウト
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <nav className="global-view-nav" aria-label="メインナビゲーション">
        <button
          type="button"
          className={`global-view-nav-button ${view === 'home' ? 'active' : ''}`}
          onClick={() => navigateTo('home')}
        >
          ホーム
        </button>
        <button
          type="button"
          className={`global-view-nav-button ${view === 'mylist' ? 'active' : ''}`}
          onClick={() => navigateTo('mylist')}
        >
          マイリスト
        </button>
        <button
          type="button"
          className={`global-view-nav-button ${view === 'bookmarks' ? 'active' : ''}`}
          onClick={() => navigateTo('bookmarks')}
        >
          ブックマーク
        </button>
        <button
          type="button"
          className={`global-view-nav-button ${isAddView ? 'active' : ''}`}
          onClick={() => navigateTo('add')}
        >
          作品の追加
        </button>
      </nav>

      {showCloudSyncMessage && (
        <div className={`cloud-sync-status ${cloudSyncState.error ? 'error' : ''}`}>
          {cloudSyncState.error ? cloudSyncState.error : 'クラウドデータを同期しています...'}
        </div>
      )}

      {/* Content Rendering Loop */}
      {view === 'login' ? (
        <LoginScreen
          onBackHome={() => navigateTo('home')}
          onLoginSuccess={handleLoginSuccess}
          switchAccountMode={loginSwitchAccountMode}
        />
      ) : isAddView ? (
        <main className="main-content">
          <AddAnimeScreen
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
      ) : view === 'mylist' ? (
          <main className={`main-content mylist-page-main page-shell${isSelectionMode ? ' has-selection-dock' : ' has-bottom-home-nav'}`}>
            <div className="mylist-section-header bookmark-screen-header">
              <div>
                <h3 className="page-main-title">マイリスト</h3>
                <p className="bookmark-screen-desc page-main-subtitle">登録済み作品の検索・絞り込み・並び替え</p>
              </div>
              <div className="bookmark-screen-actions">
                <button className="bookmark-screen-add" onClick={() => navigateTo('add')}>
                  <span className="bookmark-screen-add-icon">＋</span>
                  <span>作品を追加</span>
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

              <div className="filter-box">
                <select value={selectedGenre} onChange={(e) => setSelectedGenre(e.target.value)}>
                  <option value="All">すべてのジャンル</option>
                  {uniqueGenres.filter(g => g !== "All").map(genre => (
                    <option key={genre} value={genre}>{translateGenre(genre)}</option>
                  ))}
                </select>
              </div>

              <div className="sort-box">
                <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
                  <option value="added">追加順</option>
                  <option value="title">タイトル順</option>
                  <option value="year">放送年順</option>
                </select>
                <button
                  className="sort-order-button"
                  onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                  title={sortOrder === 'asc' ? '昇順' : '降順'}
                >
                  {sortOrder === 'asc' ? '↑' : '↓'}
                </button>
              </div>

            </div>

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
                  isSelected={selectedAnimeIds.includes(anime.id)}
                  onToggleSelect={handleToggleAnimeSelection}
                  onLongPress={handleLongPressAnime}
                />
              ))}
            </div>

            {filteredList.length === 0 && !loadingStatus.active && (
              <div className="empty-state">該当する作品がありません</div>
            )}
          </main>
      ) : (
        <>
          {!isLoggedIn && (
            <section className="home-login-entry" aria-label="ログイン案内">
              <div className="home-login-entry-text">
                <p className="home-login-entry-title">ログインするとデータを端末間で同期できます</p>
                <p className="home-login-entry-sub">
                  閲覧はログイン不要です。追加・保存データをクラウドに保持したい場合はログインしてください。
                </p>
              </div>
              <button
                type="button"
                className="home-login-entry-button"
                onClick={() => handleOpenLogin(false)}
              >
                ログイン
              </button>
            </section>
          )}

          <HeroSlider slides={featuredSlides} />

          <main className="main-content">
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

            <p className="page-guide-text">
              目的に合わせて移動できます。視聴済みは「マイリスト」、あとで見たい作品は「ブックマーク」で管理してください。
            </p>

            <StatsSection animeList={animeList} />
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
        <aside className={`quick-nav-rail ${quickNavState.mobile ? 'mobile' : ''}`} aria-label="ページ移動">
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
