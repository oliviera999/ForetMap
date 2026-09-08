'use strict';

// =====================================================================
// Resolution en cascade site → type (resource_ref='*') → ressource → (GL) chapitre/scope
// pour mode, seuil N, session, verrou (delai en HEURES, portee, severite) et granularite.
// 100 % pur — aucun acces BDD.
// =====================================================================

const gatingSettingsCore = require('./gatingSettingsCore');
const {
  normalizeMode,
  normalizeGranularity,
  clampRequiredCorrect,
} = require('./resourceQuestionGatingCore');
const {
  clampCooldownHours,
  formatHoursLabel,
  DEFAULT_RETRY_COOLDOWN_HOURS,
} = require('./cooldownDurationCore');

const COOLDOWN_SCOPES = gatingSettingsCore.COOLDOWN_SCOPE_VALUES;
const LOCK_MODES = gatingSettingsCore.LOCK_MODE_VALUES;

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

function clampRetryHours(value, fallback = DEFAULT_RETRY_COOLDOWN_HOURS) {
  return gatingSettingsCore.normalizeGatingSetting('retryCooldownHours', value ?? fallback);
}

function normalizeCooldownScope(value, fallback = 'resource') {
  const v = lower(value);
  if (COOLDOWN_SCOPES.includes(v)) return v;
  return fallback;
}

function normalizeLockMode(value, fallback = 'flow') {
  const v = lower(value);
  if (LOCK_MODES.includes(v)) return v;
  return fallback;
}

/**
 * Delai d'une ligne de politique, en heures : colonne `retry_cooldown_hours` d'abord ;
 * a defaut l'ancienne `retry_cooldown_days` × 24 (base non encore migree ou ligne ancienne).
 * `null` si la ligne herite.
 */
function rowRetryHours(row) {
  if (!row) return null;
  if (row.retry_cooldown_hours != null && row.retry_cooldown_hours !== '') {
    return clampRetryHours(row.retry_cooldown_hours, 0);
  }
  if (row.retry_cooldown_days != null && row.retry_cooldown_days !== '') {
    return clampRetryHours(Number(row.retry_cooldown_days) * 24, 0);
  }
  return null;
}

/** Reglages site normalises a partir de buildGatingSettings ou objet route. */
function siteLayerFromSettings(site = {}) {
  const s = site || {};
  // Tolere encore un objet de reglages ancien (`retryCooldownDays`) : × 24.
  const hours =
    s.retryCooldownHours != null
      ? s.retryCooldownHours
      : s.retryCooldownDays != null
        ? Number(s.retryCooldownDays) * 24
        : undefined;
  return {
    enabled: asBool(s.enabled, false),
    defaultMode: normalizeMode(s.defaultMode) || 'any',
    defaultRequiredCorrect: clampRequiredCorrect(s.defaultRequiredCorrect, 1),
    allowedWrongAttempts: clampAllowedWrong(s.allowedWrongAttempts, 0),
    maxQuestionsPerSession: clampMaxSession(s.maxQuestionsPerSession, 3),
    retryCooldownHours: clampRetryHours(hours, DEFAULT_RETRY_COOLDOWN_HOURS),
    cooldownScope: normalizeCooldownScope(s.cooldownScope, 'resource'),
    lockMode: normalizeLockMode(s.lockMode, 'flow'),
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

  let retryCooldownHours = siteLayer.retryCooldownHours;
  sources.retryCooldownHours = 'site';
  const tpHours = rowRetryHours(tp);
  if (tpHours != null) {
    retryCooldownHours = tpHours;
    sources.retryCooldownHours = typeTag;
  }
  const prHours = rowRetryHours(pr);
  if (prHours != null) {
    retryCooldownHours = prHours;
    sources.retryCooldownHours = 'resource';
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

  let lockMode = siteLayer.lockMode;
  if (rowHas(tp, 'lock_mode')) {
    lockMode = normalizeLockMode(tp.lock_mode, siteLayer.lockMode);
    sources.lockMode = typeTag;
  } else sources.lockMode = 'site';
  if (rowHas(pr, 'lock_mode')) {
    lockMode = normalizeLockMode(pr.lock_mode, lockMode);
    sources.lockMode = 'resource';
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
    retryCooldownHours,
    // Lisibilite immediate pour un professeur : « 6 h », « 2 jours », « aucun delai ».
    retryCooldownLabel: formatHoursLabel(retryCooldownHours),
    cooldownScope,
    lockMode,
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
    // `retry_cooldown_days` reste accepte en entree (× 24) pour les clients anciens.
    body: [
      'retry_cooldown_hours',
      'retryCooldownHours',
      'retry_cooldown_days',
      'retryCooldownDays',
    ],
    column: 'retry_cooldown_hours',
    inherit: true,
  },
  { body: ['cooldown_scope', 'cooldownScope'], column: 'cooldown_scope', inherit: true },
  { body: ['lock_mode', 'lockMode'], column: 'lock_mode', inherit: true },
  { body: ['granularity'], column: 'granularity', inherit: true },
]);

function readBodyField(body, keys) {
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(body, k)) return { key: k, value: body[k] };
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
    const found = readBodyField(body, spec.body);
    if (found === undefined) {
      // Ligne ancienne : la valeur en jours est reprise en heures, jamais perdue.
      out[spec.column] =
        spec.column === 'retry_cooldown_hours'
          ? rowRetryHours(existing)
          : (existing[spec.column] ?? null);
      continue;
    }
    const raw = found.value;
    if (raw === null || raw === '' || raw === INHERIT_SENTINEL || lower(raw) === 'inherit') {
      out[spec.column] = null;
      continue;
    }
    if (spec.column === 'cooldown_scope') {
      out[spec.column] = normalizeCooldownScope(raw, null);
    } else if (spec.column === 'lock_mode') {
      out[spec.column] = normalizeLockMode(raw, null);
    } else if (spec.column === 'granularity') {
      out[spec.column] = normalizeGranularity(raw);
    } else if (spec.column === 'allowed_wrong_attempts') {
      out[spec.column] = clampAllowedWrong(raw, 0);
    } else if (spec.column === 'max_questions_per_session') {
      out[spec.column] = clampMaxSession(raw, 3);
    } else if (spec.column === 'retry_cooldown_hours') {
      const legacyDays = /days/i.test(found.key);
      out[spec.column] = clampRetryHours(
        legacyDays ? Number(raw) * 24 : raw,
        DEFAULT_RETRY_COOLDOWN_HOURS,
      );
    }
  }

  return out;
}

function describeCooldownScope(scope) {
  return scope === 'question' ? 'verrou sur la question ratée' : 'verrou sur toute la fiche';
}

/** Libelles courts de la severite du verrou (prof / admin). */
const LOCK_MODE_LABELS_FR = Object.freeze({
  advisory: 'Souple : le verrou ne vaut que dans le flux de validation',
  flow: 'Normal : une question posée pour la fiche se répond dans la fiche',
  strict: 'Strict : les questions bloquantes ne se jouent que dans la fiche',
});

/**
 * Phrase prof : exigence + session + verrou.
 */
function describeEffectiveGatingPolicy({
  mode = 'any',
  requiredCorrect = 1,
  gatingCount = 0,
  allowedWrongAttempts = 0,
  maxQuestionsPerSession = 3,
  retryCooldownHours = DEFAULT_RETRY_COOLDOWN_HOURS,
  retryCooldownDays = null,
  cooldownScope = 'resource',
  lockMode = 'flow',
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
  const hours =
    retryCooldownDays != null && retryCooldownHours == null
      ? clampRetryHours(Number(retryCooldownDays) * 24, 0)
      : clampRetryHours(retryCooldownHours, 0);
  if (hours <= 0) {
    parts.push('nouvelle tentative immédiate après une erreur');
  } else {
    parts.push(`verrou ${formatHoursLabel(hours)} (${describeCooldownScope(cooldownScope)})`);
  }
  const lm = normalizeLockMode(lockMode, 'flow');
  if (lm === 'strict') parts.push('questions réservées à la validation');
  else if (lm === 'advisory') parts.push('verrou souple');
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
  LOCK_MODE_LABELS_FR,
  siteLayerFromSettings,
  resolveEffectiveGatingPolicy,
  resolveEffectivePolicy,
  sanitizePolicyPatch,
  describeEffectiveGatingPolicy,
  formatPolicyResponse,
  clampAllowedWrong,
  clampMaxSession,
  clampRetryHours,
  clampCooldownHours,
  normalizeCooldownScope,
  normalizeLockMode,
  rowRetryHours,
};
