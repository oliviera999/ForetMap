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
/**
 * Sessions d'équipe protégées (ensemble unifié, M13) : une session neuve est une **demande**,
 * qui ne vaut qu'une fois acceptée par un appareil déjà dans l'équipe ou par le prof. Sans
 * réponse, elle expire seule au bout de deux minutes.
 */
const { DEMANDE_APPAREIL_SECONDES } = require('./shared/glMainCore');

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
 * Émet une session d'équipe **en attente** : ligne `gl_guest_tokens` sans `accepted_at`, qui
 * expire dans deux minutes, + jeton signé. Le jeton ne sert à rien tant que la demande n'est pas
 * acceptée (`acceptTeamSessions`) ; accepté, il vaut 3 heures.
 * @returns {Promise<{ token: string, id: number, expiresInSeconds: number,
 *   demandeExpireDansSecondes: number }>}
 */
async function issueTeamSession(db, { gameId, teamId, classId = null }) {
  const jti = newJti();
  const result = await db.execute(
    `INSERT INTO gl_guest_tokens (kind, jti_hash, class_id, game_id, team_id, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? SECOND))`,
    [TEAM_SESSION_KIND, hashJti(jti), classId, gameId, teamId, DEMANDE_APPAREIL_SECONDES],
  );
  const token = signGuestToken({
    userId: `equipe-${gameId}-${teamId}-${jti.slice(0, 8)}`,
    displayName: 'Tablette d’équipe',
    claims: { team_session: { gameId: Number(gameId), teamId: Number(teamId), jti } },
    expiresIn: `${TEAM_SESSION_TTL_SECONDS}s`,
  });
  return {
    token,
    id: Number(result.insertId),
    expiresInSeconds: TEAM_SESSION_TTL_SECONDS,
    demandeExpireDansSecondes: DEMANDE_APPAREIL_SECONDES,
  };
}

/**
 * Accepte des demandes d'appareil encore en attente : une seule (`id`), celles d'une équipe, ou
 * toutes celles de la partie (« Tout accepter »). La session vaut alors 3 heures.
 * @param {'mj'|'equipe'|'eleve'} par qui accepte
 * @returns {Promise<number>} nombre de sessions acceptées
 */
async function acceptTeamSessions(db, { gameId, id = null, teamId = null, par = 'mj' }) {
  const where = [
    'kind = ?',
    'game_id = ?',
    'revoked_at IS NULL',
    'accepted_at IS NULL',
    'expires_at > NOW()',
  ];
  const params = [TEAM_SESSION_KIND, gameId];
  if (id != null) {
    where.push('id = ?');
    params.push(id);
  }
  if (teamId != null) {
    where.push('team_id = ?');
    params.push(teamId);
  }
  const result = await db.execute(
    `UPDATE gl_guest_tokens
        SET accepted_at = NOW(), accepted_by = ?, expires_at = DATE_ADD(NOW(), INTERVAL ? SECOND)
      WHERE ${where.join(' AND ')}`,
    [String(par), TEAM_SESSION_TTL_SECONDS, ...params],
  );
  return Number(result?.affectedRows || 0);
}

/**
 * Où en est la demande d'un appareil ? `acceptee`, `en_attente`, `refusee` (ou déconnectée par
 * le prof), `expiree`. Lu par l'appareil qui attend, avec son propre jeton.
 * @returns {Promise<{ statut: string, gameId: number, teamId: number, resteSecondes: number }|null>}
 */
async function readTeamSessionRequest(db, teamSession) {
  const jti = String(teamSession?.jti || '');
  if (!jti) return null;
  const row = await db.queryOne(
    `SELECT id, game_id, team_id, accepted_at, revoked_at,
            (expires_at > NOW()) AS vivante,
            GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(), expires_at)) AS reste
       FROM gl_guest_tokens WHERE jti_hash = ? AND kind = ? LIMIT 1`,
    [hashJti(jti), TEAM_SESSION_KIND],
  );
  if (!row) return null;
  let statut = 'en_attente';
  if (row.revoked_at) statut = 'refusee';
  else if (Number(row.vivante) !== 1) statut = 'expiree';
  else if (row.accepted_at) statut = 'acceptee';
  return {
    statut,
    gameId: Number(row.game_id),
    teamId: Number(row.team_id),
    resteSecondes: statut === 'en_attente' ? Number(row.reste) || 0 : 0,
  };
}

/**
 * Demandes d'appareil en attente sur une partie (ou une seule équipe) : aucun nom, aucun jeton.
 * @returns {Promise<Array<{ id: number, teamId: number, createdAt: any, resteSecondes: number }>>}
 */
async function listTeamSessionRequests(db, gameId, { teamId = null } = {}) {
  const rows = await db.queryAll(
    `SELECT id, team_id, created_at,
            GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(), expires_at)) AS reste
       FROM gl_guest_tokens
      WHERE game_id = ? AND kind = ? AND revoked_at IS NULL AND accepted_at IS NULL
        AND expires_at > NOW()${teamId != null ? ' AND team_id = ?' : ''}
      ORDER BY created_at ASC, id ASC`,
    teamId != null ? [gameId, TEAM_SESSION_KIND, teamId] : [gameId, TEAM_SESSION_KIND],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    teamId: Number(r.team_id),
    createdAt: r.created_at,
    resteSecondes: Number(r.reste) || 0,
  }));
}

/**
 * Session d'équipe encore valable ? (ligne présente, **acceptée**, non révoquée, non expirée,
 * même partie et même équipe, partie non close). Note `last_seen_at` au passage (au plus une fois par minute).
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
        AND t.accepted_at IS NOT NULL AND g.status <> 'ended'
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
        AND accepted_at IS NOT NULL AND created_at >= CURDATE()
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
  acceptTeamSessions,
  readTeamSessionRequest,
  listTeamSessionRequests,
  findValidTeamSession,
  revokeTeamSessions,
  listTeamSessions,
};
