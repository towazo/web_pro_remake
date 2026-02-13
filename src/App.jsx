import { useState, useEffect, useMemo, useRef } from 'react';

// Constants & Multi-language data
import { WATCHED_TITLES, ANIME_DESCRIPTIONS, translateGenre } from './constants/animeData';

// Services
import { fetchAnimeDetails, selectFeaturedAnimes, sleep } from './services/animeService';

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

  // 3. Initial Data Acquisition (Hydration) - Empty for Clean Start

  // 4. Action Handlers
  const handleAddAnime = (data) => {
    if (animeList.some(a => a.id === data.id)) {
      return { success: false, message: 'その作品は既に追加されています。' };
    }
    setAnimeList(prev => [data, ...prev]);
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

  // 5. Data Derived States (Filters/Computed)
  const uniqueGenres = useMemo(() => {
    const genres = new Set();
    animeList.forEach(anime => {
      anime.genres?.forEach(g => genres.add(g));
    });
    return ["All", ...Array.from(genres).sort()];
  }, [animeList]);

  const filteredList = useMemo(() => {
    return animeList.filter(anime => {
      const titleNative = (anime.title.native || "").toLowerCase();
      const titleRomaji = (anime.title.romaji || "").toLowerCase();
      const searchLower = searchQuery.toLowerCase();

      const matchesSearch = titleNative.includes(searchLower) || titleRomaji.includes(searchLower);
      const matchesGenre = selectedGenre === "All" || anime.genres.includes(selectedGenre);

      return matchesSearch && matchesGenre;
    });
  }, [animeList, searchQuery, selectedGenre]);

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
          />
        </main>
      ) : (
        <>
          <HeroSlider slides={featuredSlides} />

          <main className="main-content">
            <StatsSection animeList={animeList} />

            <div className="controls">
              <div className="search-box">
                <i className="search-icon">🔍</i>
                <input
                  type="text"
                  placeholder="タイトルを検索..."
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

              <button className="fab-add-button" onClick={() => setView('add')}>
                作品を追加
              </button>
            </div>

            <div className="results-count">
              {filteredList.length} 作品が見つかりました
            </div>

            <div className="anime-grid">
              {filteredList.map(anime => (
                <AnimeCard key={anime.id} anime={anime} onRemove={handleRemoveAnime} />
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
    </div>
  );
}

export default App;