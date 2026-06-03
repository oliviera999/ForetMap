import { useEffect, useState } from 'react';
import { countUpValue } from '../utils/motionMath.js';
import { useScrollReveal } from './useScrollReveal.js';

/**
 * Anime un nombre lorsqu'il entre dans le viewport.
 * @param {number|string} end
 * @param {{ start?: number, duration?: number, enabled?: boolean }} [options]
 */
export function useCountUp(end, options = {}) {
  const {
    start = 0,
    duration = 1200,
    enabled = true,
  } = options;
  const [ref, visible] = useScrollReveal({ once: true, threshold: 0.2 });
  const endNum = Number(end);
  const canAnimate = enabled && Number.isFinite(endNum);
  const [value, setValue] = useState(canAnimate ? start : end);

  useEffect(() => {
    if (!canAnimate) {
      setValue(end);
      return undefined;
    }
    if (!visible) {
      setValue(start);
      return undefined;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(endNum);
      return undefined;
    }

    const startTime = performance.now();
    let raf = 0;

    const tick = (now) => {
      const t = Math.min(1, (now - startTime) / duration);
      setValue(countUpValue(start, endNum, t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [canAnimate, visible, start, endNum, end, duration]);

  return { ref, value, visible };
}
