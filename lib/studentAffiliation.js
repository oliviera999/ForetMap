/**
 * Affiliation élève : valeurs historiques n3 / foret / both,
 * ou identifiant d'une carte existante (table maps) pour restreindre à un seul plan.
 */

const BASE_STUDENT_AFFILIATIONS = new Set(['n3', 'foret', 'both']);
/** Slug aligné sur VARCHAR(32) des cartes (lettres minuscules, chiffres, _ et -). */
const MAP_SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,30}$/;
const RESERVED_MAP_IDS_FOR_AFFILIATION = new Set(['both']);

function parseStudentAffiliationInput(raw) {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!s) return { kind: 'base', value: 'both' };
  if (BASE_STUDENT_AFFILIATIONS.has(s)) return { kind: 'base', value: s };
  if (!MAP_SLUG_RE.test(s) || RESERVED_MAP_IDS_FOR_AFFILIATION.has(s)) return { kind: 'invalid' };
  return { kind: 'map_slug', value: s };
}

/**
 * @param {*} raw
 * @param {(sql: string, params?: any[]) => Promise<any>} queryOne
 * @returns {Promise<{ ok: true, affiliation: string } | { ok: false, error: string }>}
 */
async function resolveStudentAffiliationForPersist(raw, queryOne) {
  const parsed = parseStudentAffiliationInput(raw);
  if (parsed.kind === 'invalid') {
    return { ok: false, error: 'Affiliation invalide (n3, foret, both ou identifiant de carte)' };
  }
  if (parsed.kind === 'base') return { ok: true, affiliation: parsed.value };
  const row = await queryOne('SELECT id FROM maps WHERE id = ? LIMIT 1', [parsed.value]);
  if (!row) return { ok: false, error: 'Affiliation invalide (carte inconnue)' };
  return { ok: true, affiliation: parsed.value };
}

module.exports = {
  BASE_STUDENT_AFFILIATIONS,
  MAP_SLUG_RE,
  parseStudentAffiliationInput,
  resolveStudentAffiliationForPersist,
};
