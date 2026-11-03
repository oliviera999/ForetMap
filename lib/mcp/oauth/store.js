'use strict';

/**
 * Stockage MySQL du serveur d'autorisation MCP : clients, codes, jetons (tous **hachés**).
 *
 * Invariants :
 * - un secret (code, jeton) n'existe en clair que dans la réponse HTTP qui le crée ; en base,
 *   seule son empreinte sha256 est conservée (une fuite de la base ne donne aucun jeton
 *   utilisable) ;
 * - un code d'autorisation est à **usage unique** : l'échange pose `used_at` par une écriture
 *   conditionnelle (`used_at IS NULL`) dont `affectedRows` fait foi — deux échanges
 *   simultanés du même code ne passent pas tous les deux ;
 * - la **rotation** d'un refresh pose `rotated_at` de la même façon ; présenter un refresh
 *   déjà tourné (vol probable, RFC 9700 §4.14.2) révoque toute la famille.
 *
 * Inspiration : modèle de stockage des jetons de `@modelcontextprotocol/sdk`
 * (`server/auth/provider.ts`, MIT, https://github.com/modelcontextprotocol/typescript-sdk)
 * et OAuth 2.0 Security BCP (RFC 9700) pour la détection de réutilisation des refresh.
 */

const crypto = require('node:crypto');
const { queryOne, execute } = require('../../../database');
const { getMcpConfig } = require('../config');

const TOKEN_PREFIX = Object.freeze({ access: 'fmcp_at_', refresh: 'fmcp_rt_', code: 'fmcp_ac_' });

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function randomSecret(prefix) {
  return `${prefix}${crypto.randomBytes(32).toString('base64url')}`;
}

/* ------------------------------------------------------------------ clients */

function parseJsonArray(text) {
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function rowToClient(row) {
  if (!row) return null;
  return {
    client_id: row.client_id,
    kind: row.kind,
    client_name: row.client_name || null,
    client_uri: row.client_uri || null,
    redirect_uris: parseJsonArray(row.redirect_uris_json),
    grant_types: parseJsonArray(row.grant_types_json),
    scope: row.scope || null,
    metadata_fetched_at: row.metadata_fetched_at || null,
  };
}

async function getClient(clientId) {
  const row = await queryOne('SELECT * FROM mcp_oauth_clients WHERE client_id = ? LIMIT 1', [
    String(clientId || ''),
  ]);
  return rowToClient(row);
}

async function saveClient({ client_id, kind, client_name, client_uri, redirect_uris, scope }) {
  await execute(
    `INSERT INTO mcp_oauth_clients
       (client_id, kind, client_name, client_uri, redirect_uris_json, scope, metadata_fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, IF(? = 'cimd', NOW(), NULL))
     ON DUPLICATE KEY UPDATE client_name = VALUES(client_name), client_uri = VALUES(client_uri),
       redirect_uris_json = VALUES(redirect_uris_json), scope = VALUES(scope),
       metadata_fetched_at = VALUES(metadata_fetched_at)`,
    [
      client_id,
      kind,
      client_name ? String(client_name).slice(0, 255) : null,
      client_uri ? String(client_uri).slice(0, 512) : null,
      JSON.stringify(redirect_uris || []),
      scope ? String(scope).slice(0, 255) : null,
      kind,
    ],
  );
  return getClient(client_id);
}

async function touchClient(clientId) {
  await execute('UPDATE mcp_oauth_clients SET last_used_at = NOW() WHERE client_id = ?', [
    clientId,
  ]);
}

/* -------------------------------------------------------------------- codes */

async function createAuthCode({ clientId, userId, redirectUri, codeChallenge, scope, resource }) {
  const cfg = getMcpConfig();
  const code = randomSecret(TOKEN_PREFIX.code);
  await execute(
    `INSERT INTO mcp_oauth_auth_codes
       (code_hash, client_id, user_id, redirect_uri, code_challenge, scope, resource, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))`,
    [
      sha256Hex(code),
      clientId,
      String(userId),
      redirectUri,
      codeChallenge,
      scope,
      resource || null,
      cfg.authCodeTtlSeconds,
    ],
  );
  return code;
}

/**
 * Consomme un code : renvoie sa ligne si elle était valide **et** que cet appel l'a marquée
 * utilisée ; `{ reused: true }` si le code avait déjà servi (les jetons émis avec lui sont
 * alors révoqués, RFC 6749 §4.1.2) ; `null` sinon.
 */
async function consumeAuthCode(code) {
  const hash = sha256Hex(code);
  const row = await queryOne(
    `SELECT code_hash, client_id, user_id, redirect_uri, code_challenge, scope, resource,
            family_id, used_at, (expires_at > NOW()) AS fresh
       FROM mcp_oauth_auth_codes WHERE code_hash = ? LIMIT 1`,
    [hash],
  );
  if (!row) return null;
  if (row.used_at) return { reused: true, row };
  if (!Number(row.fresh)) return null;
  const res = await execute(
    'UPDATE mcp_oauth_auth_codes SET used_at = NOW() WHERE code_hash = ? AND used_at IS NULL',
    [hash],
  );
  if (res.affectedRows !== 1) return { reused: true, row };
  return { reused: false, row };
}

/* ------------------------------------------------------------------- jetons */

async function insertToken({ kind, familyId, clientId, userId, scope, resource, ttlSeconds }) {
  const token = randomSecret(TOKEN_PREFIX[kind]);
  // Époque lue en base au moment même de l'émission (sous-requête) : un jeton émis juste après
  // un changement de mot de passe porte la nouvelle époque, jamais l'ancienne.
  await execute(
    `INSERT INTO mcp_oauth_tokens
       (token_hash, kind, family_id, client_id, user_id, scope, resource, token_epoch, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?,
             COALESCE((SELECT u.token_epoch FROM users u WHERE u.id = ?), 0),
             DATE_ADD(NOW(), INTERVAL ? SECOND))`,
    [
      sha256Hex(token),
      kind,
      familyId,
      clientId,
      String(userId),
      scope,
      resource || null,
      String(userId),
      ttlSeconds,
    ],
  );
  return token;
}

/**
 * Émet un couple access (+ refresh si `offline_access` est accordé ou si `withRefresh`).
 * @returns {Promise<{ access_token: string, refresh_token?: string, expires_in: number, scope: string, token_type: 'Bearer' }>}
 */
async function issueTokenPair({ familyId, clientId, userId, scope, resource, withRefresh }) {
  const cfg = getMcpConfig();
  const family = familyId || crypto.randomUUID();
  const accessToken = await insertToken({
    kind: 'access',
    familyId: family,
    clientId,
    userId,
    scope,
    resource,
    ttlSeconds: cfg.accessTokenTtlSeconds,
  });
  const out = {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: cfg.accessTokenTtlSeconds,
    scope,
  };
  if (withRefresh) {
    out.refresh_token = await insertToken({
      kind: 'refresh',
      familyId: family,
      clientId,
      userId,
      scope,
      resource,
      ttlSeconds: cfg.refreshTokenTtlDays * 86400,
    });
  }
  return out;
}

async function revokeFamily(familyId) {
  await execute(
    'UPDATE mcp_oauth_tokens SET revoked_at = NOW() WHERE family_id = ? AND revoked_at IS NULL',
    [familyId],
  );
}

/** Associe au code la famille de jetons qu'il vient de produire. */
async function bindCodeFamily(code, familyId) {
  await execute('UPDATE mcp_oauth_auth_codes SET family_id = ? WHERE code_hash = ?', [
    familyId,
    sha256Hex(code),
  ]);
}

/** Code rejoué : révoque la famille qu'il avait produite (RFC 6749 §4.1.2). */
async function revokeTokensForReplayedCode(row) {
  if (row?.family_id) await revokeFamily(row.family_id);
}

/**
 * Rotation d'un refresh. Renvoie :
 * - `{ ok: true, row }` si le refresh était valide et vient d'être marqué tourné ;
 * - `{ ok: false, reason: 'reuse' }` si le refresh avait déjà été tourné (famille révoquée) ;
 * - `{ ok: false, reason: 'invalid' }` sinon (inconnu, expiré, révoqué, mauvais client).
 */
async function rotateRefreshToken(refreshToken, clientId) {
  const hash = sha256Hex(refreshToken);
  const row = await queryOne(
    `SELECT t.token_hash, t.family_id, t.client_id, t.user_id, t.scope, t.resource, t.revoked_at,
            t.rotated_at, t.token_epoch, u.token_epoch AS current_epoch,
            (t.expires_at > NOW()) AS fresh
       FROM mcp_oauth_tokens t JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = ? AND t.kind = 'refresh' LIMIT 1`,
    [hash],
  );
  if (!row || row.client_id !== clientId) return { ok: false, reason: 'invalid' };
  if (Number(row.token_epoch) !== Number(row.current_epoch)) {
    // Mot de passe changé ou compte désactivé depuis l'émission : toute la famille tombe.
    await revokeFamily(row.family_id);
    return { ok: false, reason: 'epoch' };
  }
  if (row.rotated_at) {
    await revokeFamily(row.family_id);
    return { ok: false, reason: 'reuse' };
  }
  if (row.revoked_at || !Number(row.fresh)) return { ok: false, reason: 'invalid' };
  const res = await execute(
    `UPDATE mcp_oauth_tokens SET rotated_at = NOW(), revoked_at = NOW()
      WHERE token_hash = ? AND rotated_at IS NULL AND revoked_at IS NULL`,
    [hash],
  );
  if (res.affectedRows !== 1) {
    await revokeFamily(row.family_id);
    return { ok: false, reason: 'reuse' };
  }
  // L'access token encore vivant de la famille est remplacé : on le révoque aussi.
  await execute(
    `UPDATE mcp_oauth_tokens SET revoked_at = NOW()
      WHERE family_id = ? AND kind = 'access' AND revoked_at IS NULL`,
    [row.family_id],
  );
  return { ok: true, row };
}

/** Jeton d'accès valide (non expiré, non révoqué) ou `null`. */
async function findActiveAccessToken(accessToken) {
  const token = String(accessToken || '');
  if (!token.startsWith(TOKEN_PREFIX.access)) return null;
  const row = await queryOne(
    `SELECT t.token_hash, t.family_id, t.client_id, t.user_id, t.scope, t.resource,
            t.token_epoch, u.token_epoch AS current_epoch,
            TIMESTAMPDIFF(SECOND, NOW(), t.expires_at) AS expires_in
       FROM mcp_oauth_tokens t
       JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = ? AND t.kind = 'access' AND t.revoked_at IS NULL
        AND t.expires_at > NOW()
      LIMIT 1`,
    [sha256Hex(token)],
  );
  return row || null;
}

/** Révocation RFC 7009 : jeton inconnu → succès silencieux (pas d'oracle). */
async function revokeToken(token, clientId) {
  const row = await queryOne(
    'SELECT family_id, client_id FROM mcp_oauth_tokens WHERE token_hash = ? LIMIT 1',
    [sha256Hex(token)],
  );
  if (!row) return false;
  if (clientId && row.client_id !== clientId) return false;
  await revokeFamily(row.family_id);
  return true;
}

/** Révoque tous les jetons d'un compte (désactivation, perte de permission). */
async function revokeAllForUser(userId) {
  await execute(
    'UPDATE mcp_oauth_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL',
    [String(userId)],
  );
}

let lastPurgeAt = 0;
const PURGE_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Purge opportuniste (au plus toutes les 10 min, déclenchée par `/oauth/token`) : codes
 * expirés depuis 1 h, jetons expirés ou révoqués depuis 7 jours, plans expirés depuis 7 jours.
 * Le délai de grâce garde la trace d'une réutilisation de refresh le temps de la diagnostiquer.
 */
async function purgeExpiredOpportunistic({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastPurgeAt < PURGE_INTERVAL_MS) return null;
  lastPurgeAt = now;
  const codes = await execute(
    'DELETE FROM mcp_oauth_auth_codes WHERE expires_at < DATE_SUB(NOW(), INTERVAL 1 HOUR) LIMIT 5000',
  );
  const tokens = await execute(
    `DELETE FROM mcp_oauth_tokens
      WHERE expires_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
         OR revoked_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
      LIMIT 5000`,
  );
  const plans = await execute(
    `DELETE FROM mcp_content_plans
      WHERE expires_at < DATE_SUB(NOW(), INTERVAL 7 DAY) AND status <> 'applied' LIMIT 5000`,
  );
  // Confirmations du mode productivité : expirées depuis 1 h (durée de vie 10 min).
  let confirmations = { affectedRows: 0 };
  try {
    confirmations = await execute(
      `DELETE FROM mcp_confirmations
        WHERE expires_at < DATE_SUB(NOW(), INTERVAL 1 HOUR) LIMIT 5000`,
    );
  } catch {
    /* table absente avant migration 327 */
  }
  return {
    codes: codes.affectedRows,
    tokens: tokens.affectedRows,
    plans: plans.affectedRows,
    confirmations: confirmations.affectedRows,
  };
}

module.exports = {
  TOKEN_PREFIX,
  bindCodeFamily,
  consumeAuthCode,
  createAuthCode,
  findActiveAccessToken,
  getClient,
  issueTokenPair,
  purgeExpiredOpportunistic,
  revokeAllForUser,
  revokeFamily,
  revokeToken,
  revokeTokensForReplayedCode,
  rotateRefreshToken,
  saveClient,
  sha256Hex,
  touchClient,
};
