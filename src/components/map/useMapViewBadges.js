/**
 * Pastilles d'état des lieux de la carte de travail : état des tâches liées à chaque zone et
 * repère, nombre de tutoriels liés (affiché seulement si l'admin l'active), et leur rendu
 * sur la scène partagée (lieu seul ou groupe de repères).
 *
 * Extrait de `MapViewImpl` (`src/components/map-views.jsx`, étape B4 de l'audit du
 * 25/09/2026, § 3.3 ligne 5 — patron O6), sans changement de comportement.
 */
import { useCallback, useMemo } from 'react';
import {
  clusterStatusDots,
  computeTaskVisualByLocation,
  computeTutorialCountByLocation,
  locationStatusDots,
} from '../../utils/mapLocationBadges.js';

export function useMapViewBadges({
  tasks,
  tutorials,
  zones,
  markers,
  activeMapId,
  showTutorialDots,
}) {
  const { zoneTaskVisualById, markerTaskVisualById } = useMemo(
    () => computeTaskVisualByLocation(tasks),
    [tasks],
  );

  const { zoneTutorialCountById, markerTutorialCountById } = useMemo(
    () => computeTutorialCountByLocation({ tutorials, tasks, zones, markers, activeMapId }),
    [tutorials, zones, markers, activeMapId, tasks],
  );

  /**
   * Pastilles d'état des lieux sur la scène partagée (consultation) : état des tâches, et
   * tutoriels liés si l'admin les affiche. Ce sont les pastilles historiques de la carte de
   * travail, rendues par `PctStatusDotsLayer` depuis l'unification sur `SharedMapStage` —
   * sans ce branchement, la scène n'en affichait plus aucune.
   */
  const getStageZoneStatusDots = useCallback(
    (zone) =>
      locationStatusDots({
        kind: 'zone',
        taskVisual: zoneTaskVisualById.get(zone?.id),
        tutorialCount: showTutorialDots ? zoneTutorialCountById.get(zone?.id) || 0 : 0,
      }),
    [zoneTaskVisualById, zoneTutorialCountById, showTutorialDots],
  );

  const getStageMarkerStatusDots = useCallback(
    (marker) =>
      locationStatusDots({
        kind: 'marker',
        taskVisual: markerTaskVisualById.get(marker?.id),
        tutorialCount: showTutorialDots ? markerTutorialCountById.get(marker?.id) || 0 : 0,
      }),
    [markerTaskVisualById, markerTutorialCountById, showTutorialDots],
  );

  /**
   * Pastilles d'un **groupe** de repères : l'état le plus actionnable du groupe. Sans elles,
   * les repères regroupés au dézoom (l'état d'arrivée sur la carte) n'affichaient plus rien.
   */
  const getStageClusterStatusDots = useCallback(
    (markersOfCluster) =>
      clusterStatusDots(markersOfCluster, {
        taskVisualById: markerTaskVisualById,
        tutorialCountById: markerTutorialCountById,
        withTutorials: showTutorialDots,
      }),
    [markerTaskVisualById, markerTutorialCountById, showTutorialDots],
  );

  return {
    zoneTaskVisualById,
    markerTaskVisualById,
    zoneTutorialCountById,
    markerTutorialCountById,
    getStageZoneStatusDots,
    getStageMarkerStatusDots,
    getStageClusterStatusDots,
  };
}
