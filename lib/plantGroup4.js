/**
 * Règles catalogue biodiversité pour `group_4` (alignées migration 069) :
 * - Végétaux : famille en français = même valeur que `group_3` dans les fiches actuelles.
 * - Animaux : genre = premier épithète significatif du nom scientifique (hybride `×` / `x` géré).
 */

function trimStr(value) {
  if (value == null) return '';
  return String(value).trim();
}

/** Extrait le genre depuis un nom scientifique (binôme, sp., hybrides simples). */
function extractGenusFromScientificName(scientificName) {
  const s = trimStr(scientificName);
  if (!s) return null;
  const parts = s.split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  let idx = 0;
  if (parts[idx] === '×' || parts[idx].toLowerCase() === 'x') {
    idx += 1;
  }
  if (idx >= parts.length) return null;
  const genus = parts[idx];
  if (!genus || genus === '×' || genus.toLowerCase() === 'x') return null;
  return genus;
}

/**
 * Si `group_4` est laissé vide, tente de le remplir selon `group_1`, `group_3` et `scientific_name`.
 * @param {Record<string, unknown>} payload Objet fiche plante (muté si dérivation possible).
 */
function applyDerivedGroup4IfEmpty(payload) {
  if (!payload || typeof payload !== 'object') return;
  if (trimStr(payload.group_4)) return;

  const g1 = trimStr(payload.group_1).toLowerCase();
  if (g1.includes('végétal')) {
    const g3 = trimStr(payload.group_3);
    if (g3) payload.group_4 = g3;
    return;
  }
  if (g1.includes('animal')) {
    const genus = extractGenusFromScientificName(payload.scientific_name);
    if (genus) payload.group_4 = genus;
  }
}

module.exports = {
  extractGenusFromScientificName,
  applyDerivedGroup4IfEmpty,
};
