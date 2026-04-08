import { useEffect, useRef, useState } from 'react';
import { translateGenre } from '../../constants/animeData';
import WatchCountBadge from '../Shared/WatchCountBadge';
import { normalizeAnimeWatchCount } from '../../utils/animeList';
import useTrailerPlaybackStatus from '../../hooks/useTrailerPlaybackStatus';
import useViewportTrailerPriority from '../../hooks/useViewportTrailerPriority';
import { hasAnimeTrailerMetadata } from '../../utils/trailer';

const LONG_PRESS_MS = 450;
const RATING_VALUES = [1, 2, 3, 4, 5];

const normalizeRating = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return null;
  if (parsed < 1 || parsed > 5) return null;
  return parsed;
};

function AnimeCard({
  anime,
  onRemove,
  isSelectionMode = false,
  isSelected = false,
  onToggleSelect,
  onLongPress,
  onUpdateRating,
  onUpdateWatchCount,
  allowRatingEditInSelectionMode = false,
  allowWatchCountEditInSelectionMode = false,
  onPlayTrailer,
  onViewportPriorityChange,
}) {
  const cardRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const longPressTriggeredRef = useRef(false);
  const isMountedRef = useRef(true);
  const [isWatchControlsPinned, setIsWatchControlsPinned] = useState(false);
  const [isTrailerLoading, setIsTrailerLoading] = useState(false);
  const rating = normalizeRating(anime?.rating);
  const watchCount = normalizeAnimeWatchCount(anime?.watchCount, { minimum: 1, defaultValue: 1 });
  const supportsTrailerControl = !isSelectionMode && typeof onPlayTrailer === 'function';
  const shouldTrackViewportPriority = typeof onViewportPriorityChange === 'function';
  const { shouldAutoProbe, probePriority } = useViewportTrailerPriority(cardRef, {
    enabled: supportsTrailerControl || shouldTrackViewportPriority,
  });
  const canEditRating = typeof onUpdateRating === 'function'
    && (!isSelectionMode || allowRatingEditInSelectionMode);
  const canEditWatchCount = typeof onUpdateWatchCount === 'function'
    && (!isSelectionMode || allowWatchCountEditInSelectionMode);
  const { hasTrailer, isTrailerPlayable, status } = useTrailerPlaybackStatus(anime, {
    autoProbe: supportsTrailerControl && shouldAutoProbe,
    timeoutMs: 5200,
    probePriority,
  });
  const hasTrailerMetadata = hasAnimeTrailerMetadata(anime);
  const isTrailerPending = supportsTrailerControl
    && (
      !hasTrailerMetadata
      || (hasTrailer && status === 'unknown')
    );
  const canPlayTrailer = supportsTrailerControl && isTrailerPlayable;
  const shouldShowTrailerControl = canPlayTrailer || isTrailerPending;
  const isTrailerButtonBusy = isTrailerLoading || isTrailerPending;
  const trailerButtonLabel = isTrailerLoading
    ? `${anime.title.native || anime.title.romaji || anime.title.english || '作品'} の公式トレーラーを読み込み中`
    : isTrailerPending
      ? `${anime.title.native || anime.title.romaji || anime.title.english || '作品'} のトレーラーを確認中`
      : `${anime.title.native || anime.title.romaji || anime.title.english || '作品'} の公式トレーラーを再生`;

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      clearLongPressTimer();
    };
  }, []);

  useEffect(() => {
    setIsTrailerLoading(false);
  }, [anime?.id]);

  useEffect(() => {
    if (!shouldTrackViewportPriority) return undefined;

    const animeId = Number(anime?.id);
    if (!Number.isFinite(animeId)) return undefined;

    onViewportPriorityChange(animeId, shouldAutoProbe ? probePriority : 0);
    return () => {
      onViewportPriorityChange(animeId, 0);
    };
  }, [anime?.id, onViewportPriorityChange, probePriority, shouldAutoProbe, shouldTrackViewportPriority]);

  useEffect(() => {
    if (!canEditWatchCount) {
      setIsWatchControlsPinned(false);
    }
  }, [canEditWatchCount]);

  useEffect(() => {
    if (!isWatchControlsPinned) return undefined;

    const handleDocumentPointerDown = (event) => {
      const currentCard = cardRef.current;
      if (!currentCard) return;
      if (currentCard.contains(event.target)) return;
      setIsWatchControlsPinned(false);
    };

    const handleDocumentKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsWatchControlsPinned(false);
      }
    };

    document.addEventListener('pointerdown', handleDocumentPointerDown);
    document.addEventListener('keydown', handleDocumentKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown);
      document.removeEventListener('keydown', handleDocumentKeyDown);
    };
  }, [isWatchControlsPinned]);

  const startLongPress = () => {
    clearLongPressTimer();
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      if (onLongPress) onLongPress(anime.id);
    }, LONG_PRESS_MS);
  };

  const cancelLongPress = () => {
    clearLongPressTimer();
  };

  const handleCardPointerDown = (event) => {
    if (isSelectionMode) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    startLongPress();
  };

  const handleCardClick = () => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    if (isSelectionMode && onToggleSelect) {
      onToggleSelect(anime.id);
    }
  };

  const handleCardKeyDown = (event) => {
    if (!isSelectionMode || !onToggleSelect) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onToggleSelect(anime.id);
    }
  };

  const handleRatingPointerDown = (event) => {
    event.stopPropagation();
  };

  const handleRatingSelect = (event, value) => {
    event.stopPropagation();
    if (!canEditRating) return;
    onUpdateRating(anime.id, value);
  };

  const handleRatingClear = (event) => {
    event.stopPropagation();
    if (!canEditRating) return;
    onUpdateRating(anime.id, null);
  };

  const handleWatchPointerDown = (event) => {
    event.stopPropagation();
  };

  const handleToggleWatchControls = (event) => {
    event.stopPropagation();
    if (!canEditWatchCount) return;
    setIsWatchControlsPinned((prev) => !prev);
  };

  const handleWatchCountChange = (event, nextValue) => {
    event.stopPropagation();
    if (!canEditWatchCount) return;
    onUpdateWatchCount(anime.id, nextValue);
    setIsWatchControlsPinned(false);
  };

  const handleTrailerPointerDown = (event) => {
    event.stopPropagation();
  };

  const handlePlayTrailer = async (event) => {
    event.stopPropagation();
    if (!canPlayTrailer || isTrailerLoading) return;

    setIsTrailerLoading(true);
    try {
      await Promise.resolve(onPlayTrailer(anime));
    } finally {
      if (isMountedRef.current) {
        setIsTrailerLoading(false);
      }
    }
  };

  return (
    <div
      ref={cardRef}
      className={`anime-card${isSelectionMode ? ' selection-mode' : ''}${isSelected ? ' selected' : ''}`}
      onPointerDown={handleCardPointerDown}
      onPointerUp={cancelLongPress}
      onPointerCancel={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      onContextMenu={(event) => event.preventDefault()}
      role={isSelectionMode ? 'button' : undefined}
      tabIndex={isSelectionMode ? 0 : undefined}
      aria-pressed={isSelectionMode ? isSelected : undefined}
    >
      <div className="card-image-wrapper">
        <img
          src={anime.coverImage.large}
          alt={anime.title.native || anime.title.romaji}
          loading="lazy"
          draggable={false}
          onDragStart={(event) => event.preventDefault()}
        />
        <div className="episodes-badge">{anime.episodes || '?'} 話</div>
        {isSelectionMode && (
          <div className={`selection-indicator${isSelected ? ' active' : ''}`} aria-hidden="true">
            {isSelected ? '✓' : ''}
          </div>
        )}
        {!isSelectionMode && (
          <button
            className="delete-button"
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              if (window.confirm(`「${anime.title.native || anime.title.romaji}」を削除しますか？`)) {
                onRemove(anime.id);
              }
            }}
            title="削除"
          >
            ✕
          </button>
        )}
      </div>
      <div className="card-info">
        <h3>{anime.title.native || anime.title.romaji}</h3>
        <div className="card-meta">
          {anime.seasonYear && <span className="meta-tag year">{anime.seasonYear}</span>}
          {anime.genres?.map((genre, index) => (
            <span key={index} className="meta-tag genre">{translateGenre(genre)}</span>
          ))}
        </div>
        <div className="card-rating-section">
          <div className="card-rating-stars" role="group" aria-label="作品評価">
            {RATING_VALUES.map((value) => (
              <button
                key={value}
                type="button"
                className={`card-rating-star ${rating !== null && rating >= value ? 'active' : ''}`}
                onPointerDown={handleRatingPointerDown}
                onClick={(event) => handleRatingSelect(event, value)}
                disabled={!canEditRating}
                aria-label={`${value}つ星で評価`}
              >
                ★
              </button>
            ))}
          </div>
          <div className="card-rating-actions">
            <button
              type="button"
              className="card-rating-clear"
              onPointerDown={handleRatingPointerDown}
              onClick={handleRatingClear}
              disabled={!canEditRating || rating === null}
              title="評価をクリア"
              aria-label="評価をクリア"
            >
              <span className="card-rating-clear-label-full">クリア</span>
              <span className="card-rating-clear-label-compact">✕</span>
            </button>
          </div>
        </div>
        <div className={`card-watch-section${canEditWatchCount ? ' editable' : ''}${isWatchControlsPinned ? ' controls-open' : ''}`}>
          <div className="card-watch-primary">
            {shouldShowTrailerControl && (
              <button
                type="button"
                className={`card-trailer-button${isTrailerButtonBusy ? ' loading' : ''}`}
                onPointerDown={handleTrailerPointerDown}
                onClick={handlePlayTrailer}
                aria-label={trailerButtonLabel}
                aria-busy={isTrailerButtonBusy}
                disabled={isTrailerButtonBusy}
                title={isTrailerLoading ? 'トレーラーを読み込み中' : isTrailerPending ? 'トレーラーを確認中' : '公式トレーラーを再生'}
              >
                {isTrailerButtonBusy ? (
                  <span className="card-trailer-spinner" aria-hidden="true" />
                ) : (
                  <span className="card-trailer-icon" aria-hidden="true">▶</span>
                )}
              </button>
            )}
            {canEditWatchCount ? (
              <button
                type="button"
                className="card-watch-summary"
                onPointerDown={handleWatchPointerDown}
                onClick={handleToggleWatchControls}
                aria-expanded={isWatchControlsPinned}
                aria-label={`視聴回数 ${watchCount}回。タップで変更ボタンを${isWatchControlsPinned ? '閉じる' : '表示'}`}
              >
                <WatchCountBadge
                  count={watchCount}
                  className="card-watch-badge"
                  iconClassName="card-watch-icon"
                  countClassName="card-watch-count"
                />
                <span className="card-watch-underline" aria-hidden="true" />
              </button>
            ) : (
              <div className="card-watch-summary static" aria-label={`視聴回数 ${watchCount}回`}>
                <WatchCountBadge
                  count={watchCount}
                  className="card-watch-badge"
                  iconClassName="card-watch-icon"
                  countClassName="card-watch-count"
                />
                <span className="card-watch-underline" aria-hidden="true" />
              </div>
            )}
          </div>
          {canEditWatchCount && (
            <div className="card-watch-controls">
              <button
                type="button"
                className="card-watch-adjust"
                onPointerDown={handleWatchPointerDown}
                onClick={(event) => handleWatchCountChange(event, watchCount - 1)}
                disabled={watchCount <= 1}
                aria-label="視聴回数を1減らす"
              >
                −
              </button>
              <button
                type="button"
                className="card-watch-adjust"
                onPointerDown={handleWatchPointerDown}
                onClick={(event) => handleWatchCountChange(event, watchCount + 1)}
                aria-label="視聴回数を1増やす"
              >
                ＋
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AnimeCard;
