'use strict';

/**
 * Ligne zone/repère (champ `visit_is_active` ou alias SQL) : exposée dans GET /api/visit/content
 * sauf désactivation explicite (tolère booléen, chaîne `'0'`, entier).
 *
 * @param {{ visit_is_active?: unknown }} row
 * @returns {boolean}
 */
function visitContentRowIsPublicActive(row) {
  const v = row && row.visit_is_active;
  if (v === false || v === 0) return false;
  if (v === '0' || (typeof v === 'string' && String(v).trim() === '0')) return false;
  if (v === null || v === undefined) return true;
  const n = Number(v);
  if (Number.isFinite(n)) return n !== 0;
  return true;
}

module.exports = { visitContentRowIsPublicActive };
