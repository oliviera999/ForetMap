'use strict';

/**
 * Garde-fous « secrets » du mode productivité MCP (bypass RGPD).
 *
 * Même en bypass, ces tables et colonnes **ne sortent jamais** vers Claude : hachages de
 * mots de passe, secrets TOTP et codes de secours, jetons (OAuth, reset, LTI, MCP), secrets
 * d'application et valeurs de `.env`. Les e-mails et noms restent visibles (c'est l'objet
 * du bypass).
 *
 * Distinct de `sqlGuard.js` (liste blanche contenu / scrub PII complet) et de
 * `secretMask.js` (masquage de motifs dans les fichiers d'exploitation).
 */

const { maskSecrets } = require('./secretMask');

/** Tables dont aucune ligne ne doit jamais être lue ni renvoyée, même en bypass. */
const SECRET_TABLES = Object.freeze(
  new Set([
    'user_totp',
    'user_totp_backup_codes',
    'password_reset_tokens',
    'lti_nonces',
    'lti_tickets_used',
    'role_pin_secrets',
    'app_settings',
    'gl_settings',
    'mcp_confirmations',
    'mcp_oauth_clients',
    'mcp_oauth_auth_codes',
    'mcp_oauth_tokens',
  ]),
);

/** Préfixes / motifs de tables secrètes (OAuth applicatif, LTI…). */
const SECRET_TABLE_PATTERNS = Object.freeze([/^oauth_/, /^mcp_oauth_/, /^lti_/]);

/**
 * Colonnes secrètes : hachages, secrets, jetons, codes de secours.
 * Plus étroit que `DENIED_COLUMN_RE` (qui retire aussi e-mail, nom, auteur…).
 */
const SECRET_COLUMN_RE =
  /^(?:.*password.*|.*_hash|.*token.*|.*secret.*|pin_hash|secret_enc|pending_secret_enc|code_hash|token_hash)$/i;

/** Variables d'environnement dont la **valeur** ne doit jamais apparaître en clair. */
const SENSITIVE_ENV_KEYS = Object.freeze([
  'JWT_SECRET',
  'VISIT_COOKIE_SECRET',
  'DB_PASS',
  'DB_MCP_PASS',
  'SMTP_PASS',
  'MCP_HEALTH_TOKEN',
  'LOAD_TEST_SECRET',
  'FORETMAP_TOTP_ENCRYPTION_KEY',
  'TOTP_ENCRYPTION_KEY',
  'GOOGLE_CLIENT_SECRET',
  'LTI_PLATFORM_SECRET',
]);

function normalizeTableName(name) {
  return String(name || '')
    .replace(/`/g, '')
    .trim()
    .toLowerCase();
}

function isSecretTable(name) {
  const t = normalizeTableName(name);
  if (!t) return true;
  if (SECRET_TABLES.has(t)) return true;
  return SECRET_TABLE_PATTERNS.some((re) => re.test(t));
}

function isSecretColumn(name) {
  return SECRET_COLUMN_RE.test(String(name || ''));
}

/** Valeurs non vides des variables sensibles actuelles (pour les masquer dans les sorties). */
function collectEnvSecretValues() {
  const out = [];
  for (const key of SENSITIVE_ENV_KEYS) {
    const v = String(process.env[key] || '').trim();
    if (v && v.length >= 4) out.push(v);
  }
  // Toute variable dont le nom ressemble à un secret.
  for (const [k, v] of Object.entries(process.env)) {
    if (!/pass(?:word|wd)?|secret|token|api[_-]?key|private[_-]?key/i.test(k)) continue;
    const val = String(v || '').trim();
    if (val && val.length >= 4 && !out.includes(val)) out.push(val);
  }
  // Plus longues d'abord : éviter qu'un préfixe court masque une valeur plus longue.
  out.sort((a, b) => b.length - a.length);
  return out;
}

function maskEnvValuesInString(text) {
  let s = String(text);
  for (const v of collectEnvSecretValues()) {
    if (s.includes(v)) s = s.split(v).join('[secret .env masqué]');
  }
  return s;
}

/**
 * Nettoyage « secrets seulement » : retire les clés secrètes, masque bcrypt / JWT / jetons /
 * valeurs `.env`, **conserve** e-mails et noms.
 */
function scrubSecretsOnly(value, depth = 0) {
  if (depth > 12) return null;
  if (value == null) return value;
  if (typeof value === 'string') {
    return maskEnvValuesInString(maskSecrets(value));
  }
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return '[binaire]';
  if (Array.isArray(value)) return value.map((v) => scrubSecretsOnly(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (isSecretColumn(k)) continue;
      out[k] = scrubSecretsOnly(v, depth + 1);
    }
    return out;
  }
  return value;
}

module.exports = {
  SECRET_COLUMN_RE,
  SECRET_TABLES,
  SECRET_TABLE_PATTERNS,
  SENSITIVE_ENV_KEYS,
  collectEnvSecretValues,
  isSecretColumn,
  isSecretTable,
  normalizeTableName,
  scrubSecretsOnly,
};
