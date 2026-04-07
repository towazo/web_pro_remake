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

const createProbeContainer = () => {
  const node = document.createElement('div');
  node.setAttribute('aria-hidden', 'true');
  node.style.position = 'fixed';
  node.style.width = '1px';
  node.style.height = '1px';
  node.style.opacity = '0';
  node.style.pointerEvents = 'none';
  node.style.left = '-9999px';
  node.style.top = '0';
  document.body.appendChild(node);
  return node;
};

export const probeAnimeTrailerPlayback = async (animeOrTrailer, options = {}) => {
  const trailer = normalizeAnimeTrailer(animeOrTrailer);
  if (!trailer) return false;

  const currentStatus = getAnimeTrailerPlaybackStatus(trailer);
  if (currentStatus === 'playable') return true;
  if (currentStatus === 'invalid') return false;

  if (pendingProbeMap.has(trailer.id)) {
    return pendingProbeMap.get(trailer.id);
  }

  const probePromise = loadYouTubeIframeApi()
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
    });

  pendingProbeMap.set(trailer.id, probePromise);
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
    probeAnimeTrailerPlayback(trailer, { timeoutMs: options.timeoutMs })
      .then((playable) => {
        if (cancelled) return;
        setStatus(playable ? 'playable' : getAnimeTrailerPlaybackStatus(trailer));
      });

    return () => {
      cancelled = true;
    };
  }, [options.autoProbe, options.timeoutMs, trailerId, status]);

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
