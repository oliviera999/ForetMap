/**
 * Constantes et placement % de la mascotte sur le plan carte (forêt / visite).
 */

import { VISIT_MASCOT_STATE } from './visitMascotState.js';

export const MAP_VIEW_MASCOT_MOVE_MS = 560;
export const MAP_VIEW_MASCOT_HAPPY_MS = 1800;
export const MAP_VIEW_MASCOT_DIALOG_MS = 2600;
export const MAP_VIEW_MASCOT_DIALOG_MOVE_COOLDOWN_MS = 4200;
export const MAP_VIEW_MASCOT_ESTIMATED_HEIGHT_PX = 78;

/** Seuils % plan carte — alignés visite (`useMapViewMascot`). */
export const MAP_VIEW_MASCOT_RUN_DIST_PCT = 15;
export const MAP_VIEW_MASCOT_SURPRISE_DIST_PCT = 9;

export const MAP_VIEW_MASCOT_RUN_TRANSIENT_MS = 1000;
export const MAP_VIEW_MASCOT_SURPRISE_TRANSIENT_MS = 900;
export const MAP_VIEW_MASCOT_INSPECT_TRANSIENT_MS = 1200;

/**
 * État transitoire mascotte selon la distance parcourue (course / surprise).
 * @param {number} distPct distance euclidienne en % du plan
 * @returns {{ state: string, durationMs: number } | null}
 */
export function pickMapMascotMoveTransient(distPct) {
  const dist = Number(distPct);
  if (!Number.isFinite(dist) || dist < MAP_VIEW_MASCOT_SURPRISE_DIST_PCT) return null;
  if (dist > MAP_VIEW_MASCOT_RUN_DIST_PCT) {
    return { state: VISIT_MASCOT_STATE.RUNNING, durationMs: MAP_VIEW_MASCOT_RUN_TRANSIENT_MS };
  }
  return { state: VISIT_MASCOT_STATE.SURPRISE, durationMs: MAP_VIEW_MASCOT_SURPRISE_TRANSIENT_MS };
}

/**
 * Évite que la mascotte soit coupée en bas du viewport (repère %, pieds en bas du sprite).
 * @param {number} xp
 * @param {number} yp
 * @param {number} fitHeightPx hauteur affichée du plan en px
 * @returns {{ xp: number, yp: number }}
 */
export function clampMapMascotPctForViewport(xp, yp, fitHeightPx = 0) {
  const nx = Math.max(0, Math.min(100, Number(xp) || 0));
  const rawY = Math.max(0, Math.min(100, Number(yp) || 0));
  if (!(fitHeightPx > 0)) return { xp: nx, yp: rawY };
  const minVisibleY = Math.max(
    6,
    (MAP_VIEW_MASCOT_ESTIMATED_HEIGHT_PX / Math.max(1, fitHeightPx)) * 100,
  );
  const ny = Math.max(minVisibleY, Math.min(99.2, rawY));
  return { xp: nx, yp: ny };
}
