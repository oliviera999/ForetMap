'use strict';

/**
 * Ticket d'arrivée LTI (court, 2 min) puis échange contre un jeton produit (même TTL que Google, L19).
 * Le ticket est un JWT HS256 `purpose: 'lti_ticket'` portant un `jti`, consommé une seule fois
 * en base à l'échange (`lti_tickets_used`, migration 314 — AC6, audit 2026-09-30).
 */

const crypto = require('node:crypto');
const { queryOne, execute } = require('../../database');
const { signJwtToken, verifyJwtToken } = require('../auth/jwtPipeline');
const { JWT_SECRET, signAuthToken } = require('../../middleware/requireTeacher');
const { buildAuthzPayload } = require('../rbac');
const { getUserTokenEpoch } = require('../auth/tokenEpoch');
const { exposeAuth } = require('../authRouteHelpers');
const { toPublicUserRow } = require('../publicUser');
const { getGlRolePermissions, exposeGlAuth } = require('../gl/authRouteHelpers');
const { buildGlAdminClaims } = require('../glStaffAuth');
const { buildOAuthFrontendRedirect } = require('../googleOAuthShared');
const { httpError } = require('../shared/httpError');

const TICKET_TTL_SECONDS = 120;

function issueTicket({ userId, destination, report }) {
  if (!JWT_SECRET) throw httpError(503, 'JWT non configuré');
  return signJwtToken(
    {
      purpose: 'lti_ticket',
      // Identifiant unique : consommé une seule fois à l'échange (AC6, audit 2026-09-30).
      jti: crypto.randomBytes(18).toString('hex'),
      userId,
      destination,
      report,
    },
    JWT_SECRET,
    { expiresIn: TICKET_TTL_SECONDS },
  );
}

function readTicket(token) {
  if (!token) throw httpError(400, 'Ticket manquant');
  let claims;
  try {
    claims = verifyJwtToken(token, JWT_SECRET);
  } catch {
    throw httpError(401, 'Ticket d’arrivée invalide ou expiré');
  }
  if (claims.purpose !== 'lti_ticket' || !claims.userId || !claims.jti) {
    throw httpError(401, 'Ticket d’arrivée invalide');
  }
  return claims;
}

/**
 * Consomme le ticket (table `lti_tickets_used`, migration 314) : sans cela, un ticket intercepté
 * (historique, extension, capture d'écran de l'URL) s'échangeait contre autant de sessions que
 * voulu pendant ses deux minutes de vie (AC6). Appelé **après** la construction de la session :
 * un échec métier (destination à choisir, pas de joueur G&L…) ne brûle pas le ticket, et
 * l'insertion à clé primaire départage deux échanges concurrents.
 */
async function consumeTicket(claims) {
  const jti = String(claims?.jti || '').slice(0, 64);
  if (!jti) throw httpError(401, 'Ticket d’arrivée invalide');
  await execute('DELETE FROM lti_tickets_used WHERE expires_at < NOW()');
  const expSeconds = Number(claims.exp) || Math.floor(Date.now() / 1000) + TICKET_TTL_SECONDS;
  try {
    await execute('INSERT INTO lti_tickets_used (jti, expires_at) VALUES (?, ?)', [
      jti,
      new Date(expSeconds * 1000),
    ]);
  } catch (err) {
    if (err && (err.errno === 1062 || err.code === 'ER_DUP_ENTRY')) {
      throw httpError(401, 'Ticket d’arrivée déjà utilisé', { code: 'LTI_TICKET_USED' });
    }
    throw err;
  }
}

async function buildFmSession(user) {
  const userType =
    String(user.user_type || 'student').toLowerCase() === 'teacher' ? 'teacher' : 'student';
  const authz = await buildAuthzPayload(userType, user.id);
  if (!authz) throw httpError(403, 'Aucun profil pour ce compte');
  const tokenEpoch = await getUserTokenEpoch(user.id);
  const tokenPayload = {
    userType,
    userId: user.id,
    tokenEpoch,
    roleId: authz.roleId,
    roleSlug: authz.roleSlug,
    roleDisplayName: authz.roleDisplayName,
    permissions: authz.permissions,
    nativePrivileged: !!authz.nativePrivileged,
  };
  const token = await signAuthToken(tokenPayload);
  const publicUser = toPublicUserRow(user);
  return {
    product: 'fm',
    type: userType,
    token,
    auth: exposeAuth(tokenPayload),
    student: userType === 'student' ? { ...publicUser, authToken: token } : null,
  };
}

async function buildGlPlayerSession(user) {
  const player = await queryOne(
    `SELECT * FROM gl_players WHERE linked_foretmap_user_id = ? AND is_active = 1 LIMIT 1`,
    [user.id],
  );
  if (!player) throw httpError(403, 'Aucun joueur Gnomes & Licornes pour ce compte');
  const membership = await queryOne(
    `SELECT tm.game_id, tm.team_id
       FROM gl_team_members tm
 INNER JOIN gl_games g ON g.id = tm.game_id
      WHERE tm.player_id = ?
      ORDER BY CASE g.status WHEN 'live' THEN 0 WHEN 'paused' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END ASC,
               g.updated_at DESC LIMIT 1`,
    [player.id],
  );
  const claims = {
    userType: 'gl_player',
    userId: String(player.id),
    roleSlug: 'gl_player',
    displayName: player.pseudo,
    classId: player.class_id ? Number(player.class_id) : null,
    teamId: membership?.team_id
      ? Number(membership.team_id)
      : player.team_id
        ? Number(player.team_id)
        : null,
    gameId: membership?.game_id ? Number(membership.game_id) : null,
    passwordMustReset: !!Number(player.password_must_reset || 0),
    permissions: getGlRolePermissions('player'),
  };
  const tokenEpoch = await getUserTokenEpoch(user.id);
  const token = await signAuthToken({ ...claims, tokenEpoch, product: 'gl' });
  return { product: 'gl', type: 'gl_player', token, auth: exposeGlAuth(claims), student: null };
}

/**
 * Session MJ / admin G&L depuis un cours Moodle (AC1, audit 2026-09-30).
 *
 * Même contrat que la connexion directe (CDG-12, `resolveGlStaffLogin`) : le compte doit
 * être un **enseignant** ForetMap qui détient `teacher.access`, et la ligne `gl_admins` est
 * rapprochée **uniquement** par `foretmap_user_id`. L'ancien repli
 * `OR LOWER(email) = LOWER(?) LIMIT 1` laissait un Instructor Moodle prendre une ligne staff
 * historique non liée en alignant son e-mail ForetMap sur elle. La liaison par e-mail reste
 * un geste explicite (connexion directe G&L ou administration du jeu).
 */
async function buildGlStaffSession(user) {
  const denied = () =>
    httpError(403, 'Aucun compte MJ / admin Gnomes & Licornes pour cet enseignant');
  if (!user?.id || String(user.user_type || '').toLowerCase() !== 'teacher') throw denied();
  const authz = await buildAuthzPayload('teacher', user.id);
  if (!authz?.permissions?.includes('teacher.access')) throw denied();
  const admin = await queryOne('SELECT * FROM gl_admins WHERE foretmap_user_id = ? LIMIT 1', [
    String(user.id),
  ]);
  if (!admin || !Number(admin.is_active)) throw denied();
  const glRole = String(admin.role || 'mj').toLowerCase() === 'admin' ? 'admin' : 'mj';
  const base = buildGlAdminClaims(admin, glRole);
  const claims = { ...base, permissions: getGlRolePermissions(glRole === 'mj' ? 'mj' : 'admin') };
  const tokenEpoch = await getUserTokenEpoch(user.id);
  // `authSource: 'lti'` : l'hydratation refuse, pour cette voie, une ligne staff non liée.
  const token = await signAuthToken({ ...claims, tokenEpoch, authSource: 'lti', product: 'gl' });
  return { product: 'gl', type: 'gl_staff', token, auth: exposeGlAuth(claims), student: null };
}

function glOriginFromFm(fmOrigin) {
  const fromEnv = String(process.env.GL_FRONTEND_ORIGIN || '')
    .trim()
    .replace(/\/+$/, '');
  if (fromEnv) return fromEnv;
  try {
    const url = new URL(fmOrigin);
    if (url.hostname.startsWith('gl.')) return url.origin;
    url.hostname = `gl.${url.hostname.replace(/^www\./, '')}`;
    return url.origin;
  } catch {
    return fmOrigin;
  }
}

function oauthPayloadFromSession(session) {
  if (session.product === 'gl') {
    return { type: session.type, token: session.token, auth: session.auth };
  }
  if (session.type === 'teacher') {
    return { type: 'teacher', token: session.token, auth: session.auth };
  }
  return {
    type: 'student',
    student: session.student || { authToken: session.token, auth: session.auth },
  };
}

async function exchangeTicket({ ticket, destinationId, instructorPick, fmOrigin = '' }) {
  const claims = readTicket(ticket);
  const dest = claims.destination || {};
  const destinations = dest.destinations || [];
  let chosen = destinations.find((d) => d.id === destinationId) || null;
  if (!chosen && instructorPick)
    chosen = destinations.find((d) => d.product === instructorPick) || null;
  if (!chosen && destinations.length === 1) chosen = destinations[0];
  if (!chosen) throw httpError(400, 'Choisir une destination');

  const user = await queryOne('SELECT * FROM users WHERE id = ? LIMIT 1', [claims.userId]);
  if (!user || !Number(user.is_active)) throw httpError(403, 'Compte indisponible');

  let session;
  if (chosen.product === 'gl') {
    session = dest.instructor ? await buildGlStaffSession(user) : await buildGlPlayerSession(user);
  } else {
    session = await buildFmSession(user);
  }
  await consumeTicket(claims);
  const origin = chosen.product === 'gl' ? glOriginFromFm(fmOrigin) : fmOrigin;
  const redirectUrl = origin
    ? buildOAuthFrontendRedirect(origin, oauthPayloadFromSession(session))
    : null;
  return {
    ...session,
    landing: chosen.landing,
    report: claims.report,
    redirectUrl,
  };
}

function arrivalUrl(publicOrigin, ticket) {
  const base = String(publicOrigin || '').replace(/\/+$/, '') || '';
  return `${base}/lti/arrivee#ticket=${encodeURIComponent(ticket)}`;
}

module.exports = {
  TICKET_TTL_SECONDS,
  issueTicket,
  readTicket,
  consumeTicket,
  exchangeTicket,
  arrivalUrl,
  glOriginFromFm,
  buildFmSession,
  buildGlPlayerSession,
  buildGlStaffSession,
};
