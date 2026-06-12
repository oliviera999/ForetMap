/**
 * Géométrie pure du pan/zoom du plan de visite (`VisitView`).
 * Transform = { x, y, s } : translation px écran + échelle, appliqués au calque carte.
 * Bornes et formules identiques aux gestes historiques (molette, pinch, boutons +/−).
 */

export const VISIT_MAP_SCALE_MIN = 1;
export const VISIT_MAP_SCALE_MAX = 6;

/** Échelle bornée [1, 6] ; valeurs non numériques / nulles → échelle minimale. */
export function clampVisitMapScale(scale) {
  const s = Number(scale) || VISIT_MAP_SCALE_MIN;
  return Math.max(VISIT_MAP_SCALE_MIN, Math.min(VISIT_MAP_SCALE_MAX, s));
}

/**
 * Borne une transformation candidate au cadre de la scène.
 * Sans rect exploitable ou à l'échelle 1, le plan est recentré (x=0, y=0) :
 * le contenu remplit exactement la scène, aucun débord à compenser.
 * @param {{ x?: number, y?: number, s?: number }} next transformation candidate.
 * @param {{ width: number, height: number }|null} rect cadre de la scène (getBoundingClientRect).
 * @returns {{ x: number, y: number, s: number }}
 */
export function clampVisitMapTransform(next, rect = null) {
  const safeScale = clampVisitMapScale(next?.s);
  if (!rect || !rect.width || !rect.height || safeScale <= 1) {
    return { x: 0, y: 0, s: safeScale };
  }
  const minX = rect.width * (1 - safeScale);
  const minY = rect.height * (1 - safeScale);
  const x = Math.min(0, Math.max(minX, Number(next?.x) || 0));
  const y = Math.min(0, Math.max(minY, Number(next?.y) || 0));
  return { x, y, s: safeScale };
}

/**
 * Zoom vers une échelle cible en gardant le point (px, py) — coordonnées scène en px —
 * visuellement fixe : x' = px − (px − x) · (s'/s). Résultat borné via `clampVisitMapTransform`.
 * Sert la molette (échelle = s·facteur), le pinch (échelle = s₀·dist/dist₀)
 * et chaque pas de l'animation des boutons +/− (échelle interpolée).
 * @param {{ x?: number, y?: number, s?: number }} from transformation de départ.
 * @param {number} px abscisse du point fixe dans la scène.
 * @param {number} py ordonnée du point fixe dans la scène.
 * @param {number} nextScale échelle cible (sera bornée [1, 6]).
 * @param {{ width: number, height: number }|null} rect cadre de la scène pour le clamp final.
 * @returns {{ x: number, y: number, s: number }}
 */
export function zoomVisitTransformToScale(from, px, py, nextScale, rect = null) {
  const fromScale = Number(from?.s) || 1;
  const s = clampVisitMapScale(nextScale);
  const ratio = s / fromScale;
  return clampVisitMapTransform({
    s,
    x: px - (px - (Number(from?.x) || 0)) * ratio,
    y: py - (py - (Number(from?.y) || 0)) * ratio,
  }, rect);
}
