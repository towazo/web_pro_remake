import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { loadYouTubeIframeApi } from '../../services/youtubePlayerService';
import {
  markAnimeTrailerPlayable,
  markAnimeTrailerUnplayable,
  normalizeAnimeTrailer,
} from '../../utils/trailer';

const YT_PLAYER_STATE_PLAYING = 1;
const YT_PLAYER_STATE_BUFFERING = 3;
const AUTOPLAY_STARTUP_SOFT_RETRY_MS = 2200;
const AUTOPLAY_STARTUP_RECOVERY_MS = 4200;
const AUTOPLAY_STARTUP_STALL_MS = 7600;
const AUTOPLAY_STARTUP_BUFFER_STALL_MS = 10000;
const BUFFER_STALL_SOFT_RETRY_MS = 1800;
const BUFFER_STALL_HARD_RETRY_MS = 4200;
const MAX_AUTOPLAY_PLAYER_RECOVERY_RESTARTS = 1;
const PROGRESS_PLAYER_RESAMPLE_MS = 450;
const USER_PLAYBACK_INTERACTION_GRACE_MS = 2200;
const END_ADVANCE_REMAINING_SECONDS = 0.24;

const normalizeProgressRatio = (value) => Math.min(1, Math.max(0, Number(value) || 0));

const getYouTubeTrailerThumbnailUrl = (videoId) => (
  videoId
    ? `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`
    : ''
);

const isLikelyMobileAutoplayEnvironment = () => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && (
    window.matchMedia('(pointer: coarse)').matches
    || window.matchMedia('(max-width: 768px)').matches
  )
);

const YouTubeTrailerPlayer = forwardRef(function YouTubeTrailerPlayer({
  trailer,
  title = 'Trailer',
  autoplay = false,
  controls = true,
  loop = false,
  muted = true,
  allowPersistentAutoplayUnmute = false,
  muteChangeToken = 0,
  restartToken = 0,
  deferVisibilityUntilPlaying = false,
  className = '',
  onError,
  onEnded,
  onPlaybackStart,
  onPlaybackStalled,
  onMuteStateChange,
  onProgressChange,
}, ref) {
  const hostRef = useRef(null);
  const playerRef = useRef(null);
  const readyRef = useRef(false);
  const playbackRetryTimeoutIdsRef = useRef([]);
  const bufferRecoveryTimeoutIdsRef = useRef([]);
  const unmuteRetryTimeoutIdsRef = useRef([]);
  const autoplayRef = useRef(autoplay);
  const mutedRef = useRef(muted);
  const allowPersistentAutoplayUnmuteRef = useRef(allowPersistentAutoplayUnmute);
  const onEndedRef = useRef(onEnded);
  const onPlaybackStartRef = useRef(onPlaybackStart);
  const onPlaybackStalledRef = useRef(onPlaybackStalled);
  const onMuteStateChangeRef = useRef(onMuteStateChange);
  const onProgressChangeRef = useRef(onProgressChange);
  const playbackStateRef = useRef(null);
  const lastHandledMuteChangeTokenRef = useRef(muteChangeToken);
  const lastHandledRestartTokenRef = useRef(restartToken);
  const autoplayStartupTimeoutIdsRef = useRef([]);
  const autoplayRecoveryRestartCountRef = useRef(0);
  const autoplayBlockedRetryCountRef = useRef(0);
  const playbackStartedOnceRef = useRef(false);
  const preparedWhileIdleRef = useRef(false);
  const endAdvanceRequestedRef = useRef(false);
  const pendingTrustedPlaybackGestureRef = useRef(false);
  const progressAnimationFrameIdRef = useRef(0);
  const progressBaselinePlayerTimeRef = useRef(0);
  const progressBaselineTimestampRef = useRef(0);
  const progressDurationRef = useRef(0);
  const progressLastSampleTimestampRef = useRef(0);
  const progressLastEmittedValueRef = useRef(0);
  const pendingSeekProgressRef = useRef(null);
  const userPlaybackInteractionUntilRef = useRef(0);
  const [playerRestartNonce, setPlayerRestartNonce] = useState(0);
  const normalizedTrailer = normalizeAnimeTrailer(trailer);
  const videoId = normalizedTrailer?.id || '';
  const [isPlaybackVisible, setIsPlaybackVisible] = useState(() => !deferVisibilityUntilPlaying || !autoplay);
  const startupThumbnailSrc = normalizedTrailer?.thumbnail || getYouTubeTrailerThumbnailUrl(videoId);

  useEffect(() => {
    autoplayRef.current = autoplay;
  }, [autoplay]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    allowPersistentAutoplayUnmuteRef.current = allowPersistentAutoplayUnmute;
  }, [allowPersistentAutoplayUnmute]);

  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    onPlaybackStartRef.current = onPlaybackStart;
  }, [onPlaybackStart]);

  useEffect(() => {
    onPlaybackStalledRef.current = onPlaybackStalled;
  }, [onPlaybackStalled]);

  useEffect(() => {
    onMuteStateChangeRef.current = onMuteStateChange;
  }, [onMuteStateChange]);

  useEffect(() => {
    onProgressChangeRef.current = onProgressChange;
  }, [onProgressChange]);

  useLayoutEffect(() => {
    const player = playerRef.current;
    const canStartPreparedPlayer = autoplay && readyRef.current && preparedWhileIdleRef.current && player;
    if (canStartPreparedPlayer) {
      setIsPlaybackVisible(true);
      playbackStateRef.current = null;
      endAdvanceRequestedRef.current = false;
      const userInitiated = hasRecentUserPlaybackInteraction();
      syncDesiredMuteState(player);
      requestPlaybackResume(player, { userInitiated });
      scheduleAutoplayStartupWatch(player);
      return;
    }

    setIsPlaybackVisible(!deferVisibilityUntilPlaying || !autoplay);
  }, [autoplay, deferVisibilityUntilPlaying, playerRestartNonce, videoId]);

  useEffect(() => {
    autoplayRecoveryRestartCountRef.current = 0;
    autoplayBlockedRetryCountRef.current = 0;
    playbackStartedOnceRef.current = false;
    preparedWhileIdleRef.current = false;
    endAdvanceRequestedRef.current = false;
    pendingTrustedPlaybackGestureRef.current = false;
    pendingSeekProgressRef.current = null;
    userPlaybackInteractionUntilRef.current = 0;
    setPlayerRestartNonce(0);
  }, [videoId]);

  const clearPlaybackRetryTimeouts = () => {
    playbackRetryTimeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    playbackRetryTimeoutIdsRef.current = [];
  };

  const clearUnmuteRetryTimeouts = () => {
    unmuteRetryTimeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    unmuteRetryTimeoutIdsRef.current = [];
  };

  const clearBufferRecoveryTimeouts = () => {
    bufferRecoveryTimeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    bufferRecoveryTimeoutIdsRef.current = [];
  };

  const clearAutoplayStartupTimeouts = () => {
    autoplayStartupTimeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    autoplayStartupTimeoutIdsRef.current = [];
  };

  const clearProgressPollInterval = () => {
    if (progressAnimationFrameIdRef.current) {
      window.cancelAnimationFrame(progressAnimationFrameIdRef.current);
      progressAnimationFrameIdRef.current = 0;
    }
  };

  const resetProgressTracking = () => {
    progressBaselinePlayerTimeRef.current = 0;
    progressBaselineTimestampRef.current = 0;
    progressDurationRef.current = 0;
    progressLastSampleTimestampRef.current = 0;
    progressLastEmittedValueRef.current = 0;
  };

  const hasActivePlayback = () => (
    playbackStateRef.current === YT_PLAYER_STATE_PLAYING
    || playbackStateRef.current === YT_PLAYER_STATE_BUFFERING
  );

  const hasStartedPlayback = () => playbackStateRef.current === YT_PLAYER_STATE_PLAYING;

  const markUserPlaybackInteraction = (durationMs = USER_PLAYBACK_INTERACTION_GRACE_MS) => {
    const now = window.performance?.now?.() ?? Date.now();
    userPlaybackInteractionUntilRef.current = now + durationMs;
  };

  const hasRecentUserPlaybackInteraction = () => {
    const now = window.performance?.now?.() ?? Date.now();
    return userPlaybackInteractionUntilRef.current > now;
  };

  const emitMuteState = (player) => {
    if (typeof onMuteStateChangeRef.current !== 'function' || !player) return;

    try {
      onMuteStateChangeRef.current(player.isMuted());
    } catch (_) {
      // Ignore player mute-read failures.
    }
  };

  const emitPlaybackStarted = () => {
    if (typeof onPlaybackStartRef.current !== 'function') return;
    try {
      onPlaybackStartRef.current();
    } catch (_) {
      // Ignore playback start callback failures.
    }
  };

  const emitPlaybackStalled = () => {
    if (typeof onPlaybackStalledRef.current !== 'function') return;
    try {
      onPlaybackStalledRef.current();
    } catch (_) {
      // Ignore playback stalled callback failures.
    }
  };

  const requestEndedAdvance = (player) => {
    if (endAdvanceRequestedRef.current) return true;
    if (typeof onEndedRef.current !== 'function') return false;

    endAdvanceRequestedRef.current = true;
    clearPlaybackRetryTimeouts();
    clearBufferRecoveryTimeouts();
    clearUnmuteRetryTimeouts();
    clearAutoplayStartupTimeouts();
    clearProgressPollInterval();
    emitProgress(1);

    try {
      player?.pauseVideo?.();
    } catch (_) {
      // Ignore end-pause failures.
    }

    try {
      onEndedRef.current();
    } catch (_) {
      // Ignore callback failures.
    }

    return true;
  };

  const requestEndedAdvanceIfNeeded = (player, progressRatio) => {
    if (!autoplayRef.current || !playbackStartedOnceRef.current || endAdvanceRequestedRef.current) return;
    const duration = progressDurationRef.current;
    if (!(duration > 0)) return;

    const remainingSeconds = duration * Math.max(0, 1 - normalizeProgressRatio(progressRatio));
    if (remainingSeconds <= END_ADVANCE_REMAINING_SECONDS) {
      requestEndedAdvance(player);
    }
  };

  const emitProgress = (value, options = {}) => {
    if (typeof onProgressChangeRef.current !== 'function') return;
    const normalizedValue = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
    const nextValue = options.allowDecrease
      ? normalizedValue
      : Math.max(progressLastEmittedValueRef.current, normalizedValue);
    progressLastEmittedValueRef.current = nextValue;
    try {
      onProgressChangeRef.current(nextValue);
    } catch (_) {
      // Ignore progress callback failures.
    }
  };

  const shouldForceMutedForPlaybackStart = (options = {}) => {
    if (mutedRef.current) return true;
    if (!autoplayRef.current) return false;

    const hasUserPlaybackIntent = options.userInitiated === true || hasRecentUserPlaybackInteraction();
    if (hasUserPlaybackIntent) return false;

    return isLikelyMobileAutoplayEnvironment() || !hasActivePlayback();
  };

  const preparePlaybackStart = (player, options = {}) => {
    if (!player || !shouldForceMutedForPlaybackStart(options)) return;

    try {
      player.mute();
      player.setVolume?.(0);
    } catch (_) {
      // Ignore mute preparation failures.
    }
  };

  const samplePlaybackProgress = (player, options = {}) => {
    if (!player) return;

    try {
      const duration = Number(player.getDuration?.()) || 0;
      const currentTime = Number(player.getCurrentTime?.()) || 0;
      if (duration > 0) {
        const now = window.performance?.now?.() ?? Date.now();
        progressDurationRef.current = duration;
        progressBaselinePlayerTimeRef.current = currentTime;
        progressBaselineTimestampRef.current = now;
        progressLastSampleTimestampRef.current = now;
        const progressRatio = currentTime / duration;
        emitProgress(progressRatio, options);
        requestEndedAdvanceIfNeeded(player, progressRatio);
      }
    } catch (_) {
      // Ignore progress-read failures.
    }
  };

  const getEstimatedProgress = (timestamp) => {
    const duration = progressDurationRef.current;
    if (!(duration > 0)) return null;

    const isPlaying = playbackStateRef.current === YT_PLAYER_STATE_PLAYING;
    const elapsedSeconds = isPlaying && progressBaselineTimestampRef.current
      ? Math.max(0, (timestamp - progressBaselineTimestampRef.current) / 1000)
      : 0;
    const estimatedCurrentTime = Math.min(
      duration,
      progressBaselinePlayerTimeRef.current + elapsedSeconds,
    );

    return estimatedCurrentTime / duration;
  };

  const startProgressPolling = (player) => {
    clearProgressPollInterval();
    samplePlaybackProgress(player, { allowDecrease: true });

    const tick = (timestamp) => {
      if (!playerRef.current || playerRef.current !== player) return;

      const shouldResample = (
        !progressLastSampleTimestampRef.current
        || (timestamp - progressLastSampleTimestampRef.current) >= PROGRESS_PLAYER_RESAMPLE_MS
      );
      if (shouldResample) {
        samplePlaybackProgress(player);
      }

      const estimatedProgress = getEstimatedProgress(timestamp);
      if (estimatedProgress !== null) {
        emitProgress(estimatedProgress);
        requestEndedAdvanceIfNeeded(player, estimatedProgress);
      }

      progressAnimationFrameIdRef.current = window.requestAnimationFrame(tick);
    };

    progressAnimationFrameIdRef.current = window.requestAnimationFrame(tick);
  };

  const requestDeferredUnmute = (player, options = {}) => {
    if (options.userInitiated === true) {
      markUserPlaybackInteraction();
    }

    if (!player || mutedRef.current) {
      clearUnmuteRetryTimeouts();
      emitMuteState(player);
      return;
    }

    const isMobileAutoplayEnvironment = isLikelyMobileAutoplayEnvironment();
    const isPlaybackActive = hasActivePlayback();
    const allowAutoplayUnmute = (
      options.userInitiated === true
      || hasRecentUserPlaybackInteraction()
      || (!isMobileAutoplayEnvironment && allowPersistentAutoplayUnmuteRef.current && isPlaybackActive)
    );
    if (!allowAutoplayUnmute) {
      clearUnmuteRetryTimeouts();
      emitMuteState(player);
      return;
    }

    const attemptUnmute = () => {
      try {
        player.unMute();
      } catch (_) {
        // Ignore unmute failures.
      }
      if (options.userInitiated === true || !isMobileAutoplayEnvironment) {
        try {
          player.playVideo();
        } catch (_) {
          // Ignore playback resume failures.
        }
      }
      emitMuteState(player);
    };

    attemptUnmute();
    clearUnmuteRetryTimeouts();
    unmuteRetryTimeoutIdsRef.current = [
      window.setTimeout(attemptUnmute, 120),
      window.setTimeout(attemptUnmute, 320),
      window.setTimeout(attemptUnmute, 720),
      window.setTimeout(attemptUnmute, 1400),
    ];
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

  const requestPlaybackResume = (player, options = {}) => {
    if (!autoplayRef.current || !player) return;

    const attemptPlay = () => {
      preparePlaybackStart(player, options);
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

  const seekPlayerToProgress = (player, progressRatio, options = {}) => {
    const normalizedProgress = normalizeProgressRatio(progressRatio);
    if (options.userInitiated === true) {
      markUserPlaybackInteraction();
    }
    if (!player) {
      pendingSeekProgressRef.current = normalizedProgress;
      return true;
    }

    let duration = 0;
    try {
      duration = Number(player.getDuration?.()) || 0;
    } catch (_) {
      duration = 0;
    }

    if (!(duration > 0)) {
      pendingSeekProgressRef.current = normalizedProgress;
      return true;
    }

    pendingSeekProgressRef.current = null;
    const targetTime = duration * normalizedProgress;

    try {
      player.seekTo(targetTime, true);
    } catch (_) {
      pendingSeekProgressRef.current = normalizedProgress;
      return false;
    }

    const now = window.performance?.now?.() ?? Date.now();
    progressDurationRef.current = duration;
    progressBaselinePlayerTimeRef.current = targetTime;
    progressBaselineTimestampRef.current = now;
    progressLastSampleTimestampRef.current = now;
    emitProgress(normalizedProgress, { allowDecrease: true });

    syncDesiredMuteState(player, {
      userInitiated: options.userInitiated === true,
    });
    requestDeferredUnmute(player, {
      userInitiated: options.userInitiated === true,
    });

    if (options.resumePlayback !== false) {
      requestPlaybackResume(player, {
        userInitiated: options.userInitiated === true,
      });
      scheduleAutoplayStartupWatch(player);
    }

    emitMuteState(player);
    return true;
  };

  const flushPendingSeekProgress = (player, options = {}) => {
    if (pendingSeekProgressRef.current == null) return;
    seekPlayerToProgress(player, pendingSeekProgressRef.current, options);
  };

  useImperativeHandle(ref, () => ({
    seekToProgress(progressRatio, options = {}) {
      return seekPlayerToProgress(playerRef.current, progressRatio, options);
    },
  }), []);

  const requestAutoplayPlayerRecovery = () => {
    if (!autoplayRef.current) return false;
    if (hasActivePlayback()) return false;
    if (autoplayRecoveryRestartCountRef.current >= MAX_AUTOPLAY_PLAYER_RECOVERY_RESTARTS) {
      return false;
    }

    autoplayRecoveryRestartCountRef.current += 1;
    autoplayBlockedRetryCountRef.current = 0;
    readyRef.current = false;
    playbackStateRef.current = null;
    clearPlaybackRetryTimeouts();
    clearUnmuteRetryTimeouts();
    clearAutoplayStartupTimeouts();
    setIsPlaybackVisible(!deferVisibilityUntilPlaying || !autoplayRef.current);
    setPlayerRestartNonce((prev) => prev + 1);
    return true;
  };

  const scheduleBufferRecoveryWatch = (player) => {
    if (!autoplayRef.current || !player || !playbackStartedOnceRef.current) {
      clearBufferRecoveryTimeouts();
      return;
    }

    clearBufferRecoveryTimeouts();
    const attemptResume = () => {
      if (playbackStateRef.current !== YT_PLAYER_STATE_BUFFERING) return;
      requestPlaybackResume(player);
    };
    const attemptRecovery = () => {
      if (playbackStateRef.current !== YT_PLAYER_STATE_BUFFERING) return;
      try {
        const currentTime = Number(player.getCurrentTime?.()) || 0;
        player.seekTo(currentTime, true);
      } catch (_) {
        // Ignore recovery seek failures.
      }
      requestPlaybackResume(player);
    };

    bufferRecoveryTimeoutIdsRef.current = [
      window.setTimeout(attemptResume, BUFFER_STALL_SOFT_RETRY_MS),
      window.setTimeout(attemptRecovery, BUFFER_STALL_HARD_RETRY_MS),
    ];
  };

  const scheduleAutoplayStartupWatch = (player) => {
    if (!autoplayRef.current || !player) {
      clearAutoplayStartupTimeouts();
      return;
    }

    clearAutoplayStartupTimeouts();
    const retryStartup = () => {
      if (hasStartedPlayback()) return;
      if (playbackStateRef.current === YT_PLAYER_STATE_BUFFERING) {
        requestPlaybackResume(player);
        return;
      }

      try {
        player.seekTo(0, true);
      } catch (_) {
        // Ignore seek failures.
      }
      requestPlaybackResume(player);
    };

    const recoverPlayer = () => {
      if (hasStartedPlayback()) return;
      if (playbackStateRef.current === YT_PLAYER_STATE_BUFFERING) {
        requestPlaybackResume(player);
        return;
      }
      if (requestAutoplayPlayerRecovery()) return;
      emitPlaybackStalled();
    };

    const markStalled = () => {
      if (hasStartedPlayback()) return;
      if (playbackStateRef.current === YT_PLAYER_STATE_BUFFERING) return;
      emitPlaybackStalled();
    };

    const markBufferedStartupStalled = () => {
      if (hasStartedPlayback()) return;
      if (playbackStateRef.current !== YT_PLAYER_STATE_BUFFERING) return;
      emitPlaybackStalled();
    };

    autoplayStartupTimeoutIdsRef.current = [
      window.setTimeout(retryStartup, AUTOPLAY_STARTUP_SOFT_RETRY_MS),
      window.setTimeout(recoverPlayer, AUTOPLAY_STARTUP_RECOVERY_MS),
      window.setTimeout(markStalled, AUTOPLAY_STARTUP_STALL_MS),
      window.setTimeout(markBufferedStartupStalled, AUTOPLAY_STARTUP_BUFFER_STALL_MS),
    ];
  };

  const syncDesiredMuteState = (player, options = {}) => {
    if (!player) return;

    try {
      if (shouldForceMutedForPlaybackStart(options)) {
        player.mute();
        if (mutedRef.current) {
          clearUnmuteRetryTimeouts();
        }
      } else {
        player.unMute();
      }
      emitMuteState(player);
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
            enablejsapi: 1,
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
              preparedWhileIdleRef.current = !autoplayRef.current;
              endAdvanceRequestedRef.current = false;
              resetProgressTracking();
              emitProgress(0, { allowDecrease: true });
              syncIframeAttributes(event.target);
              syncDesiredMuteState(event.target);

              const shouldUsePendingGesture = pendingTrustedPlaybackGestureRef.current || hasRecentUserPlaybackInteraction();
              pendingTrustedPlaybackGestureRef.current = false;
              requestPlaybackResume(event.target, {
                userInitiated: shouldUsePendingGesture,
              });
              scheduleAutoplayStartupWatch(event.target);
              flushPendingSeekProgress(event.target, { resumePlayback: false });

              markAnimeTrailerPlayable(normalizedTrailer);
            },
            onStateChange: (event) => {
              playbackStateRef.current = Number(event?.data);
              const isPlayingState = event?.data === YT.PlayerState.PLAYING;
              const isBufferingState = event?.data === YT.PlayerState.BUFFERING;
              // Reveal only after real playback starts so YouTube's startup chrome never flashes.
              if (isPlayingState || (isBufferingState && playbackStartedOnceRef.current)) {
                setIsPlaybackVisible(true);
                flushPendingSeekProgress(event.target, {
                  userInitiated: false,
                  resumePlayback: false,
                });
              }

              if (isPlayingState) {
                autoplayBlockedRetryCountRef.current = 0;
                preparedWhileIdleRef.current = false;
                playbackStartedOnceRef.current = true;
                clearBufferRecoveryTimeouts();
                startProgressPolling(event.target);
                clearAutoplayStartupTimeouts();
                emitPlaybackStarted();
                syncDesiredMuteState(event.target);
                requestDeferredUnmute(event.target);
              }

              if (isBufferingState) {
                scheduleBufferRecoveryWatch(event.target);
              }

              if (event?.data === YT.PlayerState.ENDED) {
                if (requestEndedAdvance(event.target)) return;
                clearBufferRecoveryTimeouts();
                clearProgressPollInterval();
                emitProgress(1);
                setIsPlaybackVisible(false);
              }

              if (event?.data === YT.PlayerState.PAUSED || event?.data === YT.PlayerState.CUED) {
                clearBufferRecoveryTimeouts();
                clearProgressPollInterval();
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
              clearBufferRecoveryTimeouts();
              clearProgressPollInterval();
              resetProgressTracking();
              clearAutoplayStartupTimeouts();
              emitPlaybackStalled();
              markAnimeTrailerUnplayable(normalizedTrailer, { errorCode });
              if (typeof onError === 'function') {
                onError(errorCode);
              }
            },
            onAutoplayBlocked: (event) => {
              if (cancelled || !autoplayRef.current) return;
              if (autoplayBlockedRetryCountRef.current >= 2) return;
              autoplayBlockedRetryCountRef.current += 1;
              const blockedPlayer = event?.target || playerRef.current || localPlayer;
              preparePlaybackStart(blockedPlayer);
              window.setTimeout(() => {
                if (cancelled || !autoplayRef.current || hasStartedPlayback()) return;
                requestPlaybackResume(blockedPlayer);
                scheduleAutoplayStartupWatch(blockedPlayer);
              }, 180);
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
      playbackStartedOnceRef.current = false;
      clearPlaybackRetryTimeouts();
      clearBufferRecoveryTimeouts();
      clearUnmuteRetryTimeouts();
      clearAutoplayStartupTimeouts();
      clearProgressPollInterval();
      resetProgressTracking();
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
  }, [controls, loop, playerRestartNonce, videoId]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !readyRef.current) return;

    if (autoplay) {
      playbackStateRef.current = null;
      autoplayBlockedRetryCountRef.current = 0;
      endAdvanceRequestedRef.current = false;
      clearBufferRecoveryTimeouts();
      syncDesiredMuteState(player);
      scheduleAutoplayStartupWatch(player);
      try {
        player.seekTo(0, true);
      } catch (_) {
        // Ignore seek failures.
      }
      requestPlaybackResume(player);
      return;
    }

    preparedWhileIdleRef.current = true;
    endAdvanceRequestedRef.current = false;
    pendingTrustedPlaybackGestureRef.current = false;
    clearPlaybackRetryTimeouts();
    clearBufferRecoveryTimeouts();
    clearUnmuteRetryTimeouts();
    clearAutoplayStartupTimeouts();
    clearProgressPollInterval();
    resetProgressTracking();
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

    const userInitiatedMuteChange = muteChangeToken !== lastHandledMuteChangeTokenRef.current;
    lastHandledMuteChangeTokenRef.current = muteChangeToken;
    if (userInitiatedMuteChange) {
      markUserPlaybackInteraction();
    }

    syncDesiredMuteState(player, {
      userInitiated: userInitiatedMuteChange,
    });
    requestDeferredUnmute(player, {
      userInitiated: userInitiatedMuteChange,
    });
    if (autoplay) {
      requestPlaybackResume(player, {
        userInitiated: userInitiatedMuteChange,
      });
      scheduleAutoplayStartupWatch(player);
    }
  }, [autoplay, muted, videoId, muteChangeToken]);

  useEffect(() => {
    if (!autoplay || typeof window === 'undefined') return undefined;

    const handleTrustedPlaybackGesture = () => {
      if (hasStartedPlayback()) return;

      const player = playerRef.current;
      markUserPlaybackInteraction();
      if (!player || !readyRef.current) {
        pendingTrustedPlaybackGestureRef.current = true;
        return;
      }

      syncDesiredMuteState(player, { userInitiated: true });
      requestPlaybackResume(player, { userInitiated: true });
      scheduleAutoplayStartupWatch(player);
    };

    const listenerOptions = { capture: true, passive: true };
    window.addEventListener('pointerdown', handleTrustedPlaybackGesture, listenerOptions);
    window.addEventListener('touchend', handleTrustedPlaybackGesture, listenerOptions);
    window.addEventListener('keydown', handleTrustedPlaybackGesture, true);

    return () => {
      window.removeEventListener('pointerdown', handleTrustedPlaybackGesture, listenerOptions);
      window.removeEventListener('touchend', handleTrustedPlaybackGesture, listenerOptions);
      window.removeEventListener('keydown', handleTrustedPlaybackGesture, true);
    };
  }, [autoplay, videoId]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !readyRef.current) return;

    const shouldRestart = restartToken !== lastHandledRestartTokenRef.current;
    lastHandledRestartTokenRef.current = restartToken;
    if (!shouldRestart) return;

    playbackStateRef.current = null;
    playbackStartedOnceRef.current = false;
    autoplayBlockedRetryCountRef.current = 0;
    preparedWhileIdleRef.current = false;
    endAdvanceRequestedRef.current = false;
    pendingTrustedPlaybackGestureRef.current = false;
    clearPlaybackRetryTimeouts();
    clearBufferRecoveryTimeouts();
    clearUnmuteRetryTimeouts();
    clearAutoplayStartupTimeouts();
    clearProgressPollInterval();
    resetProgressTracking();
    emitProgress(0, { allowDecrease: true });
    setIsPlaybackVisible(!deferVisibilityUntilPlaying || !autoplay);

    try {
      player.pauseVideo?.();
    } catch (_) {
      // Ignore pause failures.
    }

    try {
      player.seekTo(0, true);
    } catch (_) {
      // Ignore seek failures.
    }

    syncDesiredMuteState(player);

    if (autoplay) {
      requestPlaybackResume(player);
      scheduleAutoplayStartupWatch(player);
      return;
    }

    emitMuteState(player);
  }, [autoplay, deferVisibilityUntilPlaying, restartToken, videoId]);

  return (
    <div
      className={`youtube-trailer-player${deferVisibilityUntilPlaying ? ' defer-visibility' : ''}${isPlaybackVisible ? ' is-playback-visible' : ''}${className ? ` ${className}` : ''}`.trim()}
    >
      <div
        ref={hostRef}
        className="youtube-trailer-player-slot"
        aria-label={title}
      />
      {deferVisibilityUntilPlaying && !isPlaybackVisible && (
        <div className="youtube-trailer-player-startup-cover" aria-hidden="true">
          {startupThumbnailSrc ? (
            <img
              src={startupThumbnailSrc}
              alt=""
              className="youtube-trailer-player-startup-cover-image"
              loading="eager"
              decoding="async"
            />
          ) : null}
        </div>
      )}
    </div>
  );
});

export default YouTubeTrailerPlayer;
