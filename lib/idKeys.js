'use strict';

/**
 * Helpers purs pour les clés dichotomiques (`id_keys` / couplets / leads).
 * - Chaque lead a exactement une issue : couplet suivant, espèce, groupe d'espèces ou
 *   grand groupe (migration 366 ; noyau partagé `lib/shared/idKeyLeadCore.js`).
 * - Aucun chemin ne doit boucler (graphe couplet → couplet).
 * - Les énoncés ne doivent pas inviter à manipuler plantes/animaux.
 */

const {
  validateLeadShape,
  resolveLeadOutcome,
  normalizeLeadOutcomeFields,
  isLeadPracticable,
  groupPlantIdsOf,
  ID_KEY_LEAD_OUTCOMES,
  TERMINAL_OUTCOMES,
} = require('./shared/idKeyLeadCore');

// « gout » sans accent visait « goûter » : `go[uû]t(?!t)` laisse passer « goutte » et
// « gouttière », descriptions de forme courantes dans les clés (17/11/2026).
const MANIPULATION_HINT_RE =
  /\b(cueill|go[uû]t(?!t)|mang(e|er)|touch(e|er)|arrach|écras|ecras|manipul|cass(e|er)|secou|froiss)\w*/i;

/**
 * Issue d'une proposition. Forme historique `{ nextCoupletId, plantId }` toujours acceptée ;
 * les issues `groupe` et `clade` passent par `outcome` et leurs champs (migration 366).
 * @returns {{ ok: true, fields?: object } | { ok: false, error: string }}
 */
function validateLeadOutcome(input = {}, opts = {}) {
  const lead = {
    ...input,
    next_couplet_id: input.next_couplet_id ?? input.nextCoupletId,
    plant_id: input.plant_id ?? input.plantId,
  };
  return validateLeadShape(lead, opts);
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
function assertLeadWellFormed(lead, coupletIdsInKey, { keyId = null } = {}) {
  const outcome = validateLeadShape(lead, { keyId });
  if (!outcome.ok) return outcome.error;
  const next = outcome.fields.next_couplet_id;
  const manip = findManipulationInvitation(lead.statement);
  if (manip) return manip;
  if (next != null && coupletIdsInKey && !coupletIdsInKey.has(next)) {
    return 'Le couplet suivant doit appartenir à la même clé';
  }
  return null;
}

module.exports = {
  validateLeadOutcome,
  validateLeadShape,
  resolveLeadOutcome,
  normalizeLeadOutcomeFields,
  isLeadPracticable,
  groupPlantIdsOf,
  ID_KEY_LEAD_OUTCOMES,
  TERMINAL_OUTCOMES,
  findManipulationInvitation,
  hasCoupletCycle,
  assertLeadWellFormed,
  MANIPULATION_HINT_RE,
};
