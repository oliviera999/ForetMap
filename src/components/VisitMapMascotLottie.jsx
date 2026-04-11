import React, { useEffect, useRef, useState } from 'react';
import lottie from 'lottie-web';
import visitMascotAnim from '../assets/lottie/visit-mascot.json';

/** Frame 0 = pose idle (jambes neutres) ; 1–30 = cycle de pas (boucle). Voir `scripts/build-visit-mascot-lottie.mjs`. */
const IDLE_FRAME = 0;
const WALK_START = 1;
const WALK_END = 30;
const MAX_PAINT_CHECKS = 6;
const PAINT_CHECK_INTERVAL_MS = 180;

function isTransparentPaint(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || raw === 'none' || raw === 'transparent') return true;
  if (raw.startsWith('rgba(') || raw.startsWith('hsla(')) {
    const parts = raw
      .replace(/^rgba?\(/, '')
      .replace(/^hsla?\(/, '')
      .replace(/\)$/, '')
      .split(',')
      .map((p) => p.trim());
    const alpha = Number(parts[3]);
    return Number.isFinite(alpha) ? alpha <= 0 : false;
  }
  if (/^#[0-9a-f]{8}$/i.test(raw)) return raw.slice(7, 9) === '00';
  if (/^#[0-9a-f]{4}$/i.test(raw)) return raw.slice(3, 4) === '0';
  return false;
}

function svgLooksPainted(containerEl) {
  const svg = containerEl.querySelector('svg');
  if (!svg) return false;
  const box = svg.getBoundingClientRect();
  if (!(box.width > 2 && box.height > 2)) return false;
  const svgStyle = window.getComputedStyle(svg);
  const svgOpacity = Number.parseFloat(svgStyle.opacity || '1');
  if (svgStyle.display === 'none' || svgStyle.visibility === 'hidden') return false;
  if (Number.isFinite(svgOpacity) && svgOpacity <= 0) return false;
  const drawableNodes = svg.querySelectorAll('path,circle,ellipse,rect,polygon,polyline,line');
  if (drawableNodes.length === 0) return false;
  for (const node of drawableNodes) {
    if (node.tagName === 'path') {
      const d = node.getAttribute('d');
      if (!d || !String(d).trim()) continue;
    }
    const st = window.getComputedStyle(node);
    if (st.display === 'none' || st.visibility === 'hidden') continue;
    const opacity = Number.parseFloat(st.opacity || '1');
    if (Number.isFinite(opacity) && opacity <= 0) continue;
    const strokeWidth = Number.parseFloat(st.strokeWidth || '0');
    const fillHidden = isTransparentPaint(st.fill);
    const strokeHidden = isTransparentPaint(st.stroke) || !(strokeWidth > 0);
    if (!(fillHidden && strokeHidden)) return true;
  }
  return false;
}

function canvasLooksPainted(containerEl) {
  const canvas = containerEl.querySelector('canvas');
  if (!canvas) return false;
  const box = canvas.getBoundingClientRect();
  if (!(box.width > 2 && box.height > 2)) return false;
  const w = Math.max(0, Number(canvas.width) || 0);
  const h = Math.max(0, Number(canvas.height) || 0);
  if (!(w > 1 && h > 1)) return false;
  let ctx = null;
  try {
    ctx = canvas.getContext('2d', { willReadFrequently: true }) || canvas.getContext('2d');
  } catch (_) {
    ctx = null;
  }
  if (!ctx) return false;
  const sampleCols = 6;
  const sampleRows = 6;
  let paintedSamples = 0;
  let sampled = 0;
  for (let row = 0; row < sampleRows; row += 1) {
    for (let col = 0; col < sampleCols; col += 1) {
      const x = Math.min(w - 1, Math.max(0, Math.round((col / (sampleCols - 1 || 1)) * (w - 1))));
      const y = Math.min(h - 1, Math.max(0, Math.round((row / (sampleRows - 1 || 1)) * (h - 1))));
      try {
        const px = ctx.getImageData(x, y, 1, 1).data;
        sampled += 1;
        if ((px?.[3] || 0) > 8) paintedSamples += 1;
      } catch (_) {
        return false;
      }
    }
  }
  if (sampled === 0) return false;
  return paintedSamples >= 2;
}

/**
 * Mascotte visite (Lottie) — petit personnage « rétro-moderne » (gros yeux, reflets, pas alternés).
 * L’orientation gauche/droite est gérée par le parent (`scaleX`). Marche : segment Lottie dédié ; idle : frame 0 figée.
 */
function VisitMapMascotLottie({ walking, prefersReducedMotion }) {
  const containerRef = useRef(null);
  const animRef = useRef(null);
  const [loadError, setLoadError] = useState(false);
  const [rendererMode, setRendererMode] = useState('svg');
  const [paintMeta, setPaintMeta] = useState({
    status: 'init',
    checks: 0,
    lastReason: 'init',
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    let anim = null;
    let cancelled = false;
    try {
      anim = lottie.loadAnimation({
        container: el,
        renderer: rendererMode,
        loop: true,
        autoplay: false,
        animationData: visitMascotAnim,
      });
    } catch (_) {
      setLoadError(true);
      return undefined;
    }
    animRef.current = anim;
    setPaintMeta({ status: 'loading', checks: 0, lastReason: `renderer:${rendererMode}` });

    const switchToCanvasOrPlaceholder = () => {
      if (cancelled || animRef.current !== anim) return;
      if (rendererMode === 'svg') {
        setPaintMeta((prev) => ({ ...prev, status: 'fallback-canvas', lastReason: 'svg-unpainted' }));
        try {
          anim.destroy();
        } catch (_) {
          /* noop */
        }
        animRef.current = null;
        setRendererMode('canvas');
        return;
      }
      setPaintMeta((prev) => ({ ...prev, status: 'fallback-placeholder', lastReason: 'canvas-unpainted' }));
      setLoadError(true);
      try {
        anim.destroy();
      } catch (_) {
        /* noop */
      }
      animRef.current = null;
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
    let paintChecks = 0;
    const checkDrawableAfterPaint = () => {
      if (cancelled || animRef.current !== anim) return;
      const looksPainted = rendererMode === 'svg' ? svgLooksPainted(el) : canvasLooksPainted(el);
      paintChecks += 1;
      setPaintMeta((prev) => ({
        status: looksPainted ? 'painted' : 'checking',
        checks: paintChecks,
        lastReason: looksPainted ? `painted:${rendererMode}` : `retry:${rendererMode}`,
      }));
      if (looksPainted) return;
      if (paintChecks < MAX_PAINT_CHECKS) {
        checkTimer = window.setTimeout(checkDrawableAfterPaint, PAINT_CHECK_INTERVAL_MS);
        return;
      }
      switchToCanvasOrPlaceholder();
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
  }, [rendererMode]);

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
    return (
      <div
        className="visit-map-mascot-lottie visit-map-mascot-lottie--fallback-mascot"
        data-renderer="fallback-mascot"
        data-painted-status={paintMeta.status}
        data-painted-checks={paintMeta.checks}
        data-painted-reason={paintMeta.lastReason}
        aria-hidden="true"
      >
        <svg viewBox="0 0 128 148" role="presentation" focusable="false">
          <ellipse cx="64" cy="140" rx="34" ry="7" fill="rgba(26,71,49,0.22)" />
          <rect x="23" y="18" width="82" height="30" rx="15" fill="#e8f5e9" stroke="#1a4731" strokeWidth="4" />
          <ellipse cx="64" cy="74" rx="38" ry="46" fill="#f4e9d0" stroke="#1a4731" strokeWidth="4" />
          <ellipse cx="48" cy="68" rx="9" ry="11" fill="#ffffff" />
          <ellipse cx="80" cy="68" rx="9" ry="11" fill="#ffffff" />
          <ellipse cx="48" cy="70" rx="4" ry="5" fill="#1a4731" />
          <ellipse cx="80" cy="70" rx="4" ry="5" fill="#1a4731" />
          <circle cx="51" cy="66" r="1.4" fill="#ffffff" />
          <circle cx="83" cy="66" r="1.4" fill="#ffffff" />
          <path d="M57 86 Q64 91 71 86" fill="none" stroke="#1a4731" strokeWidth="4" strokeLinecap="round" />
          <rect x="40" y="97" width="48" height="25" rx="12" fill="#86efac" stroke="#1a4731" strokeWidth="4" />
          <rect x="46" y="120" width="13" height="17" rx="6" fill="#6b4f2d" />
          <rect x="69" y="120" width="13" height="17" rx="6" fill="#6b4f2d" />
        </svg>
      </div>
    );
  }

  return (
    <div
      className="visit-map-mascot-lottie"
      data-renderer={rendererMode}
      data-painted-status={paintMeta.status}
      data-painted-checks={paintMeta.checks}
      data-painted-reason={paintMeta.lastReason}
      ref={containerRef}
      aria-hidden="true"
    />
  );
}

export default VisitMapMascotLottie;
export { VisitMapMascotLottie };
