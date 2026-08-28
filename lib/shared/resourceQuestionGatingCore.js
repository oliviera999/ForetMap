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
const LINK_ORIGINS = Object.freeze(['manual', 'auto', 'import', 'generated']);
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
  'content_page',
  'ecosystem',
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
 * @param {object|null} params.typePolicy politique par type (resource_ref = '*')
 * @param {string|null} params.chapterGranularity surcharge granularite (chapitre/scope GL)
 * @param {object} params.site reglages site { enabled, granularity, defaultMode, defaultRequiredCorrect }
 * @returns {{ enabled: boolean, mode: string, requiredCorrect: number, granularity: string }}
 */
function resolveEffectivePolicy({
  perResource = null,
  typePolicy = null,
  chapterGranularity = null,
  site = {},
} = {}) {
  const siteEnabled = asBool(site.enabled, false);
  const siteMode = normalizeMode(site.defaultMode) || 'any';
  const siteRequired = clampRequiredCorrect(site.defaultRequiredCorrect, 1);
  const siteGranularity = normalizeGranularity(site.granularity) || 'player';

  const pr = perResource || {};
  const tp = typePolicy || {};
  const prEnabled = asBool(pr.enabled, null);
  const prMode = normalizeMode(pr.mode);
  const tpMode = normalizeMode(tp.mode);

  const enabled = prEnabled == null ? siteEnabled : prEnabled;
  let mode =
    prMode && prMode !== 'inherit' ? prMode : tpMode && tpMode !== 'inherit' ? tpMode : siteMode;
  if (!enabled) mode = 'off';

  // Seul un mode explicite `threshold` sur la ressource emporte son N ; en `inherit`,
  // un ancien required_correct en BDD ne doit pas surprendre si le site passe en seuil.
  const typeRequired =
    tpMode === 'threshold' && tp.required_correct != null
      ? clampRequiredCorrect(tp.required_correct, siteRequired)
      : null;
  const requiredCorrect =
    prMode === 'threshold' && pr.required_correct != null
      ? clampRequiredCorrect(pr.required_correct, typeRequired ?? siteRequired)
      : mode === 'threshold'
        ? (typeRequired ?? siteRequired)
        : siteRequired;

  const granularity = normalizeGranularity(chapterGranularity) || siteGranularity;

  return { enabled, mode, requiredCorrect, granularity };
}

const MODE_LABELS_FR = Object.freeze({
  off: 'Aucune question exigée',
  any: 'Une bonne réponse suffit',
  all: 'Toutes les questions bloquantes',
  threshold: 'Un nombre minimum de bonnes réponses',
  inherit: 'Réglage du site',
});

/**
 * Phrase lisible pour un professeur : ce que l'élève devra faire avant l'accusé de lecture.
 * @param {object} params
 * @param {string} params.mode mode effectif (off|any|all|threshold|inherit)
 * @param {number} params.requiredCorrect seuil N
 * @param {number} params.gatingCount questions bloquantes approuvées liées
 */
function describeGatingPolicy({ mode = 'any', requiredCorrect = 1, gatingCount = 0 } = {}) {
  const resolved = normalizeMode(mode) || 'any';
  const count = Math.max(0, Number(gatingCount) || 0);

  if (resolved === 'off') {
    return 'Aucune question ne conditionne la validation de cette fiche (dispense locale).';
  }
  if (count === 0) {
    return 'Aucune question bloquante approuvée : la validation reste une simple confirmation.';
  }
  if (resolved === 'any') {
    return `L'élève devra répondre correctement à au moins une question (sur ${count} bloquante${count > 1 ? 's' : ''}).`;
  }
  if (resolved === 'all') {
    return `L'élève devra répondre correctement à toutes les questions bloquantes (${count}).`;
  }
  if (resolved === 'threshold') {
    const n = Math.min(clampRequiredCorrect(requiredCorrect, 1), count);
    return `L'élève devra répondre correctement à ${n} question${n > 1 ? 's' : ''} sur ${count} bloquante${count > 1 ? 's' : ''}.`;
  }
  return MODE_LABELS_FR.inherit;
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

/** Combien de bonnes réponses la politique exige-t-elle réellement ? */
function requiredCorrectCount(policy, gatingCodesCount) {
  if (gatingCodesCount <= 0) return 0;
  const mode = normalizeMode(policy?.mode) || 'any';
  if (mode === 'all') return gatingCodesCount;
  if (mode === 'threshold') {
    return Math.min(clampRequiredCorrect(policy?.requiredCorrect, 1), gatingCodesCount);
  }
  return 1;
}

/**
 * Construit le filtre SQL de la liste des liens ressource ↔ question.
 *
 * Les deux produits écrivaient la même cascade de `where.push(...) / params.push(...)` — même
 * ordre, mêmes normaliseurs, mêmes messages d'erreur — à un critère près : G&L filtre en plus
 * sur `question_dataset`. C'était la plus grosse fraction des 104 lignes communes mesurées sur
 * la paire (`docs/PARTAGE_FM_GL.md`).
 *
 * Le SQL lui-même reste au routeur : les deux tables diffèrent
 * (`resource_question_links` / `gl_resource_question_links`), et c'est justement la frontière
 * de l'isolement produit. Ce qui est mutualisé, c'est la **traduction requête → critères**.
 *
 * L'ordre des critères est conservé au caractère près : il détermine l'ordre des `?` dans
 * `params`, et un test de non-régression compare la clause produite.
 *
 * @param {object} query — `req.query` brut.
 * @param {{allowedTypes?: any, withDataset?: boolean}} options
 * @returns {{where: string[], params: any[]} | {error: string}} — `error` = message de 400.
 */
function buildLinksFilter(query = {}, { allowedTypes = null, withDataset = false } = {}) {
  const where = [];
  const params = [];

  if (withDataset) {
    const ds = query.questionDataset ? normalizeQuestionDataset(query.questionDataset) : null;
    if (query.questionDataset && !ds) return { error: 'Jeu de questions invalide' };
    if (ds) {
      where.push('question_dataset = ?');
      params.push(ds);
    }
  }

  const rt = normalizeResourceType(query.resourceType, allowedTypes);
  if (query.resourceType && !rt) return { error: 'Type de ressource invalide' };
  if (rt) {
    where.push('resource_type = ?');
    params.push(rt);
    // `resourceRef` n'a de sens que rattaché à un type : filtrer une référence sans son type
    // ferait correspondre des ressources homonymes de familles différentes.
    const ref = normalizeResourceRef(query.resourceRef);
    if (ref) {
      where.push('resource_ref = ?');
      params.push(ref);
    }
  }

  const qc = normalizeQuestionCode(query.questionCode);
  if (qc) {
    where.push('question_code = ?');
    params.push(qc);
  }

  const status = query.status ? normalizeStatus(query.status, null) : null;
  if (status) {
    where.push('status = ?');
    params.push(status);
  }

  return { where, params };
}

/** Clause `WHERE ...` prête à concaténer, ou chaîne vide si aucun critère. */
function linksWhereClause(where = []) {
  return where.length ? `WHERE ${where.join(' AND ')}` : '';
}

module.exports = {
  buildLinksFilter,
  linksWhereClause,
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
  describeGatingPolicy,
  requiredCorrectCount,
  MODE_LABELS_FR,
  gatingQuestionCodes,
  evaluateUnlock,
};
