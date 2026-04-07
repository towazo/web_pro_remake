import { useEffect, useRef, useState } from 'react';
import useTrailerPlaybackStatus from '../../hooks/useTrailerPlaybackStatus';
import { resolveAnimeTitle } from '../../utils/animeList';

function TrailerPlayButton({ anime, onPlayTrailer, className = '' }) {
  const isMountedRef = useRef(true);
  const [isTrailerLoading, setIsTrailerLoading] = useState(false);
  const { canRenderTrailer } = useTrailerPlaybackStatus(anime, {
    autoProbe: typeof onPlayTrailer === 'function',
    timeoutMs: 5200,
  });

  if (typeof onPlayTrailer !== 'function' || !canRenderTrailer) {
    return null;
  }

  const title = resolveAnimeTitle(anime);

  useEffect(() => {
    setIsTrailerLoading(false);
  }, [anime?.id]);

  useEffect(() => () => {
    isMountedRef.current = false;
  }, []);

  const handlePointerDown = (event) => {
    event.stopPropagation();
  };

  const handleClick = async (event) => {
    event.stopPropagation();
    if (isTrailerLoading) return;

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
      type="button"
      className={`card-trailer-button${isTrailerLoading ? ' loading' : ''}${className ? ` ${className}` : ''}`.trim()}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      aria-label={isTrailerLoading ? `${title} の公式トレーラーを読み込み中` : `${title} の公式トレーラーを再生`}
      aria-busy={isTrailerLoading}
      disabled={isTrailerLoading}
      title={isTrailerLoading ? 'トレーラーを読み込み中' : '公式トレーラーを再生'}
    >
      {isTrailerLoading ? (
        <span className="card-trailer-spinner" aria-hidden="true" />
      ) : (
        <span className="card-trailer-icon" aria-hidden="true">▶</span>
      )}
    </button>
  );
}

export default TrailerPlayButton;
