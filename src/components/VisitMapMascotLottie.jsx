import React, { useEffect, useRef } from 'react';
import lottie from 'lottie-web';
import visitMascotAnim from '../assets/lottie/visit-mascot.json';

/**
 * Mascotte visite (Lottie) — couleurs alignées sur le thème forêt / crème / sage.
 * Vitesse d’animation selon marche / idle ; figée sur la première image si reduced motion.
 */
function VisitMapMascotLottie({ walking, prefersReducedMotion }) {
  const containerRef = useRef(null);
  const animRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const anim = lottie.loadAnimation({
      container: el,
      renderer: 'svg',
      loop: true,
      autoplay: false,
      animationData: visitMascotAnim,
    });
    animRef.current = anim;
    return () => {
      anim.destroy();
      animRef.current = null;
    };
  }, []);

  useEffect(() => {
    const anim = animRef.current;
    if (!anim) return;
    if (prefersReducedMotion) {
      anim.pause();
      try {
        anim.goToAndStop(0, true);
      } catch (_) {
        /* noop */
      }
      return;
    }
    anim.setSpeed(walking ? 1.55 : 0.55);
    anim.play();
  }, [walking, prefersReducedMotion]);

  return <div className="visit-map-mascot-lottie" ref={containerRef} aria-hidden="true" />;
}

export default VisitMapMascotLottie;
export { VisitMapMascotLottie };
