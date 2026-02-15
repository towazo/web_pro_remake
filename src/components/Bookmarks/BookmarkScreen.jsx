import React, { useEffect, useMemo, useRef, useState } from 'react';
import { translateGenre } from '../../constants/animeData';

const LONG_PRESS_MS = 450;

function BookmarkScreen({
  bookmarkList = [],
  watchedAnimeList = [],
  onOpenBookmarkAdd,
  onBackHome,
  onToggleBookmark,
  onMarkWatched,
  onBulkRemoveBookmarks,
}) {
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedBookmarkIds, setSelectedBookmarkIds] = useState([]);
  const [actionNotice, setActionNotice] = useState({ type: '', message: '' });
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

  useEffect(() => {
    setSelectedBookmarkIds((prev) =>
      prev.filter((id) => sortedBookmarks.some((anime) => anime.id === id))
    );
  }, [sortedBookmarks]);

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

  const handleMarkWatched = (anime, event) => {
    event.stopPropagation();
    if (typeof onMarkWatched !== 'function') {
      setActionNotice({ type: 'error', message: 'マイリスト登録を実行できませんでした。' });
      return;
    }
    const title = anime?.title?.native || anime?.title?.romaji || anime?.title?.english || '作品';
    const result = onMarkWatched(anime);
    if (result?.success) {
      setActionNotice({ type: 'success', message: `「${title}」をマイリストに追加しました。` });
    } else {
      setActionNotice({ type: 'error', message: result?.message || 'マイリスト追加に失敗しました。' });
    }
  };

  return (
    <div className={`bookmark-screen${isSelectionMode ? ' has-selection-dock' : ''}`}>
      <div className="bookmark-screen-header">
        <div>
          <h2>ブックマーク</h2>
          <p className="bookmark-screen-sub">{sortedBookmarks.length} 件の作品</p>
          <p className="bookmark-screen-desc">今後見たい作品や気になる作品を保存できます。</p>
        </div>
        <div className="bookmark-screen-actions">
          <button type="button" className="bookmark-screen-add" onClick={onOpenBookmarkAdd}>
            <span className="bookmark-screen-add-icon">＋</span>
            <span>作品を探す</span>
          </button>
        </div>
      </div>

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
      ) : (
        <div className="bookmark-list-grid">
          {sortedBookmarks.map((anime) => {
            const isWatched = watchedIdSet.has(anime.id);
            const isSelected = selectedBookmarkIds.includes(anime.id);
            const title = anime?.title?.native || anime?.title?.romaji || anime?.title?.english || '作品名不明';
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
                            className="bookmark-mark-watched-button"
                            onClick={(event) => handleMarkWatched(anime, event)}
                          >
                            ✓ 視聴した（マイリストへ）
                          </button>
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
