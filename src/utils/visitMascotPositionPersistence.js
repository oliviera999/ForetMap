/**
 * Persistance locale (localStorage) de la position % de la mascotte sur le plan visite,
 * par identifiant de carte — fonctionne sans compte (visite publique).
 */

const VISIT_MASCOT_POSITION_STORAGE_PREFIX = 'foretmap_visit_mascot_pct_v1';

function positionStorageKey(mapId) {
  return `${VISIT_MASCOT_POSITION_STORAGE_PREFIX}:${encodeURIComponent(String(mapId ?? ''))}`;
}

/**
 * Valide et normalise des coordonnées % stockées (0–100).
 * @param {unknown} rawXp
 * @param {unknown} rawYp
 * @returns {{ xp: number, yp: number } | null}
 */
function normalizeStoredPct(rawXp, rawYp) {
  const xp = Number(rawXp);
  const yp = Number(rawYp);
  if (!Number.isFinite(xp) || !Number.isFinite(yp)) return null;
  const nx = Math.max(0, Math.min(100, xp));
  const ny = Math.max(0, Math.min(100, yp));
  return { xp: nx, yp: ny };
}

/**
 * @param {string} mapId
 * @returns {{ xp: number, yp: number } | null}
 */
function loadVisitMascotPositionPct(mapId) {
  if (typeof window === 'undefined') return null;
  let raw;
  try {
    raw = window.localStorage.getItem(positionStorageKey(mapId));
  } catch {
    return null;
  }
  if (raw == null || raw === '') return null;
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object') return null;
    return normalizeStoredPct(o.xp, o.yp);
  } catch {
    return null;
  }
}

/**
 * @param {string} mapId
 * @param {{ xp: number, yp: number }} pct
 */
function saveVisitMascotPositionPct(mapId, pct) {
  if (typeof window === 'undefined') return;
  const n = normalizeStoredPct(pct?.xp, pct?.yp);
  if (!n) return;
  try {
    window.localStorage.setItem(positionStorageKey(mapId), JSON.stringify(n));
  } catch {
    /* quota / mode privé strict */
  }
}

export {
  VISIT_MASCOT_POSITION_STORAGE_PREFIX,
  positionStorageKey,
  normalizeStoredPct,
  loadVisitMascotPositionPct,
  saveVisitMascotPositionPct,
};
