/**
 * Normalise une clé média (nom fichier GL_* ou slug) — aligné sur lib/glAssetManifest.deriveMediaStableKey.
 */
export function normalizeGlMediaStableKey(fileName) {
  let base = String(fileName || '').trim();
  const dot = base.lastIndexOf('.');
  if (dot > 0) base = base.slice(0, dot);
  if (/^gl_/i.test(base)) base = base.slice(3);
  return base.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}
