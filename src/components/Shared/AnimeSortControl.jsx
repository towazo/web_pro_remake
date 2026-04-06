function AnimeSortControl({
  sortKey = 'added',
  sortOrder = 'desc',
  options = [],
  onSortKeyChange,
  onSortOrderChange,
  className = '',
  selectAriaLabel = '並び替え項目',
}) {
  return (
    <div className={`sort-box anime-sort-control ${className}`.trim()}>
      <select
        value={sortKey}
        onChange={(event) => onSortKeyChange?.(event.target.value)}
        aria-label={selectAriaLabel}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="sort-order-button anime-sort-order-button"
        onClick={() => onSortOrderChange?.(sortOrder === 'asc' ? 'desc' : 'asc')}
        title={sortOrder === 'asc' ? '昇順' : '降順'}
        aria-label={sortOrder === 'asc' ? '昇順で並び替え' : '降順で並び替え'}
      >
        {sortOrder === 'asc' ? '↑' : '↓'}
      </button>
    </div>
  );
}

export default AnimeSortControl;
