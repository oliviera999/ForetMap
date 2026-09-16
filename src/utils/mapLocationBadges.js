/**
 * Pastilles de la carte : statut visuel des tâches et compteurs de tutoriels par lieu
 * (zones et repères). Logique pure extraite de `MapView` (map-views.jsx).
 */

import { taskEffectiveStatus } from './taskListHelpers.js';
import { taskVisualStatus, mergeTaskVisualStatus, TASK_VISUAL_LABEL } from './taskEnrollment.js';
import {
  taskLocationIds,
  tutorialLocationIds,
  isTaskDetachedFromLocation,
  taskLinkedTutorialRefs,
} from './mapLocationContext';

/**
 * Statut visuel agrégé des tâches par lieu.
 * @returns {{ zoneTaskVisualById: Map, markerTaskVisualById: Map }}
 */
export function computeTaskVisualByLocation(tasks) {
  const zoneTaskVisualById = new Map();
  const markerTaskVisualById = new Map();
  for (const t of tasks || []) {
    if (isTaskDetachedFromLocation(t)) continue;
    const visual = taskVisualStatus(taskEffectiveStatus(t));
    if (!visual) continue;
    const { zoneIds, markerIds } = taskLocationIds(t);
    zoneIds.forEach((id) => {
      zoneTaskVisualById.set(id, mergeTaskVisualStatus(zoneTaskVisualById.get(id), visual));
    });
    markerIds.forEach((id) => {
      markerTaskVisualById.set(id, mergeTaskVisualStatus(markerTaskVisualById.get(id), visual));
    });
  }
  return { zoneTaskVisualById, markerTaskVisualById };
}

/**
 * Nombre de tutoriels liés par lieu de la carte active : liens directs des tutoriels
 * actifs + liens hérités des tâches (dédoublonnés par paire lieu/tutoriel, sans
 * recompter un lien déjà direct).
 * @returns {{ zoneTutorialCountById: Map, markerTutorialCountById: Map }}
 */
export function computeTutorialCountByLocation({ tutorials, tasks, zones, markers, activeMapId }) {
  const zoneTutorialCountById = new Map();
  const markerTutorialCountById = new Map();
  const bumpZone = (zidRaw, delta = 1) => {
    const z = (zones || []).find((zz) => String(zz.id) === String(zidRaw));
    if (!z || z.map_id !== activeMapId) return;
    const key = z.id;
    zoneTutorialCountById.set(key, (zoneTutorialCountById.get(key) || 0) + delta);
  };
  const bumpMarker = (midRaw, delta = 1) => {
    const mk = (markers || []).find((mm) => String(mm.id) === String(midRaw));
    if (!mk || mk.map_id !== activeMapId) return;
    const key = mk.id;
    markerTutorialCountById.set(key, (markerTutorialCountById.get(key) || 0) + delta);
  };
  for (const tu of tutorials || []) {
    if (tu.is_active === false) continue;
    const { zoneIds, markerIds } = tutorialLocationIds(tu);
    for (const zid of zoneIds) bumpZone(zid, 1);
    for (const mid of markerIds) bumpMarker(mid, 1);
  }
  const pairSeen = new Set();
  for (const t of tasks || []) {
    if (isTaskDetachedFromLocation(t)) continue;
    const tuRefs = taskLinkedTutorialRefs(t, tutorials || []);
    if (!tuRefs.length) continue;
    const { zoneIds: tZones, markerIds: tMarkers } = taskLocationIds(t);
    for (const tu of tuRefs) {
      if (tu.is_active === false) continue;
      const direct = tutorialLocationIds(tu);
      const directZoneStr = new Set(direct.zoneIds.map((x) => String(x)));
      const directMarkerStr = new Set(direct.markerIds.map((x) => String(x)));
      const tid = String(tu.id);
      for (const zid of tZones) {
        if (directZoneStr.has(String(zid))) continue;
        const k = `z:${String(zid)}:tu:${tid}`;
        if (pairSeen.has(k)) continue;
        pairSeen.add(k);
        bumpZone(zid, 1);
      }
      for (const mid of tMarkers) {
        if (directMarkerStr.has(String(mid))) continue;
        const k = `m:${String(mid)}:tu:${tid}`;
        if (pairSeen.has(k)) continue;
        pairSeen.add(k);
        bumpMarker(mid, 1);
      }
    }
  }
  return { zoneTutorialCountById, markerTutorialCountById };
}

/**
 * Ton de pastille (`PctStatusDotsLayer`, neutre produit) par statut visuel de tâche.
 * Mêmes couleurs que les pastilles historiques de la carte de travail : rouge « à faire »,
 * orange « en cours », vert « terminée ».
 */
export const TASK_STATUS_DOT_VARIANT = Object.freeze({
  todo: 'alert',
  progress: 'warn',
  done: 'ok',
});

/** Libellé accessible de la pastille « tutoriels liés ». */
export function tutorialDotLabel(count) {
  return count === 1 ? '1 tutoriel lié' : `${count} tutoriels liés`;
}

/**
 * Pastilles d'état d'un lieu pour la scène partagée (`SharedMapStage`) : état des tâches en
 * haut à droite, tutoriels liés en bas à gauche — les mêmes positions que sur l'ancienne
 * carte de travail (`ZonePolygonsLayer` / `MapViewMarkerBubble`).
 *
 * @param {{ taskVisual?: string|null, tutorialCount?: number }} params
 * @returns {Array<{ variant: string, label: string, placement: string }>} vide si rien à poser.
 */
export function locationStatusDots({ taskVisual, tutorialCount = 0 } = {}) {
  const dots = [];
  const variant = TASK_STATUS_DOT_VARIANT[taskVisual];
  if (variant) {
    dots.push({
      variant,
      label: TASK_VISUAL_LABEL[taskVisual] || '',
      placement: 'top-right',
    });
  }
  if (tutorialCount > 0) {
    dots.push({
      variant: 'info',
      label: tutorialDotLabel(tutorialCount),
      placement: 'bottom-left',
    });
  }
  return dots;
}
