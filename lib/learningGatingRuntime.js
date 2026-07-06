'use strict';

// =====================================================================
// Runtime du conditionnement « lu/appris » — enregistrement des tentatives QCM GL
// (alimente le challenge « pull » à l'accusé). L'auto-marquage push a été retiré :
// seul le bouton « Marquer comme… » valide une ressource (cf. learningGatingAcknowledge).
// =====================================================================

const { getSettingValue } = require('./settings');
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

async function getFmGatingSite() {
  return {
    enabled: await getSettingValue('learning.gating.enabled', false),
    autoMarkOnCorrect: await getSettingValue('learning.gating.auto_mark_on_correct', true),
    defaultMode: await getSettingValue('learning.gating.default_mode', 'any'),
    defaultRequiredCorrect: await getSettingValue('learning.gating.default_required_correct', 1),
    retryCooldownDays: await getSettingValue('learning.gating.retry_cooldown_days', 3),
  };
}

/** GL — enregistre la tentative par lecteur si gating actif (sans marquer la ressource). */
async function recordGlQcmAttemptIfGatingEnabled(
  db,
  { glAuth, dataset, questionCode, isCorrect, gameId = null, teamId = null },
) {
  try {
    const g = await getGlGatingSettings();
    if (!g || !g.enabled) return;
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
    });
  } catch (_err) {
    return null;
  }
}

module.exports = {
  FM_MARKABLE,
  GL_MARKABLE,
  getFmGatingSite,
  recordGlQcmAttemptIfGatingEnabled,
  registerGlCooldownOnWrongIfGating,
};
