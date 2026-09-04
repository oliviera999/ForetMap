/**
 * Rectangle de rendu d'une image en `object-fit: contain` dans une boîte (noyau carte partagé).
 * Implémentation canonique, ré-exportée par `src/utils/zoneGeometry.js` et `mapImageFit.js`
 * sous son nom historique `computeMapImageContainRect`.
 * @param {number} nw largeur naturelle de l'image (0 → la boîte entière).
 * @param {number} nh hauteur naturelle.
 * @param {number} cw largeur de la boîte.
 * @param {number} ch hauteur de la boîte.
 * @returns {{ offsetX: number, offsetY: number, width: number, height: number }}
 */
export function computeContainRect(nw, nh, cw, ch) {
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

export { computeContainRect as computeMapImageContainRect };
