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
  FORETMAP_RESOURCE_TYPES,
  GL_RESOURCE_TYPES,
} = require('./shared/resourceQuestionGatingCore');
const { resolveEffectiveGatingPolicy } = require('./shared/gatingPolicyLayersCore');
const { loadResourcePolicy, loadTypePolicy } = require('./gatingPolicyLoad');
const { resolveGlChapterGranularity } = require('./glGatingChapterGranularity');

// `glossary` a rejoint la liste avec la migration 201 : ForetMap sait desormais valider un
// terme (« j'ai appris ce terme »), comme GL le faisait deja. Tant que ce geste n'existait
// pas, un lien bloquant sur un terme etait accepte mais ne conditionnait rien.
const FM_MARKABLE = new Set(['tutorial', 'plant', 'glossary']);
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
    const p = String(product || '').toLowerCase() === 'gl' ? 'gl' : 'fm';
    const allowed = p === 'gl' ? GL_RESOURCE_TYPES : FORETMAP_RESOURCE_TYPES;
    const markable = p === 'gl' ? GL_MARKABLE : FM_MARKABLE;
    const rt = normalizeResourceType(resourceType, allowed);
    const ref = normalizeResourceRef(resourceRef);
    if (!rt || !ref || !markable.has(rt)) return null;
    const settings = p === 'gl' ? await getGlGatingSettings() : await getFmGatingSite();
    if (!settings || !settings.enabled) return null;
    const perResource = await loadResourcePolicy(db, p, rt, ref);
    const typePolicy = await loadTypePolicy(db, p, rt);
    const chapterGranularity =
      p === 'gl'
        ? await resolveGlChapterGranularity(db, {
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
    const reader = p === 'gl' ? buildReaderKey(glAuth) : null;
    if (p === 'gl' && !reader) return null;
    if (p === 'fm' && !userId) return null;
    return await maybeRegisterCooldownOnWrong(db, {
      product: p,
      userId,
      reader,
      resourceType: rt,
      resourceRef: ref,
      questionCode,
      isCorrect,
      retryDays: policy.retryCooldownDays,
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
