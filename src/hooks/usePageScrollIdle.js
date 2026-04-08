import { useEffect, useState } from 'react';

const SCROLL_IDLE_DELAY_MS = 180;

const subscribers = new Set();
let currentIsScrollIdle = true;
let idleTimerId = null;
let detachWindowListeners = null;

const notifySubscribers = () => {
  subscribers.forEach((listener) => {
    try {
      listener(currentIsScrollIdle);
    } catch (_) {
      // Ignore subscriber failures to keep the shared store healthy.
    }
  });
};

const setScrollIdleState = (nextIsIdle) => {
  if (currentIsScrollIdle === nextIsIdle) return;
  currentIsScrollIdle = nextIsIdle;
  notifySubscribers();
};

const scheduleIdleRestore = () => {
  if (typeof window === 'undefined') return;
  if (idleTimerId) {
    window.clearTimeout(idleTimerId);
  }
  idleTimerId = window.setTimeout(() => {
    idleTimerId = null;
    setScrollIdleState(true);
  }, SCROLL_IDLE_DELAY_MS);
};

const handleScrollActivity = () => {
  setScrollIdleState(false);
  scheduleIdleRestore();
};

const ensureWindowListeners = () => {
  if (typeof window === 'undefined' || detachWindowListeners) return;

  const listenerOptions = { passive: true };
  window.addEventListener('scroll', handleScrollActivity, listenerOptions);
  window.addEventListener('wheel', handleScrollActivity, listenerOptions);
  window.addEventListener('touchmove', handleScrollActivity, listenerOptions);

  detachWindowListeners = () => {
    window.removeEventListener('scroll', handleScrollActivity, listenerOptions);
    window.removeEventListener('wheel', handleScrollActivity, listenerOptions);
    window.removeEventListener('touchmove', handleScrollActivity, listenerOptions);
  };
};

const maybeReleaseWindowListeners = () => {
  if (subscribers.size > 0 || !detachWindowListeners) return;

  detachWindowListeners();
  detachWindowListeners = null;

  if (typeof window !== 'undefined' && idleTimerId) {
    window.clearTimeout(idleTimerId);
  }
  idleTimerId = null;
  currentIsScrollIdle = true;
};

function usePageScrollIdle() {
  const [isScrollIdle, setIsScrollIdle] = useState(() => (
    typeof window === 'undefined' ? true : currentIsScrollIdle
  ));

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    ensureWindowListeners();
    subscribers.add(setIsScrollIdle);
    setIsScrollIdle(currentIsScrollIdle);

    return () => {
      subscribers.delete(setIsScrollIdle);
      maybeReleaseWindowListeners();
    };
  }, []);

  return isScrollIdle;
}

export default usePageScrollIdle;
