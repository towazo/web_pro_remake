import useTrailerPlaybackStatus from '../../hooks/useTrailerPlaybackStatus';
import { resolveAnimeTitle } from '../../utils/animeList';

function TrailerPlayButton({ anime, onPlayTrailer, className = '' }) {
  const { canRenderTrailer } = useTrailerPlaybackStatus(anime, {
    autoProbe: typeof onPlayTrailer === 'function',
    timeoutMs: 5200,
  });

  if (typeof onPlayTrailer !== 'function' || !canRenderTrailer) {
    return null;
  }

  const title = resolveAnimeTitle(anime);

  const handlePointerDown = (event) => {
    event.stopPropagation();
  };

  const handleClick = (event) => {
    event.stopPropagation();
    onPlayTrailer(anime);
  };

  return (
    <button
      type="button"
      className={`card-trailer-button${className ? ` ${className}` : ''}`.trim()}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      aria-label={`${title} の公式トレーラーを再生`}
      title="公式トレーラーを再生"
    >
      <span className="card-trailer-icon" aria-hidden="true">▶</span>
    </button>
  );
}

export default TrailerPlayButton;
