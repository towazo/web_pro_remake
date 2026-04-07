import { useEffect, useRef, useState } from 'react';
import { loadYouTubeIframeApi } from '../../services/youtubePlayerService';
import {
  markAnimeTrailerPlayable,
  markAnimeTrailerUnplayable,
  normalizeAnimeTrailer,
} from '../../utils/trailer';

const YT_PLAYER_STATE_PLAYING = 1;
const YT_PLAYER_STATE_BUFFERING = 3;

function YouTubeTrailerPlayer({
  trailer,
  title = 'Trailer',
  autoplay = false,
  controls = true,
  loop = false,
  muted = true,
  deferVisibilityUntilPlaying = false,
  className = '',
  onError,
}) {
  const hostRef = useRef(null);
  const playerRef = useRef(null);
  const readyRef = useRef(false);
  const playbackRetryTimeoutIdsRef = useRef([]);
  const autoplayRef = useRef(autoplay);
  const mutedRef = useRef(muted);
  const playbackStateRef = useRef(null);
  const [isPlaybackVisible, setIsPlaybackVisible] = useState(() => !deferVisibilityUntilPlaying || !autoplay);
  const normalizedTrailer = normalizeAnimeTrailer(trailer);
  const videoId = normalizedTrailer?.id || '';

  useEffect(() => {
    autoplayRef.current = autoplay;
  }, [autoplay]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    setIsPlaybackVisible(!deferVisibilityUntilPlaying || !autoplay);
  }, [autoplay, deferVisibilityUntilPlaying, videoId]);

  const clearPlaybackRetryTimeouts = () => {
    playbackRetryTimeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    playbackRetryTimeoutIdsRef.current = [];
  };

  const syncIframeAttributes = (player) => {
    const iframe = player?.getIframe?.();
    if (!iframe) return;

    iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('playsinline', '1');
    iframe.setAttribute('webkit-playsinline', '1');
    iframe.setAttribute('title', title);
  };

  const requestPlaybackResume = (player) => {
    if (!autoplayRef.current || !player) return;

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
      window.setTimeout(attemptPlay, 900),
      window.setTimeout(attemptPlay, 1600),
      window.setTimeout(attemptPlay, 2600),
    ];
  };

  const syncDesiredMuteState = (player, options = {}) => {
    if (!player) return;

    const isPlaybackActive = (
      playbackStateRef.current === YT_PLAYER_STATE_PLAYING
      || playbackStateRef.current === YT_PLAYER_STATE_BUFFERING
    );
    const shouldKeepMutedForAutoplay = autoplayRef.current && !mutedRef.current && !isPlaybackActive && !options.forceUnmute;

    try {
      if (mutedRef.current || shouldKeepMutedForAutoplay) {
        player.mute();
      } else {
        player.unMute();
      }
    } catch (_) {
      // Ignore mute sync failures.
    }
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
            // Mobile autoplay is much more reliable if the player starts muted.
            mute: autoplay ? 1 : (muted ? 1 : 0),
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
              playbackStateRef.current = null;
              syncIframeAttributes(event.target);
              syncDesiredMuteState(event.target);

              requestPlaybackResume(event.target);

              markAnimeTrailerPlayable(normalizedTrailer);
            },
            onStateChange: (event) => {
              playbackStateRef.current = Number(event?.data);
              if (event?.data === YT.PlayerState.BUFFERING) {
                setIsPlaybackVisible(true);
              }

              if (event?.data === YT.PlayerState.PLAYING) {
                setIsPlaybackVisible(true);
                syncDesiredMuteState(event.target, { forceUnmute: true });
              }

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
      playbackStateRef.current = null;
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
  }, [controls, loop, videoId]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !readyRef.current) return;

    if (autoplay) {
      playbackStateRef.current = null;
      syncDesiredMuteState(player);
      try {
        player.seekTo(0, true);
      } catch (_) {
        // Ignore seek failures.
      }
      requestPlaybackResume(player);
      return;
    }

    clearPlaybackRetryTimeouts();
    try {
      player.pauseVideo();
    } catch (_) {
      // Ignore pause failures.
    }
    try {
      player.seekTo(0, true);
    } catch (_) {
      // Ignore seek failures.
    }
  }, [autoplay, videoId]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !readyRef.current) return;

    syncDesiredMuteState(player);
    if (autoplay) {
      requestPlaybackResume(player);
    }
  }, [autoplay, muted, videoId]);

  return (
    <div
      className={`youtube-trailer-player${deferVisibilityUntilPlaying ? ' defer-visibility' : ''}${isPlaybackVisible ? ' is-playback-visible' : ''}${className ? ` ${className}` : ''}`.trim()}
    >
      <div
        ref={hostRef}
        className="youtube-trailer-player-slot"
        aria-label={title}
      />
    </div>
  );
}

export default YouTubeTrailerPlayer;
