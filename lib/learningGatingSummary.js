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

const {
  getChallengeState,
  loadApprovedGatingLinksForRefs,
  listFmCorrectQuestionCodes,
  listGlCorrectQuestionCodes,
  listGlCorrectQuestionCodesForTeam,
  resolveGlReaderTeamId,
} = require('./learningGatingAcknowledge');
const { buildReaderKey } = require('./shared/learningAckCore');
const { loadResourcePolicies } = require('./gatingPolicyLoad');
const { loadResourceCooldownRows } = require('./learningGatingCooldown');
const { getGatingPresentation, decorateSummaryItem } = require('./learningGatingPresentation');
const { normalizeResourceRef } = require('./shared/resourceQuestionGatingCore');

/**
 * Plafond de ressources interrogeables en une fois (garde-fou de charge).
 *
 * Il valait 60 quand chaque ressource coûtait 3 à 4 requêtes SQL en série — mais 60 était
 * **inférieur au catalogue biodiversité** (78 fiches) : au-delà de la 60ᵉ, l'annonce du
 * contrôle de compréhension disparaissait sans que rien ne le signale
 * (docs/AUDIT_CHARGE_BIODIVERSITE_2026-09.md, B4). Le chargement est désormais groupé — le
 * coût SQL ne dépend plus du nombre de ressources —, le plafond est donc aligné sur celui
 * des compteurs d'observation (`parsePlantIdsQueryParam`, 200). Il reste un garde-fou :
 * il borne la taille des clauses `IN (…)` et du corps de réponse.
 */
const SUMMARY_MAX_REFS = 200;

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

  // Une seule lecture des bonnes réponses pour toute la liste (évite N× SELECT).
  let correctCodesPreload = null;
  if (product === 'fm' && userId) {
    correctCodesPreload = new Set(await listFmCorrectQuestionCodes(db, userId));
  } else if (product === 'gl' && glAuth) {
    const reader = buildReaderKey(glAuth);
    if (reader) {
      const allCorrect = new Set();
      for (const ds of ['qcm', 'qcm_lore']) {
        for (const code of await listGlCorrectQuestionCodes(db, reader, ds)) {
          allCorrect.add(code);
        }
      }
      const teamId = await resolveGlReaderTeamId(db, glAuth);
      for (const code of await listGlCorrectQuestionCodesForTeam(db, teamId)) {
        allCorrect.add(code);
      }
      correctCodesPreload = allCorrect;
    }
  }

  // Chargement groupé : trois requêtes constantes pour toute la liste, au lieu de 3 à 4
  // **par ressource** exécutées en série (jusqu'à ~240 pour un seul appel HTTP).
  // Le calcul, lui, reste identique — `getChallengeState` déroule les mêmes règles, en
  // mémoire, à partir des lignes préchargées.
  // Nom distinct de la variable homonyme du bloc GL ci-dessus : la même clé de lecteur,
  // mais utilisée ici pour le chargement groupé des verrous.
  const cooldownReader = product === 'gl' ? buildReaderKey(glAuth) : null;
  const [policies, links, cooldowns] = await Promise.all([
    loadResourcePolicies(db, product, resourceType, unique),
    loadApprovedGatingLinksForRefs(db, product, resourceType, unique),
    loadResourceCooldownRows(db, {
      product,
      userId,
      reader: cooldownReader,
      resourceType,
      refs: unique,
    }),
  ]);
  const preload = { policies, links, cooldowns };

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
      correctCodesPreload,
      preload,
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
