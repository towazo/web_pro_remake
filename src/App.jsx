import { useState, useEffect, useMemo } from 'react';

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

/**
 * Main App Component
 * Responsible for routing, global state management, and data orchestration.
 */
function App() {
  // Initialize state from localStorage if available
  const [animeList, setAnimeList] = useState(() => {
    const saved = localStorage.getItem('myAnimeList');
    return saved ? JSON.parse(saved) : [];
  });

  const [loadingStatus, setLoadingStatus] = useState({
    loaded: 0,
    total: 0,
    active: false
  });

  const [view, setView] = useState('home'); // 'home' or 'add'
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

  // 1. Storage Persistence
  useEffect(() => {
    if (animeList.length > 0) {
      localStorage.setItem('myAnimeList', JSON.stringify(animeList));
    }
  }, [animeList]);

  // 2. Featured Content Selection
  useEffect(() => {
    const slides = selectFeaturedAnimes(animeList);
    setFeaturedSlides(slides);
  }, [animeList]);

  // 3. Scroll Reset on View Change
  useEffect(() => {
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

  // 4. Home Quick Navigation (Top/Bottom)
  useEffect(() => {
    if (view !== 'home') {
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

  const handleAddAnime = (data) => {
    if (animeList.some(a => a.id === data.id)) {
      return { success: false, message: 'その作品は既に追加されています。' };
    }
    // Add timestamp for "added" sort
    const animeWithDate = { ...data, addedAt: Date.now() };
    setAnimeList(prev => [animeWithDate, ...prev]);
    return { success: true };
  };

  const handleRemoveAnime = (id) => {
    setAnimeList(prev => {
      const updated = prev.filter(anime => anime.id !== id);
      if (updated.length === 0) {
        localStorage.removeItem('myAnimeList');
      }
      return updated;
    });
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
      const updated = prev.filter((anime) => !selectedSet.has(anime.id));
      if (updated.length === 0) {
        localStorage.removeItem('myAnimeList');
      }
      return updated;
    });

    setIsSelectionMode(false);
    setSelectedAnimeIds([]);
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
        <div className="logo" onClick={() => setView('home')} style={{ cursor: 'pointer' }}>
          <img src="/images/logo.png" alt="AniTrigger" style={{ height: '120px' }} />
        </div>
      </header>

      {/* Content Rendering Loop */}
      {view === 'add' ? (
        <main className="main-content">
          <AddAnimeScreen
            onAdd={handleAddAnime}
            onBack={() => setView('home')}
            animeList={animeList}
          />
        </main>
      ) : (
        <>
          <HeroSlider slides={featuredSlides} />

          <main className={`main-content${isSelectionMode ? ' has-selection-dock' : ''}`}>
            <StatsSection animeList={animeList} />

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

              <button className="fab-add-button" onClick={() => setView('add')}>
                作品を追加
              </button>
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
        </>
      )}

      <footer className="app-footer">
        <p>AniTrigger &copy; 2025 - Data provided by AniList API</p>
      </footer>

      {view === 'home' && isSelectionMode && (
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

      {view === 'home' && !isSelectionMode && quickNavState.visible && (
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
