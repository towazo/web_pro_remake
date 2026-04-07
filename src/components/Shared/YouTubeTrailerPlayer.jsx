import { useEffect, useRef } from 'react';
import { loadYouTubeIframeApi } from '../../services/youtubePlayerService';
import {
  markAnimeTrailerPlayable,
  markAnimeTrailerUnplayable,
  normalizeAnimeTrailer,
} from '../../utils/trailer';

function YouTubeTrailerPlayer({
  trailer,
  title = 'Trailer',
  autoplay = false,
  controls = true,
  loop = false,
  muted = true,
  className = '',
  onError,
}) {
  const hostRef = useRef(null);
  const playerRef = useRef(null);
  const readyRef = useRef(false);
  const playbackRetryTimeoutIdsRef = useRef([]);
  const normalizedTrailer = normalizeAnimeTrailer(trailer);
  const videoId = normalizedTrailer?.id || '';

  const clearPlaybackRetryTimeouts = () => {
    playbackRetryTimeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    playbackRetryTimeoutIdsRef.current = [];
  };

  const requestPlaybackResume = (player) => {
    if (!autoplay || !player) return;

    const attemptPlay = () => {
      try {
        player.playVideo();
      } catch (_) {
        // Ignore autoplay failures.
      }
    };

    attemptPlay();
    clearPlaybackRetryTimeouts();
    playbackRetryTimeoutIdsRef.current = [
      window.setTimeout(attemptPlay, 140),
      window.setTimeout(attemptPlay, 420),
    ];
  };

  useEffect(() => {
    if (!videoId || !hostRef.current) return undefined;

    let cancelled = false;
    let localPlayer = null;

    const createPlayer = async () => {
      try {
        const YT = await loadYouTubeIframeApi();
        if (cancelled || !hostRef.current) return;

        localPlayer = new YT.Player(hostRef.current, {
          host: 'https://www.youtube-nocookie.com',
          videoId,
          playerVars: {
            autoplay: autoplay ? 1 : 0,
            controls: controls ? 1 : 0,
            disablekb: controls ? 0 : 1,
            fs: controls ? 1 : 0,
            iv_load_policy: 3,
            loop: loop ? 1 : 0,
            modestbranding: 1,
            mute: muted ? 1 : 0,
            playsinline: 1,
            playlist: loop ? videoId : undefined,
            rel: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              if (cancelled) return;
              playerRef.current = event.target;
              readyRef.current = true;

              try {
                if (muted) {
                  event.target.mute();
                } else {
                  event.target.unMute();
                }
              } catch (_) {
                // Ignore mute sync failures.
              }

              requestPlaybackResume(event.target);

              markAnimeTrailerPlayable(normalizedTrailer);
            },
            onStateChange: (event) => {
              if (!loop) return;
              if (event?.data !== YT.PlayerState.ENDED) return;

              try {
                event.target.seekTo(0, true);
              } catch (_) {
                // Ignore seek failures.
              }
              requestPlaybackResume(event.target);
            },
            onError: (event) => {
              if (cancelled) return;
              const errorCode = Number(event?.data) || 0;
              markAnimeTrailerUnplayable(normalizedTrailer, { errorCode });
              if (typeof onError === 'function') {
                onError(errorCode);
              }
            },
          },
        });
      } catch (_) {
        markAnimeTrailerUnplayable(normalizedTrailer, { errorCode: 0 });
        if (typeof onError === 'function') {
          onError(0);
        }
      }
    };

    createPlayer();

    return () => {
      cancelled = true;
      readyRef.current = false;
      clearPlaybackRetryTimeouts();
      if (localPlayer) {
        try {
          localPlayer.destroy();
        } catch (_) {
          // Ignore teardown failures.
        }
      }
      playerRef.current = null;
      if (hostRef.current) {
        hostRef.current.innerHTML = '';
      }
    };
  }, [autoplay, controls, loop, videoId]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !readyRef.current) return;

    try {
      if (muted) {
        player.mute();
      } else {
        player.unMute();
      }
    } catch (_) {
      // Ignore mute sync failures.
    }
    requestPlaybackResume(player);
  }, [autoplay, muted, videoId]);

  return (
    <div className={`youtube-trailer-player${className ? ` ${className}` : ''}`.trim()}>
      <div
        ref={hostRef}
        className="youtube-trailer-player-slot"
        aria-label={title}
      />
    </div>
  );
}

export default YouTubeTrailerPlayer;
