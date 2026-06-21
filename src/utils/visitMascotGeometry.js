/**
 * Helpers purs de géométrie de la carte de visite — extraits de `visit-views.jsx` (O6).
 *
 * Compensation de l'étirement anisotrope du SVG pour les `<text>`/emojis, et bornage de la position
 * en pourcentage de la mascotte pour rester visible dans le viewport. Aucune dépendance ni effet de bord.
 */

/** Hauteur estimée (px) de la mascotte de visite, pour garantir sa visibilité en bas de carte. */
export const VISIT_MAP_MASCOT_ESTIMATED_HEIGHT_PX = 78;

/**
 * Compense l'étirement anisotrope du SVG (viewBox carré + `preserveAspectRatio="none"` sur un
 * rectangle carte) : sans cela, les `<text>` et emojis paraissent tassés sur l'axe Y dès que
 * largeur ≠ hauteur. Retourne un `transform` SVG, ou `undefined` si inutile (carré / dimensions nulles).
 */
export function visitZoneSvgTextUniformYTransform(cx, cy, fitW, fitH) {
  if (!(fitW > 0 && fitH > 0)) return undefined;
  const r = fitW / fitH;
  if (Math.abs(r - 1) < 0.0005) return undefined;
  return `translate(${cx},${cy}) scale(1,${r}) translate(${-cx},${-cy})`;
}

/**
 * Borne la position (en %) de la mascotte dans `[0,100]` sur X, et garantit qu'elle reste visible
 * verticalement (au moins `minVisibleY`, au plus 99.2) quand la hauteur d'affichage est connue.
 * @returns {{ xp: number, yp: number }}
 */
export function clampVisitMascotPctForViewport(xp, yp, fitHeightPx = 0) {
  const nx = Math.max(0, Math.min(100, Number(xp) || 0));
  const rawY = Math.max(0, Math.min(100, Number(yp) || 0));
  if (!(fitHeightPx > 0)) return { xp: nx, yp: rawY };
  const minVisibleY = Math.max(
    6,
    (VISIT_MAP_MASCOT_ESTIMATED_HEIGHT_PX / Math.max(1, fitHeightPx)) * 100,
  );
  const ny = Math.max(minVisibleY, Math.min(99.2, rawY));
  return { xp: nx, yp: ny };
}
