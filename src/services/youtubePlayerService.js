let youtubeIframeApiPromise = null;

export const loadYouTubeIframeApi = async () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('YouTube Iframe API is unavailable outside the browser.');
  }

  if (window.YT?.Player) {
    return window.YT;
  }

  if (youtubeIframeApiPromise) {
    return youtubeIframeApiPromise;
  }

  youtubeIframeApiPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[data-youtube-iframe-api="true"]');
    const previousReady = window.onYouTubeIframeAPIReady;
    let settled = false;

    const finishResolve = () => {
      if (settled) return;
      settled = true;
      resolve(window.YT);
    };

    const finishReject = (error) => {
      if (settled) return;
      settled = true;
      youtubeIframeApiPromise = null;
      reject(error);
    };

    window.onYouTubeIframeAPIReady = () => {
      if (typeof previousReady === 'function') {
        try {
          previousReady();
        } catch (_) {
          // Ignore third-party callback failures.
        }
      }
      finishResolve();
    };

    if (!existingScript) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.dataset.youtubeIframeApi = 'true';
      script.onerror = () => finishReject(new Error('Failed to load YouTube Iframe API.'));
      document.head.appendChild(script);
    }

    window.setTimeout(() => {
      if (window.YT?.Player) {
        finishResolve();
        return;
      }
      finishReject(new Error('Timed out while loading the YouTube Iframe API.'));
    }, 15000);
  });

  return youtubeIframeApiPromise;
};
