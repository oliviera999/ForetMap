/**
 * Rectangle (px, espace « monde » carte) où l’image du plan est réellement dessinée
 * après équivalent `object-fit: contain` dans une boîte cw×ch.
 *
 * Utilisé par la **carte visite** (`visit-views.jsx`) pour aligner SVG / repères en %
 * sur le même rectangle que l’image affichée.
 *
 * La **carte tâches** (`map-views.jsx`) applique une logique plus riche (`measureAndFit`,
 * viewport mobile, conteneur embarqué, paddings) : les % stockés restent valides si la
 * même `map_image_url` remplit le cadre de la même façon ; en cas d’écart de cadre,
 * comparer visuellement les deux vues après synchronisation carte ↔ visite.
 *
 * @param {number} nw largeur naturelle de l’image (0 si inconnue)
 * @param {number} nh hauteur naturelle de l’image (0 si inconnue)
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

/**
 * Dimensions client d’une scène carte ; en plein écran, repli viewport si le layout n’est pas encore stabilisé.
 * @param {HTMLElement|null|undefined} el
 * @param {{ fullscreen?: boolean, minSide?: number }} [options]
 */
export function resolveMapStageClientBox(el, { fullscreen = false, minSide = 200 } = {}) {
  const vw = window.visualViewport?.width ?? window.innerWidth;
  const vh = window.visualViewport?.height ?? window.innerHeight;
  let cw = Math.max(1, el?.clientWidth || 0);
  let ch = Math.max(1, el?.clientHeight || 0);
  if (fullscreen && (cw < minSide || ch < minSide)) {
    return { cw: Math.max(1, vw), ch: Math.max(1, vh) };
  }
  return { cw, ch };
}
