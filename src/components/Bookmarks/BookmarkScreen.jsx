import React, { useEffect, useMemo, useRef, useState } from 'react';
import { translateGenre } from '../../constants/animeData';
import AnimeFilterDialog from '../Shared/AnimeFilterDialog';
import AnimeSortControl from '../Shared/AnimeSortControl';
import CollectionPagination from '../Shared/CollectionPagination';
import TrailerPlayButton from '../Shared/TrailerPlayButton';
import useTagTranslationVersion from '../../hooks/useTagTranslationVersion';
import {
  ANIME_SORT_OPTIONS,
} from '../../utils/animeList';
import {
  collectAnimeFilterOptions,
  filterAnimeCollection,
  sortAnimeCollection,
} from '../../utils/animeFilters';

const LONG_PRESS_MS = 450;
const RATING_VALUES = [1, 2, 3, 4, 5];
const COLLECTION_PAGE_SIZE = 30;

const normalizeRating = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return null;
  if (parsed < 1 || parsed > 5) return null;
  return parsed;
};

const getBookmarkAnimeTitle = (anime) => anime?.title?.native || anime?.title?.romaji || anime?.title?.english || '作品';

function BookmarkScreen({
  bookmarkList = [],
  watchedAnimeList = [],
  onOpenBookmarkAdd,
  onOpenCurrentSeasonAdd,
  onOpenNextSeasonAdd,
  onBackHome,
  onToggleBookmark,
  onMarkWatched,
  onBulkRemoveBookmarks,
  onPlayTrailer,
  onVisibleAnimeIdsChange,
}) {
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedBookmarkIds, setSelectedBookmarkIds] = useState([]);
  const [actionNotice, setActionNotice] = useState({ type: '', message: '' });
  const [pendingRatingById, setPendingRatingById] = useState({});
  const [ratingTargetId, setRatingTargetId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [selectedYear, setSelectedYear] = useState('');
  const [filterMatchMode, setFilterMatchMode] = useState('and');
  const [sortKey, setSortKey] = useState('added');
  const [sortOrder, setSortOrder] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [quickNavState, setQuickNavState] = useState({
    visible: false,
    mobile: false,
    nearTop: true,
    nearBottom: false,
  });
  const watchedIdSet = useMemo(
    () => new Set((watchedAnimeList || []).map((anime) => anime.id)),
    [watchedAnimeList]
  );
  const longPressTimerRef = useRef(null);
  const longPressTriggeredRef = useRef(false);
  const resultsRef = useRef(null);
  const pendingPageScrollRef = useRef(false);
  const tagTranslationVersion = useTagTranslationVersion();

  const sortedBookmarks = useMemo(() => {
    const safeList = Array.isArray(bookmarkList) ? [...bookmarkList] : [];
    return safeList.sort((a, b) => (b.bookmarkedAt || 0) - (a.bookmarkedAt || 0));
  }, [bookmarkList]);

  const bookmarkFilterOptions = useMemo(
    () => collectAnimeFilterOptions(sortedBookmarks),
    [sortedBookmarks, tagTranslationVersion]
  );
  const uniqueGenres = bookmarkFilterOptions.genres;
  const uniqueTags = bookmarkFilterOptions.tags;
  const uniqueYears = bookmarkFilterOptions.years;
  const isBookmarkTagInfoLoading = useMemo(
    () => sortedBookmarks.some((anime) => anime?.id && !Array.isArray(anime?.tags)),
    [sortedBookmarks]
  );

  const filteredBookmarks = useMemo(() => {
    return sortAnimeCollection(filterAnimeCollection(sortedBookmarks, {
      searchQuery,
      selectedGenres,
      selectedTags,
      selectedYear,
      matchMode: filterMatchMode,
    }), {
      sortKey,
      sortOrder,
      addedAtFields: ['bookmarkedAt', 'addedAt'],
    });
  }, [sortedBookmarks, searchQuery, selectedGenres, selectedTags, selectedYear, filterMatchMode, sortKey, sortOrder]);
  const totalPages = Math.max(1, Math.ceil(filteredBookmarks.length / COLLECTION_PAGE_SIZE));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const pagedBookmarks = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * COLLECTION_PAGE_SIZE;
    return filteredBookmarks.slice(startIndex, startIndex + COLLECTION_PAGE_SIZE);
  }, [filteredBookmarks, safeCurrentPage]);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(Math.max(1, prev), totalPages));
  }, [totalPages]);

  useEffect(() => {
    if (typeof onVisibleAnimeIdsChange !== 'function') return;
    onVisibleAnimeIdsChange(pagedBookmarks.map((anime) => anime.id));
  }, [pagedBookmarks, onVisibleAnimeIdsChange]);

  useEffect(() => () => {
    onVisibleAnimeIdsChange?.([]);
  }, [onVisibleAnimeIdsChange]);

  useEffect(() => {
    setSelectedBookmarkIds((prev) =>
      prev.filter((id) => filteredBookmarks.some((anime) => anime.id === id))
    );
  }, [filteredBookmarks]);

  useEffect(() => {
    if (!isSelectionMode) return;
    setRatingTargetId(null);
  }, [isSelectionMode]);

  useEffect(() => {
    setSelectedGenres((prev) => prev.filter((genre) => uniqueGenres.includes(genre)));
    setSelectedTags((prev) => prev.filter((tag) => uniqueTags.includes(tag)));
    setSelectedYear((prev) => {
      const year = Number(prev);
      if (!Number.isFinite(year)) return '';
      return uniqueYears.includes(year) ? String(year) : '';
    });
  }, [uniqueGenres, uniqueTags, uniqueYears]);

  useEffect(() => {
    if (ratingTargetId == null) return;
    if (filteredBookmarks.some((anime) => anime.id === ratingTargetId)) return;
    setRatingTargetId(null);
  }, [filteredBookmarks, ratingTargetId]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!actionNotice.message) return;
    const timer = setTimeout(() => {
      setActionNotice({ type: '', message: '' });
    }, 2200);
    return () => clearTimeout(timer);
  }, [actionNotice]);

  useEffect(() => {
    if (isSelectionMode || filteredBookmarks.length === 0) {
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
      const isMobile = window.matchMedia('(max-width: 1024px)').matches;

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
  }, [isSelectionMode, filteredBookmarks.length, searchQuery, selectedGenres, selectedTags, selectedYear, filterMatchMode, sortKey, sortOrder, currentPage]);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleStartLongPress = (id, event) => {
    if (isSelectionMode) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    clearLongPressTimer();
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      setIsSelectionMode(true);
      setSelectedBookmarkIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    }, LONG_PRESS_MS);
  };

  const handleCardClick = (id) => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    if (!isSelectionMode) return;
    setSelectedBookmarkIds((prev) =>
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
    );
  };

  const handleCancelSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedBookmarkIds([]);
  };

  const handleBulkRemoveSelected = () => {
    if (selectedBookmarkIds.length === 0) return;
    if (!window.confirm(`選択した ${selectedBookmarkIds.length} 件をブックマークから削除しますか？`)) return;
    onBulkRemoveBookmarks?.(selectedBookmarkIds);
    setIsSelectionMode(false);
    setSelectedBookmarkIds([]);
  };

  const handleRemoveSingleBookmark = (anime, event) => {
    event.stopPropagation();
    clearLongPressTimer();
    if (!anime || typeof anime.id !== 'number') return;
    if (typeof onToggleBookmark !== 'function') {
      setActionNotice({ type: 'error', message: 'ブックマーク削除を実行できませんでした。' });
      return;
    }

    const title = getBookmarkAnimeTitle(anime);
    if (!window.confirm(`「${title}」をブックマークから削除しますか？`)) return;

    const result = onToggleBookmark(anime);
    if (result?.success && result.action === 'removed') {
      setSelectedBookmarkIds((prev) => prev.filter((id) => id !== anime.id));
      setActionNotice({ type: 'success', message: `「${title}」をブックマークから削除しました。` });
      return;
    }
    setActionNotice({ type: 'error', message: result?.message || 'ブックマーク削除に失敗しました。' });
  };

  const handleMarkWatched = (anime, event, rating = null) => {
    event.stopPropagation();
    if (typeof onMarkWatched !== 'function') {
      setActionNotice({ type: 'error', message: 'マイリスト登録を実行できませんでした。' });
      return;
    }
    const title = getBookmarkAnimeTitle(anime);
    const normalizedRating = normalizeRating(rating);
    const result = onMarkWatched(anime, { rating: normalizedRating });
    if (result?.success) {
      setRatingTargetId(null);
      setActionNotice({ type: 'success', message: `「${title}」をマイリストに追加しました。` });
    } else {
      setActionNotice({ type: 'error', message: result?.message || 'マイリスト追加に失敗しました。' });
    }
  };

  const handleOpenRatingPanel = (anime, event) => {
    event.stopPropagation();
    if (!anime || typeof anime.id !== 'number') return;
    setRatingTargetId((prev) => (prev === anime.id ? null : anime.id));
    setPendingRatingById((prev) => {
      if (Object.prototype.hasOwnProperty.call(prev, anime.id)) return prev;
      return { ...prev, [anime.id]: null };
    });
  };

  const handleCloseRatingPanel = (animeId, event) => {
    event.stopPropagation();
    if (ratingTargetId !== animeId) return;
    setRatingTargetId(null);
  };

  const handleDraftRatingSelect = (animeId, rating, event) => {
    event.stopPropagation();
    setPendingRatingById((prev) => ({ ...prev, [animeId]: normalizeRating(rating) }));
  };

  const handleApplyFilters = (nextFilters) => {
    setCurrentPage(1);
    setSelectedGenres(Array.isArray(nextFilters?.selectedGenres) ? nextFilters.selectedGenres : []);
    setSelectedTags(Array.isArray(nextFilters?.selectedTags) ? nextFilters.selectedTags : []);
    setSelectedYear(String(nextFilters?.selectedYear || '').trim());
    setFilterMatchMode(nextFilters?.matchMode || 'and');
  };

  const handleClearFilters = () => {
    setCurrentPage(1);
    setSelectedGenres([]);
    setSelectedTags([]);
    setSelectedYear('');
    setFilterMatchMode('and');
  };

  useEffect(() => {
    if (!pendingPageScrollRef.current) return undefined;

    pendingPageScrollRef.current = false;
    let firstFrameId = 0;
    let secondFrameId = 0;

    const performScroll = () => {
      const target = resultsRef.current;
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
  }, [filteredBookmarks.length, safeCurrentPage]);

  const queueResultsScroll = () => {
    pendingPageScrollRef.current = true;
  };

  const handleSearchChange = (event) => {
    setCurrentPage(1);
    setSearchQuery(event.target.value);
  };

  const handleSortKeyChange = (nextSortKey) => {
    setCurrentPage(1);
    setSortKey(nextSortKey);
  };

  const handleSortOrderChange = (nextSortOrder) => {
    setCurrentPage(1);
    setSortOrder(nextSortOrder);
  };

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

  return (
    <div className={`bookmark-screen page-shell${isSelectionMode ? ' has-selection-dock' : ''}`}>
      <div className="bookmark-screen-header">
        <div>
          <h2 className="page-main-title">ブックマーク</h2>
          <p className="bookmark-screen-desc page-main-subtitle">今後見たい作品や気になる作品を保存できます。</p>
        </div>
        <div className="bookmark-screen-actions">
          <div className="bookmark-season-nav-buttons" role="group" aria-label="シーズン別追加ページ">
            <button
              type="button"
              className="bookmark-season-nav-button page-action-button page-action-secondary"
              onClick={onOpenCurrentSeasonAdd}
            >
              今期作品を追加
            </button>
            <button
              type="button"
              className="bookmark-season-nav-button page-action-button page-action-secondary"
              onClick={onOpenNextSeasonAdd}
            >
              来季作品を追加
            </button>
          </div>
          <button
            type="button"
            className="bookmark-screen-add page-action-button page-action-primary page-action-strong"
            onClick={onOpenBookmarkAdd}
          >
            <span className="bookmark-screen-add-icon">＋</span>
            <span>作品を追加</span>
          </button>
        </div>
      </div>

      {sortedBookmarks.length > 0 && (
        <>
          <div className="controls bookmark-screen-controls">
            <div className="search-box">
              <i className="search-icon" aria-hidden="true" />
              <input
                type="text"
                placeholder="ブックマークからタイトル検索"
                value={searchQuery}
                onChange={handleSearchChange}
              />
            </div>
          </div>

          <AnimeFilterDialog
            contextId="bookmarks"
            title="絞り込み条件"
            emptySummaryText="ジャンル・タグ・放送年で絞り込めます。"
            helperText="AND / OR はジャンルとタグの組み合わせに適用されます。放送年は追加条件として扱います。"
            appliedGenres={selectedGenres}
            appliedTags={selectedTags}
            appliedYear={selectedYear}
            appliedMatchMode={filterMatchMode}
            availableGenres={uniqueGenres}
            availableTags={uniqueTags}
            availableYears={uniqueYears}
            isLoadingTags={isBookmarkTagInfoLoading}
            loadingTagsText="タグ候補を取得中です…"
            showSeasons={false}
            showMinRating={false}
            toolbarSupplement={(
              <AnimeSortControl
                sortKey={sortKey}
                sortOrder={sortOrder}
                options={ANIME_SORT_OPTIONS}
                onSortKeyChange={handleSortKeyChange}
                onSortOrderChange={handleSortOrderChange}
                selectAriaLabel="ブックマークの並び替え"
              />
            )}
            onApply={handleApplyFilters}
            onClear={handleClearFilters}
          />

          <div ref={resultsRef}>
            <div className="results-count">
              {filteredBookmarks.length} 作品が見つかりました
            </div>
            <CollectionPagination
              currentPage={safeCurrentPage}
              totalPages={totalPages}
              totalItems={filteredBookmarks.length}
              itemsPerPage={COLLECTION_PAGE_SIZE}
              onPageChange={(nextPage) => {
                setCurrentPage(nextPage);
                queueResultsScroll();
              }}
            />
          </div>
        </>
      )}

      {actionNotice.message && (
        <div className={`bookmark-action-notice ${actionNotice.type}`}>
          {actionNotice.message}
        </div>
      )}

      {isSelectionMode && (
        <div className="bookmark-selection-toolbar" role="region" aria-label="ブックマーク選択モード">
          <p className="bookmark-selection-title">選択モード</p>
          <p className="bookmark-selection-count">{selectedBookmarkIds.length} 件を選択中</p>
        </div>
      )}

      {sortedBookmarks.length === 0 ? (
        <div className="bookmark-empty">
          ブックマークはまだありません。気になる作品を追加してください。
        </div>
      ) : filteredBookmarks.length === 0 ? (
        <div className="bookmark-empty bookmark-filter-empty">
          条件に一致する作品が見つかりませんでした。検索語やジャンル・タグ・年を調整してください。
        </div>
      ) : (
        <div className="bookmark-list-grid">
          {pagedBookmarks.map((anime) => {
            const isWatched = watchedIdSet.has(anime.id);
            const isSelected = selectedBookmarkIds.includes(anime.id);
            const title = getBookmarkAnimeTitle(anime);
            const draftRating = normalizeRating(pendingRatingById[anime.id]);
            const isRatingPanelOpen = ratingTargetId === anime.id;
            return (
              <article
                key={anime.id}
                className={`bookmark-item-card${isSelectionMode ? ' selection-mode' : ''}${isSelected ? ' selected' : ''}`}
                onPointerDown={(event) => handleStartLongPress(anime.id, event)}
                onPointerUp={clearLongPressTimer}
                onPointerCancel={clearLongPressTimer}
                onPointerLeave={clearLongPressTimer}
                onClick={() => handleCardClick(anime.id)}
                onContextMenu={(event) => event.preventDefault()}
                role={isSelectionMode ? 'button' : undefined}
                tabIndex={isSelectionMode ? 0 : undefined}
                aria-pressed={isSelectionMode ? isSelected : undefined}
              >
                <img src={anime?.coverImage?.large || ''} alt="" className="bookmark-item-thumb" />
                {!isSelectionMode && (
                  <button
                    type="button"
                    className="delete-button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onPointerUp={(event) => event.stopPropagation()}
                    onClick={(event) => handleRemoveSingleBookmark(anime, event)}
                    title="ブックマークから削除"
                    aria-label={`${title}をブックマークから削除`}
                  >
                    ✕
                  </button>
                )}
                <div className="bookmark-item-content">
                  <h3 className="bookmark-item-title">{title}</h3>
                  <div className="bookmark-item-meta-row">
                    <div className="bookmark-item-meta">
                      <span>{anime?.seasonYear || '-'}</span>
                      {anime?.format && <span>{anime.format}</span>}
                    </div>
                    {!isSelectionMode && (
                      <TrailerPlayButton
                        anime={anime}
                        onPlayTrailer={onPlayTrailer}
                        className="bookmark-trailer-button"
                      />
                    )}
                  </div>
                  <div className="bookmark-item-genres">
                    {(anime?.genres || []).slice(0, 3).map((g) => translateGenre(g)).join(' / ')}
                  </div>
                  {isSelectionMode ? (
                    <div className={`bookmark-selection-indicator ${isSelected ? 'active' : ''}`}>
                      {isSelected ? '✓' : ''}
                    </div>
                  ) : (
                    <>
                      {isWatched ? (
                        <div className="bookmark-watched-pill">視聴済み</div>
                      ) : (
                        <div className="bookmark-item-actions">
                          <button
                            type="button"
                            className="bookmark-toggle-button active"
                            onClick={(event) => {
                              event.stopPropagation();
                              onToggleBookmark(anime);
                            }}
                          >
                            ★ ブックマーク済み（解除）
                          </button>
                          <button
                            type="button"
                            className={`bookmark-mark-watched-button${isRatingPanelOpen ? ' active' : ''}`}
                            onClick={(event) => handleOpenRatingPanel(anime, event)}
                            aria-expanded={isRatingPanelOpen}
                            aria-controls={`bookmark-rating-panel-${anime.id}`}
                          >
                            {isRatingPanelOpen ? '✓ 評価入力を閉じる' : '✓ マイリストへ追加（評価）'}
                          </button>
                          {isRatingPanelOpen && (
                            <div
                              id={`bookmark-rating-panel-${anime.id}`}
                              className="bookmark-rating-panel"
                              onClick={(event) => event.stopPropagation()}
                              onPointerDown={(event) => event.stopPropagation()}
                            >
                              <p className="bookmark-rating-label">評価（任意）</p>
                              <div className="bookmark-rating-stars" role="group" aria-label="評価を選択">
                                {RATING_VALUES.map((value) => (
                                  <button
                                    key={value}
                                    type="button"
                                    className={`bookmark-rating-star ${draftRating !== null && draftRating >= value ? 'active' : ''}`}
                                    onClick={(event) => handleDraftRatingSelect(anime.id, value, event)}
                                  >
                                    ★
                                  </button>
                                ))}
                              </div>
                              <div className="bookmark-rating-actions">
                                <button
                                  type="button"
                                  className="bookmark-rating-clear"
                                  onClick={(event) => handleDraftRatingSelect(anime.id, null, event)}
                                  title="評価をクリア"
                                  aria-label="評価をクリア"
                                >
                                  クリア
                                </button>
                                <button
                                  type="button"
                                  className="bookmark-rating-submit"
                                  onClick={(event) => handleMarkWatched(anime, event, draftRating)}
                                >
                                  マイリストへ追加
                                </button>
                                <button
                                  type="button"
                                  className="bookmark-rating-cancel"
                                  onClick={(event) => handleCloseRatingPanel(anime.id, event)}
                                >
                                  キャンセル
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <CollectionPagination
        currentPage={safeCurrentPage}
        totalPages={totalPages}
        totalItems={filteredBookmarks.length}
        itemsPerPage={COLLECTION_PAGE_SIZE}
        className="browse-pagination-bottom"
        onPageChange={(nextPage) => {
          setCurrentPage(nextPage);
          queueResultsScroll();
        }}
      />

      {isSelectionMode && (
        <div className="bookmark-selection-dock" role="region" aria-label="選択操作">
          <p className="bookmark-selection-dock-count">{selectedBookmarkIds.length} 件選択中</p>
          <div className="bookmark-selection-dock-actions">
            <button
              type="button"
              className="bookmark-selection-remove"
              onClick={handleBulkRemoveSelected}
              disabled={selectedBookmarkIds.length === 0}
            >
              選択した作品を削除
            </button>
            <button type="button" className="bookmark-selection-cancel" onClick={handleCancelSelectionMode}>
              キャンセル
            </button>
          </div>
        </div>
      )}

      {!isSelectionMode && (
        <nav className="screen-bottom-home-nav" aria-label="画面移動">
          <button type="button" className="screen-bottom-home-button" onClick={onBackHome}>
            ← ホームへ戻る
          </button>
        </nav>
      )}

      {!isSelectionMode && quickNavState.visible && (
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

export default BookmarkScreen;
