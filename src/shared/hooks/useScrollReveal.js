import { useEffect, useRef, useState } from 'react';

/**
 * Révèle un élément au scroll (remplacement léger d'AOS).
 * @param {{ rootMargin?: string, threshold?: number, once?: boolean }} [options]
 */
export function useScrollReveal(options = {}) {
  const {
    rootMargin = '0px 0px -80px 0px',
    threshold = 0.08,
    once = true,
  } = options;
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return undefined;
    }

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

    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin, threshold, once]);

  return [ref, visible];
}
