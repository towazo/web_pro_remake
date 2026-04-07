import { useEffect, useState } from 'react';

const DEFAULT_ROOT_MARGIN = '260px 0px 360px 0px';
const DEFAULT_PRIORITY = 160;
const DEFAULT_THRESHOLD = [0, 0.01, 0.35, 0.75];

const getViewportHeight = () => {
  if (typeof window === 'undefined') return 0;
  return Number(window.innerHeight) || Number(document.documentElement?.clientHeight) || 0;
};

const buildProbePriority = (entry) => {
  const viewportHeight = getViewportHeight();
  if (!entry || viewportHeight <= 0) return DEFAULT_PRIORITY;

  const rect = entry.boundingClientRect;
  const elementCenter = rect.top + (rect.height / 2);
  const viewportCenter = viewportHeight / 2;
  const centerDistance = Math.abs(elementCenter - viewportCenter);
  const centerBonus = Math.max(0, 180 - Math.round(centerDistance / 4));
  const visibilityBonus = Math.round(
    Math.max(0, Math.min(1, Number(entry.intersectionRatio) || 0)) * 180
  );

  return DEFAULT_PRIORITY + centerBonus + visibilityBonus;
};

function useViewportTrailerPriority(targetRef, options = {}) {
  const enabled = options.enabled !== false;
  const targetNode = targetRef?.current ?? null;
  const [state, setState] = useState(() => ({
    shouldAutoProbe: typeof window === 'undefined' ? enabled : false,
    probePriority: enabled ? DEFAULT_PRIORITY : 0,
  }));

  useEffect(() => {
    if (!enabled) {
      setState((prev) => (
        prev.shouldAutoProbe === false && prev.probePriority === 0
          ? prev
          : { shouldAutoProbe: false, probePriority: 0 }
      ));
      return undefined;
    }

    if (typeof window === 'undefined') {
      setState((prev) => (
        prev.shouldAutoProbe === true && prev.probePriority === DEFAULT_PRIORITY
          ? prev
          : { shouldAutoProbe: true, probePriority: DEFAULT_PRIORITY }
      ));
      return undefined;
    }

    if (!targetNode) return undefined;

    if (typeof window.IntersectionObserver !== 'function') {
      setState((prev) => (
        prev.shouldAutoProbe === true && prev.probePriority === DEFAULT_PRIORITY
          ? prev
          : { shouldAutoProbe: true, probePriority: DEFAULT_PRIORITY }
      ));
      return undefined;
    }

    const rootMargin = typeof options.rootMargin === 'string' && options.rootMargin.trim()
      ? options.rootMargin
      : DEFAULT_ROOT_MARGIN;

    const observer = new window.IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      const viewportHeight = getViewportHeight();
      const rect = entry.boundingClientRect;
      const isNearViewport = entry.isIntersecting
        || (
          viewportHeight > 0
          && rect.top <= viewportHeight + 320
          && rect.bottom >= -220
        );

      const nextState = isNearViewport
        ? {
          shouldAutoProbe: true,
          probePriority: buildProbePriority(entry),
        }
        : {
          shouldAutoProbe: false,
          probePriority: 0,
        };

      setState((prev) => (
        prev.shouldAutoProbe === nextState.shouldAutoProbe
          && prev.probePriority === nextState.probePriority
          ? prev
          : nextState
      ));
    }, {
      rootMargin,
      threshold: DEFAULT_THRESHOLD,
    });

    observer.observe(targetNode);
    return () => {
      observer.disconnect();
    };
  }, [enabled, options.rootMargin, targetNode]);

  return state;
}

export default useViewportTrailerPriority;
