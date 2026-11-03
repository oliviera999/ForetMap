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
 *   des journaux et fichiers du serveur, réservée à `mcp.write` (admin).
 */

const DEFAULT_ALLOWED_REDIRECTS = Object.freeze([
  'https://claude.ai/api/mcp/auth_callback',
  // Claude Code : redirection loopback RFC 8252, port éphémère ignoré à la comparaison.
  'http://localhost/callback',
  'http://127.0.0.1/callback',
]);

const SCOPES = Object.freeze({
  READ: 'foretmap.read',
  WRITE: 'foretmap.write',
  OFFLINE: 'offline_access',
});

/** Audience logique des jetons MCP (distincte de tout JWT applicatif). */
const MCP_TOKEN_AUDIENCE = 'foretmap-mcp';

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

/**
 * Origine publique du connecteur (`https://foretmap.example`), sans barre finale.
 * Sans `MCP_PUBLIC_BASE_URL`, elle est dérivée de la requête (protocole + host vus par
 * Express, donc dépendants de `trust proxy`) : acceptable en local et en test, **à éviter en
 * production**, où `resource` doit valoir exactement l'URL saisie dans Claude.
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

function getMcpConfig() {
  return {
    enabled: isMcpEnabled(),
    writeEnabled: isMcpWriteEnabled(),
    sqlEnabled: isMcpSqlEnabled(),
    filesEnabled: isMcpFilesEnabled(),
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
  isMcpFilesEnabled,
  productionBaseUrlMissing,
  resolvePublicBaseUrl,
};
