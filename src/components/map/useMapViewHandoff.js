/**
 * Passage de relais de la vue (zoom + point central) entre les deux moteurs de la carte de
 * travail : la scène partagée de consultation (`WorkMapStage`) et le canevas d'édition
 * (`MapViewEditCanvas`, moteur `useMapGestures`). Chaque bascule démonte l'un et monte l'autre ;
 * sans relais, le moteur entrant repartait de la carte entière — ouvrir l'édition d'une zone,
 * tracer une zone ou poser un repère faisait perdre le zoom et le cadrage choisis.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { pctMapViewSnapshot } from '../../shared/pct-map/pctMapTransform.js';

/**
 * @param {object} options
 * @param {boolean} options.useSharedViewStage la scène de consultation porte la carte
 * @param {{ x: number, y: number, s: number }} options.committed vue commitée du canevas d'édition
 * @param {{ w: number, h: number }} options.stageSize cadre du canevas d'édition
 * @param {{ w: number, h: number }} options.imgSize taille naturelle de l'image du plan
 * @param {number} options.fitScale échelle d'ajustement du canevas d'édition
 * @param {(snapshot: object|null) => void} options.restoreView restitution côté canevas d'édition
 * @param {{ current: { getViewSnapshot?: () => object|null } }} options.workViewportApiRef pont
 *   vers la scène de consultation
 * @returns {{ stageInitialView: object|null }} vue à remettre à la scène quand elle se remonte
 */
export function useMapViewHandoff({
  useSharedViewStage,
  committed,
  stageSize,
  imgSize,
  fitScale,
  restoreView,
  workViewportApiRef,
}) {
  const editViewSnapshot = useMemo(
    () =>
      pctMapViewSnapshot({
        transform: committed,
        stage: stageSize,
        fitRect: { offsetX: 0, offsetY: 0, width: imgSize.w, height: imgSize.h },
        fitScale,
      }),
    [committed, stageSize, imgSize.w, imgSize.h, fitScale],
  );

  // Édition → consultation : la vue doit être connue dès le rendu qui monte la scène.
  const [previousShared, setPreviousShared] = useState(useSharedViewStage);
  const [stageInitialView, setStageInitialView] = useState(null);
  if (previousShared !== useSharedViewStage) {
    setPreviousShared(useSharedViewStage);
    setStageInitialView(useSharedViewStage ? editViewSnapshot : null);
  }
  // Lue au montage seulement : on l'oublie ensuite, pour qu'un remontage ultérieur de la scène
  // (plein écran…) ne ressuscite pas une vue périmée.
  useEffect(() => {
    if (stageInitialView) setStageInitialView(null);
  }, [stageInitialView]);

  // Consultation → édition : la scène vient d'être démontée, ses refs restent lisibles.
  const sharedAtLastEffectRef = useRef(useSharedViewStage);
  useLayoutEffect(() => {
    if (sharedAtLastEffectRef.current === useSharedViewStage) return;
    sharedAtLastEffectRef.current = useSharedViewStage;
    if (!useSharedViewStage) restoreView(workViewportApiRef.current.getViewSnapshot?.() || null);
  }, [useSharedViewStage, restoreView, workViewportApiRef]);

  return { stageInitialView };
}
