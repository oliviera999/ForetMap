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
    let cancelled = false;
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

    const switchToPlaceholder = () => {
      if (cancelled || animRef.current !== anim) return;
      setLoadError(true);
      try {
        anim.destroy();
      } catch (_) {
        /* noop */
      }
      animRef.current = null;
    };

    const hasDrawableSvg = () => {
      const svg = el.querySelector('svg');
      if (!svg) return false;
      const box = svg.getBoundingClientRect();
      if (!(box.width > 2 && box.height > 2)) return false;
      const drawableNodes = svg.querySelectorAll('path,circle,ellipse,rect,polygon,polyline,line');
      if (drawableNodes.length === 0) return false;
      for (const node of drawableNodes) {
        if (node.tagName === 'path') {
          const d = node.getAttribute('d');
          if (typeof d === 'string' && d.trim()) return true;
          continue;
        }
        return true;
      }
      return false;
    };

    /** Sans ça, `goToAndStop(0)` peut partir avant le DOM SVG → chemins vides, mascotte « invisible » sans erreur console. */
    const paintIdle = () => {
      if (cancelled || animRef.current !== anim) return;
      try {
        anim.pause();
        anim.goToAndStop(IDLE_FRAME, true);
      } catch (_) {
        /* noop */
      }
    };
    const checkDrawableAfterPaint = () => {
      if (cancelled || animRef.current !== anim) return;
      if (!hasDrawableSvg()) switchToPlaceholder();
    };
    const onDomLoaded = () => {
      paintIdle();
      requestAnimationFrame(checkDrawableAfterPaint);
    };
    anim.addEventListener('DOMLoaded', onDomLoaded);
    let raf0 = 0;
    let raf1 = 0;
    let checkTimer = 0;
    raf0 = requestAnimationFrame(() => {
      raf1 = requestAnimationFrame(() => {
        paintIdle();
        checkDrawableAfterPaint();
      });
    });
    checkTimer = window.setTimeout(checkDrawableAfterPaint, 650);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf0);
      cancelAnimationFrame(raf1);
      if (checkTimer) clearTimeout(checkTimer);
      try {
        anim.removeEventListener('DOMLoaded', onDomLoaded);
      } catch (_) {
        /* noop */
      }
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
