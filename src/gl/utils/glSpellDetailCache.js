import { apiGL } from '../services/apiGL.js';

const detailCache = new Map();

/**
 * Charge la fiche sort (GET /api/gl/spells/:code) avec cache mémoire par code.
 * @returns {Promise<{ spell, category }|null>}
 */
export async function fetchSpellDetail(spellCode) {
  const code = String(spellCode || '').trim().toUpperCase();
  if (!code) return null;
  const cached = detailCache.get(code);
  if (cached) return cached;
  const data = await apiGL(`/api/gl/spells/${encodeURIComponent(code)}`);
  detailCache.set(code, data);
  return data;
}

/** Vide le cache (tests). */
export function clearSpellDetailCache() {
  detailCache.clear();
}
