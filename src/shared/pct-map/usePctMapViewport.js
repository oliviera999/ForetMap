import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { pointToContainedRectPct } from './pctMapPointer.js';
import {
  PCT_MAP_INERTIA_MIN_VELOCITY,
  PCT_MAP_SCALE_MAX_DEFAULT,
  PCT_MAP_SCALE_MIN_DEFAULT,
  centerPctMapTransformOnPct,
  clampPctMapScale,
  clampPctMapTransform,
  elasticPctMapTransform,
  fitPctMapTransform,
  pctMapInertiaStep,
  pctMapReleaseVelocity,
  pctMapTransformEquals,
  pinchPctMapTransform,
  zoomPctMapTransformToScale,
} from './pctMapTransform.js';
import { wheelZoomScaleFactor } from './pctMapWheelZoom.js';
import { computeContainRect } from './pctMapFit.js';

/**
 * Moteur de vue d'une carte « % image » — noyau carte partagé (lot 2 du plan de convergence,
 * `docs/AUDIT_CONVERGENCE_APPS_2026-09.md` §5.2 « Noyau carte »).
 *
 * Fusionne le meilleur des trois moteurs historiques :
 *   - `useMapGestures` (carte de travail ForetMap) : valeur vive dans une ref + un seul commit
 *     React par geste, `will-change` retiré au repos, molette normalisée, animation des boutons
 *     +/−, pan clavier, verrou tactile « la page défile d'abord » sur pointeur grossier ;
 *   - `useVisitMapTransform` + `visitMapTransform.js` (Visite) : bornes, `ResizeObserver`,
 *     re-clamp au redimensionnement ;
 *   - `useGlPctMapGestures` (plateaux G&L) : conversion clic → % du rectangle image « contain ».
 * Et ajoute ce qu'aucun n'avait : double-tap, pinch à médian vivant (pinch + déplacement),
 * inertie, retour élastique en butée.
 *
 * Deux modes de contenu :
 *   - `contentMode: 'image'` — le calque monde mesure l'image en px naturels ; l'ajustement est
 *     porté par la transformation (carte de travail : SVG en px image) ;
 *   - `contentMode: 'stage'` — le calque monde mesure le cadre ; l'image est en `object-fit:
 *     contain` dans un calque « fit » (`fitRect`) que les couches en % épousent (Visite, G&L).
 *
 * Aucune écriture réseau ici : le glisser d'un repère est un pilote externe
 * (`beginExternalDrag`) dont le produit décide de la persistance.
 *
 * @param {object} options
 * @param {string} [options.imageSrc] source de l'image (remesure quand elle change).
 * @param {'image'|'stage'} [options.contentMode='image']
 * @param {boolean} [options.enabled=true] gestes pan/zoom actifs.
 * @param {boolean} [options.panEnabled=true] pan au pointeur (un doigt / souris) ; à `false`, la
 *   molette, le pinch et les pilotes externes restent actifs (modes d'édition de la carte).
 * @param {number|((fitScale: number) => number)} [options.minScale] échelle minimale (absolue ou
 *   dérivée de l'échelle d'ajustement). Défaut : 0,15 en mode image, 0,5 × ajustement en mode scène.
 * @param {number} [options.maxScale=8]
 * @param {boolean} [options.bounds=true] bornes « contain » (+ élastique pendant le geste).
 * @param {boolean} [options.doubleTapZoom=true]
 * @param {number} [options.doubleTapZoomFactor=2.5] échelle cible = ajustement × facteur.
 * @param {boolean} [options.inertia=true]
 * @param {boolean} [options.keyboardPan=false] flèches clavier (hors champs de saisie).
 * @param {boolean} [options.coarsePointerScrollLock=false] sur pointeur grossier, un doigt fait
 *   défiler la page tant que la carte n'est pas « activée » (pinch, bouton) ni zoomée.
 * @param {'fit'|'clamp'} [options.onResize='fit'] au redimensionnement du cadre : réajuster ou
 *   seulement re-borner la vue courante.
 * @param {(target: Element) => boolean} [options.isGestureTarget] cibles qui ne démarrent pas de pan
 *   (boutons superposés, poignées d'édition…).
 * @param {(container: HTMLElement) => ({ w: number, h: number }|null)} [options.resolveStageBox]
 *   mesure du cadre imposée au conteneur (largeur/hauteur écrites en style) ; défaut : client box.
 * @param {Array<{ current: Element|null }>} [options.observeRefs] éléments supplémentaires observés.
 * @param {string} [options.resetKey] changement de carte : réajustement.
 * @param {(fit: { fitScale: number, fitRect: object, stage: object }) => void} [options.onFit]
 * @param {(kind: string) => void} [options.onGestureStart]
 * @param {() => void} [options.onGestureEnd]
 */
/** Annulation d'un rAF tolérante aux environnements sans `cancelAnimationFrame` (SSR, jsdom nu). */
function cancelRaf(id) {
  if (id != null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
}

export function usePctMapViewport({
  imageSrc = '',
  contentMode = 'image',
  enabled = true,
  panEnabled = true,
  minScale,
  maxScale = PCT_MAP_SCALE_MAX_DEFAULT,
  bounds = true,
  doubleTapZoom = true,
  doubleTapZoomFactor = 2.5,
  inertia = true,
  keyboardPan = false,
  coarsePointerScrollLock = false,
  onResize = 'fit',
  isGestureTarget = null,
  resolveStageBox = null,
  observeRefs = null,
  resetKey = '',
  onFit = null,
  onGestureStart = null,
  onGestureEnd = null,
} = {}) {
  const containerRef = useRef(null);
  const worldRef = useRef(null);
  const imgRef = useRef(null);

  const tx = useRef({ x: 0, y: 0, s: 1 });
  const [committed, setCommitted] = useState({ x: 0, y: 0, s: 1 });
  const [imgSize, setImgSize] = useState({ w: 1, h: 1 });
  const imgSizeRef = useRef({ w: 1, h: 1 });
  const stageRef = useRef({ w: 0, h: 0 });
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  const fitRectRef = useRef({ offsetX: 0, offsetY: 0, width: 0, height: 0 });
  const [fitRect, setFitRect] = useState({ offsetX: 0, offsetY: 0, width: 0, height: 0 });
  const [fitScale, setFitScale] = useState(1);
  const fitScaleRef = useRef(1);

  const moved = useRef(false);
  const skipClickRef = useRef(false);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panSamples = useRef([]);
  const pinching = useRef(false);
  const pinchStart = useRef(null);
  const lastTap = useRef({ t: 0, x: 0, y: 0 });
  const animRafRef = useRef(null);
  const applyRafRef = useRef(null);
  const commitRafRef = useRef(null);
  const commitTimerRef = useRef(null);
  const reducedMotionRef = useRef(false);
  const externalDragRef = useRef(null);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const [interactionEnabled, setInteractionEnabled] = useState(true);

  const optionsRef = useRef({});
  optionsRef.current = {
    enabled,
    panEnabled,
    minScale,
    maxScale,
    bounds,
    doubleTapZoom,
    doubleTapZoomFactor,
    inertia,
    coarsePointerScrollLock,
    onResize,
    isGestureTarget,
    resolveStageBox,
    onFit,
    onGestureStart,
    onGestureEnd,
    contentMode,
    interactionEnabled,
    isCoarsePointer,
  };

  /** Taille du contenu à l'échelle 1 selon le mode. */
  const contentSize = useCallback(() => {
    if (optionsRef.current.contentMode === 'stage') {
      const st = stageRef.current;
      return { w: Math.max(1, st.w), h: Math.max(1, st.h) };
    }
    return { w: Math.max(1, imgSizeRef.current.w), h: Math.max(1, imgSizeRef.current.h) };
  }, []);

  const resolveMinScale = useCallback(() => {
    const opt = optionsRef.current;
    const fit = fitScaleRef.current || 1;
    if (typeof opt.minScale === 'function') return Number(opt.minScale(fit)) || 0.15;
    if (Number.isFinite(Number(opt.minScale)) && Number(opt.minScale) > 0)
      return Number(opt.minScale);
    return opt.contentMode === 'stage' ? fit * 0.5 : PCT_MAP_SCALE_MIN_DEFAULT;
  }, []);

  /** Bornes courantes pour la géométrie pure (`{ content, stage, min, max }`). */
  const currentBounds = useCallback(() => {
    const opt = optionsRef.current;
    const st = stageRef.current;
    return {
      content: contentSize(),
      stage: opt.bounds && st.w > 0 && st.h > 0 ? { w: st.w, h: st.h } : null,
      min: resolveMinScale(),
      max: Number(opt.maxScale) > 0 ? Number(opt.maxScale) : PCT_MAP_SCALE_MAX_DEFAULT,
    };
  }, [contentSize, resolveMinScale]);

  const lastAppliedRef = useRef('');
  /** Écrit `style.transform` sur le monde — seulement si la valeur change (aucune mutation DOM à vide). */
  const applyTransform = useCallback(() => {
    const el = worldRef.current;
    if (!el) return;
    const { x, y, s } = tx.current;
    const next = `translate(${x}px,${y}px) scale(${s})`;
    if (lastAppliedRef.current === next && el.style.transform === next) return;
    lastAppliedRef.current = next;
    el.style.transform = next;
  }, []);

  const setWorldWillChange = useCallback((on) => {
    const el = worldRef.current;
    if (el) el.style.willChange = on ? 'transform' : 'auto';
  }, []);

  const scheduleApply = useCallback(() => {
    if (applyRafRef.current != null) return;
    applyRafRef.current = requestAnimationFrame(() => {
      applyRafRef.current = null;
      applyTransform();
    });
  }, [applyTransform]);

  /** Fin de geste : fige la valeur vive dans l'état React (un re-render par geste, aucun sans changement). */
  const commit = useCallback(
    (next = null) => {
      if (next) tx.current = { ...next };
      if (commitTimerRef.current != null) {
        clearTimeout(commitTimerRef.current);
        commitTimerRef.current = null;
      }
      const snap = { ...tx.current };
      setCommitted((prev) => (pctMapTransformEquals(prev, snap, { epsilon: 1e-6 }) ? prev : snap));
      setWorldWillChange(false);
      cancelRaf(commitRafRef.current);
      commitRafRef.current = requestAnimationFrame(() => {
        commitRafRef.current = null;
        applyTransform();
      });
    },
    [applyTransform, setWorldWillChange],
  );

  const scheduleCommit = useCallback(
    (delayMs = 80) => {
      if (commitTimerRef.current != null) clearTimeout(commitTimerRef.current);
      commitTimerRef.current = setTimeout(() => {
        commitTimerRef.current = null;
        commit();
      }, delayMs);
    },
    [commit],
  );

  const cancelAnimation = useCallback(() => {
    if (animRafRef.current != null) {
      cancelRaf(animRafRef.current);
      animRafRef.current = null;
      return true;
    }
    return false;
  }, []);

  /** Animation courte (200 ms, ease-out cubique) entre deux transformations, puis commit. */
  const animateTo = useCallback(
    (target, { duration = 200, onDone = null } = {}) => {
      cancelAnimation();
      const start = { ...tx.current };
      const end = { ...target };
      if (pctMapTransformEquals(start, end, { epsilon: 0.01 })) {
        commit(end);
        onDone?.();
        return;
      }
      const ms = reducedMotionRef.current ? 0 : duration;
      if (ms <= 0) {
        commit(end);
        onDone?.();
        return;
      }
      setWorldWillChange(true);
      const t0 = performance.now();
      const easeOutCubic = (u) => 1 - (1 - u) ** 3;
      const step = (now) => {
        const t = Math.min(1, (now - t0) / ms);
        const u = easeOutCubic(t);
        tx.current = {
          x: start.x + (end.x - start.x) * u,
          y: start.y + (end.y - start.y) * u,
          s: start.s + (end.s - start.s) * u,
        };
        applyTransform();
        if (t < 1) {
          animRafRef.current = requestAnimationFrame(step);
        } else {
          animRafRef.current = null;
          commit(end);
          onDone?.();
        }
      };
      animRafRef.current = requestAnimationFrame(step);
    },
    [applyTransform, cancelAnimation, commit, setWorldWillChange],
  );

  /** Retour en butée après un geste élastique (ou commit direct si déjà dans les bornes). */
  const settle = useCallback(() => {
    const clamped = clampPctMapTransform(tx.current, currentBounds());
    if (pctMapTransformEquals(clamped, tx.current, { epsilon: 0.01 })) commit();
    else animateTo(clamped, { duration: 160 });
  }, [animateTo, commit, currentBounds]);

  /**
   * Mesure du cadre + ajustement. `mode: 'fit'` réajuste ; `'clamp'` conserve la vue et la
   * re-borne (redimensionnement pendant la consultation).
   */
  const measure = useCallback(
    (mode = 'fit') => {
      const c = containerRef.current;
      if (!c) return;
      const opt = optionsRef.current;
      let box = null;
      if (typeof opt.resolveStageBox === 'function') {
        box = opt.resolveStageBox(c);
        if (box && box.w > 0 && box.h > 0) {
          c.style.width = `${box.w}px`;
          c.style.height = `${box.h}px`;
        }
      }
      if (!box || !(box.w > 0) || !(box.h > 0)) {
        box = { w: Math.max(1, c.clientWidth), h: Math.max(1, c.clientHeight) };
      }
      const prevStage = stageRef.current;
      const stageChanged =
        Math.abs(prevStage.w - box.w) > 0.5 || Math.abs(prevStage.h - box.h) > 0.5;
      stageRef.current = { w: box.w, h: box.h };
      if (stageChanged) setStageSize({ w: box.w, h: box.h });

      const { w: iw, h: ih } = imgSizeRef.current;
      let nextFitScale = 1;
      let nextFitRect;
      if (opt.contentMode === 'stage') {
        nextFitRect = computeContainRect(iw > 1 ? iw : 0, ih > 1 ? ih : 0, box.w, box.h);
      } else {
        nextFitRect = { offsetX: 0, offsetY: 0, width: iw, height: ih };
        nextFitScale = fitPctMapTransform({ w: iw, h: ih }, box).s;
      }
      const rectChanged =
        Math.abs(fitRectRef.current.width - nextFitRect.width) > 0.5 ||
        Math.abs(fitRectRef.current.height - nextFitRect.height) > 0.5 ||
        Math.abs(fitRectRef.current.offsetX - nextFitRect.offsetX) > 0.5 ||
        Math.abs(fitRectRef.current.offsetY - nextFitRect.offsetY) > 0.5;
      fitRectRef.current = nextFitRect;
      if (rectChanged) setFitRect(nextFitRect);
      fitScaleRef.current = nextFitScale;
      setFitScale((prev) => (Math.abs(prev - nextFitScale) < 1e-4 ? prev : nextFitScale));

      const fitTx =
        opt.contentMode === 'stage'
          ? { x: 0, y: 0, s: 1 }
          : fitPctMapTransform({ w: iw, h: ih }, box);
      const next = mode === 'clamp' ? clampPctMapTransform(tx.current, currentBounds()) : fitTx;
      cancelAnimation();
      tx.current = next;
      applyTransform();
      setWorldWillChange(false);
      setCommitted((prev) => (pctMapTransformEquals(prev, next) ? prev : next));
      opt.onFit?.({
        fitScale: nextFitScale,
        fitRect: nextFitRect,
        stage: { ...box },
        transform: next,
      });
    },
    [applyTransform, cancelAnimation, currentBounds, setWorldWillChange],
  );

  const fitMap = useCallback(() => measure('fit'), [measure]);
  const remeasure = useCallback(
    () => measure(optionsRef.current.onResize === 'clamp' ? 'clamp' : 'fit'),
    [measure],
  );

  /** Réajustement animé (bouton « recentrer ») : même cible que `fitMap`, en douceur. */
  const fitMapAnimated = useCallback(() => {
    const st = stageRef.current;
    if (!(st.w > 0) || !(st.h > 0)) return fitMap();
    const target =
      optionsRef.current.contentMode === 'stage'
        ? { x: 0, y: 0, s: 1 }
        : fitPctMapTransform(contentSize(), st);
    animateTo(target);
    return undefined;
  }, [animateTo, contentSize, fitMap]);

  /* Préférences système : mouvement réduit, pointeur grossier. */
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const coarse = window.matchMedia('(pointer: coarse)');
    const applyMotion = () => {
      reducedMotionRef.current = !!motion.matches;
    };
    const applyCoarse = () => setIsCoarsePointer(!!coarse.matches);
    applyMotion();
    applyCoarse();
    motion.addEventListener?.('change', applyMotion);
    if (typeof coarse.addEventListener === 'function')
      coarse.addEventListener('change', applyCoarse);
    else coarse.addListener?.(applyCoarse);
    return () => {
      motion.removeEventListener?.('change', applyMotion);
      if (typeof coarse.removeEventListener === 'function')
        coarse.removeEventListener('change', applyCoarse);
      else coarse.removeListener?.(applyCoarse);
    };
  }, []);

  useEffect(() => {
    setInteractionEnabled(true);
  }, [resetKey]);

  /* Dimensions naturelles de l'image. */
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return undefined;
    const onLoad = () => {
      const w = Math.max(1, img.naturalWidth || 0);
      const h = Math.max(1, img.naturalHeight || 0);
      imgSizeRef.current = { w, h };
      setImgSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    if (img.complete && img.naturalWidth > 0) onLoad();
    else img.addEventListener('load', onLoad);
    return () => img.removeEventListener('load', onLoad);
  }, [imageSrc]);

  /* Mesure du cadre : au montage, à chaque image, à chaque carte, et sur redimensionnement. */
  const observeRefsList = observeRefs || null;
  useLayoutEffect(() => {
    const c = containerRef.current;
    if (!c) return undefined;
    measure('fit');
    let debounce = null;
    const schedule = () => {
      if (debounce != null) clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        debounce = null;
        remeasure();
      }, 120);
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    if (ro) {
      ro.observe(c);
      for (const ref of observeRefsList || []) {
        if (ref?.current) ro.observe(ref.current);
      }
    }
    window.addEventListener('resize', schedule);
    const vv = window.visualViewport;
    if (vv) vv.addEventListener('resize', schedule);
    return () => {
      if (debounce != null) clearTimeout(debounce);
      if (ro) ro.disconnect();
      window.removeEventListener('resize', schedule);
      if (vv) vv.removeEventListener('resize', schedule);
      if (typeof optionsRef.current.resolveStageBox === 'function') {
        c.style.width = '';
        c.style.height = '';
      }
    };
    // `imgSize` et `resetKey` : remesure quand l'image ou la carte change.
  }, [imgSize, resetKey, contentMode, measure, remeasure, observeRefsList]);

  // Un re-render pendant un geste ne doit pas réécrire le style avec l'état commité en retard.
  useLayoutEffect(() => {
    applyTransform();
  });

  useEffect(
    () => () => {
      cancelAnimation();
      cancelRaf(applyRafRef.current);
      cancelRaf(commitRafRef.current);
      if (commitTimerRef.current != null) clearTimeout(commitTimerRef.current);
    },
    [cancelAnimation],
  );

  /** Pointeur (client) → % du rectangle image ; `clamp: false` par défaut (édition hors cadre). */
  const toImagePct = useCallback((clientX, clientY, options = {}) => {
    const c = containerRef.current;
    if (!c) return null;
    const fr = fitRectRef.current;
    const fit =
      optionsRef.current.contentMode === 'stage'
        ? fr
        : { offsetX: 0, offsetY: 0, width: imgSizeRef.current.w, height: imgSizeRef.current.h };
    return pointToContainedRectPct({ clientX, clientY }, c, tx.current, fit, {
      clamp: options.clamp === true,
      decimals: options.decimals ?? null,
    });
  }, []);

  const localPoint = useCallback((clientX, clientY) => {
    const c = containerRef.current;
    const r = c ? c.getBoundingClientRect() : { left: 0, top: 0 };
    return { x: clientX - r.left, y: clientY - r.top };
  }, []);

  /** Zoom animé vers une échelle autour d'un pivot (px cadre) — boutons +/−, double-tap, focus. */
  const animateZoomTowardScale = useCallback(
    (targetScale, pivotX, pivotY) => {
      const b = currentBounds();
      const target = zoomPctMapTransformToScale(tx.current, pivotX, pivotY, targetScale, b);
      animateTo(target);
    },
    [animateTo, currentBounds],
  );

  /** Zoom par facteur (boutons +/−) depuis le centre du cadre, animé. */
  const zoomBy = useCallback(
    (factor) => {
      const st = stageRef.current;
      animateZoomTowardScale(tx.current.s * (Number(factor) || 1), st.w / 2, st.h / 2);
    },
    [animateZoomTowardScale],
  );

  /** Centre un point % image dans le cadre (résultat de recherche, lien profond), animé. */
  const focusOnPct = useCallback(
    (pct, { targetScale = null, zoomFactor = 1.35 } = {}) => {
      const b = currentBounds();
      const fit = fitScaleRef.current || 1;
      const desired =
        targetScale != null
          ? Number(targetScale)
          : Math.max(tx.current.s, fit * (Number(zoomFactor) || 1.35));
      const s = clampPctMapScale(desired, b);
      const fr = optionsRef.current.contentMode === 'stage' ? fitRectRef.current : null;
      animateTo(centerPctMapTransformOnPct(pct, s, b, fr));
    },
    [animateTo, currentBounds],
  );

  const applyLive = useCallback(
    (next) => {
      tx.current = next;
      scheduleApply();
    },
    [scheduleApply],
  );

  /** Pilotes externes de pan (édition de contour : fond glissé, clavier). */
  const beginPan = useCallback(
    (clientX, clientY) => {
      cancelAnimation();
      isPanning.current = true;
      panStart.current = { x: clientX - tx.current.x, y: clientY - tx.current.y };
      panSamples.current = [{ x: clientX, y: clientY, t: performance.now() }];
      setWorldWillChange(true);
      optionsRef.current.onGestureStart?.('pan');
    },
    [cancelAnimation, setWorldWillChange],
  );

  const updatePan = useCallback(
    (clientX, clientY) => {
      if (!isPanning.current) return;
      const raw = {
        x: clientX - panStart.current.x,
        y: clientY - panStart.current.y,
        s: tx.current.s,
      };
      const samples = panSamples.current;
      samples.push({ x: clientX, y: clientY, t: performance.now() });
      if (samples.length > 8) samples.shift();
      applyLive(optionsRef.current.bounds ? elasticPctMapTransform(raw, currentBounds()) : raw);
    },
    [applyLive, currentBounds],
  );

  const runInertia = useCallback(
    (velocity) => {
      const b = currentBounds();
      let v = velocity;
      let last = performance.now();
      setWorldWillChange(true);
      const step = (now) => {
        const dt = now - last;
        last = now;
        const res = pctMapInertiaStep(tx.current, v, dt, b);
        tx.current = res.tx;
        v = res.velocity;
        applyTransform();
        if (res.done) {
          animRafRef.current = null;
          commit();
          optionsRef.current.onGestureEnd?.();
        } else {
          animRafRef.current = requestAnimationFrame(step);
        }
      };
      cancelAnimation();
      animRafRef.current = requestAnimationFrame(step);
    },
    [applyTransform, cancelAnimation, commit, currentBounds, setWorldWillChange],
  );

  const endPan = useCallback(() => {
    if (!isPanning.current) return;
    isPanning.current = false;
    const opt = optionsRef.current;
    const { vx, vy } = pctMapReleaseVelocity(panSamples.current);
    panSamples.current = [];
    const clamped = clampPctMapTransform(tx.current, currentBounds());
    const inBounds = pctMapTransformEquals(clamped, tx.current, { epsilon: 0.01 });
    if (
      opt.inertia &&
      !reducedMotionRef.current &&
      inBounds &&
      opt.bounds &&
      Math.hypot(vx, vy) >= PCT_MAP_INERTIA_MIN_VELOCITY
    ) {
      runInertia({ vx, vy });
      return;
    }
    if (opt.bounds) settle();
    else commit();
    opt.onGestureEnd?.();
  }, [commit, currentBounds, runInertia, settle]);

  const panByScreenDelta = useCallback(
    (dxPx, dyPx) => {
      cancelAnimation();
      setWorldWillChange(true);
      const raw = {
        x: tx.current.x + (Number(dxPx) || 0),
        y: tx.current.y + (Number(dyPx) || 0),
        s: tx.current.s,
      };
      applyLive(optionsRef.current.bounds ? clampPctMapTransform(raw, currentBounds()) : raw);
      scheduleCommit(80);
    },
    [applyLive, cancelAnimation, currentBounds, scheduleCommit, setWorldWillChange],
  );

  /**
   * Glisser externe (repère) : suit le pointeur en % image sans toucher à la vue ; le produit
   * persiste la position finale dans `onEnd`.
   */
  const beginExternalDrag = useCallback(
    (element, pointerId, { onMove = null, onEnd = null } = {}) => {
      externalDragRef.current = { element, onMove, onEnd, last: null };
      try {
        element?.setPointerCapture?.(pointerId);
      } catch (_) {
        /* capture non disponible (jsdom) */
      }
      setInteractionEnabled(true);
    },
    [],
  );

  const consumeSkipClick = useCallback(() => {
    if (!skipClickRef.current) return false;
    skipClickRef.current = false;
    return true;
  }, []);

  const enableInteraction = useCallback(() => setInteractionEnabled(true), []);
  const toggleInteraction = useCallback(() => setInteractionEnabled((v) => !v), []);

  /* Écouteurs natifs (passif: false pour pouvoir prévenir le défilement). */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;

    const gesturesAllowed = () => {
      const opt = optionsRef.current;
      return opt.enabled;
    };

    const singlePointerAllowed = (e) => {
      const opt = optionsRef.current;
      if (!opt.coarsePointerScrollLock) return true;
      const touchLike = e.pointerType === 'touch' || e.pointerType === 'pen';
      if (!touchLike || !opt.isCoarsePointer) return true;
      return opt.interactionEnabled || tx.current.s > fitScaleRef.current * 1.05;
    };

    const onPointerDown = (e) => {
      const opt = optionsRef.current;
      if (typeof opt.isGestureTarget === 'function' && opt.isGestureTarget(e.target)) return;
      cancelAnimation();
      moved.current = false;
      if (!gesturesAllowed()) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (!singlePointerAllowed(e)) return;
      if (pinching.current) return;
      if (!opt.panEnabled) return;
      isPanning.current = true;
      panStart.current = { x: e.clientX - tx.current.x, y: e.clientY - tx.current.y };
      panSamples.current = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
      // Double-tap : deux appuis tactiles rapprochés (< 300 ms, < 24 px).
      if (opt.doubleTapZoom && (e.pointerType === 'touch' || e.pointerType === 'pen')) {
        const now = performance.now();
        const prev = lastTap.current;
        if (now - prev.t < 300 && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 24) {
          lastTap.current = { t: 0, x: 0, y: 0 };
          isPanning.current = false;
          skipClickRef.current = true;
          const p = localPoint(e.clientX, e.clientY);
          const fit = fitScaleRef.current || 1;
          const target =
            tx.current.s < fit * opt.doubleTapZoomFactor * 0.9
              ? fit * opt.doubleTapZoomFactor
              : fit;
          if (target <= fit + 1e-6) fitMapAnimated();
          else animateZoomTowardScale(target, p.x, p.y);
          setInteractionEnabled(true);
          return;
        }
        lastTap.current = { t: now, x: e.clientX, y: e.clientY };
      }
    };

    const onPointerMove = (e) => {
      const drag = externalDragRef.current;
      if (drag) {
        const p = toImagePct(e.clientX, e.clientY);
        if (!p) return;
        moved.current = true;
        drag.last = p;
        drag.onMove?.(p, e);
        e.preventDefault();
        return;
      }
      if (!isPanning.current) return;
      if (!moved.current) {
        const dx = e.clientX - (panStart.current.x + tx.current.x);
        const dy = e.clientY - (panStart.current.y + tx.current.y);
        if (Math.hypot(dx, dy) < 4) return;
        moved.current = true;
        skipClickRef.current = true;
        setWorldWillChange(true);
        optionsRef.current.onGestureStart?.('pan');
        try {
          el.setPointerCapture(e.pointerId);
        } catch (_) {
          /* jsdom */
        }
      }
      updatePan(e.clientX, e.clientY);
      e.preventDefault();
    };

    const onPointerUp = (e) => {
      const drag = externalDragRef.current;
      if (drag) {
        externalDragRef.current = null;
        try {
          drag.element?.releasePointerCapture?.(e.pointerId);
        } catch (_) {
          /* jsdom */
        }
        drag.onEnd?.(drag.last, e);
      }
      if (isPanning.current) {
        if (moved.current) {
          endPan();
        } else {
          isPanning.current = false;
          panSamples.current = [];
        }
      }
      setTimeout(() => {
        moved.current = false;
        skipClickRef.current = false;
      }, 0);
    };

    const onWheel = (e) => {
      if (!gesturesAllowed()) return;
      e.preventDefault();
      cancelAnimation();
      setWorldWillChange(true);
      const p = localPoint(e.clientX, e.clientY);
      const factor = wheelZoomScaleFactor(e, { containerClientHeight: el.clientHeight });
      const b = currentBounds();
      applyLive(zoomPctMapTransformToScale(tx.current, p.x, p.y, tx.current.s * factor, b));
      scheduleCommit(80);
    };

    const midpoint = (t0, t1) => {
      const r = el.getBoundingClientRect();
      return {
        x: (t0.clientX + t1.clientX) / 2 - r.left,
        y: (t0.clientY + t1.clientY) / 2 - r.top,
        dist: Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY),
      };
    };

    const onTouchStart = (e) => {
      if (!gesturesAllowed() || e.touches.length !== 2) return;
      cancelAnimation();
      isPanning.current = false;
      panSamples.current = [];
      pinching.current = true;
      skipClickRef.current = true;
      moved.current = true;
      setWorldWillChange(true);
      pinchStart.current = { tx: { ...tx.current }, mid: midpoint(e.touches[0], e.touches[1]) };
      setInteractionEnabled(true);
      optionsRef.current.onGestureStart?.('pinch');
      e.preventDefault();
    };

    const onTouchMove = (e) => {
      if (!pinching.current || e.touches.length !== 2 || !pinchStart.current) return;
      const mid = midpoint(e.touches[0], e.touches[1]);
      const { tx: start, mid: startMid } = pinchStart.current;
      applyLive(pinchPctMapTransform(start, startMid, mid, currentBounds()));
      e.preventDefault();
    };

    const onTouchEnd = (e) => {
      if (pinching.current && e.touches.length < 2) {
        pinching.current = false;
        pinchStart.current = null;
        if (optionsRef.current.bounds) settle();
        else commit();
        optionsRef.current.onGestureEnd?.();
        setTimeout(() => {
          skipClickRef.current = false;
          moved.current = false;
        }, 0);
      }
    };

    const onDoubleClick = (e) => {
      const opt = optionsRef.current;
      if (!opt.doubleTapZoom || !gesturesAllowed()) return;
      if (typeof opt.isGestureTarget === 'function' && opt.isGestureTarget(e.target)) return;
      e.preventDefault();
      const p = localPoint(e.clientX, e.clientY);
      const fit = fitScaleRef.current || 1;
      const target =
        tx.current.s < fit * opt.doubleTapZoomFactor * 0.9 ? fit * opt.doubleTapZoomFactor : fit;
      if (target <= fit + 1e-6) fitMapAnimated();
      else animateZoomTowardScale(target, p.x, p.y);
    };

    el.addEventListener('pointerdown', onPointerDown, { passive: true });
    el.addEventListener('pointermove', onPointerMove, { passive: false });
    el.addEventListener('pointerup', onPointerUp, { passive: true });
    el.addEventListener('pointercancel', onPointerUp, { passive: true });
    el.addEventListener('pointerleave', onPointerUp, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    el.addEventListener('dblclick', onDoubleClick);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
      el.removeEventListener('pointerleave', onPointerUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      el.removeEventListener('dblclick', onDoubleClick);
    };
  }, [
    animateZoomTowardScale,
    applyLive,
    cancelAnimation,
    commit,
    currentBounds,
    endPan,
    fitMapAnimated,
    localPoint,
    scheduleCommit,
    setWorldWillChange,
    settle,
    toImagePct,
    updatePan,
  ]);

  /* Flèches clavier (hors champs de saisie). */
  useEffect(() => {
    if (!keyboardPan || !enabled) return undefined;
    const ARROW_DELTA = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };
    const onKey = (e) => {
      const t = e.target;
      if (t?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      const dir = ARROW_DELTA[e.key];
      if (!dir) return;
      e.preventDefault();
      const stepPx = e.shiftKey ? 40 : 8;
      panByScreenDelta(dir[0] * stepPx, dir[1] * stepPx);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [keyboardPan, enabled, panByScreenDelta]);

  const prefersPageScroll =
    coarsePointerScrollLock &&
    isCoarsePointer &&
    enabled &&
    committed.s <= fitScale * 1.05 &&
    !interactionEnabled;
  const touchAction = !enabled ? 'auto' : prefersPageScroll ? 'pan-y' : 'none';

  return useMemo(
    () => ({
      containerRef,
      worldRef,
      imgRef,
      tx,
      committed,
      fitScale,
      imgSize,
      imgSizeRef,
      stageSize,
      fitRect,
      moved,
      consumeSkipClick,
      applyTransform,
      commit,
      scheduleCommit,
      fitMap,
      fitMapAnimated,
      remeasure,
      toImagePct,
      animateZoomTowardScale,
      zoomBy,
      focusOnPct,
      animateTo,
      cancelAnimation,
      beginPan,
      updatePan,
      endPan,
      panByScreenDelta,
      beginExternalDrag,
      isCoarsePointer,
      interactionEnabled,
      setInteractionEnabled,
      enableInteraction,
      toggleInteraction,
      prefersPageScroll,
      touchAction,
    }),
    [
      committed,
      fitScale,
      imgSize,
      stageSize,
      fitRect,
      consumeSkipClick,
      applyTransform,
      commit,
      scheduleCommit,
      fitMap,
      fitMapAnimated,
      remeasure,
      toImagePct,
      animateZoomTowardScale,
      zoomBy,
      focusOnPct,
      animateTo,
      cancelAnimation,
      beginPan,
      updatePan,
      endPan,
      panByScreenDelta,
      beginExternalDrag,
      isCoarsePointer,
      interactionEnabled,
      enableInteraction,
      toggleInteraction,
      prefersPageScroll,
      touchAction,
    ],
  );
}
