import { useCallback, useEffect, useMemo, useRef } from 'react';
import { api } from '../services/api';
import { usePctMapViewport } from '../shared/pct-map/usePctMapViewport.js';

const FM_MAP_FULLSCREEN_LAYER_SELECTOR = '.fm-map-fullscreen-layer';
const EMBEDDED_H_FLOOR = 96;
const FULLSCREEN_H_FLOOR = 64;

/** Bornes d’échelle de la carte des zones (molette, pinch, boutons +/−). */
const MAP_VIEW_SCALE_MIN = 0.15;
const MAP_VIEW_SCALE_MAX = 8;

/**
 * Zone utile (px) pour le cadre carte dans `map-view-canvas-outer`.
 * En plein écran (portail body), on s’appuie sur les dimensions du conteneur / viewport,
 * pas sur `.main` (absent du portail) — évite un cadre 1×1 et un plan invisible.
 */
function resolveMapLayoutAvailBox(
  outer,
  { embedded, padL, padR, padT, padB, mapFullscreen = false },
) {
  const inFullscreenLayer = mapFullscreen || !!outer?.closest?.(FM_MAP_FULLSCREEN_LAYER_SELECTOR);
  const availW = Math.max(1, outer.clientWidth - padL - padR);

  if (inFullscreenLayer) {
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const vw = window.visualViewport?.width ?? window.innerWidth;
    let availH = outer.clientHeight - padT - padB;
    let availW = outer.clientWidth - padL - padR;
    if (!Number.isFinite(availH) || availH < FULLSCREEN_H_FLOOR) {
      availH = vh - padT - padB;
    }
    if (!Number.isFinite(availW) || availW < FULLSCREEN_H_FLOOR) {
      availW = vw - padL - padR;
    }
    return { availW: Math.max(1, availW), availH: Math.max(1, availH) };
  }

  let availH;
  if (embedded) {
    availH = Math.max(1, outer.clientHeight - padT - padB);
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

  return { availW, availH };
}

/** Cibles qui ne démarrent jamais un pan de la carte (poignées d'édition, bulles de repère). */
function isMapGestureTarget(target) {
  return Boolean(target?.closest?.('.edit-pt, .map-bubble'));
}

/**
 * Gestes de la carte de travail ForetMap — adaptateur mince du moteur partagé
 * `usePctMapViewport` (lot 2 du plan de convergence). Ce hook ne garde que ce qui est propre
 * à ForetMap : la mesure du cadre dans `map-view-canvas-outer` (`resolveMapLayoutAvailBox`),
 * la variable CSS `--fm-map-canvas-w` de la barre d'outils, et la persistance du glisser d'un
 * repère (PUT `/api/map/markers/:id`). Tout le reste (pan, molette, pinch + déplacement,
 * double-tap, inertie, bornes, verrou tactile, flèches clavier) vit dans le moteur.
 *
 * L'API retournée est celle consommée historiquement par `MapView`, `MapViewToolbar` et
 * `useZoneEditPoints` : identités stables (mémoïsées) pour `React.memo` en aval.
 */
function useMapGestures({
  mapImageSrc,
  activeMapId,
  mode,
  onRefresh,
  embedded = false,
  mapLayoutOuterRef = null,
  mapFullscreen = false,
}) {
  const optionsRef = useRef({});
  optionsRef.current = { embedded, mapLayoutOuterRef, mapFullscreen };

  /** Largeur du cadre → `--fm-map-canvas-w` sur `.map-view-root` (barre d'outils alignée). */
  const syncToolbarWidth = useCallback((container, cw) => {
    const root = container?.closest?.('.map-view-root');
    if (!root) return;
    if (cw > 0) root.style.setProperty('--fm-map-canvas-w', `${cw}px`);
    else root.style.removeProperty('--fm-map-canvas-w');
  }, []);

  /**
   * Cadre = toute la zone disponible de `map-view-canvas-outer` (le « contain » de l'image
   * est porté par la transformation) ; sans conteneur externe, la boîte client du cadre.
   */
  const resolveStageBox = useCallback(
    (container) => {
      const { embedded: emb, mapLayoutOuterRef: outerRef, mapFullscreen: fs } = optionsRef.current;
      const outer = outerRef?.current;
      if (!outer) {
        syncToolbarWidth(container, Math.max(1, container.clientWidth));
        return null;
      }
      const st = getComputedStyle(outer);
      const padL = parseFloat(st.paddingLeft) || 0;
      const padR = parseFloat(st.paddingRight) || 0;
      const padT = parseFloat(st.paddingTop) || 0;
      const padB = parseFloat(st.paddingBottom) || 0;
      const { availW, availH } = resolveMapLayoutAvailBox(outer, {
        embedded: emb,
        padL,
        padR,
        padT,
        padB,
        mapFullscreen: fs,
      });
      syncToolbarWidth(container, availW);
      return { w: availW, h: availH };
    },
    [syncToolbarWidth],
  );

  const fullscreenLayerRef = useRef(null);
  fullscreenLayerRef.current =
    mapLayoutOuterRef?.current?.closest?.(FM_MAP_FULLSCREEN_LAYER_SELECTOR) || null;
  const observeRefs = useMemo(
    () => [mapLayoutOuterRef, fullscreenLayerRef],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mapLayoutOuterRef, mapFullscreen],
  );

  const viewport = usePctMapViewport({
    imageSrc: mapImageSrc,
    contentMode: 'image',
    enabled: true,
    panEnabled: mode === 'view',
    minScale: MAP_VIEW_SCALE_MIN,
    maxScale: MAP_VIEW_SCALE_MAX,
    bounds: true,
    doubleTapZoom: mode === 'view',
    inertia: true,
    keyboardPan: mode === 'view',
    coarsePointerScrollLock: true,
    onResize: 'fit',
    isGestureTarget: isMapGestureTarget,
    resolveStageBox: mapLayoutOuterRef ? resolveStageBox : null,
    observeRefs,
    resetKey: `${activeMapId}|${embedded ? 1 : 0}|${mapFullscreen ? 1 : 0}`,
  });

  const {
    containerRef,
    worldRef,
    imgRef,
    tx,
    committed,
    fitScale,
    imgSize,
    imgSizeRef,
    moved,
    applyTransform,
    commit,
    fitMap,
    remeasure,
    toImagePct,
    animateZoomTowardScale,
    focusOnPct,
    beginPan,
    updatePan,
    endPan,
    panByScreenDelta,
    beginExternalDrag,
    isCoarsePointer,
    interactionEnabled,
    setInteractionEnabled,
    toggleInteraction,
    prefersPageScroll,
    touchAction,
  } = viewport;

  // Variable CSS de la barre d'outils retirée au démontage (comme avant).
  useEffect(() => {
    const c = containerRef.current;
    return () => {
      const root = c?.closest?.('.map-view-root');
      if (root) root.style.removeProperty('--fm-map-canvas-w');
    };
  }, [containerRef]);

  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  /**
   * Glisser d'un repère (prof, position déverrouillée) : suit le pointeur en % image puis
   * persiste la position finale — la vue ne bouge pas pendant le glisser.
   */
  const beginMarkerDrag = useCallback(
    (id, target, pointerId) => {
      beginExternalDrag(target, pointerId, {
        onMove: (p) => {
          target.style.left = `${p.xp}%`;
          target.style.top = `${p.yp}%`;
        },
        onEnd: (p) => {
          if (!p) return;
          api(`/api/map/markers/${id}`, 'PUT', { x_pct: p.xp, y_pct: p.yp }).then(() =>
            onRefreshRef.current?.(),
          );
        },
      });
    },
    [beginExternalDrag],
  );

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
      moved,
      applyTransform,
      commit,
      fitMap,
      remeasureMap: remeasure,
      toImagePct,
      focusOnPct,
      beginMarkerDrag,
      isCoarsePointer,
      mapInteractionEnabled: interactionEnabled,
      setMapInteractionEnabled: setInteractionEnabled,
      toggleMapInteraction: toggleInteraction,
      prefersPageScroll,
      touchAction,
      animateZoomTowardScale,
      beginPan,
      updatePan,
      endPan,
      panByScreenDelta,
    }),
    [
      containerRef,
      worldRef,
      imgRef,
      tx,
      committed,
      fitScale,
      imgSize,
      imgSizeRef,
      moved,
      applyTransform,
      commit,
      fitMap,
      remeasure,
      toImagePct,
      focusOnPct,
      beginMarkerDrag,
      isCoarsePointer,
      interactionEnabled,
      setInteractionEnabled,
      toggleInteraction,
      prefersPageScroll,
      touchAction,
      animateZoomTowardScale,
      beginPan,
      updatePan,
      endPan,
      panByScreenDelta,
    ],
  );
}

export { useMapGestures, resolveMapLayoutAvailBox, MAP_VIEW_SCALE_MIN, MAP_VIEW_SCALE_MAX };
