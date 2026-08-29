'use strict';

// =====================================================================
// Resolution en cascade site → type (resource_ref='*') → ressource → (GL) chapitre/scope
// pour mode, seuil N, session, verrou et granularite.
// 100 % pur — aucun acces BDD.
// =====================================================================

const gatingSettingsCore = require('./gatingSettingsCore');
const {
  normalizeMode,
  normalizeGranularity,
  clampRequiredCorrect,
} = require('./resourceQuestionGatingCore');

const COOLDOWN_SCOPES = gatingSettingsCore.COOLDOWN_SCOPE_VALUES;

function lower(value) {
  return String(value == null ? '' : value)
    .trim()
    .toLowerCase();
}

function asBool(value, fallback = null) {
  if (value === true || value === 1 || value === '1' || value === 'true') return true;
  if (value === false || value === 0 || value === '0' || value === 'false') return false;
  return fallback;
}

function clampAllowedWrong(value, fallback = 0) {
  return gatingSettingsCore.normalizeGatingSetting('allowedWrongAttempts', value ?? fallback);
}

function clampMaxSession(value, fallback = 3) {
  return gatingSettingsCore.normalizeGatingSetting('maxQuestionsPerSession', value ?? fallback);
}

function clampRetryDays(value, fallback = 3) {
  return gatingSettingsCore.normalizeGatingSetting('retryCooldownDays', value ?? fallback);
}

function normalizeCooldownScope(value, fallback = 'resource') {
  const v = lower(value);
  if (COOLDOWN_SCOPES.includes(v)) return v;
  return fallback;
}

/** Reglages site normalises a partir de buildGatingSettings ou objet route. */
function siteLayerFromSettings(site = {}) {
  const s = site || {};
  return {
    enabled: asBool(s.enabled, false),
    defaultMode: normalizeMode(s.defaultMode) || 'any',
    defaultRequiredCorrect: clampRequiredCorrect(s.defaultRequiredCorrect, 1),
    allowedWrongAttempts: clampAllowedWrong(s.allowedWrongAttempts, 0),
    maxQuestionsPerSession: clampMaxSession(s.maxQuestionsPerSession, 3),
    retryCooldownDays: clampRetryDays(s.retryCooldownDays, 3),
    cooldownScope: normalizeCooldownScope(s.cooldownScope, 'resource'),
    granularity: normalizeGranularity(s.granularity) || 'player',
  };
}

function rowHas(row, snakeKey) {
  return row && row[snakeKey] != null && row[snakeKey] !== '';
}

/**
 * Politique effective complete + trace d'heritage.
 * @param {object} params
 * @param {'fm'|'gl'} [params.product]
 * @param {object|null} params.typePolicy resource_ref='*'
 * @param {object|null} params.perResource
 * @param {string|null} params.chapterGranularity GL chapitre/scope
 * @param {object} params.site reglages site (buildGatingSettings)
 * @param {string} [params.resourceType] pour libelle source type:*
 */
function resolveEffectiveGatingPolicy({
  perResource = null,
  typePolicy = null,
  chapterGranularity = null,
  site = {},
  product = 'fm',
  resourceType = null,
} = {}) {
  const siteLayer = siteLayerFromSettings(site);
  const sources = {};
  const pr = perResource || {};
  const tp = typePolicy || {};
  const typeTag = resourceType ? `type:${resourceType}` : 'type';

  const prEnabled = asBool(pr.enabled, null);
  const prMode = normalizeMode(pr.mode);
  const tpMode = normalizeMode(tp.mode);

  const enabled = prEnabled == null ? siteLayer.enabled : prEnabled;
  let mode =
    prMode && prMode !== 'inherit'
      ? prMode
      : tpMode && tpMode !== 'inherit'
        ? tpMode
        : siteLayer.defaultMode;
  if (!enabled) mode = 'off';

  if (prMode && prMode !== 'inherit') sources.mode = 'resource';
  else if (tpMode && tpMode !== 'inherit') sources.mode = typeTag;
  else sources.mode = 'site';

  const typeRequired =
    tpMode === 'threshold' && tp.required_correct != null
      ? clampRequiredCorrect(tp.required_correct, siteLayer.defaultRequiredCorrect)
      : null;
  const requiredCorrect =
    prMode === 'threshold' && pr.required_correct != null
      ? clampRequiredCorrect(pr.required_correct, typeRequired ?? siteLayer.defaultRequiredCorrect)
      : mode === 'threshold'
        ? (typeRequired ?? siteLayer.defaultRequiredCorrect)
        : siteLayer.defaultRequiredCorrect;

  if (prMode === 'threshold' && pr.required_correct != null) sources.requiredCorrect = 'resource';
  else if (tpMode === 'threshold' && tp.required_correct != null) sources.requiredCorrect = typeTag;
  else if (mode === 'threshold') sources.requiredCorrect = 'site';

  let allowedWrongAttempts = siteLayer.allowedWrongAttempts;
  if (rowHas(tp, 'allowed_wrong_attempts')) {
    allowedWrongAttempts = clampAllowedWrong(
      tp.allowed_wrong_attempts,
      siteLayer.allowedWrongAttempts,
    );
    sources.allowedWrongAttempts = typeTag;
  } else sources.allowedWrongAttempts = 'site';
  if (rowHas(pr, 'allowed_wrong_attempts')) {
    allowedWrongAttempts = clampAllowedWrong(pr.allowed_wrong_attempts, allowedWrongAttempts);
    sources.allowedWrongAttempts = 'resource';
  }

  let maxQuestionsPerSession = siteLayer.maxQuestionsPerSession;
  if (rowHas(tp, 'max_questions_per_session')) {
    maxQuestionsPerSession = clampMaxSession(
      tp.max_questions_per_session,
      siteLayer.maxQuestionsPerSession,
    );
    sources.maxQuestionsPerSession = typeTag;
  } else sources.maxQuestionsPerSession = 'site';
  if (rowHas(pr, 'max_questions_per_session')) {
    maxQuestionsPerSession = clampMaxSession(pr.max_questions_per_session, maxQuestionsPerSession);
    sources.maxQuestionsPerSession = 'resource';
  }

  let retryCooldownDays = siteLayer.retryCooldownDays;
  if (rowHas(tp, 'retry_cooldown_days')) {
    retryCooldownDays = clampRetryDays(tp.retry_cooldown_days, siteLayer.retryCooldownDays);
    sources.retryCooldownDays = typeTag;
  } else sources.retryCooldownDays = 'site';
  if (rowHas(pr, 'retry_cooldown_days')) {
    retryCooldownDays = clampRetryDays(pr.retry_cooldown_days, retryCooldownDays);
    sources.retryCooldownDays = 'resource';
  }

  let cooldownScope = siteLayer.cooldownScope;
  if (rowHas(tp, 'cooldown_scope')) {
    cooldownScope = normalizeCooldownScope(tp.cooldown_scope, siteLayer.cooldownScope);
    sources.cooldownScope = typeTag;
  } else sources.cooldownScope = 'site';
  if (rowHas(pr, 'cooldown_scope')) {
    cooldownScope = normalizeCooldownScope(pr.cooldown_scope, cooldownScope);
    sources.cooldownScope = 'resource';
  }

  let granularity = siteLayer.granularity;
  sources.granularity = 'site';
  if (rowHas(tp, 'granularity')) {
    granularity = normalizeGranularity(tp.granularity) || granularity;
    sources.granularity = typeTag;
  }
  if (rowHas(pr, 'granularity')) {
    granularity = normalizeGranularity(pr.granularity) || granularity;
    sources.granularity = 'resource';
  }
  const chapG = normalizeGranularity(chapterGranularity);
  if (chapG) {
    granularity = chapG;
    sources.granularity = 'chapter';
  }

  if (String(product).toLowerCase() === 'fm') {
    granularity = 'player';
    sources.granularity = 'fm_default';
  }

  return {
    enabled,
    mode,
    requiredCorrect,
    allowedWrongAttempts,
    maxQuestionsPerSession,
    retryCooldownDays,
    cooldownScope,
    granularity,
    effectiveSources: sources,
  };
}

/** Alias retro-compatible (etendu). */
function resolveEffectivePolicy(params = {}) {
  return resolveEffectiveGatingPolicy(params);
}

const INHERIT_SENTINEL = '__inherit__';

const POLICY_PATCH_FIELDS = Object.freeze([
  {
    body: ['allowed_wrong_attempts', 'allowedWrongAttempts'],
    column: 'allowed_wrong_attempts',
    inherit: true,
  },
  {
    body: ['max_questions_per_session', 'maxQuestionsPerSession'],
    column: 'max_questions_per_session',
    inherit: true,
  },
  {
    body: ['retry_cooldown_days', 'retryCooldownDays'],
    column: 'retry_cooldown_days',
    inherit: true,
  },
  { body: ['cooldown_scope', 'cooldownScope'], column: 'cooldown_scope', inherit: true },
  { body: ['granularity'], column: 'granularity', inherit: true },
]);

function readBodyField(body, keys) {
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(body, k)) return body[k];
  }
  return undefined;
}

/**
 * Fusionne un PATCH policy avec la ligne existante.
 * `null` ou 'inherit' sur un champ nullable → NULL BDD (heriter).
 */
function sanitizePolicyPatch(body = {}, existing = {}) {
  const out = {
    mode: normalizeMode(body.mode) || existing.mode || 'inherit',
    required_correct:
      body.required_correct != null || body.requiredCorrect != null
        ? clampRequiredCorrect(
            body.required_correct ?? body.requiredCorrect,
            existing.required_correct ?? 1,
          )
        : (existing.required_correct ?? 1),
    enabled: existing.enabled ?? 1,
  };

  if (body.enabled !== undefined && body.enabled !== null) {
    out.enabled = body.enabled ? 1 : 0;
  }

  for (const spec of POLICY_PATCH_FIELDS) {
    const raw = readBodyField(body, spec.body);
    if (raw === undefined) {
      out[spec.column] = existing[spec.column] ?? null;
      continue;
    }
    if (raw === null || raw === '' || raw === INHERIT_SENTINEL || lower(raw) === 'inherit') {
      out[spec.column] = null;
      continue;
    }
    if (spec.column === 'cooldown_scope') {
      out[spec.column] = normalizeCooldownScope(raw, null);
    } else if (spec.column === 'granularity') {
      out[spec.column] = normalizeGranularity(raw);
    } else if (spec.column === 'allowed_wrong_attempts') {
      out[spec.column] = clampAllowedWrong(raw, 0);
    } else if (spec.column === 'max_questions_per_session') {
      out[spec.column] = clampMaxSession(raw, 3);
    } else if (spec.column === 'retry_cooldown_days') {
      out[spec.column] = clampRetryDays(raw, 3);
    }
  }

  return out;
}

function describeCooldownScope(scope) {
  return scope === 'question' ? 'verrou sur la question ratée' : 'verrou sur toute la fiche';
}

/**
 * Phrase prof : exigence + session + verrou.
 */
function describeEffectiveGatingPolicy({
  mode = 'any',
  requiredCorrect = 1,
  gatingCount = 0,
  allowedWrongAttempts = 0,
  maxQuestionsPerSession = 3,
  retryCooldownDays = 3,
  cooldownScope = 'resource',
} = {}) {
  const { describeGatingPolicy } = require('./resourceQuestionGatingCore');
  const base = describeGatingPolicy({ mode, requiredCorrect, gatingCount });
  if (mode === 'off' || gatingCount === 0) return base;

  const parts = [base.replace(/\.$/, '')];
  const tol = clampAllowedWrong(allowedWrongAttempts, 0);
  parts.push(
    tol === 0
      ? 'aucune erreur tolérée'
      : `${tol} erreur${tol > 1 ? 's' : ''} tolérée${tol > 1 ? 's' : ''}`,
  );
  parts.push(`jusqu'à ${clampMaxSession(maxQuestionsPerSession, 3)} question(s) par session`);
  const days = clampRetryDays(retryCooldownDays, 0);
  if (days <= 0) {
    parts.push('nouvelle tentative immédiate après verrou');
  } else {
    parts.push(
      `verrou ${days} jour${days > 1 ? 's' : ''} (${describeCooldownScope(cooldownScope)})`,
    );
  }
  return `${parts.join(' · ')}.`;
}

function formatPolicyResponse({ policy, typePolicy, site, effective, product, resourceType }) {
  const resolved =
    effective ||
    resolveEffectiveGatingPolicy({
      perResource: policy,
      typePolicy,
      site,
      product,
      resourceType,
    });
  return {
    policy: policy || null,
    typePolicy: typePolicy || null,
    site,
    effective: resolved,
    effectiveSources: resolved.effectiveSources || {},
  };
}

module.exports = {
  INHERIT_SENTINEL,
  POLICY_PATCH_FIELDS,
  siteLayerFromSettings,
  resolveEffectiveGatingPolicy,
  resolveEffectivePolicy,
  sanitizePolicyPatch,
  describeEffectiveGatingPolicy,
  formatPolicyResponse,
  clampAllowedWrong,
  clampMaxSession,
  clampRetryDays,
  normalizeCooldownScope,
};
