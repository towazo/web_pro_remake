function AudioToggleButton({
  muted = true,
  onClick,
  className = '',
  disabled = false,
  labelOn = '音声をオン',
  labelOff = '音声をオフ',
  labelDisabled = '音声は利用できません',
}) {
  const label = disabled ? labelDisabled : (muted ? labelOn : labelOff);

  return (
    <button
      type="button"
      className={`audio-toggle-button${className ? ` ${className}` : ''}`.trim()}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={!muted}
      title={label}
    >
      <svg
        className="audio-toggle-icon"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M5 9H9L14 5V19L9 15H5Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        {muted ? (
          <path
            d="M4.5 4.5L19.5 19.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
          />
        ) : (
          <>
            <path
              d="M16.5 9C17.8 10.2 18.5 11.9 18.5 13.5C18.5 15.1 17.8 16.8 16.5 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <path
              d="M18.8 6.5C20.9 8.3 22 10.9 22 13.5C22 16.1 20.9 18.7 18.8 20.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </>
        )}
      </svg>
    </button>
  );
}

export default AudioToggleButton;
