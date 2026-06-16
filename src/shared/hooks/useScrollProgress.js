import { useEffect, useRef, useState } from 'react';
import { computeScrollProgress } from '../utils/motionMath.js';

/**
 * Progression de scroll (0–1) pour la fenêtre ou un conteneur.
 * @param {'window' | 'element'} [mode]
 */
export function useScrollProgress(mode = 'window') {
  const ref = useRef(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let raf = 0;

    const update = () => {
      raf = 0;
      if (mode === 'element' && ref.current) {
        const el = ref.current;
        setProgress(
          computeScrollProgress({
            scrollTop: el.scrollTop,
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
          }),
        );
        return;
      }
      setProgress(
        computeScrollProgress({
          scrollTop: window.scrollY,
          scrollHeight: document.documentElement.scrollHeight,
          clientHeight: window.innerHeight,
        }),
      );
    };

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    const target = mode === 'element' ? ref.current : window;
    target?.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    update();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      target?.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [mode]);

  return { ref, progress };
}
