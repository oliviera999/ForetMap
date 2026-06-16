import { useCallback, useEffect, useRef, useState } from 'react';
import { isElementScrollRevealVisible } from '../utils/motionMath.js';

/**
 * Révèle un élément au scroll (remplacement léger d'AOS).
 * @param {{ rootMargin?: string, threshold?: number, once?: boolean }} [options]
 */
export function useScrollReveal(options = {}) {
  const { rootMargin = '0px 0px -80px 0px', threshold = 0.08, once = true } = options;
  const [visible, setVisible] = useState(false);
  const elementRef = useRef(null);
  const observerRef = useRef(null);

  const disconnectObserver = useCallback(() => {
    observerRef.current?.disconnect();
    observerRef.current = null;
  }, []);

  const attachReveal = useCallback(
    (el) => {
      disconnectObserver();
      if (!el) return;

      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setVisible(true);
        return;
      }

      const revealIfVisible = () => {
        if (!isElementScrollRevealVisible(el, { rootMargin, threshold })) return false;
        setVisible(true);
        return true;
      };

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting) {
            setVisible(true);
            if (once) observer.disconnect();
          } else if (!once) {
            setVisible(false);
          }
        },
        { rootMargin, threshold },
      );

      observerRef.current = observer;
      observer.observe(el);

      requestAnimationFrame(() => {
        if (revealIfVisible() && once) observer.disconnect();
      });
    },
    [disconnectObserver, once, rootMargin, threshold],
  );

  const setRef = useCallback(
    (node) => {
      elementRef.current = node;
      attachReveal(node);
    },
    [attachReveal],
  );

  useEffect(
    () => () => {
      disconnectObserver();
    },
    [disconnectObserver],
  );

  useEffect(() => {
    if (elementRef.current) attachReveal(elementRef.current);
  }, [attachReveal]);

  return [setRef, visible];
}
