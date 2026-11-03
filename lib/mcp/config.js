'use strict';

/**
 * Configuration du connecteur MCP distant (`/mcp`) et de son serveur d'autorisation OAuth.
 *
 * Toutes les valeurs sont lues **à chaque appel** (et non figées à l'import) : les tests
 * modifient `process.env` entre deux cas, et un redémarrage Passenger relit de toute façon
 * l'environnement. Le coût est négligeable (quelques lectures de chaînes par requête).
 *
 * Valeurs par défaut (décision documentée dans `docs/MCP.md`) :
 * - `MCP_ENABLED` : **désactivé** tant qu'il n'est pas posé à `true` — exposer un serveur
 *   d'autorisation est un changement de surface d'attaque, il doit être voulu ;
 * - `MCP_WRITE_ENABLED` : **activé** (demande explicite du propriétaire) ; l'écriture reste
 *   réservée aux comptes porteurs de `mcp.write` (admin) et au scope `foretmap.write` ;
 * - `MCP_SQL_ENABLED` : **désactivé** (requêtes SELECT libres, admin `mcp.sql`) ;
 * - `MCP_FILES_ENABLED` : **activé** (demande du propriétaire) : consultation en lecture seule
 *   des journaux et fichiers du serveur, réservée à `mcp.write` (admin) ;
 * - mode productivité (défauts **protégés**) : `MCP_SQL_WRITE_ENABLED=false`,
 *   `MCP_SQL_DDL_ENABLED=false`, `MCP_WRITE_REQUIRE_PLAN=true`, `MCP_PRIVACY_BYPASS=false`,
 *   `MCP_CONFIRM_REQUIRED=true`.
 */

const DEFAULT_ALLOWED_REDIRECTS = Object.freeze([
  // Claude (claude.ai + Claude Code loopback, port ignoré à la comparaison).
  'https://claude.ai/api/mcp/auth_callback',
  'http://localhost/callback',
  'http://127.0.0.1/callback',
  // Cursor (web / Agents + desktop).
  'https://www.cursor.com/agents/mcp/oauth/callback',
  'http://localhost:8787/callback',
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

function isMcpWriteEnabled() {
  return readBool('MCP_WRITE_ENABLED', true);
}

function isMcpSqlEnabled() {
  return readBool('MCP_SQL_ENABLED', false);
}

/** SQL en écriture (`foretmap_sql_execute`) — désactivé par défaut. */
function isMcpSqlWriteEnabled() {
  return readBool('MCP_SQL_WRITE_ENABLED', false);
}

/** DDL / DCL dans `foretmap_sql_execute` — désactivé par défaut. */
function isMcpSqlDdlEnabled() {
  return readBool('MCP_SQL_DDL_ENABLED', false);
}

/**
 * Si `true` (défaut), l'écriture de contenu exige plan → apply ; `foretmap_content_change`
 * (écriture directe) disparaît.
 */
function isMcpWriteRequirePlan() {
  return readBool('MCP_WRITE_REQUIRE_PLAN', true);
}

/** Confirmation par code pour les opérations sensibles — activée par défaut. */
function isMcpConfirmRequired() {
  return readBool('MCP_CONFIRM_REQUIRED', true);
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
 * État du bypass RGPD. Actif seulement si `MCP_PRIVACY_BYPASS=true` **et**
 * `MCP_PRIVACY_BYPASS_ACK` est une date valide non future.
 * @returns {{ requested: boolean, ack: string|null, active: boolean, reason: string|null }}
 */
function privacyBypassStatus() {
  const requested = readBool('MCP_PRIVACY_BYPASS', false);
  const ackRaw = String(process.env.MCP_PRIVACY_BYPASS_ACK ?? '').trim() || null;
  if (!requested) {
    return { requested: false, ack: ackRaw, active: false, reason: null };
  }
  const parsed = parsePrivacyBypassAck(ackRaw);
  if (!parsed.ok) {
    return {
      requested: true,
      ack: ackRaw,
      active: false,
      reason: parsed.reason,
    };
  }
  return { requested: true, ack: parsed.date, active: true, reason: null };
}

function isMcpPrivacyBypassActive() {
  return privacyBypassStatus().active;
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

/** Outils de consultation des fichiers du serveur (admin `mcp.write`) : actifs par défaut. */
function isMcpFilesEnabled() {
  return readBool('MCP_FILES_ENABLED', true);
}

/**
 * Journalise une fois l'état du bypass au montage (ou au premier appel de test).
 * Si demandé sans ACK valide → erreur claire, outils désactivés.
 */
function logPrivacyBypassStartupStatus() {
  if (privacyBypassStartupLogged) return privacyBypassStatus();
  privacyBypassStartupLogged = true;
  const status = privacyBypassStatus();
  const logger = require('../logger');
  if (status.requested && !status.active) {
    logger.error(
      {
        msg: 'mcp_privacy_bypass_ack_missing',
        reason: status.reason,
        ack: status.ack,
      },
      'MCP_PRIVACY_BYPASS=true sans MCP_PRIVACY_BYPASS_ACK valide (AAAA-MM-JJ, non future) : ' +
        'les outils nominatifs restent désactivés. Voir docs/MCP_REGISTRE_TRAITEMENT.md § 9.',
    );
  } else if (status.active) {
    logger.warn(
      { msg: 'mcp_privacy_bypass_active', ack: status.ack },
      'Bypass RGPD du connecteur MCP actif : données nominatives d’élèves accessibles aux admins.',
    );
  }
  return status;
}

/** Réservé aux tests : permet de rejouer le journal de démarrage. */
function resetPrivacyBypassStartupLogForTests() {
  privacyBypassStartupLogged = false;
}

function getMcpConfig() {
  const privacy = privacyBypassStatus();
  const writeEnabled = isMcpWriteEnabled();
  const requirePlan = isMcpWriteRequirePlan();
  return {
    enabled: isMcpEnabled(),
    writeEnabled,
    writeRequirePlan: requirePlan,
    /** Écriture directe (`foretmap_content_change`) : write activé ET plan non exigé. */
    directWriteEnabled: writeEnabled && !requirePlan,
    sqlEnabled: isMcpSqlEnabled(),
    sqlWriteEnabled: isMcpSqlWriteEnabled(),
    sqlDdlEnabled: isMcpSqlDdlEnabled(),
    sqlMaxAffectedRows: readInt('MCP_SQL_MAX_AFFECTED_ROWS', 100, { min: 1, max: 100000 }),
    filesEnabled: isMcpFilesEnabled(),
    privacyBypassRequested: privacy.requested,
    privacyBypassActive: privacy.active,
    privacyBypassAck: privacy.ack,
    privacyBypassReason: privacy.reason,
    confirmRequired: isMcpConfirmRequired(),
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
