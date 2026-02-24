import { useState, useEffect, useMemo, useRef } from 'react';

// Constants & Multi-language data
import { translateGenre } from './constants/animeData';

// Services
import { selectFeaturedAnimes } from './services/animeService';
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
import AddAnimeScreen from './components/AddAnime/AddAnimeScreen';
import BookmarkScreen from './components/Bookmarks/BookmarkScreen';

/**
 * Main App Component
 * Responsible for routing, global state management, and data orchestration.
 */
function App() {
  const normalizeAnimeRating = (value) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) return null;
    if (parsed < 1 || parsed > 5) return null;
    return parsed;
  };
  const resolveAnimeTitle = (anime) => anime?.title?.native || anime?.title?.romaji || anime?.title?.english || '作品';

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
  const [featuredSlides, setFeaturedSlides] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [sortKey, setSortKey] = useState("added"); // 'added', 'title', 'year', 'rating'
  const [sortOrder, setSortOrder] = useState("desc"); // 'desc', 'asc'
  const [includeRatingInCopy, setIncludeRatingInCopy] = useState(false);
  const [mylistCopyNotice, setMylistCopyNotice] = useState({ type: '', message: '' });
  const [quickNavState, setQuickNavState] = useState({
    visible: false,
    mobile: false,
    nearTop: true,
    nearBottom: false,
  });
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedAnimeIds, setSelectedAnimeIds] = useState([]);
  const [isRefreshingFeatured, setIsRefreshingFeatured] = useState(false);
  const [isServerLibraryReady, setIsServerLibraryReady] = useState(false);
  const navigationTypeRef = useRef('init');
  const serverSaveDebounceRef = useRef(null);
  const featuredRefreshTimerRef = useRef(null);

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
    const slides = selectFeaturedAnimes(animeList);
    setFeaturedSlides(slides);
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
  }, [view, animeList.length, searchQuery, selectedGenres, sortKey, sortOrder]);

  useEffect(() => {
    setSelectedAnimeIds((prev) => prev.filter((id) => animeList.some((anime) => anime.id === id)));
  }, [animeList]);

  useEffect(() => {
    if (!mylistCopyNotice.message) return;
    const timer = setTimeout(() => {
      setMylistCopyNotice({ type: '', message: '' });
    }, 2200);
    return () => clearTimeout(timer);
  }, [mylistCopyNotice]);

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
    if (isRefreshingFeatured) return;
    setIsRefreshingFeatured(true);
    if (featuredRefreshTimerRef.current) {
      clearTimeout(featuredRefreshTimerRef.current);
    }
    featuredRefreshTimerRef.current = setTimeout(() => {
      setFeaturedSlides(selectFeaturedAnimes(animeList));
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

  const handleClearMyListGenre = () => {
    setSelectedGenres([]);
  };

  const copyTextToClipboard = async (text) => {
    const hasClipboardApi = typeof navigator !== 'undefined'
      && typeof window !== 'undefined'
      && window.isSecureContext
      && typeof navigator?.clipboard?.writeText === 'function';
    if (hasClipboardApi) {
      await navigator.clipboard.writeText(text);
      return;
    }

    if (typeof document === 'undefined') {
      throw new Error('clipboard_unavailable');
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-1000px';
    textarea.style.left = '-1000px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    if (!copied) {
      throw new Error('copy_failed');
    }
  };

  const handleCopyMyList = async () => {
    if (filteredList.length === 0) {
      setMylistCopyNotice({ type: 'error', message: 'コピー対象の作品がありません。' });
      return;
    }

    const lines = filteredList.map((anime) => {
      const title = resolveAnimeTitle(anime);
      const rating = normalizeAnimeRating(anime?.rating);
      if (includeRatingInCopy && rating !== null) {
        return `・${title} ★${rating}`;
      }
      return `・${title}`;
    });

    try {
      await copyTextToClipboard(lines.join('\n'));
      setMylistCopyNotice({ type: 'success', message: `${filteredList.length} 件をコピーしました。` });
    } catch (_) {
      setMylistCopyNotice({ type: 'error', message: 'コピーに失敗しました。ブラウザの権限をご確認ください。' });
    }
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
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const hasGenreFilter = selectedGenres.length > 0;
    let result = animeList.filter(anime => {
      const titleNative = String(anime?.title?.native || "").toLowerCase();
      const titleRomaji = String(anime?.title?.romaji || "").toLowerCase();
      const titleEnglish = String(anime?.title?.english || "").toLowerCase();
      const animeGenres = Array.isArray(anime?.genres) ? anime.genres : [];

      const matchesSearch = normalizedSearch.length === 0
        || titleNative.includes(normalizedSearch)
        || titleRomaji.includes(normalizedSearch)
        || titleEnglish.includes(normalizedSearch);
      const matchesGenre = !hasGenreFilter || selectedGenres.every((genre) => animeGenres.includes(genre));

      return matchesSearch && matchesGenre;
    });

    // Apply Sorting
    result.sort((a, b) => {
      let valA, valB;

      switch (sortKey) {
        case 'title':
          valA = resolveAnimeTitle(a).toLowerCase();
          valB = resolveAnimeTitle(b).toLowerCase();
          break;
        case 'year':
          valA = a.seasonYear || 0;
          valB = b.seasonYear || 0;
          break;
        case 'rating':
          valA = normalizeAnimeRating(a.rating) || 0;
          valB = normalizeAnimeRating(b.rating) || 0;
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
  }, [animeList, searchQuery, selectedGenres, sortKey, sortOrder]);

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

  // 6. UI Render
  return (
    <div className="app-container">
      {/* Navigation Header */}
      <header className="app-header">
        <div className="logo" onClick={() => navigateTo('home')} style={{ cursor: 'pointer' }}>
          <img src="/images/logo.png" alt="AniTrigger" style={{ height: '120px' }} />
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
      ) : view === 'mylist' ? (
          <main className={`main-content mylist-page-main page-shell${isSelectionMode ? ' has-selection-dock' : ' has-bottom-home-nav'}`}>
            <div className="mylist-section-header bookmark-screen-header">
              <div>
                <h3 className="page-main-title">マイリスト</h3>
                <p className="bookmark-screen-desc page-main-subtitle">登録済み作品の検索・絞り込み・並び替え</p>
              </div>
              <div className="bookmark-screen-actions mylist-screen-actions">
                <div className="mylist-copy-controls">
                  <label className="mylist-copy-rating-toggle">
                    <input
                      type="checkbox"
                      checked={includeRatingInCopy}
                      onChange={(event) => setIncludeRatingInCopy(event.target.checked)}
                    />
                    <span>評価を含める</span>
                  </label>
                  <button
                    type="button"
                    className="mylist-copy-button"
                    onClick={handleCopyMyList}
                    disabled={filteredList.length === 0}
                  >
                    一覧をコピー
                  </button>
                </div>
                <button className="bookmark-screen-add" onClick={() => navigateTo('add')}>
                  <span className="bookmark-screen-add-icon">＋</span>
                  <span>作品を追加</span>
                </button>
              </div>
            </div>

            {mylistCopyNotice.message && (
              <div className={`bookmark-action-notice ${mylistCopyNotice.type}`}>
                {mylistCopyNotice.message}
              </div>
            )}

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

            <div className="bookmark-genre-filter-section mylist-genre-filter-section">
              <div className="bookmark-genre-filter-header">
                <p className="bookmark-genre-filter-title">ジャンル絞り込み</p>
                <button
                  type="button"
                  className="bookmark-genre-filter-clear"
                  onClick={handleClearMyListGenre}
                  disabled={selectedGenres.length === 0}
                >
                  クリア
                </button>
              </div>
              <p className="bookmark-genre-filter-selected">
                {selectedGenres.length > 0
                  ? `選択中: ${selectedGenres.map((genre) => translateGenre(genre)).join(' / ')}`
                  : 'ジャンル未選択（すべて表示）'}
              </p>
              <p className="bookmark-genre-filter-note">複数選択時は「すべて含む」で絞り込みます。</p>
              {uniqueGenres.length > 0 ? (
                <div className="bookmark-genre-filter-chips">
                  {uniqueGenres.map((genre) => {
                    const isActive = selectedGenres.includes(genre);
                    return (
                      <button
                        key={genre}
                        type="button"
                        className={`bookmark-genre-chip ${isActive ? 'active' : ''}`}
                        onClick={() => handleToggleMyListGenre(genre)}
                      >
                        {translateGenre(genre)}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="bookmark-genre-filter-empty">ジャンル情報がある作品はまだありません。</p>
              )}
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
                  onUpdateRating={handleUpdateAnimeRating}
                />
              ))}
            </div>

            {filteredList.length === 0 && (
              <div className="empty-state">該当する作品がありません</div>
            )}
          </main>
      ) : (
        <>
          <HeroSlider
            slides={featuredSlides}
            onRefresh={handleRefreshFeaturedSlides}
            isRefreshing={isRefreshingFeatured}
          />

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
