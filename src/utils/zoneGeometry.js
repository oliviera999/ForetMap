/**
 * Géométrie de zones — module **fédérateur** (§5.3 de `docs/AUDIT_CODE_2026-07.md`).
 *
 * Regroupe les helpers purs qui étaient dupliqués ligne à ligne entre la carte visite
 * (`visitMapGeometry.js`) et la carte biodiversité (`biodivMapGeometry.js`) :
 * - le parsing des points de polygone de zone (`parseZonePoints`) ;
 * - le rectangle de rendu de l'image du plan en `object-fit: contain`
 *   (`computeMapImageContainRect`).
 *
 * Les anciens emplacements (`visitMapGeometry.js`, `mapImageFit.js`) ré-exportent ces
 * implémentations sous leurs noms publics historiques — aucun importateur n'est cassé.
 */

/**
 * Points d'un polygone de zone (JSON stocké), normalisés en pourcentages 0–100.
 * @param {string} raw
 * @returns {{ xp: number, yp: number }[]}
 */
export function parseZonePoints(raw) {
  try {
    const points = JSON.parse(raw || '[]');
    if (!Array.isArray(points)) return [];
    return points
      .map((p) => ({
        xp: Number(p?.xp),
        yp: Number(p?.yp),
      }))
      .filter((p) => Number.isFinite(p.xp) && Number.isFinite(p.yp));
  } catch (_) {
    return [];
  }
}

/**
 * Rectangle (px, espace « monde » carte) où l'image du plan est réellement dessinée
 * après équivalent `object-fit: contain` dans une boîte cw×ch.
 *
 * Utilisé par la **carte visite** (`visit-views.jsx`) et la **carte biodiversité**
 * (`biodivMapGeometry.js`) pour aligner SVG / repères en % sur le même rectangle que
 * l'image affichée.
 *
 * La **carte tâches** (`map-views.jsx`) applique une logique plus riche (`measureAndFit`,
 * viewport mobile, conteneur embarqué, paddings) : les % stockés restent valides si la
 * même `map_image_url` remplit le cadre de la même façon ; en cas d'écart de cadre,
 * comparer visuellement les deux vues après synchronisation carte ↔ visite.
 *
 * @param {number} nw largeur naturelle de l'image (0 si inconnue)
 * @param {number} nh hauteur naturelle de l'image (0 si inconnue)
 * @param {number} cw largeur du conteneur (px)
 * @param {number} ch hauteur du conteneur (px)
 * @returns {{ offsetX: number, offsetY: number, width: number, height: number }}
 */
export function computeMapImageContainRect(nw, nh, cw, ch) {
  const boxW = Math.max(1, cw);
  const boxH = Math.max(1, ch);
  if (!nw || !nh) {
    return { offsetX: 0, offsetY: 0, width: boxW, height: boxH };
  }
  const scale = Math.min(boxW / nw, boxH / nh);
  const width = nw * scale;
  const height = nh * scale;
  const offsetX = (boxW - width) / 2;
  const offsetY = (boxH - height) / 2;
  return { offsetX, offsetY, width, height };
}
