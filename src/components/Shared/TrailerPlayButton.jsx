import { useEffect, useRef, useState } from 'react';
import useTrailerPlaybackStatus from '../../hooks/useTrailerPlaybackStatus';
import useViewportTrailerPriority from '../../hooks/useViewportTrailerPriority';
import { resolveAnimeTitle } from '../../utils/animeList';
import { hasAnimeTrailerMetadata } from '../../utils/trailer';

function TrailerPlayButton({ anime, onPlayTrailer, className = '' }) {
  const isMountedRef = useRef(true);
  const buttonRef = useRef(null);
  const [isTrailerLoading, setIsTrailerLoading] = useState(false);
  const supportsTrailerControl = typeof onPlayTrailer === 'function';
  const { shouldAutoProbe, probePriority } = useViewportTrailerPriority(buttonRef, {
    enabled: supportsTrailerControl,
  });
  const { hasTrailer, isTrailerPlayable, status } = useTrailerPlaybackStatus(anime, {
    autoProbe: shouldAutoProbe,
    timeoutMs: 5200,
    probePriority,
  });
  const title = resolveAnimeTitle(anime);
  const hasTrailerMetadata = hasAnimeTrailerMetadata(anime);
  const isTrailerPending = supportsTrailerControl
    && (
      !hasTrailerMetadata
      || (hasTrailer && status === 'unknown')
    );
  const canPlayTrailer = supportsTrailerControl && isTrailerPlayable;
  const shouldShowTrailerControl = canPlayTrailer || isTrailerPending;
  const isTrailerButtonBusy = isTrailerLoading || isTrailerPending;

  useEffect(() => {
    setIsTrailerLoading(false);
  }, [anime?.id]);

  useEffect(() => () => {
    isMountedRef.current = false;
  }, []);

  if (!shouldShowTrailerControl) {
    return null;
  }

  const handlePointerDown = (event) => {
    event.stopPropagation();
  };

  const handleClick = async (event) => {
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
    <button
      ref={buttonRef}
      type="button"
      className={`card-trailer-button${isTrailerButtonBusy ? ' loading' : ''}${className ? ` ${className}` : ''}`.trim()}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      aria-label={isTrailerLoading ? `${title} の公式トレーラーを読み込み中` : isTrailerPending ? `${title} のトレーラーを確認中` : `${title} の公式トレーラーを再生`}
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
  );
}

export default TrailerPlayButton;
