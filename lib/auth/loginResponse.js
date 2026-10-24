'use strict';

/**
 * Corps de réponse d'une connexion réussie (session émise), partagé par
 * `POST /api/auth/login` et par les routes du second facteur (`/api/auth/totp/verify`,
 * `/api/auth/totp/enroll/confirm`) : le front reçoit la même forme, que la connexion ait
 * demandé ou non un code.
 */

const { toPublicUserRow } = require('../publicUser');
const { parseDiscoveryTourSeen } = require('../discoveryTourSeen');
const { exposeAuth } = require('../authRouteHelpers');

/**
 * @param {{ account: object, tokenPayload: object, token: string }} params `account` = ligne
 *   `users` complète (liste blanche appliquée par `toPublicUserRow`).
 */
async function buildLoginResponseBody({ account, tokenPayload, token }) {
  let pedago = { biodivGroupPedagoLevels: [], biodivGroupCurriculumNiveaux: [] };
  try {
    const { loadUserGroupPedagoProfile } = require('../biodivPedagoLevel');
    const profile = await loadUserGroupPedagoProfile(account.id);
    pedago = {
      biodivGroupPedagoLevels: profile.levels,
      biodivGroupCurriculumNiveaux: profile.curriculumNiveaux,
    };
  } catch (_) {
    /* niveaux pédagogiques facultatifs à la connexion */
  }
  return {
    ...toPublicUserRow(account),
    discoveryTourSeen: parseDiscoveryTourSeen(account.discovery_tour_seen_json),
    // Mot de passe provisoire (posé par un responsable ou le jeu G&L) : le client invite
    // à en choisir un nouveau (`POST /api/auth/me/password`).
    passwordMustReset: !!Number(account.password_must_reset || 0),
    authToken: token,
    auth: tokenPayload ? exposeAuth(tokenPayload) : null,
    ...pedago,
  };
}

/** Trace d'usage d'une connexion réussie : jamais bloquante. */
function recordLoginTouch(req, userType, userId) {
  try {
    const { recordAuthenticatedTouch } = require('../userTracking');
    const productHeader = String(req?.headers?.['x-foretmap-product'] || '')
      .trim()
      .toLowerCase();
    void recordAuthenticatedTouch({
      product: productHeader || 'foret',
      userType,
      userId,
      action: 'login',
    });
  } catch (_) {
    /* ignore */
  }
}

module.exports = { buildLoginResponseBody, recordLoginTouch };
