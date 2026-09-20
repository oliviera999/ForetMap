/**
 * Découpage de listes d’ids pour les routes bornées (gating/summary, etc.).
 * Partagé ForetMap / GL — ne pas importer depuis un produit.
 */

export const IDS_BATCH_SIZE_DEFAULT = 200;
export const IDS_DEBOUNCE_MS_DEFAULT = 280;

/**
 * @template T
 * @param {T[]} ids
 * @param {number} [size]
 * @returns {T[][]}
 */
export function chunkIds(ids, size = IDS_BATCH_SIZE_DEFAULT) {
  const list = Array.isArray(ids) ? ids : [];
  const n = Math.max(1, Math.floor(Number(size) || IDS_BATCH_SIZE_DEFAULT));
  if (list.length === 0) return [];
  const out = [];
  for (let i = 0; i < list.length; i += n) {
    out.push(list.slice(i, i + n));
  }
  return out;
}
