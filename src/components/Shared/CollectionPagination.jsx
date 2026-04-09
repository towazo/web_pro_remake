function CollectionPagination({
  currentPage = 1,
  totalPages = 1,
  totalItems = 0,
  itemsPerPage = 30,
  onPageChange,
  className = '',
}) {
  if (totalItems <= 0 || totalPages <= 1) return null;

  const safeCurrentPage = Math.min(Math.max(1, Number(currentPage) || 1), totalPages);
  const startIndex = ((safeCurrentPage - 1) * itemsPerPage) + 1;
  const endIndex = Math.min(totalItems, startIndex + itemsPerPage - 1);
  const rootClassName = `browse-pagination${className ? ` ${className}` : ''}`;

  return (
    <div className={rootClassName}>
      <span className="browse-pagination-context">
        {totalItems}件中 {startIndex}-{endIndex}件を表示
      </span>
      <div className="browse-pagination-controls">
        <button
          type="button"
          className="browse-page-button"
          onClick={() => onPageChange?.(safeCurrentPage - 1)}
          disabled={safeCurrentPage <= 1}
        >
          前へ
        </button>
        <span className="browse-page-info">
          {safeCurrentPage} / {totalPages}
        </span>
        <button
          type="button"
          className="browse-page-button"
          onClick={() => onPageChange?.(safeCurrentPage + 1)}
          disabled={safeCurrentPage >= totalPages}
        >
          次へ
        </button>
      </div>
    </div>
  );
}

export default CollectionPagination;
