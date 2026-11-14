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

/**
 * Variables d'environnement dont la **valeur** ne doit jamais apparaître en clair, quelle que
 * soit sa forme (même courte, même un mot du dictionnaire).
 */
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
  'TOTP_ENCRYPTION_KEY_PREVIOUS',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'LTI_PLATFORM_SECRET',
  'DEPLOY_SECRET',
  'FORETMAP_DEPLOY_SECRET',
  'FORETMAP_DEPLOY_CHECK_SECRET',
  'FORETMAP_SOCKET_QUERY_TOKEN',
  'OPENAI_API_KEY',
  'PLANTNET_API_KEY',
  'TREFLE_TOKEN',
  'TEACHER_ADMIN_PASSWORD',
]);

/**
 * Nom qui **ressemble** à celui d'un secret : le mot sensible doit être un **segment** du nom
 * (séparé par `_` ou en bordure). Avant, `pass` était cherché n'importe où :
 * `PASSENGER_APP_ENV` (injectée par Passenger, valeur `production`) passait pour un secret, et
 * « reproduction » sortait du connecteur en « re[secret .env masqué] ».
 */
const SECRET_LIKE_ENV_NAME_RE =
  /(?:^|_)(?:PASS|PASSWD|PASSWORD|PASSPHRASE|SECRET|TOKEN|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY|CREDENTIALS?)(?:_|$)/i;

/** Suffixes de configuration (adresse, chemin, interrupteur…) : jamais un secret en soi. */
const NON_SECRET_ENV_SUFFIX_RE =
  /_(?:URL|URI|PATH|FILE|DIR|LOG|HOST|PORT|USER|ENV|MODE|NAME|ENABLED|REQUIRED|TTL|DAYS|HOURS|MINUTES|SECONDS|MS|MAX|MIN|LENGTH|LEN)$/i;

/** Valeurs courantes, jamais traitées comme secrètes pour un nom repéré par l'heuristique. */
const COMMON_ENV_VALUES = Object.freeze(
  new Set([
    'production',
    'development',
    'staging',
    'test',
    'testing',
    'local',
    'localhost',
    'true',
    'false',
    'yes',
    'no',
    'oui',
    'non',
    'on',
    'off',
    'null',
    'none',
    'undefined',
    'default',
    'enabled',
    'disabled',
    'changeme',
  ]),
);

/** Longueur à partir de laquelle une valeur repérée par le nom est masquée en sous-chaîne. */
const NAME_ONLY_SUBSTRING_MIN = 12;

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

/**
 * Valeurs secrètes de l'environnement, avec leur mode de masquage :
 * - clés listées (`SENSITIVE_ENV_KEYS`) : toujours masquées, dès 4 caractères ;
 * - noms repérés par l'heuristique (`SECRET_LIKE_ENV_NAME_RE`, hors suffixes de configuration) :
 *   ignorées si la valeur est un mot courant (`production`, `true`…) ou un nombre ;
 * - masquage **en sous-chaîne** pour une valeur d'au moins 12 caractères, **au mot entier**
 *   sinon (une valeur courte ne doit pas caviarder l'intérieur d'un mot ordinaire).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Array<{ value: string, wholeWord: boolean }>}
 */
function collectEnvSecretPatterns(env = process.env) {
  const out = new Map();
  const add = (value, wholeWord) => {
    const prev = out.get(value);
    // Une même valeur vue deux fois : le masquage le plus large l'emporte.
    out.set(value, { value, wholeWord: prev ? prev.wholeWord && wholeWord : wholeWord });
  };
  for (const key of SENSITIVE_ENV_KEYS) {
    const v = String(env[key] || '').trim();
    if (v.length >= 4) add(v, v.length < NAME_ONLY_SUBSTRING_MIN);
  }
  for (const [k, raw] of Object.entries(env)) {
    if (SENSITIVE_ENV_KEYS.includes(k)) continue;
    if (!SECRET_LIKE_ENV_NAME_RE.test(k) || NON_SECRET_ENV_SUFFIX_RE.test(k)) continue;
    const v = String(raw || '').trim();
    if (v.length < 4) continue;
    if (COMMON_ENV_VALUES.has(v.toLowerCase()) || /^\d+$/.test(v)) continue;
    add(v, v.length < NAME_ONLY_SUBSTRING_MIN);
  }
  // Plus longues d'abord : éviter qu'un préfixe court masque une valeur plus longue.
  return [...out.values()].sort((a, b) => b.value.length - a.value.length);
}

/** Valeurs secrètes de l'environnement (compatibilité : sans le mode de masquage). */
function collectEnvSecretValues(env = process.env) {
  return collectEnvSecretPatterns(env).map((p) => p.value);
}

const ENV_MASK = '[secret .env masqué]';

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function maskEnvValuesInString(text, env = process.env) {
  let s = String(text);
  for (const { value, wholeWord } of collectEnvSecretPatterns(env)) {
    if (!s.includes(value)) continue;
    if (wholeWord) {
      const re = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(value)}(?![\\p{L}\\p{N}_])`, 'gu');
      s = s.replace(re, ENV_MASK);
    } else {
      s = s.split(value).join(ENV_MASK);
    }
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
  COMMON_ENV_VALUES,
  SECRET_COLUMN_RE,
  SECRET_LIKE_ENV_NAME_RE,
  SECRET_TABLES,
  SECRET_TABLE_PATTERNS,
  SENSITIVE_ENV_KEYS,
  collectEnvSecretPatterns,
  collectEnvSecretValues,
  isSecretColumn,
  maskEnvValuesInString,
  isSecretTable,
  normalizeTableName,
  scrubSecretsOnly,
};
