import React, { useEffect, useRef, useState } from 'react';
import lottie from 'lottie-web';
import visitMascotAnim from '../assets/lottie/visit-mascot.json';

/** Frame 0 = pose idle (jambes neutres) ; 1–30 = cycle de pas (boucle). Voir `scripts/build-visit-mascot-lottie.mjs`. */
const IDLE_FRAME = 0;
const WALK_START = 1;
const WALK_END = 30;

/**
 * Mascotte visite (Lottie) — petit personnage « rétro-moderne » (gros yeux, reflets, pas alternés).
 * L’orientation gauche/droite est gérée par le parent (`scaleX`). Marche : segment Lottie dédié ; idle : frame 0 figée.
 */
function VisitMapMascotLottie({ walking, prefersReducedMotion }) {
  const containerRef = useRef(null);
  const animRef = useRef(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    let anim = null;
    try {
      anim = lottie.loadAnimation({
        container: el,
        renderer: 'svg',
        loop: true,
        autoplay: false,
        animationData: visitMascotAnim,
      });
    } catch (_) {
      setLoadError(true);
      return undefined;
    }
    animRef.current = anim;
    return () => {
      try {
        anim.destroy();
      } catch (_) {
        /* noop */
      }
      animRef.current = null;
    };
  }, []);

  useEffect(() => {
    const anim = animRef.current;
    if (!anim) return;
    if (prefersReducedMotion) {
      anim.pause();
      try {
        anim.goToAndStop(IDLE_FRAME, true);
      } catch (_) {
        /* noop */
      }
      return;
    }
    if (walking) {
      anim.setSpeed(1.12);
      try {
        anim.playSegments([WALK_START, WALK_END], true);
      } catch (_) {
        anim.play();
      }
    } else {
      anim.pause();
      try {
        anim.goToAndStop(IDLE_FRAME, true);
      } catch (_) {
        /* noop */
      }
    }
  }, [walking, prefersReducedMotion]);

  if (loadError) {
    return <div className="visit-map-mascot-lottie visit-map-mascot-lottie--placeholder" aria-hidden="true" />;
  }

  return <div className="visit-map-mascot-lottie" ref={containerRef} aria-hidden="true" />;
}

export default VisitMapMascotLottie;
export { VisitMapMascotLottie };
