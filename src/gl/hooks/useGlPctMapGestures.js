import { useCallback, useMemo } from 'react';
import { usePctMapViewport } from '../../shared/pct-map/usePctMapViewport.js';

/** Cibles qui ne démarrent pas un pan du plateau : repères, poignées d'édition, boutons. */
function isGlBoardGestureTarget(target) {
  return Boolean(
    target?.closest?.(
      '.gl-board-marker, .gl-pct-edit-overlay, .gl-board-zoom-controls, button, a, [data-pct-no-pan]',
    ),
  );
}

/**
 * Gestes des plateaux Gnomes & Licornes — adaptateur mince du moteur de carte partagé
 * `usePctMapViewport` (lot 2 du plan de convergence). Jusqu'ici les plateaux ne connaissaient
 * que le clic (`toImagePct`) ; ils gagnent pan, molette, pinch + déplacement, double-tap et
 * inertie, en mode « scène » (calque monde = cadre, image en `object-fit: contain`).
 *
 * L'API historique est conservée : `containerRef`, `imageRef`, `toImagePct(clientX, clientY)`
 * → `{ x, y }` bornés 0–100 (ou `null` hors cadre mesurable). Le moteur complet est exposé
 * sous `viewport` et ses membres utiles sont aplatis (`worldRef`, `fitRect`, `fitMap`, …).
 *
 * @param {object} [options]
 * @param {string} [options.imageSrc] source de l'image (remesure quand elle change).
 * @param {boolean} [options.enabled=true] pan/zoom actifs (à couper pendant un glisser d'édition).
 * @param {boolean} [options.panEnabled=true] pan au pointeur seul (molette/pinch restent actifs).
 * @param {(target: Element) => boolean} [options.isGestureTarget] cibles exclues du pan.
 * @param {string} [options.resetKey] changement de plateau : réajustement.
 * @param {boolean} [options.doubleTapZoom=true]
 */
export function useGlPctMapGestures({
  imageSrc = '',
  enabled = true,
  panEnabled = true,
  isGestureTarget = isGlBoardGestureTarget,
  resetKey = '',
  doubleTapZoom = true,
} = {}) {
  const viewport = usePctMapViewport({
    imageSrc,
    contentMode: 'stage',
    enabled,
    panEnabled,
    onResize: 'clamp',
    resetKey,
    doubleTapZoom,
    isGestureTarget,
  });

  const { containerRef, worldRef, imgRef, toImagePct: viewportToImagePct } = viewport;

  /** Pointeur (client) → `{ x, y }` en % du rectangle image, bornés 0–100 (contrat GL). */
  const toImagePct = useCallback(
    (clientX, clientY) => {
      const p = viewportToImagePct(clientX, clientY, { clamp: true });
      if (!p || p.xp == null || p.yp == null) return null;
      return { x: p.xp, y: p.yp };
    },
    [viewportToImagePct],
  );

  return useMemo(
    () => ({
      containerRef,
      imageRef: imgRef,
      worldRef,
      toImagePct,
      viewport,
      fitRect: viewport.fitRect,
      imgSize: viewport.imgSize,
      committed: viewport.committed,
      touchAction: viewport.touchAction,
      fitMap: viewport.fitMap,
      fitMapAnimated: viewport.fitMapAnimated,
      zoomBy: viewport.zoomBy,
      focusOnPct: viewport.focusOnPct,
      consumeSkipClick: viewport.consumeSkipClick,
    }),
    [containerRef, imgRef, worldRef, toImagePct, viewport],
  );
}

export { isGlBoardGestureTarget };
