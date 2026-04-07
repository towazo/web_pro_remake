import { useEffect, useRef, useState } from 'react';
import useTrailerPlaybackStatus from '../../hooks/useTrailerPlaybackStatus';
import { resolveAnimeTitle } from '../../utils/animeList';
import { getAnimeTrailerWatchUrl } from '../../utils/trailer';
import AudioToggleButton from './AudioToggleButton';
import YouTubeTrailerPlayer from './YouTubeTrailerPlayer';

function TrailerModal({ anime, onClose }) {
  const closeButtonRef = useRef(null);
  const [isMuted, setIsMuted] = useState(true);
  const { trailer, isTrailerInvalid } = useTrailerPlaybackStatus(anime);
  const animeId = anime?.id || 'current';
  const trailerId = trailer?.id || '';

  useEffect(() => {
    if (!anime || !trailer) return undefined;

    document.body.classList.add('trailer-modal-open');

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    closeButtonRef.current?.focus();

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.classList.remove('trailer-modal-open');
    };
  }, [animeId, trailerId]);

  useEffect(() => {
    if (!anime || !isTrailerInvalid) return;
    onClose?.();
  }, [animeId, isTrailerInvalid]);

  useEffect(() => {
    setIsMuted(true);
  }, [animeId]);

  if (!anime || !trailer) return null;

  const title = resolveAnimeTitle(anime);
  const titleId = `trailer-modal-title-${animeId}`;
  const watchUrl = getAnimeTrailerWatchUrl(trailer);

  return (
    <div className="trailer-modal-backdrop" onClick={() => onClose?.()}>
      <section
        className="trailer-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="trailer-modal-header">
          <div>
            <p className="trailer-modal-eyebrow">公式 Trailer</p>
            <h3 id={titleId} className="trailer-modal-title">{title}</h3>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="trailer-modal-close"
            onClick={() => onClose?.()}
            aria-label="トレーラーを閉じる"
          >
            ✕
          </button>
        </header>

        <div className="trailer-modal-player">
          <YouTubeTrailerPlayer
            trailer={trailer}
            title={`${title} の公式トレーラー`}
            className="trailer-modal-frame"
            autoplay
            controls
            muted={isMuted}
          />
        </div>

        <div className="trailer-modal-footer">
          <AudioToggleButton
            muted={isMuted}
            className="trailer-audio-toggle"
            onClick={() => setIsMuted((prev) => !prev)}
            labelOn="トレーラーの音声をオンにする"
            labelOff="トレーラーの音声をオフにする"
          />
          {watchUrl && (
            <a
              className="trailer-modal-external"
              href={watchUrl}
              target="_blank"
              rel="noreferrer"
            >
              YouTube で開く
            </a>
          )}
        </div>
      </section>
    </div>
  );
}

export default TrailerModal;
