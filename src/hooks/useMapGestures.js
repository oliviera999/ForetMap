import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { wheelZoomScaleFactor } from '../utils/mapWheelZoom';
import { pointToContainedRectPct } from '../shared/pct-map/pctMapPointer.js';

function useMapGestures({ mapImageSrc, activeMapId, mode, onRefresh, embedded = false, mapLayoutOuterRef = null }) {
  const containerRef = useRef(null);
  const worldRef = useRef(null);
  const imgRef = useRef(null);
  const tx = useRef({ x: 0, y: 0, s: 1 });
  const [committed, setCommitted] = useState({ x: 0, y: 0, s: 1 });
  const [imgSize, setImgSize] = useState({ w: 1, h: 1 });
  const imgSizeRef = useRef({ w: 1, h: 1 });
  const moved = useRef(false);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const pinching = useRef(false);
  const zoomAnimRafRef = useRef(null);
  const reducedMotionRef = useRef(false);
  const rafId = useRef(null);
  const commitRef = useRef(null);
  const draggingMarkerRef = useRef(null);
  const draggingMarkerEl = useRef(null);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const [mapInteractionEnabled, setMapInteractionEnabled] = useState(true);

  const applyTransform = () => {
    if (!worldRef.current) return;
    const { x, y, s } = tx.current;
    worldRef.current.style.transform = `translate(${x}px,${y}px) scale(${s})`;
  };

  const commit = () => {
    const snap = { ...tx.current };
    setCommitted(snap);
    cancelAnimationFrame(commitRef.current);
    commitRef.current = requestAnimationFrame(applyTransform);
  };

  const scheduleApply = () => {
    if (rafId.current) return;
    rafId.current = requestAnimationFrame(() => {
      applyTransform();
      rafId.current = null;
    });
  };

  /** Ajuste la carte au conteneur sans forcer un re-render si rien n’a changé (évite le gel mobile quand la barre d’adresse redimensionne la vue en boucle). */
  const commitFitLayout = (x, y, s) => {
    tx.current = { x, y, s };
    applyTransform();
    setCommitted((prev) => {
      if (Math.abs(prev.x - x) < 0.5 && Math.abs(prev.y - y) < 0.5 && Math.abs(prev.s - s) < 1e-4) return prev;
      return { x, y, s };
    });
  };

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      reducedMotionRef.current = !!mq.matches;
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const cancelToolbarZoomAnim = () => {
    if (zoomAnimRafRef.current != null) {
      cancelAnimationFrame(zoomAnimRafRef.current);
      zoomAnimRafRef.current = null;
    }
  };

  /** Zoom boutons +/− : interpolation courte : même cible que l’ancien saut, sans effet « par paliers ». */
  const animateZoomTowardScale = (targetS, pivotLocalX, pivotLocalY) => {
    cancelToolbarZoomAnim();
    const start = { ...tx.current };
    const clampedTarget = Math.min(Math.max(targetS, 0.15), 6);
    if (!Number.isFinite(clampedTarget) || Math.abs(clampedTarget - start.s) < 1e-6) return;
    const duration = reducedMotionRef.current ? 0 : 200;
    const easeOutCubic = (u) => 1 - (1 - u) ** 3;
    if (duration <= 0) {
      const ns = clampedTarget;
      tx.current.x = pivotLocalX - (pivotLocalX - start.x) * (ns / start.s);
      tx.current.y = pivotLocalY - (pivotLocalY - start.y) * (ns / start.s);
      tx.current.s = ns;
      applyTransform();
      commit();
      return;
    }
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      const u = easeOutCubic(t);
      const curS = start.s + (clampedTarget - start.s) * u;
      tx.current.x = pivotLocalX - (pivotLocalX - start.x) * (curS / start.s);
      tx.current.y = pivotLocalY - (pivotLocalY - start.y) * (curS / start.s);
      tx.current.s = curS;
      applyTransform();
      if (t < 1) {
        zoomAnimRafRef.current = requestAnimationFrame(step);
      } else {
        zoomAnimRafRef.current = null;
        commit();
      }
    };
    zoomAnimRafRef.current = requestAnimationFrame(step);
  };

  const enableMapInteraction = () => {
    setMapInteractionEnabled(true);
  };

  const toggleMapInteraction = () => {
    setMapInteractionEnabled((prev) => {
      const next = !prev;
      return next;
    });
  };

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(pointer: coarse)');
    const update = () => setIsCoarsePointer(media.matches);
    update();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  useEffect(() => {
    setMapInteractionEnabled(true);
  }, [activeMapId]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const onLoad = () => {
      imgSizeRef.current = { w: img.naturalWidth, h: img.naturalHeight };
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
    };
    if (img.complete) onLoad(); else img.addEventListener('load', onLoad);
    return () => img.removeEventListener('load', onLoad);
  }, [mapImageSrc]);

  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;

    const syncToolbarWidth = (cw) => {
      const root = c.closest('.map-view-root');
      if (!root) return;
      if (cw > 0) root.style.setProperty('--fm-map-canvas-w', `${cw}px`);
      else root.style.removeProperty('--fm-map-canvas-w');
    };

    const measureAndFit = () => {
      if (imgSizeRef.current.w <= 1) {
        syncToolbarWidth(0);
        return;
      }
      const { w: iw, h: ih } = imgSizeRef.current;
      const outer = mapLayoutOuterRef?.current;

      if (!outer) {
        const cw = Math.max(1, c.clientWidth);
        const ch = Math.max(1, c.clientHeight);
        const s = Math.min(cw / iw, ch / ih, 1);
        const x = (cw - iw * s) / 2;
        const y = (ch - ih * s) / 2;
        commitFitLayout(x, y, s);
        syncToolbarWidth(cw);
        return;
      }

      const st = getComputedStyle(outer);
      const padL = parseFloat(st.paddingLeft) || 0;
      const padR = parseFloat(st.paddingRight) || 0;
      const padT = parseFloat(st.paddingTop) || 0;
      const padB = parseFloat(st.paddingBottom) || 0;
      const availW = Math.max(1, outer.clientWidth - padL - padR);

      let availH;
      if (embedded) {
        availH = Math.max(1, outer.clientHeight - padT - padB);
        /* Premiers layouts / flex+grid : clientHeight peut rester quasi nul ; reprendre la logique vue solo. */
        const EMBEDDED_H_FLOOR = 96;
        if (availH < EMBEDDED_H_FLOOR) {
          const vh = window.visualViewport?.height ?? window.innerHeight;
          const oRect = outer.getBoundingClientRect();
          const mainEl = outer.closest('.main, .teacher-main');
          const mRect = mainEl?.getBoundingClientRect();
          const bottomLimit = mRect ? Math.min(mRect.bottom, vh) : vh;
          const maxOuterBoxH = Math.max(0, bottomLimit - oRect.top - 2);
          const fromViewport = Math.max(1, Math.floor(maxOuterBoxH - padT - padB));
          availH = Math.max(availH, fromViewport);
        }
      } else {
        const vh = window.visualViewport?.height ?? window.innerHeight;
        const oRect = outer.getBoundingClientRect();
        const main = outer.closest('.main, .teacher-main');
        const mRect = main?.getBoundingClientRect();
        const bottomLimit = mRect ? Math.min(mRect.bottom, vh) : vh;
        const maxOuterBoxH = Math.max(0, bottomLimit - oRect.top - 2);
        availH = Math.max(1, Math.floor(maxOuterBoxH - padT - padB));
      }

      /* Cadre = toute la zone disponible ; le « contain » de l’image reste assuré par s, x, y sur le monde (zoom mobile / plans larges ex. N3). */
      const cw = Math.max(1, availW);
      const ch = Math.max(1, availH);

      c.style.width = `${cw}px`;
      c.style.height = `${ch}px`;

      const s = Math.min(cw / iw, ch / ih, 1);
      const x = (cw - iw * s) / 2;
      const y = (ch - ih * s) / 2;
      commitFitLayout(x, y, s);
      syncToolbarWidth(cw);
    };

    measureAndFit();
    let resizeDebounce = null;
    const schedule = () => {
      if (resizeDebounce != null) clearTimeout(resizeDebounce);
      resizeDebounce = window.setTimeout(() => {
        resizeDebounce = null;
        measureAndFit();
      }, 120);
    };

    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(schedule)
      : null;
    if (ro) {
      ro.observe(c);
      const outerEl = mapLayoutOuterRef?.current;
      if (outerEl) ro.observe(outerEl);
    }

    window.addEventListener('resize', schedule);
    const vv = window.visualViewport;
    if (vv) vv.addEventListener('resize', schedule);

    return () => {
      if (resizeDebounce != null) clearTimeout(resizeDebounce);
      if (ro) ro.disconnect();
      window.removeEventListener('resize', schedule);
      if (vv) vv.removeEventListener('resize', schedule);
      c.style.width = '';
      c.style.height = '';
      const root = c.closest('.map-view-root');
      if (root) root.style.removeProperty('--fm-map-canvas-w');
    };
  }, [imgSize, embedded, mapLayoutOuterRef]);

  const toImagePct = (clientX, clientY) => {
    const c = containerRef.current;
    if (!c) return null;
    const { x, y, s } = tx.current;
    const { w, h } = imgSizeRef.current;
    return pointToContainedRectPct(
      { clientX, clientY },
      c,
      { x, y, s },
      { offsetX: 0, offsetY: 0, width: w, height: h },
      { clamp: false }
    );
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onPD = (e) => {
      if (e.target.closest('.edit-pt') || e.target.closest('.map-bubble')) return;
      cancelToolbarZoomAnim();
      moved.current = false;
      if (mode !== 'view') return;
      const touchLike = e.pointerType === 'touch' || e.pointerType === 'pen';
      const interactionActive = mapInteractionEnabled || tx.current.s > 1.05;
      if (touchLike && isCoarsePointer && !interactionActive) return;
      isPanning.current = true;
      panStart.current = { x: e.clientX - tx.current.x, y: e.clientY - tx.current.y };
    };

    const onPM = (e) => {
      if (isPanning.current) {
        if (!moved.current) {
          moved.current = true;
          try { el.setPointerCapture(e.pointerId); } catch (_) {}
        }
        tx.current.x = e.clientX - panStart.current.x;
        tx.current.y = e.clientY - panStart.current.y;
        scheduleApply();
        e.preventDefault();
        return;
      }
      if (draggingMarkerRef.current && draggingMarkerEl.current) {
        if (!moved.current) moved.current = true;
        const p = toImagePct(e.clientX, e.clientY);
        if (!p) return;
        const mel = draggingMarkerEl.current;
        mel.style.left = p.xp + '%';
        mel.style.top = p.yp + '%';
        mel._pct = p;
        e.preventDefault();
      }
    };

    const onPU = () => {
      if (isPanning.current) {
        isPanning.current = false;
        commit();
      }
      if (draggingMarkerRef.current) {
        const id = draggingMarkerRef.current;
        const mel = draggingMarkerEl.current;
        if (mel?._pct) {
          api(`/api/map/markers/${id}`, 'PUT', { x_pct: mel._pct.xp, y_pct: mel._pct.yp }).then(onRefresh);
          delete mel._pct;
        }
        draggingMarkerRef.current = null;
        draggingMarkerEl.current = null;
      }
      setTimeout(() => { moved.current = false; }, 0);
    };

    const onWH = (e) => {
      e.preventDefault();
      cancelToolbarZoomAnim();
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const d = wheelZoomScaleFactor(e, { containerClientHeight: el.clientHeight });
      const ns = Math.min(Math.max(tx.current.s * d, 0.15), 6);
      tx.current.x = mx - (mx - tx.current.x) * (ns / tx.current.s);
      tx.current.y = my - (my - tx.current.y) * (ns / tx.current.s);
      tx.current.s = ns;
      scheduleApply();
      clearTimeout(onWH._t);
      onWH._t = setTimeout(commit, 80);
    };

    const touchRef2 = {};
    const onTS = (e) => {
      if (e.touches.length !== 2) return;
      cancelToolbarZoomAnim();
      isPanning.current = false;
      pinching.current = true;
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const rect = el.getBoundingClientRect();
      touchRef2.dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      touchRef2.s = tx.current.s;
      touchRef2.ox = tx.current.x;
      touchRef2.oy = tx.current.y;
      touchRef2.mx = (t0.clientX + t1.clientX) / 2 - rect.left;
      touchRef2.my = (t0.clientY + t1.clientY) / 2 - rect.top;
      enableMapInteraction();
      e.preventDefault();
    };

    const onTM = (e) => {
      if (!pinching.current || e.touches.length !== 2) return;
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      const ns = Math.min(Math.max(touchRef2.s * (dist / touchRef2.dist), 0.15), 6);
      tx.current.x = touchRef2.mx - (touchRef2.mx - touchRef2.ox) * (ns / touchRef2.s);
      tx.current.y = touchRef2.my - (touchRef2.my - touchRef2.oy) * (ns / touchRef2.s);
      tx.current.s = ns;
      scheduleApply();
      e.preventDefault();
    };

    const onTE = (e) => {
      if (pinching.current && e.touches.length < 2) {
        pinching.current = false;
        commit();
      }
    };

    el.addEventListener('pointerdown', onPD, { passive: true });
    el.addEventListener('pointermove', onPM, { passive: false });
    el.addEventListener('pointerup', onPU, { passive: true });
    el.addEventListener('pointerleave', onPU, { passive: true });
    el.addEventListener('wheel', onWH, { passive: false });
    el.addEventListener('touchstart', onTS, { passive: false });
    el.addEventListener('touchmove', onTM, { passive: false });
    el.addEventListener('touchend', onTE, { passive: true });

    return () => {
      cancelToolbarZoomAnim();
      el.removeEventListener('pointerdown', onPD);
      el.removeEventListener('pointermove', onPM);
      el.removeEventListener('pointerup', onPU);
      el.removeEventListener('pointerleave', onPU);
      el.removeEventListener('wheel', onWH);
      el.removeEventListener('touchstart', onTS);
      el.removeEventListener('touchmove', onTM);
      el.removeEventListener('touchend', onTE);
    };
  }, [enableMapInteraction, isCoarsePointer, mapInteractionEnabled, mode, onRefresh]);

  const fitMap = () => {
    cancelToolbarZoomAnim();
    const c = containerRef.current;
    if (!c) return;
    const { w, h } = imgSizeRef.current;
    if (w <= 1 || h <= 1) return;
    const cw = Math.max(1, c.clientWidth);
    const ch = Math.max(1, c.clientHeight);
    const s = Math.min(cw / w, ch / h, 1);
    const x = (cw - w * s) / 2;
    const y = (ch - h * s) / 2;
    commitFitLayout(x, y, s);
  };

  const beginMarkerDrag = (id, target, pointerId) => {
    draggingMarkerRef.current = id;
    draggingMarkerEl.current = target;
    target.setPointerCapture(pointerId);
    enableMapInteraction();
  };

  const prefersPageScroll = isCoarsePointer && mode === 'view' && committed.s <= 1.05 && !mapInteractionEnabled;
  const touchAction = prefersPageScroll ? 'pan-y' : 'none';

  return {
    containerRef,
    worldRef,
    imgRef,
    tx,
    committed,
    imgSize,
    imgSizeRef,
    moved,
    applyTransform,
    commit,
    fitMap,
    toImagePct,
    beginMarkerDrag,
    isCoarsePointer,
    mapInteractionEnabled,
    setMapInteractionEnabled,
    toggleMapInteraction,
    prefersPageScroll,
    touchAction,
    animateZoomTowardScale,
  };
}

export { useMapGestures };
