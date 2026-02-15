import { useEffect, useRef } from 'react';
import { translateGenre } from '../../constants/animeData';

const LONG_PRESS_MS = 450;

function AnimeCard({
  anime,
  onRemove,
  isSelectionMode = false,
  isSelected = false,
  onToggleSelect,
  onLongPress,
}) {
  const longPressTimerRef = useRef(null);
  const longPressTriggeredRef = useRef(false);

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
            X
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
      </div>
    </div>
  );
}

export default AnimeCard;
