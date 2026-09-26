'use strict';

/**
 * Niveau d'un groupe tel que l'écran des groupes le montre (décision du mainteneur du
 * 25/09/2026, question 5 : `groups.curriculum_niveau` devient la colonne de niveau des groupes).
 *
 * Pour chaque groupe : le niveau **effectif** (le sien, ou hérité du premier parent qui en a
 * un), s'il **manque** (classe ou unité sans niveau, même hérité : ses élèves retombent sur
 * les anciens réglages et le défaut de l'établissement), et la **proposition** tirée du nom
 * (`lib/pedago/groupNiveauFromName.js`) quand le groupe n'a pas de niveau propre.
 *
 * Pur : `groupsById` est une `Map` id → { id, name, kind, parent_group_id, curriculum_niveau }.
 * Une parenté circulaire (refusée à l'écriture) s'arrête net.
 */

const { normalizeLearnerNiveau } = require('../pedagoScales');
const {
  suggestCurriculumNiveauFromName,
  AUTO_NIVEAU_GROUP_KINDS,
} = require('./groupNiveauFromName');

/**
 * Types de groupe qui devraient porter un niveau. Une équipe ou un club réunit des élèves de
 * plusieurs classes : chacun garde le niveau de sa classe, on ne le signale pas.
 */
const NIVEAU_EXPECTED_GROUP_KINDS = AUTO_NIVEAU_GROUP_KINDS;

/**
 * Niveau effectif d'un groupe, héritage compris.
 * @returns {{ niveau: string|null, heriteDe: { id: string, name: string }|null }}
 */
function describeGroupNiveau(groupId, groupsById) {
  const visited = new Set();
  let cursor = groupId != null ? String(groupId) : '';
  let depth = 0;
  while (cursor && !visited.has(cursor) && groupsById.has(cursor)) {
    visited.add(cursor);
    const row = groupsById.get(cursor);
    const own = normalizeLearnerNiveau(row.curriculum_niveau);
    if (own) {
      return {
        niveau: own,
        heriteDe: depth > 0 ? { id: cursor, name: String(row.name || '') } : null,
      };
    }
    cursor = row.parent_group_id != null ? String(row.parent_group_id) : '';
    depth += 1;
  }
  return { niveau: null, heriteDe: null };
}

/** Le groupe devrait-il porter un niveau ? */
function groupExpectsNiveau(group) {
  const kind = String(group?.kind || 'class')
    .trim()
    .toLowerCase();
  return NIVEAU_EXPECTED_GROUP_KINDS.includes(kind);
}

/**
 * Champs ajoutés à chaque groupe de `GET /api/groups`.
 * @returns {{
 *   curriculum_niveau_effectif: string|null,
 *   curriculum_niveau_herite_de: { id: string, name: string }|null,
 *   curriculum_niveau_manquant: boolean,
 *   curriculum_niveau_suggestion: { niveau: string|null, raison: string }|null,
 * }}
 */
function groupNiveauAnnotations(group, groupsById) {
  const info = describeGroupNiveau(group?.id, groupsById);
  const expected = groupExpectsNiveau(group);
  const hasOwn = !!normalizeLearnerNiveau(group?.curriculum_niveau);
  let suggestion = null;
  if (expected && !hasOwn) {
    const { niveau, raison } = suggestCurriculumNiveauFromName(group?.name);
    suggestion = { niveau, raison };
  }
  return {
    curriculum_niveau_effectif: info.niveau,
    curriculum_niveau_herite_de: info.heriteDe,
    curriculum_niveau_manquant: expected && !info.niveau,
    curriculum_niveau_suggestion: suggestion,
  };
}

module.exports = {
  NIVEAU_EXPECTED_GROUP_KINDS,
  describeGroupNiveau,
  groupExpectsNiveau,
  groupNiveauAnnotations,
};
