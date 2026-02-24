import React, { useEffect, useMemo, useRef, useState } from 'react';
import { translateGenre } from '../../constants/animeData';

const LONG_PRESS_MS = 450;
const RATING_VALUES = [1, 2, 3, 4, 5];

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
}) {
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedBookmarkIds, setSelectedBookmarkIds] = useState([]);
  const [actionNotice, setActionNotice] = useState({ type: '', message: '' });
  const [pendingRatingById, setPendingRatingById] = useState({});
  const [ratingTargetId, setRatingTargetId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [sortKey, setSortKey] = useState('added');
  const [sortOrder, setSortOrder] = useState('desc');
  const watchedIdSet = useMemo(
    () => new Set((watchedAnimeList || []).map((anime) => anime.id)),
    [watchedAnimeList]
  );
  const longPressTimerRef = useRef(null);
  const longPressTriggeredRef = useRef(false);

  const sortedBookmarks = useMemo(() => {
    const safeList = Array.isArray(bookmarkList) ? [...bookmarkList] : [];
    return safeList.sort((a, b) => (b.bookmarkedAt || 0) - (a.bookmarkedAt || 0));
  }, [bookmarkList]);

  const uniqueGenres = useMemo(() => {
    const genreSet = new Set();
    sortedBookmarks.forEach((anime) => {
      (anime?.genres || []).forEach((genre) => {
        if (typeof genre === 'string' && genre.trim().length > 0) {
          genreSet.add(genre);
        }
      });
    });
    return Array.from(genreSet).sort((a, b) => a.localeCompare(b));
  }, [sortedBookmarks]);

  const filteredBookmarks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const hasGenreFilter = selectedGenres.length > 0;

    const filtered = sortedBookmarks.filter((anime) => {
      const titleNative = String(anime?.title?.native || '').toLowerCase();
      const titleRomaji = String(anime?.title?.romaji || '').toLowerCase();
      const titleEnglish = String(anime?.title?.english || '').toLowerCase();
      const matchesSearch = query.length === 0
        || titleNative.includes(query)
        || titleRomaji.includes(query)
        || titleEnglish.includes(query);

      if (!matchesSearch) return false;
      if (!hasGenreFilter) return true;

      const animeGenres = Array.isArray(anime?.genres) ? anime.genres : [];
      return selectedGenres.some((genre) => animeGenres.includes(genre));
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sortKey === 'title') {
        const titleA = getBookmarkAnimeTitle(a).toLowerCase();
        const titleB = getBookmarkAnimeTitle(b).toLowerCase();
        const compareResult = titleA.localeCompare(titleB, 'ja');
        return sortOrder === 'asc' ? compareResult : compareResult * -1;
      }

      let valueA = 0;
      let valueB = 0;
      switch (sortKey) {
        case 'year':
          valueA = Number(a?.seasonYear) || 0;
          valueB = Number(b?.seasonYear) || 0;
          break;
        case 'rating':
          valueA = normalizeRating(a?.rating) || 0;
          valueB = normalizeRating(b?.rating) || 0;
          break;
        case 'added':
        default:
          valueA = Number(a?.bookmarkedAt) || Number(a?.addedAt) || 0;
          valueB = Number(b?.bookmarkedAt) || Number(b?.addedAt) || 0;
          break;
      }

      if (valueA < valueB) return sortOrder === 'asc' ? -1 : 1;
      if (valueA > valueB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [sortedBookmarks, searchQuery, selectedGenres, sortKey, sortOrder]);

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
  }, [uniqueGenres]);

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

  const handleToggleGenreFilter = (genre) => {
    setSelectedGenres((prev) => (
      prev.includes(genre) ? prev.filter((item) => item !== genre) : [...prev, genre]
    ));
  };

  const handleClearGenreFilter = () => {
    setSelectedGenres([]);
  };

  return (
    <div className={`bookmark-screen page-shell${isSelectionMode ? ' has-selection-dock' : ''}`}>
      <div className="bookmark-screen-header">
        <div>
          <h2 className="page-main-title">ブックマーク</h2>
          <p className="bookmark-screen-sub">{sortedBookmarks.length} 件の作品</p>
          <p className="bookmark-screen-desc page-main-subtitle">今後見たい作品や気になる作品を保存できます。</p>
        </div>
        <div className="bookmark-screen-actions">
          <div className="bookmark-season-nav-buttons" role="group" aria-label="シーズン別追加ページ">
            <button
              type="button"
              className="bookmark-season-nav-button"
              onClick={onOpenCurrentSeasonAdd}
            >
              今期作品を追加
            </button>
            <button
              type="button"
              className="bookmark-season-nav-button"
              onClick={onOpenNextSeasonAdd}
            >
              来季作品を追加
            </button>
          </div>
          <button type="button" className="bookmark-screen-add" onClick={onOpenBookmarkAdd}>
            <span className="bookmark-screen-add-icon">＋</span>
            <span>作品を追加</span>
          </button>
        </div>
      </div>

      {sortedBookmarks.length > 0 && (
        <>
          <div className="controls bookmark-screen-controls">
            <div className="search-box">
              <i className="search-icon">🔍</i>
              <input
                type="text"
                placeholder="ブックマークからタイトル検索"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>

            <div className="sort-box">
              <select value={sortKey} onChange={(event) => setSortKey(event.target.value)}>
                <option value="added">追加順</option>
                <option value="title">タイトル順</option>
                <option value="year">放送年順</option>
                <option value="rating">評価順</option>
              </select>
              <button
                type="button"
                className="sort-order-button"
                onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                title={sortOrder === 'asc' ? '昇順' : '降順'}
                aria-label={sortOrder === 'asc' ? '昇順で並び替え' : '降順で並び替え'}
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          </div>

          <div className="bookmark-genre-filter-section">
            <div className="bookmark-genre-filter-header">
              <p className="bookmark-genre-filter-title">ジャンル絞り込み</p>
              <button
                type="button"
                className="bookmark-genre-filter-clear"
                onClick={handleClearGenreFilter}
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
            {uniqueGenres.length > 0 ? (
              <div className="bookmark-genre-filter-chips">
                {uniqueGenres.map((genre) => {
                  const isActive = selectedGenres.includes(genre);
                  return (
                    <button
                      key={genre}
                      type="button"
                      className={`bookmark-genre-chip ${isActive ? 'active' : ''}`}
                      onClick={() => handleToggleGenreFilter(genre)}
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
            {filteredBookmarks.length} 作品が見つかりました
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
          条件に一致する作品が見つかりませんでした。検索語やジャンルを調整してください。
        </div>
      ) : (
        <div className="bookmark-list-grid">
          {filteredBookmarks.map((anime) => {
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
                  <div className="bookmark-item-meta">
                    <span>{anime?.seasonYear || '-'}</span>
                    {anime?.format && <span>{anime.format}</span>}
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
    </div>
  );
}

export default BookmarkScreen;
