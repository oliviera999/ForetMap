'use strict';

/**
 * Jetons invités de Gnomes & Licornes (« Tenir à deux », lot 2) : émission, hachage du `jti`,
 * révocation. Deux usages :
 * - la **projection** (`lib/glProjection.js`) : un seul jeton par partie, hachage dans
 *   `gl_games.projection_token_hash` ;
 * - la **session d'équipe** d'une tablette de classe (`lib/glClassLink.js`) : plusieurs jetons
 *   par équipe, table `gl_guest_tokens` (migration 348), révocables un par un ou par lot.
 *
 * Un jeton invité est un JWT `product: 'gl'`, `userType: 'gl_guest'`, qui porte un claim propre
 * à son usage (`projection`, `team_session`). Seul le SHA-256 du `jti` est stocké : un jeton
 * volé en base ne se rejoue pas. Aucun nom d'élève n'entre dans un jeton invité.
 */

const crypto = require('node:crypto');
const { signJwtToken } = require('./auth/jwtPipeline');
const { JWT_SECRET } = require('../middleware/requireTeacher');

const TEAM_SESSION_KIND = 'team_session';
/** Durée d'une session d'équipe : une séance de classe et sa marge. */
const TEAM_SESSION_TTL_SECONDS = 3 * 60 * 60;

function newJti() {
  return crypto.randomUUID();
}

/** Hachage d'un `jti` (stocké, comparé en temps constant). */
function hashJti(jti) {
  return crypto.createHash('sha256').update(String(jti)).digest('hex');
}

function hashesMatch(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

/**
 * Signe un jeton invité. `claims` porte le claim d'usage (`{ projection: {…} }`,
 * `{ team_session: {…} }`).
 */
function signGuestToken({ userId, displayName, claims = {}, expiresIn }) {
  return signJwtToken(
    {
      product: 'gl',
      userType: 'gl_guest',
      userId: String(userId),
      roleSlug: 'gl_observateur',
      displayName: String(displayName || ''),
      ...claims,
    },
    JWT_SECRET,
    { expiresIn },
  );
}

/**
 * Émet une session d'équipe : ligne `gl_guest_tokens` + jeton signé (3 heures).
 * @returns {Promise<{ token: string, id: number, expiresInSeconds: number }>}
 */
async function issueTeamSession(db, { gameId, teamId, classId = null }) {
  const jti = newJti();
  const result = await db.execute(
    `INSERT INTO gl_guest_tokens (kind, jti_hash, class_id, game_id, team_id, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? SECOND))`,
    [TEAM_SESSION_KIND, hashJti(jti), classId, gameId, teamId, TEAM_SESSION_TTL_SECONDS],
  );
  const token = signGuestToken({
    userId: `equipe-${gameId}-${teamId}-${jti.slice(0, 8)}`,
    displayName: 'Tablette d’équipe',
    claims: { team_session: { gameId: Number(gameId), teamId: Number(teamId), jti } },
    expiresIn: `${TEAM_SESSION_TTL_SECONDS}s`,
  });
  return { token, id: Number(result.insertId), expiresInSeconds: TEAM_SESSION_TTL_SECONDS };
}

/**
 * Session d'équipe encore valable ? (ligne présente, non révoquée, non expirée, même partie et
 * même équipe, partie non close). Note `last_seen_at` au passage (au plus une fois par minute).
 * @returns {Promise<{ id: number, gameId: number, teamId: number, classId: number|null }|null>}
 */
async function findValidTeamSession(db, teamSession) {
  const jti = String(teamSession?.jti || '');
  const gameId = Number(teamSession?.gameId) || 0;
  const teamId = Number(teamSession?.teamId) || 0;
  if (!jti || !gameId || !teamId) return null;
  const row = await db.queryOne(
    `SELECT t.id, t.game_id, t.team_id, t.class_id, t.last_seen_at,
            (t.last_seen_at IS NULL OR t.last_seen_at < DATE_SUB(NOW(), INTERVAL 60 SECOND)) AS a_noter
       FROM gl_guest_tokens t
       INNER JOIN gl_games g ON g.id = t.game_id
       INNER JOIN gl_teams e ON e.id = t.team_id AND e.game_id = t.game_id
      WHERE t.jti_hash = ? AND t.kind = ? AND t.revoked_at IS NULL AND t.expires_at > NOW()
        AND g.status <> 'ended'
      LIMIT 1`,
    [hashJti(jti), TEAM_SESSION_KIND],
  );
  if (!row || Number(row.game_id) !== gameId || Number(row.team_id) !== teamId) return null;
  if (Number(row.a_noter) === 1) {
    await db.execute('UPDATE gl_guest_tokens SET last_seen_at = NOW() WHERE id = ?', [row.id]);
  }
  return {
    id: Number(row.id),
    gameId,
    teamId,
    classId: row.class_id != null ? Number(row.class_id) : null,
  };
}

/**
 * Révoque des sessions d'équipe : une seule (`id`), celles d'une équipe, d'une partie ou d'une
 * classe. Au moins un critère est exigé.
 * @returns {Promise<number>} nombre de sessions révoquées
 */
async function revokeTeamSessions(db, { id = null, gameId = null, teamId = null, classId = null }) {
  const where = ['kind = ?', 'revoked_at IS NULL'];
  const params = [TEAM_SESSION_KIND];
  if (id != null) {
    where.push('id = ?');
    params.push(id);
  }
  if (gameId != null) {
    where.push('game_id = ?');
    params.push(gameId);
  }
  if (teamId != null) {
    where.push('team_id = ?');
    params.push(teamId);
  }
  if (classId != null) {
    where.push('class_id = ?');
    params.push(classId);
  }
  if (where.length === 2) throw new Error('revokeTeamSessions : critère requis');
  const result = await db.execute(
    `UPDATE gl_guest_tokens SET revoked_at = NOW() WHERE ${where.join(' AND ')}`,
    params,
  );
  return Number(result?.affectedRows || 0);
}

/** Sessions d'équipe ouvertes aujourd'hui sur une partie (console du prof). */
async function listTeamSessions(db, gameId) {
  const rows = await db.queryAll(
    `SELECT id, team_id, created_at, last_seen_at, expires_at
       FROM gl_guest_tokens
      WHERE game_id = ? AND kind = ? AND revoked_at IS NULL AND expires_at > NOW()
        AND created_at >= CURDATE()
      ORDER BY team_id ASC, created_at ASC`,
    [gameId, TEAM_SESSION_KIND],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    teamId: Number(r.team_id),
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at || null,
    expiresAt: r.expires_at,
  }));
}

module.exports = {
  TEAM_SESSION_KIND,
  TEAM_SESSION_TTL_SECONDS,
  newJti,
  hashJti,
  hashesMatch,
  signGuestToken,
  issueTeamSession,
  findValidTeamSession,
  revokeTeamSessions,
  listTeamSessions,
};
