import { useEffect, useRef } from 'react';
import { translateGenre } from '../../constants/animeData';

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
}) {
  const longPressTimerRef = useRef(null);
  const longPressTriggeredRef = useRef(false);
  const rating = normalizeRating(anime?.rating);
  const canEditRating = typeof onUpdateRating === 'function' && !isSelectionMode;

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearLongPressTimer();
  }, []);

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

  return (
    <div
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
      </div>
    </div>
  );
}

export default AnimeCard;
