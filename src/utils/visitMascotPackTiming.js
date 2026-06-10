/**
 * Helpers purs de pack de mascotte de visite — extraits de `VisitMascotPackManager.jsx` (O6).
 *
 * Détection d'URL d'image prévisualisable (bibliothèque de sprites) et estimation de la durée
 * d'animation d'un état (somme des `frameDwellMs` si fournie, sinon dérivée du `fps`). Purs.
 */

/** Vrai si l'URL pointe vers une image prévisualisable (extension image, avec ou sans query). */
export function isSpriteLibraryPreviewableUrl(url) {
  return /\.(png|jpg|jpeg|webp|gif|svg)(\?|$)/i.test(String(url || ''));
}

/**
 * Durée estimée (ms) de l'animation d'un état d'un pack, ou `null` si indéterminable.
 * Préfère la somme des `frameDwellMs` (si une valeur par frame), sinon `1000/fps × nbFrames`.
 * @param {Record<string, unknown>} pack
 * @param {string} stateKey
 */
export function estimateStateDurationMs(pack, stateKey) {
  const sf = pack?.stateFrames && typeof pack.stateFrames === 'object' ? pack.stateFrames[stateKey] : null;
  if (!sf || typeof sf !== 'object') return null;
  const nFiles = Array.isArray(sf.files) ? sf.files.length : Array.isArray(sf.srcs) ? sf.srcs.length : 0;
  if (nFiles <= 0) return null;
  if (Array.isArray(sf.frameDwellMs) && sf.frameDwellMs.length === nFiles) {
    return sf.frameDwellMs.reduce((a, b) => a + (Number(b) || 0), 0);
  }
  const fps = Math.max(1, Number(sf.fps) || 8);
  return Math.round((1000 / fps) * nFiles);
}
