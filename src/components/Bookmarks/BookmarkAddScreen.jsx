import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fetchAnimeByYear } from '../../services/animeService';
import { translateGenre } from '../../constants/animeData';

const YEAR_PER_PAGE = 36;
const SEASON_FILTER_OPTIONS = [
  { key: 'winter', label: '冬 (1〜3月)' },
  { key: 'spring', label: '春 (4〜6月)' },
  { key: 'summer', label: '夏 (7〜9月)' },
  { key: 'autumn', label: '秋 (10〜12月)' },
  { key: 'other', label: '開始月不明' },
];

function BookmarkAddScreen({
  bookmarkList = [],
  watchedAnimeList = [],
  onToggleBookmark,
  onAddToMyList,
  onRemoveFromMyList,
  onBackBookmarks,
  onBackHome,
}) {
  const [browseYearDraft, setBrowseYearDraft] = useState('');
  const [selectedBrowseYear, setSelectedBrowseYear] = useState(null);
  const [browsePage, setBrowsePage] = useState(1);
  const [browseGenreFilters, setBrowseGenreFilters] = useState([]);
  const [browseSeasonFilters, setBrowseSeasonFilters] = useState([]);
  const [browseResults, setBrowseResults] = useState([]);
  const [browsePageInfo, setBrowsePageInfo] = useState({
    total: 0,
    perPage: YEAR_PER_PAGE,
    currentPage: 1,
    lastPage: 1,
    hasNextPage: false,
  });
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState('');
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });
  const [browseQuickNavState, setBrowseQuickNavState] = useState({
    visible: false,
    mobile: false,
    nearTop: true,
    nearBottom: false,
  });

  const browseResultsTopRef = useRef(null);
  const browseRequestIdRef = useRef(0);
  const pendingBrowseScrollPageRef = useRef(null);

  const currentYear = new Date().getFullYear();
  const browseYearOptions = useMemo(
    () => Array.from({ length: currentYear - 1960 + 1 }, (_, idx) => currentYear - idx),
    [currentYear]
  );
  const watchedIdSet = useMemo(
    () => new Set((watchedAnimeList || []).map((anime) => anime.id)),
    [watchedAnimeList]
  );
  const bookmarkIdSet = useMemo(
    () => new Set((bookmarkList || []).map((anime) => anime.id)),
    [bookmarkList]
  );
  const browseGenreOptions = useMemo(() => {
    const genreSet = new Set(browseGenreFilters);
    browseResults.forEach((anime) => {
      (anime.genres || []).forEach((g) => genreSet.add(g));
    });
    return Array.from(genreSet).sort((a, b) => a.localeCompare(b));
  }, [browseResults, browseGenreFilters]);

  useEffect(() => {
    if (!selectedBrowseYear) return;

    const requestId = browseRequestIdRef.current + 1;
    browseRequestIdRef.current = requestId;
    setBrowseLoading(true);
    setBrowseError('');

    const run = async () => {
      const { items, pageInfo, error } = await fetchAnimeByYear(selectedBrowseYear, {
        page: browsePage,
        perPage: YEAR_PER_PAGE,
        genreIn: browseGenreFilters,
        timeoutMs: 9000,
        maxAttempts: 2,
        baseDelayMs: 250,
        maxRetryDelayMs: 900,
      });

      if (browseRequestIdRef.current !== requestId) return;

      const total = Math.max(0, Number(pageInfo?.total) || 0);
      const perPage = Math.max(1, Number(pageInfo?.perPage) || YEAR_PER_PAGE);
      const currentPage = Math.max(1, Number(pageInfo?.currentPage) || browsePage);
      const lastPageFromApi = Math.max(1, Number(pageInfo?.lastPage) || 1);
      const derivedLastPage = Math.max(1, Math.ceil(total / perPage));
      const lastPage = Math.max(lastPageFromApi, derivedLastPage);
      const safeCurrentPage = Math.min(currentPage, lastPage);
      const safeItems = Array.isArray(items) ? items : [];

      if (total > 0 && safeItems.length === 0 && safeCurrentPage > 1) {
        const fallbackPage = safeCurrentPage - 1;
        if (fallbackPage !== browsePage) {
          setBrowsePage(fallbackPage);
          setBrowseLoading(false);
          return;
        }
      }

      setBrowseResults(safeItems);
      setBrowsePageInfo({
        total,
        perPage,
        currentPage: safeCurrentPage,
        lastPage,
        hasNextPage: safeCurrentPage < lastPage && safeItems.length > 0,
      });

      if (error) {
        setBrowseError('年代リストの取得に失敗しました。時間をおいて再試行してください。');
      } else {
        setBrowseError('');
      }

      setBrowseLoading(false);
    };

    run();
  }, [selectedBrowseYear, browsePage, browseGenreFilters]);

  useEffect(() => {
    if (!toast.visible) return;
    const timer = setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, 2200);
    return () => clearTimeout(timer);
  }, [toast.visible, toast.message]);

  const scrollToBrowseResultsTop = (behavior = 'smooth') => {
    const el = browseResultsTopRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + (window.pageYOffset || window.scrollY || 0) - 8;
    window.scrollTo({ top: Math.max(0, top), behavior });
  };

  useEffect(() => {
    if (pendingBrowseScrollPageRef.current == null) return;
    if (browseLoading) return;

    const currentPage = Math.max(1, Number(browsePageInfo.currentPage) || browsePage);
    const requestedPage = Number(pendingBrowseScrollPageRef.current);

    if (currentPage === requestedPage) {
      requestAnimationFrame(() => {
        scrollToBrowseResultsTop('auto');
      });
      pendingBrowseScrollPageRef.current = null;
    }
  }, [browseLoading, browsePageInfo.currentPage, browsePage]);

  useEffect(() => {
    if (!selectedBrowseYear) {
      setBrowseQuickNavState({
        visible: false,
        mobile: false,
        nearTop: true,
        nearBottom: false,
      });
      return;
    }

    let rafId = null;

    const updateBrowseQuickNav = () => {
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
      const visible = hasLongContent && (!isMobile || scrollTop > 180 || nearBottom);

      setBrowseQuickNavState((prev) => {
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
        updateBrowseQuickNav();
      });
    };

    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);
    updateBrowseQuickNav();

    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', requestUpdate);
      window.removeEventListener('resize', requestUpdate);
    };
  }, [selectedBrowseYear, browseLoading, browsePage, browseGenreFilters, browseSeasonFilters, browseResults.length]);

  const getSeasonKeyByMonth = (month) => {
    if (month >= 1 && month <= 3) return 'winter';
    if (month >= 4 && month <= 6) return 'spring';
    if (month >= 7 && month <= 9) return 'summer';
    if (month >= 10 && month <= 12) return 'autumn';
    return 'other';
  };

  const browseSeasonOptions = useMemo(() => {
    const seasonSet = new Set(browseSeasonFilters);
    browseResults.forEach((anime) => {
      const month = Number(anime?.startDate?.month) || 0;
      seasonSet.add(getSeasonKeyByMonth(month));
    });
    return SEASON_FILTER_OPTIONS.filter((option) => seasonSet.has(option.key));
  }, [browseResults, browseSeasonFilters]);

  const browseVisibleResults = useMemo(
    () =>
      browseResults.filter((anime) => {
        if (browseSeasonFilters.length === 0) return true;
        const month = Number(anime?.startDate?.month) || 0;
        const seasonKey = getSeasonKeyByMonth(month);
        return browseSeasonFilters.includes(seasonKey);
      }),
    [browseResults, browseSeasonFilters]
  );

  const handleBrowseYearApply = () => {
    const year = Number(browseYearDraft);
    if (!Number.isFinite(year)) {
      setToast({ visible: true, message: '年を選択してください。', type: 'warning' });
      return;
    }
    setSelectedBrowseYear(year);
    setBrowsePage(1);
  };

  const handleBrowseGenreToggle = (genre) => {
    setBrowseGenreFilters((prev) => {
      const exists = prev.includes(genre);
      return exists ? prev.filter((g) => g !== genre) : [...prev, genre];
    });
    setBrowsePage(1);
  };

  const handleBrowseGenreClear = () => {
    setBrowseGenreFilters([]);
    setBrowsePage(1);
  };

  const handleBrowseSeasonToggle = (seasonKey) => {
    setBrowseSeasonFilters((prev) => {
      const exists = prev.includes(seasonKey);
      return exists ? prev.filter((key) => key !== seasonKey) : [...prev, seasonKey];
    });
    setBrowsePage(1);
  };

  const handleBrowseSeasonClear = () => {
    setBrowseSeasonFilters([]);
    setBrowsePage(1);
  };

  const handleBrowsePageChange = (nextPage) => {
    const page = Number(nextPage);
    const lastPage = Number(browsePageInfo.lastPage) || 1;
    if (!Number.isFinite(page) || page < 1 || page > lastPage) return;
    pendingBrowseScrollPageRef.current = page;
    setBrowsePage(page);
    requestAnimationFrame(() => {
      scrollToBrowseResultsTop('auto');
    });
  };

  const handleBookmarkToggle = (anime) => {
    if (watchedIdSet.has(anime.id)) return;
    const title = anime?.title?.native || anime?.title?.romaji || anime?.title?.english || '作品';
    const result = onToggleBookmark?.(anime);
    if (result?.success) {
      if (result.action === 'removed') {
        setToast({ visible: true, message: `「${title}」をブックマークから外しました。`, type: 'warning' });
      } else {
        setToast({ visible: true, message: `「${title}」をブックマークに追加しました。`, type: 'success' });
      }
    } else if (result?.message) {
      setToast({ visible: true, message: result.message, type: 'warning' });
    }
  };

  const handleMyListToggle = (anime, isWatched) => {
    const title = anime?.title?.native || anime?.title?.romaji || anime?.title?.english || '作品';

    if (isWatched) {
      if (typeof onRemoveFromMyList !== 'function') {
        setToast({ visible: true, message: 'マイリスト削除を実行できませんでした。', type: 'warning' });
        return;
      }
      onRemoveFromMyList(anime.id);
      setToast({ visible: true, message: `「${title}」をマイリストから外しました。`, type: 'warning' });
      return;
    }

    if (typeof onAddToMyList !== 'function') {
      setToast({ visible: true, message: 'マイリスト追加を実行できませんでした。', type: 'warning' });
      return;
    }

    const result = onAddToMyList(anime);
    if (result?.success) {
      setToast({ visible: true, message: `「${title}」をマイリストに追加しました。`, type: 'success' });
    } else {
      setToast({ visible: true, message: result?.message || 'すでに追加済みです。', type: 'warning' });
    }
  };

  const browseGenreSummaryText =
    browseGenreFilters.length > 0
      ? `選択中: ${browseGenreFilters.map((genre) => translateGenre(genre)).join(' / ')}`
      : 'ジャンル未選択（表示中の作品をすべて表示）';
  const browseSeasonSummaryText =
    browseSeasonFilters.length > 0
      ? `選択中: ${SEASON_FILTER_OPTIONS.filter((season) => browseSeasonFilters.includes(season.key))
          .map((season) => season.label)
          .join(' / ')}`
      : '放送時期未選択（表示中の作品をすべて表示）';
  const browseCurrentPage = Math.max(1, Number(browsePageInfo.currentPage) || browsePage);
  const browseLastPage = Math.max(1, Number(browsePageInfo.lastPage) || 1);
  const browsePerPage = Math.max(1, Number(browsePageInfo.perPage) || YEAR_PER_PAGE);
  const browseRangeStart =
    browsePageInfo.total > 0 && browseResults.length > 0 ? (browseCurrentPage - 1) * browsePerPage + 1 : 0;
  const browseRangeEnd = browseRangeStart > 0 ? browseRangeStart + browseResults.length - 1 : 0;

  const handleBrowseScrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBrowseScrollToBottom = () => {
    const docH = Math.max(
      document.body?.scrollHeight || 0,
      document.documentElement?.scrollHeight || 0
    );
    window.scrollTo({ top: docH, behavior: 'smooth' });
  };

  return (
    <div className="add-screen-container bookmark-add-screen has-bookmark-bottom-nav">
      <div className="bookmark-add-header">
        <h2>ブックマークへ追加</h2>
      </div>

      <div className="entry-browse-section">
        <div className="browse-control-panel">
          <div className="browse-year-controls">
            <select
              className="browse-year-select"
              value={browseYearDraft}
              onChange={(e) => setBrowseYearDraft(e.target.value)}
              disabled={browseLoading}
            >
              <option value="">年を選択してください</option>
              {browseYearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}年
                </option>
              ))}
            </select>
            <button
              className="action-button primary-button browse-apply-button"
              onClick={handleBrowseYearApply}
              disabled={browseLoading}
              type="button"
            >
              一覧を表示
            </button>
          </div>
          <div className="browse-guide-note">視聴済み作品はブックマーク操作できません。</div>
        </div>

        {!selectedBrowseYear ? (
          <div className="browse-empty-state">上のプルダウンで年を選び、「一覧を表示」を押してください。</div>
        ) : (
          <div className="browse-results-area" ref={browseResultsTopRef}>
            <div className="browse-results-header">
              <div className="browse-results-title">{selectedBrowseYear}年の作品</div>
              <div className="browse-results-meta">
                {browsePageInfo.total > 0 ? (
                  <>
                    {browsePageInfo.total} 件中 {browseRangeStart}〜{browseRangeEnd} 件を取得 / 条件一致{' '}
                    {browseVisibleResults.length} 件を表示
                  </>
                ) : (
                  '0 件'
                )}
              </div>
            </div>

            <div className="browse-genre-section">
              <div className="browse-filter-title">絞り込み条件（複数選択 / OR）</div>
              <div className="browse-filter-grid">
                <div className="browse-filter-group">
                  <div className="browse-genre-header">
                    <div className="browse-genre-title">ジャンル</div>
                    {browseGenreFilters.length > 0 && (
                      <button
                        type="button"
                        className="browse-clear-filters-button"
                        onClick={handleBrowseGenreClear}
                        disabled={browseLoading}
                      >
                        解除
                      </button>
                    )}
                  </div>
                  <div className="browse-genre-selected">{browseGenreSummaryText}</div>
                  {browseGenreOptions.length > 0 ? (
                    <div className="browse-genre-chips">
                      {browseGenreOptions.map((genre) => {
                        const selected = browseGenreFilters.includes(genre);
                        return (
                          <button
                            key={genre}
                            type="button"
                            className={`browse-genre-chip ${selected ? 'active' : ''}`}
                            onClick={() => handleBrowseGenreToggle(genre)}
                            disabled={browseLoading}
                          >
                            {translateGenre(genre)}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="browse-genre-empty">表示中の作品からジャンルを読み込み中です。</div>
                  )}
                </div>

                <div className="browse-filter-group">
                  <div className="browse-genre-header">
                    <div className="browse-genre-title">放送時期</div>
                    {browseSeasonFilters.length > 0 && (
                      <button
                        type="button"
                        className="browse-clear-filters-button"
                        onClick={handleBrowseSeasonClear}
                        disabled={browseLoading}
                      >
                        解除
                      </button>
                    )}
                  </div>
                  <div className="browse-genre-selected">{browseSeasonSummaryText}</div>
                  {browseSeasonOptions.length > 0 ? (
                    <div className="browse-genre-chips">
                      {browseSeasonOptions.map((season) => {
                        const selected = browseSeasonFilters.includes(season.key);
                        return (
                          <button
                            key={season.key}
                            type="button"
                            className={`browse-genre-chip ${selected ? 'active' : ''}`}
                            onClick={() => handleBrowseSeasonToggle(season.key)}
                            disabled={browseLoading}
                          >
                            {season.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="browse-genre-empty">表示中の作品から放送時期を読み込み中です。</div>
                  )}
                </div>
              </div>
            </div>

            {browseLoading && (
              <div className="browse-skeleton-grid">
                {Array.from({ length: 8 }).map((_, idx) => (
                  <div key={idx} className="browse-skeleton-card">
                    <div className="skeleton-thumb" />
                    <div className="skeleton-line long" />
                    <div className="skeleton-line short" />
                    <div className="skeleton-line short" />
                  </div>
                ))}
              </div>
            )}

            {!browseLoading && (
              <>
                <div className="browse-pagination">
                  <span className="browse-pagination-context">{selectedBrowseYear}年内のページ</span>
                  <div className="browse-pagination-controls">
                    <button
                      type="button"
                      className="browse-page-button"
                      onClick={() => handleBrowsePageChange(browseCurrentPage - 1)}
                      disabled={browseCurrentPage <= 1}
                    >
                      前ページ
                    </button>
                    <span className="browse-page-info">
                      {browseCurrentPage} / {browseLastPage} ページ
                    </span>
                    <button
                      type="button"
                      className="browse-page-button"
                      onClick={() => handleBrowsePageChange(browseCurrentPage + 1)}
                      disabled={!browsePageInfo.hasNextPage}
                    >
                      次ページ
                    </button>
                  </div>
                </div>

                {browseError && <div className="browse-error-message">{browseError}</div>}

                {browseVisibleResults.length === 0 ? (
                  <div className="browse-filter-empty">条件に一致する作品はありません。</div>
                ) : (
                  <div className="browse-card-grid">
                    {browseVisibleResults.map((anime) => {
                      const isWatched = watchedIdSet.has(anime.id);
                      const isBookmarked = bookmarkIdSet.has(anime.id);
                      const displayTitle = anime.title?.native || anime.title?.romaji || anime.title?.english;
                      return (
                        <article key={anime.id} className="browse-anime-card">
                          <img src={anime.coverImage?.large} alt="" className="browse-card-thumb" />
                          <div className="browse-card-content">
                            <h4 className="browse-card-title">{displayTitle}</h4>
                            <div className="browse-card-meta">
                              <span>{anime.seasonYear || selectedBrowseYear}年</span>
                              {anime.format && <span>{anime.format}</span>}
                            </div>
                            <div className="browse-card-genres">
                              {(anime.genres || []).slice(0, 3).map((g) => translateGenre(g)).join(' / ')}
                            </div>
                            <div className="bookmark-card-actions">
                              <button
                                type="button"
                                className={`bookmark-toggle-button ${isBookmarked ? 'active' : ''}`}
                                onClick={() => handleBookmarkToggle(anime)}
                                disabled={isWatched}
                                aria-pressed={isBookmarked}
                              >
                                {isWatched
                                  ? '視聴済み（ブックマーク不可）'
                                  : isBookmarked
                                    ? '★ ブックマーク済み（解除）'
                                    : '☆ ブックマークへ追加'}
                              </button>
                              <button
                                type="button"
                                className={`bookmark-sub-toggle-button ${isWatched ? 'active' : ''}`}
                                onClick={() => handleMyListToggle(anime, isWatched)}
                                aria-pressed={isWatched}
                              >
                                {isWatched ? '✓ マイリスト追加済み（取消）' : '＋ マイリストへ追加'}
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}

                <div className="browse-pagination browse-pagination-bottom">
                  <span className="browse-pagination-context">{selectedBrowseYear}年内のページ</span>
                  <div className="browse-pagination-controls">
                    <button
                      type="button"
                      className="browse-page-button"
                      onClick={() => handleBrowsePageChange(browseCurrentPage - 1)}
                      disabled={browseCurrentPage <= 1}
                    >
                      前ページ
                    </button>
                    <span className="browse-page-info">
                      {browseCurrentPage} / {browseLastPage} ページ
                    </span>
                    <button
                      type="button"
                      className="browse-page-button"
                      onClick={() => handleBrowsePageChange(browseCurrentPage + 1)}
                      disabled={!browsePageInfo.hasNextPage}
                    >
                      次ページ
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {toast.visible && <div className={`add-toast ${toast.type}`}>{toast.message}</div>}

      <nav className="bookmark-bottom-nav" aria-label="画面移動">
        <button type="button" className="bookmark-bottom-nav-button secondary" onClick={onBackBookmarks}>
          ← ブックマークへ戻る
        </button>
        <button type="button" className="bookmark-bottom-nav-button primary" onClick={onBackHome}>
          ← ホームへ
        </button>
      </nav>

      {selectedBrowseYear && browseQuickNavState.visible && (
        <aside
          className={`browse-quick-nav-rail bookmark-add-quick-nav ${browseQuickNavState.mobile ? 'mobile' : ''}`}
          aria-label="一覧内ページ移動"
        >
          <button
            type="button"
            className="browse-quick-nav-button"
            onClick={handleBrowseScrollToTop}
            disabled={browseQuickNavState.nearTop}
            aria-label="一覧の最上部へ移動"
            title="最上部へ"
          >
            ↑
          </button>
          <button
            type="button"
            className="browse-quick-nav-button"
            onClick={handleBrowseScrollToBottom}
            disabled={browseQuickNavState.nearBottom}
            aria-label="一覧の最下部へ移動"
            title="最下部へ"
          >
            ↓
          </button>
        </aside>
      )}
    </div>
  );
}

export default BookmarkAddScreen;
