'use strict';

// =====================================================================
// Reponses des routes `gating/challenge` et `gating/summary` — COMMUNES aux deux produits.
//
// Les deux routes existaient en double, chacune reserialisant l'etat a la main. Deux
// consequences, corrigees ici :
//
//   1. ForetMap avait un resume par lot (`/summary`), Gnomes & Licornes non. Cote GL,
//      aucun ecran ne pouvait donc annoncer quoi que ce soit avant le clic.
//   2. Les deux routes `challenge` OMETTAIENT `ask_count`, `allowed_wrong_attempts` et
//      `max_questions_per_session`, que le client attend pourtant :
//        - sans `ask_count`, le client retombe sur `pending_count` et pose TOUTES les
//          questions restantes — le plafond par session ne s'appliquait jamais ;
//        - sans `allowed_wrong_attempts`, les regles annoncees promettaient un blocage
//          des la premiere erreur meme quand des essais etaient tolers.
//      Serialiser au meme endroit pour les deux produits empeche la divergence de revenir.
// =====================================================================

const { getChallengeState } = require('./learningGatingAcknowledge');
const { getGatingPresentation, decorateSummaryItem } = require('./learningGatingPresentation');
const { normalizeResourceRef } = require('./shared/resourceQuestionGatingCore');

/** Plafond de ressources interrogeables en une fois (garde-fou de charge). */
const SUMMARY_MAX_REFS = 60;

/**
 * Corps de reponse d'un challenge, champs de conduite compris.
 * @param {object} state sortie de `getChallengeState`
 */
function serializeChallenge(state) {
  return {
    gating_enabled: state.gating_enabled,
    required: state.required,
    mode: state.mode,
    required_correct: state.required_correct,
    gating_questions_count: state.gating_questions_count,
    granularity: state.granularity,
    questions: state.questions,
    pending_count: state.pending_count,
    // Ces trois-la manquaient : le client les lit pour limiter la session et pour
    // annoncer ce qu'une erreur coute reellement.
    ask_count: state.ask_count,
    max_questions_per_session: state.max_questions_per_session,
    allowed_wrong_attempts: state.allowed_wrong_attempts,
    cooldown_scope: state.cooldown_scope,
    retry_cooldown_days: state.retry_cooldown_days,
    effective_sources: state.effective_sources,
    satisfied: state.satisfied,
    cooldown: state.cooldown,
  };
}

/** Ligne de resume d'une ressource — forme identique des deux cotes. */
function serializeSummaryItem(resourceRef, state) {
  return {
    resource_ref: resourceRef,
    required: !!state.required,
    // `ask_count` = ce qui sera reellement pose maintenant (plafond par session
    // applique) ; `pending_count` = ce qu'il reste au total pour valider.
    ask_count: state.ask_count || 0,
    pending_count: state.pending_count || 0,
    satisfied: !!state.satisfied,
    mode: state.mode,
    locked: !!state.cooldown?.locked,
    remaining_days: state.cooldown?.remaining_days || 0,
    retry_days: state.cooldown?.retry_days || 0,
    allowed_wrong_attempts: state.allowed_wrong_attempts || 0,
  };
}

/**
 * Resume du conditionnement pour PLUSIEURS ressources d'un coup.
 *
 * Sert a prevenir le lecteur AVANT qu'il ne clique : un bouton « Marquer comme lu » ne
 * laissait rien deviner, et le controle ne se revelait qu'une fois la fenetre ouverte.
 * Interroger une route par ressource aurait multiplie les appels ; ce point d'entree en
 * traite une liste.
 *
 * @param {object} db
 * @param {object} params
 * @param {'fm'|'gl'} params.product
 * @param {string} params.resourceType
 * @param {string} params.rawRefs liste brute « 1,2,3 »
 * @param {string|null} [params.userId] ForetMap
 * @param {object|null} [params.glAuth] Gnomes & Licornes
 * @param {(resourceType: string, ref: string) => Promise<boolean>} [params.isAlreadyDone]
 *        ressource deja validee par ce lecteur : le conditionnement ne s'y applique plus.
 */
async function buildGatingSummary(
  db,
  { product, resourceType, rawRefs, userId = null, glAuth = null, isAlreadyDone = null } = {},
) {
  const refs = String(rawRefs || '')
    .split(',')
    .map((r) => normalizeResourceRef(r))
    .filter(Boolean);
  const unique = [...new Set(refs)].slice(0, SUMMARY_MAX_REFS);

  const presentation = await getGatingPresentation(product);
  const items = [];
  for (const resourceRef of unique) {
    const skipGating =
      typeof isAlreadyDone === 'function'
        ? !!(await isAlreadyDone(resourceType, resourceRef))
        : false;
    const state = await getChallengeState(db, {
      product,
      resourceType,
      resourceRef,
      userId,
      glAuth,
      skipGating,
    });
    if (!state.ok) continue;
    items.push(decorateSummaryItem(serializeSummaryItem(resourceRef, state), presentation));
  }
  return { resource_type: resourceType, items, ...presentation };
}

module.exports = {
  SUMMARY_MAX_REFS,
  serializeChallenge,
  serializeSummaryItem,
  buildGatingSummary,
};
