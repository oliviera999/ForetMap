/**
 * Constantes et placement % de la mascotte sur le plan carte (forêt / visite).
 */

export const MAP_VIEW_MASCOT_MOVE_MS = 560;
export const MAP_VIEW_MASCOT_HAPPY_MS = 1800;
export const MAP_VIEW_MASCOT_DIALOG_MS = 2600;
export const MAP_VIEW_MASCOT_DIALOG_MOVE_COOLDOWN_MS = 4200;
export const MAP_VIEW_MASCOT_ESTIMATED_HEIGHT_PX = 78;

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
