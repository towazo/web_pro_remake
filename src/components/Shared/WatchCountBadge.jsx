function WatchCountBadge({
  count = 1,
  className = '',
  iconClassName = '',
  countClassName = '',
}) {
  return (
    <span className={`watch-count-badge${className ? ` ${className}` : ''}`.trim()}>
      <svg
        viewBox="0 0 24 24"
        className={`watch-count-icon${iconClassName ? ` ${iconClassName}` : ''}`.trim()}
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M2 12C3.8 8.9 7.3 6 12 6C16.7 6 20.2 8.9 22 12C20.2 15.1 16.7 18 12 18C7.3 18 3.8 15.1 2 12Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx="12"
          cy="12"
          r="3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        />
      </svg>
      <span className={`watch-count-number${countClassName ? ` ${countClassName}` : ''}`.trim()}>
        {count}
      </span>
    </span>
  );
}

export default WatchCountBadge;
