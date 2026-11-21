'use strict';

/**
 * Helpers purs pour les clés dichotomiques (`id_keys` / couplets / leads).
 * - Chaque lead a exactement une issue : couplet suivant, espèce, groupe d'espèces ou
 *   grand groupe (migration 366 ; noyau partagé `lib/shared/idKeyLeadCore.js`).
 * - Aucun chemin ne doit boucler (graphe couplet → couplet).
 * - Les énoncés ne doivent pas inviter à manipuler plantes/animaux.
 */

const { validateLeadShape, resolveLeadOutcome } = require('./shared/idKeyLeadCore');

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

/** Champs d'issue d'une proposition et leurs alias acceptés en entrée. */
const OUTCOME_FIELDS = Object.freeze({
  outcome: ['outcome'],
  next_couplet_id: ['next_couplet_id', 'nextCoupletId'],
  plant_id: ['plant_id', 'plantId'],
  clade_id: ['clade_id', 'cladeId'],
  result_label: ['result_label', 'resultLabel'],
  group_plant_ids: ['group_plant_ids', 'groupPlantIds', 'group_plants'],
  next_key_id: ['next_key_id', 'nextKeyId'],
});

/** Champs de texte et d'image d'une proposition et leurs alias acceptés en entrée. */
const CONTENT_FIELDS = Object.freeze({
  statement: ['statement'],
  hint: ['hint'],
  image_url: ['image_url', 'imageUrl'],
  image_credit: ['image_credit', 'imageCredit'],
  image_licence: ['image_licence', 'imageLicence'],
});

/** Valeur envoyée pour un champ (premier alias défini) ; `undefined` = champ non envoyé. */
function sentValue(raw, aliases) {
  for (const key of aliases) {
    if (raw != null && raw[key] !== undefined) return raw[key];
  }
  return undefined;
}

/** Champs d'issue apparus avec les feuilles groupe / clade (migration 366). */
const MODERN_OUTCOME_FIELDS = [
  'outcome',
  'clade_id',
  'result_label',
  'group_plant_ids',
  'next_key_id',
];

function filled(value) {
  return value != null && value !== '';
}

/**
 * Proposition reçue, complétée par la proposition existante de même identifiant.
 *
 * Règle : **ce qui n'est pas renvoyé n'est pas effacé**. Renvoyée avec son `id`, une
 * proposition garde
 * - son énoncé, son aide, son image, le crédit et la licence de l'image, champ par champ
 *   (un champ envoyé à `null` ou vide est, lui, bien effacé) ;
 * - son issue **entière** (`outcome`, `next_couplet_id`, `plant_id`, `clade_id`,
 *   `result_label`, `group_plant_ids`, `next_key_id`) quand la proposition reçue n'en dit
 *   rien : aucun champ d'issue, ou seulement `next_couplet_id` / `plant_id` vides, forme
 *   qu'envoie un ancien client pour une feuille groupe ou clade.
 * Dès qu'une issue est énoncée, elle remplace l'ancienne en entier. Seule exception, la forme
 * historique `{ id, plant_id }` (espèce, sans `outcome`) : le renvoi « pour aller plus loin »
 * est gardé.
 *
 * @param {object} raw — proposition reçue
 * @param {object|null} previous — proposition existante (forme de `serializeLead`), ou null
 * @returns {object} proposition à valider, aux noms de champs canoniques
 */
function mergeLeadInput(raw = {}, previous = null) {
  const merged = {};
  for (const [field, aliases] of Object.entries(CONTENT_FIELDS)) {
    const sent = sentValue(raw, aliases);
    merged[field] = sent === undefined ? (previous?.[field] ?? null) : sent;
  }
  const sentOutcome = {};
  for (const [field, aliases] of Object.entries(OUTCOME_FIELDS)) {
    const sent = sentValue(raw, aliases);
    if (sent !== undefined) sentOutcome[field] = sent;
  }
  const modern = MODERN_OUTCOME_FIELDS.some((field) => field in sentOutcome);
  const legacyStated = filled(sentOutcome.next_couplet_id) || filled(sentOutcome.plant_id);
  if (previous && !modern && !legacyStated) {
    for (const field of Object.keys(OUTCOME_FIELDS)) merged[field] = previous[field];
    return merged;
  }
  Object.assign(merged, sentOutcome);
  if (previous && !modern && resolveLeadOutcome(sentOutcome) === 'espece') {
    merged.next_key_id = previous.next_key_id;
  }
  return merged;
}

module.exports = {
  validateLeadOutcome,
  findManipulationInvitation,
  hasCoupletCycle,
  assertLeadWellFormed,
  mergeLeadInput,
};
