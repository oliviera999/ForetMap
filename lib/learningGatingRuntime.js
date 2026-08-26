'use strict';

// =====================================================================
// Runtime du conditionnement « lu/appris » — enregistrement des tentatives QCM GL
// (alimente le challenge « pull » à l'accusé). L'auto-marquage push a été retiré :
// seul le bouton « Marquer comme… » valide une ressource (cf. learningGatingAcknowledge).
// =====================================================================

const { getSettingValue } = require('./settings');
const gatingCore = require('./shared/gatingSettingsCore');
const { getGlGatingSettings } = require('./glSettings');
const { buildReaderKey } = require('./shared/learningAckCore');
const { recordGlQcmAttempt } = require('./glQcmAttempts');
const { maybeRegisterCooldownOnWrong } = require('./learningGatingCooldown');
const {
  normalizeResourceType,
  normalizeResourceRef,
  GL_RESOURCE_TYPES,
} = require('./shared/resourceQuestionGatingCore');

const FM_MARKABLE = new Set(['tutorial', 'plant']);
const GL_MARKABLE = new Set([
  'species',
  'glossary',
  'tutorial',
  'lore_glossary',
  'feuillet',
  'content_page',
  'ecosystem',
]);

/**
 * Reglages de conditionnement du site ForetMap, lus depuis le catalogue COMMUN
 * (lib/shared/gatingSettingsCore.js). Ajouter un reglage la-bas suffit : il
 * apparait ici et cote GL, avec les memes bornes.
 */
async function getFmGatingSite() {
  const raw = {};
  for (const name of gatingCore.GATING_SETTING_NAMES) {
    const def = gatingCore.GATING_SETTING_DEFS[name];
    if (!def.fmKey) continue;
    raw[name] = await getSettingValue(def.fmKey, def.default);
  }
  return gatingCore.buildGatingSettings(raw, 'fm');
}

/**
 * GL — enregistre la tentative QCM par lecteur (sans marquer la ressource).
 *
 * L'écriture est INCONDITIONNELLE : elle ne dépend plus de `gating.enabled`. Le conditionner
 * rendait l'activation du gating non rétroactive — le jour où un admin allumait l'interrupteur,
 * toutes les bonnes réponses déjà données (parties jouées, entraînement libre) étaient invisibles
 * et les élèves se voyaient reposer des questions déjà réussies (cf. docs/AUDIT_GATING_QCM_FEUILLETS_2026-08.md,
 * constat F3). Seule la LECTURE (`getChallengeState`) reste conditionnée : gating éteint = aucun
 * quiz à l'accusé, comportement visible inchangé.
 */
async function recordGlQcmAttemptForReader(
  db,
  { glAuth, dataset, questionCode, isCorrect, gameId = null, teamId = null },
) {
  try {
    const reader = buildReaderKey(glAuth);
    if (!reader) return;
    await recordGlQcmAttempt(db, { reader, dataset, questionCode, isCorrect, gameId, teamId });
  } catch (_err) {
    /* defensif : ne jamais casser la réponse */
  }
}

/**
 * GL — verrou de re-tentative sur une mauvaise reponse au QCM de validation.
 * Ne s'active que si la reponse est envoyee avec un contexte ressource
 * (resourceType/resourceRef), c.-a-d. depuis le flux « Marquer comme acquis ».
 * Best-effort : ne casse jamais la reponse QCM.
 * @returns {Promise<object|null>} etat du verrou pose, ou null.
 */
async function registerGlCooldownOnWrongIfGating(
  db,
  { glAuth, resourceType, resourceRef, questionCode, isCorrect } = {},
) {
  try {
    if (isCorrect) return null;
    const rt = normalizeResourceType(resourceType, GL_RESOURCE_TYPES);
    const ref = normalizeResourceRef(resourceRef);
    if (!rt || !ref || !GL_MARKABLE.has(rt)) return null;
    const g = await getGlGatingSettings();
    if (!g || !g.enabled) return null;
    const reader = buildReaderKey(glAuth);
    if (!reader) return null;
    return await maybeRegisterCooldownOnWrong(db, {
      product: 'gl',
      reader,
      resourceType: rt,
      resourceRef: ref,
      questionCode,
      isCorrect,
      retryDays: g.retryCooldownDays,
      // GL herite des memes reglages que ForetMap depuis le catalogue commun.
      allowedWrongAttempts: g.allowedWrongAttempts,
      cooldownScope: g.cooldownScope,
    });
  } catch (_err) {
    return null;
  }
}

module.exports = {
  FM_MARKABLE,
  GL_MARKABLE,
  getFmGatingSite,
  recordGlQcmAttemptForReader,
  registerGlCooldownOnWrongIfGating,
};
