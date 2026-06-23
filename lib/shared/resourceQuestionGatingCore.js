'use strict';

// =====================================================================
// Coeur partage du conditionnement « ressource <-> questions » (ForetMap + GL).
// 100 % pur (aucun acces BDD) : normalisation des entrees, resolution de la
// politique effective (ressource -> chapitre -> site -> defauts) et evaluation
// du deblocage a partir des bonnes reponses connues. Les routes produit gerent
// le SQL et passent les lignes deja chargees a ces fonctions.
// Pendant de lib/shared/learningAckCore.js.
// =====================================================================

const GATING_MODES = Object.freeze(['inherit', 'off', 'any', 'all', 'threshold']);
const GATING_GRANULARITIES = Object.freeze(['player', 'team', 'per_resource']);
const LINK_ORIGINS = Object.freeze(['manual', 'auto', 'import']);
const LINK_STATUSES = Object.freeze(['suggested', 'approved', 'rejected']);

// Types de ressources connus par produit (liste ouverte : la colonne reste un
// VARCHAR, on valide ici pour guider les saisies sans bloquer une evolution BDD).
const FORETMAP_RESOURCE_TYPES = Object.freeze(['tutorial', 'plant', 'glossary']);
const GL_RESOURCE_TYPES = Object.freeze([
  'species',
  'glossary',
  'lore_glossary',
  'tutorial',
  'feuillet',
]);
const GL_QUESTION_DATASETS = Object.freeze(['qcm', 'qcm_lore']);

const MAX_RESOURCE_REF_LEN = 64;
const MAX_QUESTION_CODE_LEN = 16;
const MAX_REQUIRED_CORRECT = 50;

function lower(value) {
  return String(value == null ? '' : value)
    .trim()
    .toLowerCase();
}

function normalizeMode(value) {
  const v = lower(value);
  return GATING_MODES.includes(v) ? v : null;
}

function normalizeGranularity(value) {
  const v = lower(value);
  return GATING_GRANULARITIES.includes(v) ? v : null;
}

function normalizeOrigin(value, fallback = 'manual') {
  const v = lower(value);
  return LINK_ORIGINS.includes(v) ? v : fallback;
}

function normalizeStatus(value, fallback = 'approved') {
  const v = lower(value);
  return LINK_STATUSES.includes(v) ? v : fallback;
}

/** Type de ressource : valide contre `allowed` si fourni, sinon accepte tout slug non vide. */
function normalizeResourceType(value, allowed = null) {
  const v = lower(value);
  if (!v) return null;
  if (Array.isArray(allowed) && allowed.length) return allowed.includes(v) ? v : null;
  return v;
}

function normalizeQuestionDataset(value) {
  const v = lower(value);
  return GL_QUESTION_DATASETS.includes(v) ? v : null;
}

/** Reference ressource : on conserve la casse (codes parfois sensibles), trim + borne de longueur. */
function normalizeResourceRef(value) {
  const v = String(value == null ? '' : value).trim();
  if (!v || v.length > MAX_RESOURCE_REF_LEN) return null;
  return v;
}

/** Code question : trim + borne de longueur, casse conservee (QF/GQCM/LQCM en majuscules en BDD). */
function normalizeQuestionCode(value) {
  const v = String(value == null ? '' : value).trim();
  if (!v || v.length > MAX_QUESTION_CODE_LEN) return null;
  return v;
}

function asBool(value, fallback = null) {
  if (value === true || value === 1 || value === '1' || value === 'true') return true;
  if (value === false || value === 0 || value === '0' || value === 'false') return false;
  return fallback;
}

function clampRequiredCorrect(value, fallback = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(MAX_REQUIRED_CORRECT, Math.floor(n)));
}

/**
 * Valide/normalise une saisie de lien depuis une route.
 * `options.allowedResourceTypes` (obligatoire pour borner le produit) et
 * `options.requireDataset` (true cote GL).
 * @returns {{ ok: true, value: object } | { ok: false, error: string }}
 */
function sanitizeLinkInput(input = {}, options = {}) {
  const allowed = options.allowedResourceTypes || null;
  const resourceType = normalizeResourceType(input.resource_type ?? input.resourceType, allowed);
  if (!resourceType) return { ok: false, error: 'Type de ressource invalide' };

  const resourceRef = normalizeResourceRef(input.resource_ref ?? input.resourceRef);
  if (!resourceRef) return { ok: false, error: 'Reference de ressource invalide' };

  const questionCode = normalizeQuestionCode(input.question_code ?? input.questionCode);
  if (!questionCode) return { ok: false, error: 'Code de question invalide' };

  const value = {
    resource_type: resourceType,
    resource_ref: resourceRef,
    question_code: questionCode,
    is_gating: asBool(input.is_gating ?? input.isGating, true) ? 1 : 0,
    weight: Number.isFinite(Number(input.weight))
      ? Math.max(0, Math.floor(Number(input.weight)))
      : 1,
    origin: normalizeOrigin(input.origin),
    status: normalizeStatus(input.status),
    note: input.note == null ? null : String(input.note).trim().slice(0, 255) || null,
  };

  if (options.requireDataset) {
    const dataset = normalizeQuestionDataset(input.question_dataset ?? input.questionDataset);
    if (!dataset) return { ok: false, error: 'Jeu de questions invalide (qcm | qcm_lore)' };
    value.question_dataset = dataset;
  }

  const confidence = input.confidence;
  if (confidence != null && confidence !== '') {
    const c = Number(confidence);
    if (!Number.isFinite(c) || c < 0 || c > 1) {
      return { ok: false, error: 'Confiance attendue entre 0 et 1' };
    }
    value.confidence = c;
  }

  return { ok: true, value };
}

/**
 * Resout la politique effective pour une ressource.
 * @param {object} params
 * @param {object|null} params.perResource ligne resource_gating_policy (ou null)
 * @param {string|null} params.chapterGranularity surcharge granularite (chapitre/scope GL)
 * @param {object} params.site reglages site { enabled, granularity, defaultMode, defaultRequiredCorrect }
 * @returns {{ enabled: boolean, mode: string, requiredCorrect: number, granularity: string }}
 */
function resolveEffectivePolicy({ perResource = null, chapterGranularity = null, site = {} } = {}) {
  const siteEnabled = asBool(site.enabled, false);
  const siteMode = normalizeMode(site.defaultMode) || 'any';
  const siteRequired = clampRequiredCorrect(site.defaultRequiredCorrect, 1);
  const siteGranularity = normalizeGranularity(site.granularity) || 'player';

  const pr = perResource || {};
  const prEnabled = asBool(pr.enabled, null);
  const prMode = normalizeMode(pr.mode);

  const enabled = prEnabled == null ? siteEnabled : prEnabled;
  let mode = prMode && prMode !== 'inherit' ? prMode : siteMode;
  if (!enabled) mode = 'off';

  const requiredCorrect =
    pr.required_correct != null
      ? clampRequiredCorrect(pr.required_correct, siteRequired)
      : siteRequired;

  const granularity = normalizeGranularity(chapterGranularity) || siteGranularity;

  return { enabled, mode, requiredCorrect, granularity };
}

/** Codes des questions « bloquantes » (is_gating) d'un ensemble de liens. */
function gatingQuestionCodes(links = []) {
  const out = [];
  for (const link of Array.isArray(links) ? links : []) {
    if (!link) continue;
    const gating = asBool(link.is_gating, true);
    if (gating === false) continue;
    const code = normalizeQuestionCode(link.question_code ?? link.questionCode);
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}

/**
 * Le lecteur a-t-il debloque la ressource ?
 * Non bloquant (true) si mode off/inherit ou si aucun lien bloquant.
 * @param {object} params
 * @param {Array} params.links liens de la ressource
 * @param {Array<string>} params.correctRefs codes des questions repondues juste par le lecteur
 * @param {string} params.mode mode resolu ('off'|'any'|'all'|'threshold')
 * @param {number} params.requiredCorrect seuil pour 'threshold'
 */
function evaluateUnlock({ links = [], correctRefs = [], mode = 'any', requiredCorrect = 1 } = {}) {
  const resolvedMode = normalizeMode(mode) || 'any';
  if (resolvedMode === 'off' || resolvedMode === 'inherit') return true;

  const gatingCodes = gatingQuestionCodes(links);
  if (gatingCodes.length === 0) return true;

  const correct = new Set(
    (Array.isArray(correctRefs) ? correctRefs : [])
      .map((c) => normalizeQuestionCode(c))
      .filter(Boolean),
  );
  const satisfied = gatingCodes.filter((c) => correct.has(c)).length;

  if (resolvedMode === 'all') return satisfied === gatingCodes.length;
  if (resolvedMode === 'threshold') return satisfied >= clampRequiredCorrect(requiredCorrect, 1);
  return satisfied >= 1; // 'any'
}

module.exports = {
  GATING_MODES,
  GATING_GRANULARITIES,
  LINK_ORIGINS,
  LINK_STATUSES,
  FORETMAP_RESOURCE_TYPES,
  GL_RESOURCE_TYPES,
  GL_QUESTION_DATASETS,
  MAX_RESOURCE_REF_LEN,
  MAX_QUESTION_CODE_LEN,
  MAX_REQUIRED_CORRECT,
  normalizeMode,
  normalizeGranularity,
  normalizeOrigin,
  normalizeStatus,
  normalizeResourceType,
  normalizeQuestionDataset,
  normalizeResourceRef,
  normalizeQuestionCode,
  clampRequiredCorrect,
  sanitizeLinkInput,
  resolveEffectivePolicy,
  gatingQuestionCodes,
  evaluateUnlock,
};
