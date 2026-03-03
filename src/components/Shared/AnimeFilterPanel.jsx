import { translateGenre } from '../../constants/animeData';
import { MIN_RATING_FILTER_OPTIONS, normalizeMinRatingFilter } from '../../utils/animeList';

function AnimeFilterPanel({
  uniqueGenres = [],
  selectedGenres = [],
  minRating = '',
  onToggleGenre,
  onMinRatingChange,
  onClearFilters,
  sectionClassName = '',
  title = '絞り込み',
  selectedNote = '複数選択時は「すべて含む」で絞り込みます。',
  contextId = 'default',
}) {
  const normalizedMinRating = normalizeMinRatingFilter(minRating);
  const clearDisabled = selectedGenres.length === 0 && !normalizedMinRating;

  return (
    <div className={`bookmark-genre-filter-section ${sectionClassName}`.trim()}>
      <div className="bookmark-genre-filter-header">
        <p className="bookmark-genre-filter-title">{title}</p>
        <button
          type="button"
          className="bookmark-genre-filter-clear"
          onClick={onClearFilters}
          disabled={clearDisabled}
        >
          クリア
        </button>
      </div>
      <p className="bookmark-genre-filter-selected">
        {selectedGenres.length > 0
          ? `選択中: ${selectedGenres.map((genre) => translateGenre(genre)).join(' / ')}`
          : 'ジャンル未選択（すべて表示）'}
      </p>
      <div className="bookmark-rating-filter-row">
        <label className="bookmark-rating-filter-label" htmlFor={`rating-filter-${contextId}`}>
          最低評価
        </label>
        <select
          id={`rating-filter-${contextId}`}
          className="bookmark-rating-filter-select"
          value={normalizedMinRating}
          onChange={(event) => onMinRatingChange(event.target.value)}
        >
          {MIN_RATING_FILTER_OPTIONS.map((option) => (
            <option key={option.value || 'all'} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <p className="bookmark-genre-filter-note">{selectedNote}</p>
      {uniqueGenres.length > 0 ? (
        <div className="bookmark-genre-filter-chips">
          {uniqueGenres.map((genre) => {
            const isActive = selectedGenres.includes(genre);
            return (
              <button
                key={genre}
                type="button"
                className={`bookmark-genre-chip ${isActive ? 'active' : ''}`}
                onClick={() => onToggleGenre(genre)}
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
  );
}

export default AnimeFilterPanel;
