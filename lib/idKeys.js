'use strict';

/**
 * Helpers purs pour les clés dichotomiques (`id_keys` / couplets / leads).
 * - Chaque lead a exactement une issue : next_couplet XOR plant_id.
 * - Aucun chemin ne doit boucler (graphe couplet → couplet).
 * - Les énoncés ne doivent pas inviter à manipuler plantes/animaux.
 */

const MANIPULATION_HINT_RE =
  /\b(cueill|goût|gout|mang(e|er)|touch(e|er)|arrach|écras|ecras|manipul|cass(e|er)|arrach|secou|froiss)\w*/i;

/**
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
function validateLeadOutcome({ nextCoupletId, plantId }) {
  const hasNext = nextCoupletId != null && nextCoupletId !== '';
  const hasPlant = plantId != null && plantId !== '';
  if (hasNext === hasPlant) {
    return {
      ok: false,
      error:
        'Chaque proposition doit mener soit à un couplet suivant, soit à une espèce (pas les deux, pas aucun)',
    };
  }
  return { ok: true };
}

/**
 * Détecte une invitation à manipuler dans un énoncé pédagogique.
 * @returns {string|null} message d'erreur ou null si OK
 */
function findManipulationInvitation(statement) {
  const text = String(statement || '').trim();
  if (!text) return 'Énoncé requis';
  if (MANIPULATION_HINT_RE.test(text)) {
    return 'L’énoncé ne doit pas inviter à cueillir, goûter ou manipuler la plante ou l’animal';
  }
  return null;
}

/**
 * Détection de cycles dans le graphe couplet → couplet (via les leads).
 * @param {Array<{id:number, leads?: Array<{next_couplet_id?:number|null}>}>} couplets
 * @returns {boolean} true s'il existe un cycle
 */
function hasCoupletCycle(couplets) {
  const edges = new Map();
  for (const c of couplets || []) {
    const id = Number(c.id);
    if (!Number.isFinite(id)) continue;
    const nexts = new Set();
    for (const lead of c.leads || []) {
      const n = lead.next_couplet_id != null ? Number(lead.next_couplet_id) : NaN;
      if (Number.isFinite(n) && n > 0) nexts.add(n);
    }
    edges.set(id, [...nexts]);
  }
  const visiting = new Set();
  const visited = new Set();
  function dfs(node) {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of edges.get(node) || []) {
      if (dfs(next)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  }
  for (const id of edges.keys()) {
    if (dfs(id)) return true;
  }
  return false;
}

/**
 * Vérifie qu'un lead a une issue unique et qu'un éventuel next appartient à la clé.
 * @param {object} lead
 * @param {Set<number>} coupletIdsInKey
 */
function assertLeadWellFormed(lead, coupletIdsInKey) {
  const next =
    lead.next_couplet_id != null && lead.next_couplet_id !== ''
      ? Number(lead.next_couplet_id)
      : null;
  const plant = lead.plant_id != null && lead.plant_id !== '' ? Number(lead.plant_id) : null;
  const outcome = validateLeadOutcome({
    nextCoupletId: next,
    plantId: plant,
  });
  if (!outcome.ok) return outcome.error;
  const manip = findManipulationInvitation(lead.statement);
  if (manip) return manip;
  if (next != null && coupletIdsInKey && !coupletIdsInKey.has(next)) {
    return 'Le couplet suivant doit appartenir à la même clé';
  }
  return null;
}

module.exports = {
  validateLeadOutcome,
  findManipulationInvitation,
  hasCoupletCycle,
  assertLeadWellFormed,
  MANIPULATION_HINT_RE,
};
