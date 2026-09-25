'use strict';

// =====================================================================
// Runtime du conditionnement « lu/appris » — enregistrement des tentatives QCM GL
// (alimente le challenge « pull » à l'accusé). L'auto-marquage push a été retiré :
// seul le bouton « Marquer comme… » valide une ressource (cf. learningGatingAcknowledge).
// =====================================================================

const { maybeRegisterCooldownOnWrong } = require('./learningGatingCooldown');
const {
  normalizeResourceType,
  normalizeResourceRef,
} = require('./shared/resourceQuestionGatingCore');
const { resolveEffectiveGatingPolicy } = require('./shared/gatingPolicyLayersCore');
const { loadResourcePolicy, loadTypePolicy } = require('./gatingPolicyLoad');
// Ce qui distingue ForetMap de GL (types validables, réglages du site, lecteur, granularité
// de chapitre, écriture des tentatives GL) est porté par l'adaptateur de produit.
const {
  GATING_PRODUCTS,
  FM_MARKABLE,
  GL_MARKABLE,
  getFmGatingSite,
  gatingProductOrDefault,
} = require('./pedago/gatingProducts');

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
    const gl = GATING_PRODUCTS.gl;
    const reader = gl.readerKey(glAuth);
    if (!reader) return;
    await gl.recordAttempt(db, {
      reader,
      dataset,
      questionCode,
      isCorrect,
      gameId,
      teamId,
    });
  } catch (_err) {
    /* defensif : ne jamais casser la réponse */
  }
}

/**
 * Verrou de re-tentative (FM ou GL) : lit la politique EFFECTIVE
 * (cascade site → type → fiche) avant d'écrire. Best-effort : ne casse
 * jamais la réponse QCM.
 */
async function registerCooldownOnWrongIfGating(
  db,
  {
    product,
    userId = null,
    glAuth = null,
    resourceType,
    resourceRef,
    questionCode,
    isCorrect,
  } = {},
) {
  try {
    if (isCorrect) return null;
    const adapter = gatingProductOrDefault(product);
    const p = adapter.id;
    const rt = normalizeResourceType(resourceType, adapter.resourceTypes);
    const ref = normalizeResourceRef(resourceRef);
    if (!rt || !ref || !adapter.markable.has(rt)) return null;
    const settings = await adapter.loadSiteSettings();
    if (!settings || !settings.enabled) return null;
    const perResource = await loadResourcePolicy(db, p, rt, ref);
    const typePolicy = await loadTypePolicy(db, p, rt);
    const chapterGranularity = adapter.capabilities.chapterGranularity
      ? await adapter.resolveChapterGranularity(db, {
          resourceType: rt,
          resourceRef: ref,
          glAuth,
        })
      : null;
    const policy = resolveEffectiveGatingPolicy({
      perResource,
      typePolicy,
      chapterGranularity,
      site: settings,
      product: p,
      resourceType: rt,
    });
    if (!policy.enabled || policy.mode === 'off') return null;
    const learner = adapter.resolveLearner({ userId, glAuth });
    if (!learner.ok) return null;
    const { reader } = learner;
    return await maybeRegisterCooldownOnWrong(db, {
      product: p,
      userId,
      reader,
      resourceType: rt,
      resourceRef: ref,
      questionCode,
      isCorrect,
      retryHours: policy.retryCooldownHours,
      allowedWrongAttempts: policy.allowedWrongAttempts,
      cooldownScope: policy.cooldownScope,
    });
  } catch (_err) {
    return null;
  }
}

/**
 * GL — verrou de re-tentative sur une mauvaise reponse au QCM de validation.
 * Ne s'active que si la reponse est envoyee avec un contexte ressource
 * (resourceType/resourceRef), c.-a-d. depuis le flux « Marquer comme acquis ».
 */
async function registerGlCooldownOnWrongIfGating(
  db,
  { glAuth, resourceType, resourceRef, questionCode, isCorrect } = {},
) {
  return registerCooldownOnWrongIfGating(db, {
    product: 'gl',
    glAuth,
    resourceType,
    resourceRef,
    questionCode,
    isCorrect,
  });
}

/**
 * ForetMap — même cascade que le challenge / GL. Le chemin quiz utilisait
 * encore les seuls réglages du site : une surcharge type/fiche (tolérance,
 * délai, portée) était annoncée mais jamais écrite.
 */
async function registerFmCooldownOnWrongIfGating(
  db,
  { userId, resourceType, resourceRef, questionCode, isCorrect } = {},
) {
  return registerCooldownOnWrongIfGating(db, {
    product: 'fm',
    userId,
    resourceType,
    resourceRef,
    questionCode,
    isCorrect,
  });
}

module.exports = {
  FM_MARKABLE,
  GL_MARKABLE,
  getFmGatingSite,
  recordGlQcmAttemptForReader,
  registerCooldownOnWrongIfGating,
  registerGlCooldownOnWrongIfGating,
  registerFmCooldownOnWrongIfGating,
};
