import { useEffect, useState } from 'react';
import { loadYouTubeIframeApi } from '../services/youtubePlayerService';
import {
  getAnimeTrailerPlaybackStatus,
  markAnimeTrailerPlayable,
  markAnimeTrailerUnplayable,
  normalizeAnimeTrailer,
  subscribeTrailerPlaybackStatus,
} from '../utils/trailer';

const pendingProbeMap = new Map();
const probeTaskQueue = [];
const MAX_CONCURRENT_PROBES = 2;
const MOBILE_MAX_CONCURRENT_PROBES = 1;
const MIN_YOUTUBE_PLAYER_VIEWPORT_PX = 200;
const DEFAULT_PROBE_PRIORITY = 0;
export const TRAILER_PROBE_PRIORITY_USER_INITIATED = 1000;
let activeProbeCount = 0;
let probeTaskSequence = 0;

const getMaxConcurrentProbes = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return MAX_CONCURRENT_PROBES;
  }

  const isMobileLikeEnvironment = window.matchMedia('(pointer: coarse)').matches
    || window.matchMedia('(max-width: 768px)').matches;

  return isMobileLikeEnvironment
    ? MOBILE_MAX_CONCURRENT_PROBES
    : MAX_CONCURRENT_PROBES;
};

const normalizeProbePriority = (value, fallback = DEFAULT_PROBE_PRIORITY) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const sortProbeTaskQueue = () => {
  probeTaskQueue.sort((left, right) => {
    const priorityDelta = normalizeProbePriority(right.priority) - normalizeProbePriority(left.priority);
    if (priorityDelta !== 0) return priorityDelta;
    return left.sequence - right.sequence;
  });
};

const runQueuedProbes = () => {
  while (activeProbeCount < getMaxConcurrentProbes() && probeTaskQueue.length > 0) {
    const nextTask = probeTaskQueue.shift();
    if (!nextTask) return;
    activeProbeCount += 1;
    nextTask.started = true;
    nextTask.run()
      .then(nextTask.resolve)
      .catch(nextTask.reject)
      .finally(() => {
        activeProbeCount = Math.max(0, activeProbeCount - 1);
        runQueuedProbes();
      });
  }
};

const enqueueProbeTask = ({ videoId, priority, run }) => {
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  const task = {
    videoId,
    priority: normalizeProbePriority(priority),
    run,
    resolve: resolvePromise,
    reject: rejectPromise,
    sequence: probeTaskSequence++,
    started: false,
  };
  probeTaskQueue.push(task);
  sortProbeTaskQueue();
  runQueuedProbes();
  return { promise, task };
};

const reprioritizePendingProbe = (pendingEntry, nextPriority) => {
  const task = pendingEntry?.task;
  const normalizedPriority = normalizeProbePriority(nextPriority);
  if (!task || task.started || task.priority >= normalizedPriority) return;
  task.priority = normalizedPriority;
  sortProbeTaskQueue();
};

const createProbeContainer = () => {
  const node = document.createElement('div');
  node.setAttribute('aria-hidden', 'true');
  node.style.position = 'fixed';
  node.style.width = `${MIN_YOUTUBE_PLAYER_VIEWPORT_PX}px`;
  node.style.height = `${MIN_YOUTUBE_PLAYER_VIEWPORT_PX}px`;
  node.style.opacity = '0';
  node.style.pointerEvents = 'none';
  node.style.left = '-9999px';
  node.style.top = '0';
  node.style.overflow = 'hidden';
  document.body.appendChild(node);
  return node;
};

export const probeAnimeTrailerPlayback = async (animeOrTrailer, options = {}) => {
  const trailer = normalizeAnimeTrailer(animeOrTrailer);
  if (!trailer) return false;
  const requestedPriority = normalizeProbePriority(options.priority);

  const currentStatus = getAnimeTrailerPlaybackStatus(trailer);
  if (currentStatus === 'playable') return true;
  if (currentStatus === 'invalid') return false;

  const pendingEntry = pendingProbeMap.get(trailer.id);
  if (pendingEntry) {
    reprioritizePendingProbe(pendingEntry, requestedPriority);
    return pendingEntry.promise;
  }

  const { promise: probePromise, task } = enqueueProbeTask({
    videoId: trailer.id,
    priority: requestedPriority,
    run: () => loadYouTubeIframeApi()
      .then((YT) => new Promise((resolve) => {
        const container = createProbeContainer();
        const timeoutMs = Math.max(2500, Number(options.timeoutMs) || 5000);
        let settled = false;
        let player = null;
        let timeoutId = null;

        const finish = (playable, errorCode = 0) => {
          if (settled) return;
          settled = true;

          if (timeoutId) {
            window.clearTimeout(timeoutId);
            timeoutId = null;
          }

          if (playable) {
            markAnimeTrailerPlayable(trailer);
          } else {
            markAnimeTrailerUnplayable(trailer, { errorCode });
          }

          try {
            player?.stopVideo?.();
          } catch (_) {
            // Ignore teardown failures.
          }
          try {
            player?.destroy?.();
          } catch (_) {
            // Ignore teardown failures.
          }
          if (container.parentNode) {
            container.parentNode.removeChild(container);
          }
          resolve(playable);
        };

        timeoutId = window.setTimeout(() => finish(false, 408), timeoutMs);

        player = new YT.Player(container, {
          videoId: trailer.id,
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
          },
          events: {
            onReady: (event) => {
              try {
                event.target.cueVideoById(trailer.id);
              } catch (_) {
                finish(false, 500);
              }
            },
            onStateChange: (event) => {
              if (
                event.data === YT.PlayerState.CUED
                || event.data === YT.PlayerState.BUFFERING
                || event.data === YT.PlayerState.PLAYING
              ) {
                finish(true, 0);
              }
            },
            onError: (event) => {
              finish(false, Number(event.data) || 0);
            },
          },
        });
      }))
      .catch(() => {
        markAnimeTrailerUnplayable(trailer, { errorCode: 0 });
        return false;
      })
      .finally(() => {
        pendingProbeMap.delete(trailer.id);
      }),
  });

  pendingProbeMap.set(trailer.id, { promise: probePromise, task });
  return probePromise;
};

function useTrailerPlaybackStatus(animeOrTrailer, options = {}) {
  const trailer = normalizeAnimeTrailer(animeOrTrailer);
  const trailerId = trailer?.id || '';
  const [status, setStatus] = useState(() => getAnimeTrailerPlaybackStatus(trailer));

  useEffect(() => {
    setStatus(getAnimeTrailerPlaybackStatus(trailer));
    if (!trailerId) return undefined;

    const unsubscribe = subscribeTrailerPlaybackStatus((event) => {
      if (event?.videoId !== trailerId) return;
      setStatus(event.status || getAnimeTrailerPlaybackStatus(trailer));
    });

    return unsubscribe;
  }, [trailerId]);

  useEffect(() => {
    if (!options.autoProbe || !trailer || status !== 'unknown') return undefined;

    let cancelled = false;
    probeAnimeTrailerPlayback(trailer, {
      timeoutMs: options.timeoutMs,
      priority: options.probePriority,
    })
      .then((playable) => {
        if (cancelled) return;
        setStatus(playable ? 'playable' : getAnimeTrailerPlaybackStatus(trailer));
      });

    return () => {
      cancelled = true;
    };
  }, [options.autoProbe, options.timeoutMs, options.probePriority, trailerId, status]);

  return {
    trailer,
    status,
    hasTrailer: Boolean(trailer),
    canRenderTrailer: Boolean(trailer) && status !== 'invalid',
    isTrailerPlayable: status === 'playable',
    isTrailerInvalid: status === 'invalid',
  };
}

export default useTrailerPlaybackStatus;
