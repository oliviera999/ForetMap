'use strict';

/**
 * Ticket d'arrivée LTI (court, 2 min) puis échange contre un jeton produit (même TTL que Google, L19).
 * Le ticket est un JWT HS256 `purpose: 'lti_ticket'` : pas d'état partagé entre processus.
 */

const { queryOne } = require('../../database');
const { signJwtToken, verifyJwtToken } = require('../auth/jwtPipeline');
const { JWT_SECRET, signAuthToken } = require('../../middleware/requireTeacher');
const { ensureCanonicalUserByAuth } = require('../identity');
const { buildAuthzPayload } = require('../rbac');
const { getUserTokenEpoch } = require('../auth/tokenEpoch');
const { exposeAuth } = require('../authRouteHelpers');
const { toPublicUserRow } = require('../publicUser');
const { getGlRolePermissions, exposeGlAuth } = require('../gl/authRouteHelpers');
const { buildGlAdminClaims } = require('../glStaffAuth');
const { buildOAuthFrontendRedirect } = require('../googleOAuthShared');

const TICKET_TTL_SECONDS = 120;

function httpError(status, message, extra = {}) {
  const err = new Error(message);
  err.status = status;
  Object.assign(err, extra);
  return err;
}

function issueTicket({ userId, destination, report }) {
  if (!JWT_SECRET) throw httpError(503, 'JWT non configuré');
  return signJwtToken(
    {
      purpose: 'lti_ticket',
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
  if (claims.purpose !== 'lti_ticket' || !claims.userId) {
    throw httpError(401, 'Ticket d’arrivée invalide');
  }
  return claims;
}

async function buildFmSession(user) {
  const userType =
    String(user.user_type || 'student').toLowerCase() === 'teacher' ? 'teacher' : 'student';
  const canonicalUserId = await ensureCanonicalUserByAuth({ userType, userId: user.id });
  const authz = await buildAuthzPayload(userType, user.id);
  if (!authz) throw httpError(403, 'Aucun profil pour ce compte');
  const tokenEpoch = await getUserTokenEpoch(user.id);
  const tokenPayload = {
    userType,
    userId: user.id,
    canonicalUserId: canonicalUserId || null,
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

async function buildGlStaffSession(user) {
  const admin = await queryOne(
    `SELECT * FROM gl_admins WHERE foretmap_user_id = ? OR LOWER(email) = LOWER(?) LIMIT 1`,
    [user.id, user.email || ''],
  );
  if (!admin || !Number(admin.is_active)) {
    throw httpError(403, 'Aucun compte MJ / admin Gnomes & Licornes pour cet enseignant');
  }
  const glRole = String(admin.role || 'mj').toLowerCase() === 'admin' ? 'admin' : 'mj';
  const base = buildGlAdminClaims(admin, glRole);
  const claims = { ...base, permissions: getGlRolePermissions(glRole === 'mj' ? 'mj' : 'admin') };
  const tokenEpoch = user.id ? await getUserTokenEpoch(user.id) : 0;
  const token = await signAuthToken({ ...claims, tokenEpoch, product: 'gl' });
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
  exchangeTicket,
  arrivalUrl,
  glOriginFromFm,
  buildFmSession,
  buildGlPlayerSession,
  buildGlStaffSession,
};
