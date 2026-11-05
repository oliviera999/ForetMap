'use strict';

/**
 * Configuration du connecteur MCP distant (`/mcp`) et de son serveur d'autorisation OAuth.
 *
 * Toutes les valeurs d'environnement sont lues **à chaque appel** (et non figées à l'import) :
 * les tests modifient `process.env` entre deux cas, et un redémarrage Passenger relit de toute
 * façon l'environnement.
 *
 * Réglages du connecteur (décision du propriétaire du 05/11/2026, `docs/MCP.md` § 13) : tout est
 * **ouvert par défaut** et paramétrable depuis l'administration (clés `mcp.*`, déclarées dans
 * `lib/settings/mcp.js`). Résolution : **variable d'environnement posée** (gagne et verrouille la
 * clé) > valeur `app_settings` > défaut ouvert. `resolveMcpSettings()` (asynchrone, cache 10 s)
 * mémorise l'instantané ; `getMcpConfig()` reste **synchrone** et le consomme — le script stdio
 * Cursor, qui n'a pas de base, retombe sur environnement + défauts.
 *
 * Restent hors réglages : `MCP_ENABLED` (interrupteur général, **désactivé** par défaut :
 * exposer un serveur d'autorisation est un changement de surface d'attaque) et
 * `MCP_WRITE_ENABLED` (activé par défaut).
 */

const DEFAULT_ALLOWED_REDIRECTS = Object.freeze([
  // Claude (claude.ai + Claude Code loopback, port ignoré à la comparaison).
  'https://claude.ai/api/mcp/auth_callback',
  'http://localhost/callback',
  'http://127.0.0.1/callback',
  // Cursor (web / Agents + desktop loopback + schéma custom IDE).
  'https://www.cursor.com/agents/mcp/oauth/callback',
  'http://localhost:8787/callback',
  'http://127.0.0.1:8787/callback',
  'cursor://anysphere.cursor-mcp/oauth/callback',
  // ChatGPT (redirect stable + préfixe pour callback_id).
  'https://chatgpt.com/connector_platform_oauth_redirect',
  'https://chatgpt.com/connector/oauth/*',
  // Gemini CLI (loopback, chemin /oauth/callback).
  'http://localhost/oauth/callback',
  'http://127.0.0.1/oauth/callback',
]);

const SCOPES = Object.freeze({
  READ: 'foretmap.read',
  WRITE: 'foretmap.write',
  OFFLINE: 'offline_access',
});

/** Audience logique des jetons MCP (distincte de tout JWT applicatif). */
const MCP_TOKEN_AUDIENCE = 'foretmap-mcp';

const ACK_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function readBool(name, fallback) {
  const raw = String(process.env[name] ?? '')
    .trim()
    .toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on', 'oui'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off', 'non'].includes(raw)) return false;
  return fallback;
}

function readInt(name, fallback, { min, max }) {
  const raw = String(process.env[name] ?? '').trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < min || n > max) return fallback;
  return n;
}

function readList(name, fallback) {
  const raw = String(process.env[name] ?? '').trim();
  if (!raw) return [...fallback];
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function isMcpEnabled() {
  return readBool('MCP_ENABLED', false);
}

// ---------------------------------------------------------------------------------------------
// Réglages `mcp.*` : variable d'environnement > `app_settings` > défaut ouvert.
// ---------------------------------------------------------------------------------------------

const { MCP_SETTINGS, MCP_DOMAIN_NAMES, HTTP_METHODS } = require('../settings/mcp');

/** Durée de vie de l'instantané résolu (relu à chaque requête `/mcp` au-delà). */
const SETTINGS_SNAPSHOT_TTL_MS = 10_000;

function parseBoolText(raw) {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (['1', 'true', 'yes', 'on', 'oui'].includes(v)) return true;
  if (['0', 'false', 'no', 'off', 'non'].includes(v)) return false;
  return undefined;
}

function parseEnumText(meta) {
  return (raw) => {
    const v = String(raw ?? '').trim();
    return meta.values.includes(v) ? v : undefined;
  };
}

function parseIntText(meta) {
  return (raw) => {
    const n = Number.parseInt(String(raw ?? '').trim(), 10);
    if (!Number.isFinite(n) || n < meta.min || n > meta.max) return undefined;
    return n;
  };
}

function parseCsvText(allowed, { upper = false } = {}) {
  return (raw) => {
    const items = String(raw ?? '')
      .split(/[\s,;]+/)
      .map((x) => (upper ? x.trim().toUpperCase() : x.trim()))
      .filter(Boolean);
    if (allowed) return items.filter((x) => allowed.includes(x)).join(',');
    return items.join(',');
  };
}

/**
 * Correspondance clé ↔ variables d'environnement. La première variable **posée et valide**
 * gagne et verrouille la clé. Les variables historiques (`MCP_WRITE_REQUIRE_PLAN`,
 * `MCP_CONFIRM_REQUIRED`, `MCP_SQL_ENABLED`) sont converties vers la valeur du réglage.
 */
const ENV_BINDINGS = Object.freeze({
  'mcp.write_mode': [
    { env: 'MCP_WRITE_MODE', parse: parseEnumText(MCP_SETTINGS['mcp.write_mode']) },
    {
      env: 'MCP_WRITE_REQUIRE_PLAN',
      parse: (raw) => {
        const b = parseBoolText(raw);
        return b === undefined ? undefined : b ? 'plan' : 'direct';
      },
    },
  ],
  'mcp.write_scope_policy': [
    {
      env: 'MCP_WRITE_SCOPE_POLICY',
      parse: parseEnumText(MCP_SETTINGS['mcp.write_scope_policy']),
    },
  ],
  'mcp.api_bridge_enabled': [{ env: 'MCP_API_BRIDGE_ENABLED', parse: parseBoolText }],
  'mcp.api_bridge_methods': [
    { env: 'MCP_API_BRIDGE_METHODS', parse: parseCsvText(HTTP_METHODS, { upper: true }) },
  ],
  'mcp.api_bridge_sensitive_auth': [{ env: 'MCP_API_BRIDGE_SENSITIVE_AUTH', parse: parseBoolText }],
  'mcp.domains_disabled': [{ env: 'MCP_DOMAINS_DISABLED', parse: parseCsvText(MCP_DOMAIN_NAMES) }],
  'mcp.sql_select_enabled': [{ env: 'MCP_SQL_ENABLED', parse: parseBoolText }],
  'mcp.sql_select_pool': [
    { env: 'MCP_SQL_SELECT_POOL', parse: parseEnumText(MCP_SETTINGS['mcp.sql_select_pool']) },
  ],
  'mcp.sql_write_enabled': [{ env: 'MCP_SQL_WRITE_ENABLED', parse: parseBoolText }],
  'mcp.sql_ddl_enabled': [{ env: 'MCP_SQL_DDL_ENABLED', parse: parseBoolText }],
  'mcp.sql_max_affected_rows': [
    {
      env: 'MCP_SQL_MAX_AFFECTED_ROWS',
      parse: parseIntText(MCP_SETTINGS['mcp.sql_max_affected_rows']),
    },
  ],
  'mcp.confirm_mode': [
    { env: 'MCP_CONFIRM_MODE', parse: parseEnumText(MCP_SETTINGS['mcp.confirm_mode']) },
    {
      env: 'MCP_CONFIRM_REQUIRED',
      parse: (raw) => {
        const b = parseBoolText(raw);
        return b === undefined ? undefined : b ? 'sensitive' : 'off';
      },
    },
  ],
  'mcp.privacy_bypass': [{ env: 'MCP_PRIVACY_BYPASS', parse: parseBoolText }],
  'mcp.privacy_bypass_ack': [
    { env: 'MCP_PRIVACY_BYPASS_ACK', parse: (raw) => String(raw ?? '').trim() || undefined },
  ],
  'mcp.privacy_reads_audit_details': [
    {
      env: 'MCP_PRIVACY_READS_AUDIT_DETAILS',
      parse: parseEnumText(MCP_SETTINGS['mcp.privacy_reads_audit_details']),
    },
  ],
  'mcp.ops_enabled': [{ env: 'MCP_OPS_ENABLED', parse: parseBoolText }],
  'mcp.files_enabled': [{ env: 'MCP_FILES_ENABLED', parse: parseBoolText }],
  'mcp.max_rows': [{ env: 'MCP_MAX_ROWS', parse: parseIntText(MCP_SETTINGS['mcp.max_rows']) }],
  'mcp.max_output_chars': [
    { env: 'MCP_MAX_OUTPUT_CHARS', parse: parseIntText(MCP_SETTINGS['mcp.max_output_chars']) },
  ],
  'mcp.tool_profile': [
    { env: 'MCP_TOOL_PROFILE', parse: parseEnumText(MCP_SETTINGS['mcp.tool_profile']) },
  ],
});

/** Variable d'environnement qui verrouille `key`, avec sa valeur convertie (ou `null`). */
function envOverride(key) {
  for (const binding of ENV_BINDINGS[key] || []) {
    const raw = process.env[binding.env];
    if (raw === undefined || String(raw).trim() === '') continue;
    const value = binding.parse(raw);
    if (value !== undefined) return { env: binding.env, value };
  }
  return null;
}

/**
 * Valeur effective de chaque clé `mcp.*`.
 * @param {Record<string, unknown>} [dbValues] valeurs lues en base (clés présentes seulement)
 * @returns {Record<string, { value: unknown, source: 'env'|'base'|'défaut', locked: boolean, env: string|null }>}
 */
function buildSettingsEntries(dbValues = {}) {
  const out = {};
  for (const [key, meta] of Object.entries(MCP_SETTINGS)) {
    const env = envOverride(key);
    if (env) {
      out[key] = { value: env.value, source: 'env', locked: true, env: env.env };
    } else if (Object.prototype.hasOwnProperty.call(dbValues, key)) {
      out[key] = { value: dbValues[key], source: 'base', locked: false, env: null };
    } else {
      out[key] = { value: meta.default, source: 'défaut', locked: false, env: null };
    }
  }
  return out;
}

let resolvedSnapshot = null; // { at, entries }

/**
 * Lit les réglages `mcp.*` en base (cache ≤ 10 s) et mémorise l'instantané que
 * `getMcpConfig()` consomme ensuite **de façon synchrone** (les modules du connecteur l'appellent
 * en profondeur : confirmation, SQL, plans). Appelée en tête de chaque requête `/mcp` et des
 * étapes OAuth qui décident d'une portée. En cas d'échec de lecture : défauts + environnement.
 * @param {{ force?: boolean }} [opts]
 */
async function resolveMcpSettings({ force = false } = {}) {
  if (!force && resolvedSnapshot && Date.now() - resolvedSnapshot.at < SETTINGS_SNAPSHOT_TTL_MS) {
    return buildSettingsEntries(resolvedSnapshot.dbValues);
  }
  const dbValues = {};
  try {
    const { queryAll } = require('../../database');
    const { getSettingValue } = require('../settings');
    const rows = await queryAll("SELECT `key` FROM app_settings WHERE `key` LIKE 'mcp.%'");
    for (const row of rows || []) {
      const key = String(row.key);
      if (!Object.prototype.hasOwnProperty.call(MCP_SETTINGS, key)) continue;
      dbValues[key] = await getSettingValue(key, MCP_SETTINGS[key].default);
    }
  } catch (err) {
    try {
      require('../logger').warn(
        { err, msg: 'mcp_settings_read_failed' },
        'Réglages MCP illisibles',
      );
    } catch (_) {
      // Script stdio sans logger : défauts + environnement.
    }
  }
  // On mémorise les valeurs de base seulement : l'environnement est relu à chaque
  // `getMcpConfig()` (une variable posée gagne immédiatement).
  resolvedSnapshot = { at: Date.now(), dbValues };
  return buildSettingsEntries(dbValues);
}

/** Invalidé à l'écriture d'un réglage `mcp.*` (`lib/settings.js`). */
function invalidateMcpSettingsCache() {
  resolvedSnapshot = null;
}

/** Entrées courantes : instantané résolu s'il existe, sinon environnement + défauts. */
function currentSettingsEntries() {
  return buildSettingsEntries(resolvedSnapshot ? resolvedSnapshot.dbValues : {});
}

function csvList(value) {
  return String(value || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * Valide une date d'accusé `AAAA-MM-JJ` (calendrier réel, non future).
 * @returns {{ ok: true, date: string } | { ok: false, reason: string }}
 */
function parsePrivacyBypassAck(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { ok: false, reason: 'absent' };
  const m = ACK_DATE_RE.exec(text);
  if (!m) return { ok: false, reason: 'format_invalide' };
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return { ok: false, reason: 'date_invalide' };
  }
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (dt.getTime() > todayUtc) return { ok: false, reason: 'date_future' };
  return { ok: true, date: text };
}

/**
 * État du bypass RGPD. Depuis le 05/11/2026, l'accusé n'est **plus un prérequis** : le bypass
 * est actif dès que `mcp.privacy_bypass` vaut vrai (défaut). L'accusé reste une information
 * affichée au diagnostic (`reason` = motif de son absence ou de son invalidité).
 * @returns {{ requested: boolean, ack: string|null, active: boolean, reason: string|null }}
 */
function privacyBypassStatus(entries = currentSettingsEntries()) {
  const requested = !!entries['mcp.privacy_bypass'].value;
  const ackRaw = String(entries['mcp.privacy_bypass_ack'].value || '').trim() || null;
  const parsed = parsePrivacyBypassAck(ackRaw);
  return {
    requested,
    ack: parsed.ok ? parsed.date : ackRaw,
    active: requested,
    reason: requested && !parsed.ok ? parsed.reason : null,
  };
}

function isMcpPrivacyBypassActive() {
  return privacyBypassStatus().active;
}

function isMcpWriteEnabled() {
  return readBool('MCP_WRITE_ENABLED', true);
}

function isMcpSqlEnabled() {
  return getMcpConfig().sqlEnabled;
}

/** SQL en écriture (`foretmap_sql_execute`). */
function isMcpSqlWriteEnabled() {
  return getMcpConfig().sqlWriteEnabled;
}

/** DDL / DCL dans `foretmap_sql_execute`. */
function isMcpSqlDdlEnabled() {
  return getMcpConfig().sqlDdlEnabled;
}

/** Vrai en mode `plan` : `foretmap_content_change` (écriture directe) disparaît. */
function isMcpWriteRequirePlan() {
  return getMcpConfig().writeRequirePlan;
}

/** Confirmation par code active (`sensitive` ou `all_writes`). */
function isMcpConfirmRequired() {
  return getMcpConfig().confirmRequired;
}

/**
 * Origine publique du connecteur (`https://foretmap.example`), sans barre finale.
 * Sans `MCP_PUBLIC_BASE_URL`, elle est dérivée de la requête (protocole + host vus par
 * Express, donc dépendants de `trust proxy`) : acceptable en local et en test, **à éviter en
 * production**, où `resource` doit valoir exactement l'URL saisie dans le client MCP.
 * @param {import('express').Request} [req]
 */
function resolvePublicBaseUrl(req) {
  const fromEnv = String(process.env.MCP_PUBLIC_BASE_URL || '').trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  if (!req) return 'http://localhost:3000';
  const host = req.get('host') || 'localhost';
  return `${req.protocol}://${host}`.replace(/\/+$/, '');
}

let missingBaseUrlLogged = false;
let privacyBypassStartupLogged = false;

/**
 * En production, l'URL publique doit être fixée : sans elle, `resource` (RFC 9728) et la
 * liaison des jetons dépendraient de l'en-tête `Host` (relecture de sécurité, M5). Le
 * connecteur répond alors 503 et l'erreur est journalisée une fois.
 */
function productionBaseUrlMissing() {
  const prod = String(process.env.NODE_ENV || '').trim() === 'production';
  if (!prod || String(process.env.MCP_PUBLIC_BASE_URL || '').trim()) return false;
  if (!missingBaseUrlLogged) {
    missingBaseUrlLogged = true;
    // Chargement tardif : ce module est aussi lu par le script stdio, qui n'a pas de Pino.
    require('../logger').error(
      { msg: 'mcp_public_base_url_missing' },
      'Connecteur MCP désactivé : MCP_PUBLIC_BASE_URL est obligatoire en production (docs/MCP.md § 2)',
    );
  }
  return true;
}

/** Outils de consultation des fichiers du serveur. */
function isMcpFilesEnabled() {
  return getMcpConfig().filesEnabled;
}

/**
 * Journalise une fois l'état du bypass au montage (ou au premier appel de test). Bypass actif
 * sans accusé valide : avertissement (plus une erreur bloquante, cf. registre de traitement § 9).
 */
function logPrivacyBypassStartupStatus() {
  if (privacyBypassStartupLogged) return privacyBypassStatus();
  privacyBypassStartupLogged = true;
  const status = privacyBypassStatus();
  const logger = require('../logger');
  if (status.active && status.reason) {
    logger.warn(
      { msg: 'mcp_privacy_bypass_ack_missing', reason: status.reason, ack: status.ack },
      'Bypass RGPD du connecteur MCP actif sans accusé valide (mcp.privacy_bypass_ack, AAAA-MM-JJ) : ' +
        'données nominatives d’élèves accessibles aux porteurs de mcp.privacy_bypass. Voir docs/MCP_REGISTRE_TRAITEMENT.md § 9.',
    );
  } else if (status.active) {
    logger.warn(
      { msg: 'mcp_privacy_bypass_active', ack: status.ack },
      'Bypass RGPD du connecteur MCP actif : données nominatives d’élèves accessibles aux porteurs de mcp.privacy_bypass.',
    );
  }
  return status;
}

/** Réservé aux tests : permet de rejouer le journal de démarrage et oublie l'instantané. */
function resetPrivacyBypassStartupLogForTests() {
  privacyBypassStartupLogged = false;
  resolvedSnapshot = null;
}

/**
 * Configuration effective du connecteur. Synchrone : elle lit l'instantané des réglages
 * résolu par `resolveMcpSettings()` (requête `/mcp`, OAuth), ou à défaut l'environnement et les
 * défauts ouverts (script stdio, tests unitaires).
 * @param {Record<string, { value: unknown }>} [entries]
 */
function getMcpConfig(entries = currentSettingsEntries()) {
  const v = (key) => entries[key].value;
  const privacy = privacyBypassStatus(entries);
  const writeEnabled = isMcpWriteEnabled();
  const writeMode = v('mcp.write_mode');
  const requirePlan = writeMode === 'plan';
  const confirmMode = v('mcp.confirm_mode');
  return {
    enabled: isMcpEnabled(),
    writeEnabled,
    writeMode,
    writeRequirePlan: requirePlan,
    /** Écriture directe (`foretmap_content_change`) : write activé ET mode `direct`. */
    directWriteEnabled: writeEnabled && !requirePlan,
    writeScopePolicy: v('mcp.write_scope_policy'),
    apiBridgeEnabled: !!v('mcp.api_bridge_enabled'),
    apiBridgeMethods: csvList(v('mcp.api_bridge_methods'))
      .map((m) => m.toUpperCase())
      .filter((m) => HTTP_METHODS.includes(m)),
    apiBridgeSensitiveAuth: !!v('mcp.api_bridge_sensitive_auth'),
    domainsDisabled: csvList(v('mcp.domains_disabled')).filter((d) => MCP_DOMAIN_NAMES.includes(d)),
    sqlEnabled: !!v('mcp.sql_select_enabled'),
    sqlSelectPool: v('mcp.sql_select_pool'),
    sqlWriteEnabled: !!v('mcp.sql_write_enabled'),
    sqlDdlEnabled: !!v('mcp.sql_ddl_enabled'),
    sqlMaxAffectedRows: Number(v('mcp.sql_max_affected_rows')),
    filesEnabled: !!v('mcp.files_enabled'),
    opsEnabled: !!v('mcp.ops_enabled'),
    privacyBypassRequested: privacy.requested,
    privacyBypassActive: privacy.active,
    privacyBypassAck: privacy.ack,
    privacyBypassReason: privacy.reason,
    privacyReadsAuditDetails: v('mcp.privacy_reads_audit_details'),
    confirmMode,
    confirmRequired: confirmMode !== 'off',
    confirmAllWrites: confirmMode === 'all_writes',
    maxRows: Number(v('mcp.max_rows')),
    maxOutputChars: Number(v('mcp.max_output_chars')),
    toolProfile: v('mcp.tool_profile'),
    settings: entries,
    accessTokenTtlSeconds: readInt('MCP_ACCESS_TOKEN_TTL_SECONDS', 3600, { min: 300, max: 86400 }),
    refreshTokenTtlDays: readInt('MCP_REFRESH_TOKEN_TTL_DAYS', 30, { min: 1, max: 365 }),
    authCodeTtlSeconds: readInt('MCP_AUTH_CODE_TTL_SECONDS', 60, { min: 30, max: 600 }),
    planTtlMinutes: readInt('MCP_PLAN_TTL_MINUTES', 60, { min: 5, max: 1440 }),
    statementTimeoutMs: readInt('MCP_STATEMENT_TIMEOUT_MS', 5000, { min: 500, max: 60000 }),
    cimdEnabled: readBool('MCP_CIMD_ENABLED', true),
    dcrEnabled: readBool('MCP_DCR_ENABLED', true),
    allowedRedirects: readList('MCP_OAUTH_ALLOWED_REDIRECTS', DEFAULT_ALLOWED_REDIRECTS),
    rateLimitPerMin: readInt('MCP_RATE_LIMIT_PER_MIN', 300, { min: 10, max: 10000 }),
  };
}

module.exports = {
  DEFAULT_ALLOWED_REDIRECTS,
  ENV_BINDINGS,
  buildSettingsEntries,
  invalidateMcpSettingsCache,
  resolveMcpSettings,
  MCP_TOKEN_AUDIENCE,
  SCOPES,
  getMcpConfig,
  isMcpEnabled,
  isMcpWriteEnabled,
  isMcpSqlEnabled,
  isMcpSqlWriteEnabled,
  isMcpSqlDdlEnabled,
  isMcpWriteRequirePlan,
  isMcpConfirmRequired,
  isMcpFilesEnabled,
  isMcpPrivacyBypassActive,
  logPrivacyBypassStartupStatus,
  parsePrivacyBypassAck,
  privacyBypassStatus,
  productionBaseUrlMissing,
  resetPrivacyBypassStartupLogForTests,
  resolvePublicBaseUrl,
};
