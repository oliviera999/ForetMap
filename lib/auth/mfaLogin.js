'use strict';

/**
 * Étape « second facteur » des connexions ForetMap, partagée par le mot de passe
 * (`POST /api/auth/login`), Google (`lib/auth/googleAuthService.js`) et Moodle/LTI
 * (`lib/lti/session.js`).
 *
 * `gateLoginSession` reçoit la session **que la connexion s'apprêtait à émettre** et rend :
 *   - `{ kind: 'session', suggestSetup }` : émettre la session (compte non soumis, réglage
 *     `off`, ou compte soumis non enrôlé en phase `enroll` — `suggestSetup` dit alors s'il
 *     faut proposer l'activation) ;
 *   - `{ kind: 'challenge', challenge }` : ne **pas** émettre de session ; `challenge` porte
 *     le jeton intermédiaire et l'étape attendue (`verify` ou `enroll`).
 */

const { queryOne } = require('../../database');
const { logSecurityEvent } = require('../auditLog');
const logger = require('../logger');
const { getMfaEnforcement, isMfaSubjectRole, decideLoginMfa } = require('./mfaPolicy');
const { issueMfaPendingToken } = require('./mfaPending');
const { isTotpEnabled } = require('./totpStore');
const { isTotpKeyConfigured } = require('./totpCrypto');

/**
 * @param {object} params
 * @param {{ tokenPayload: object, authz: object }} params.session session prête à émettre
 * @param {string} params.userId
 * @param {'password'|'google'|'lti'} params.via premier facteur utilisé
 * @param {'teacher'|'student'|'staff'} [params.next] type de session attendu par le front
 * @param {object} [params.req] requête (journal de sécurité)
 */
async function gateLoginSession({ session, userId, via, next, req = null }) {
  const enforcement = await getMfaEnforcement();
  const subject = isMfaSubjectRole(session?.authz);
  const enrolled = subject && enforcement !== 'off' ? await isTotpEnabled(userId) : false;
  const decision = decideLoginMfa({ authz: session?.authz, enrolled, enforcement });
  if (decision.action === 'session') {
    return { kind: 'session', suggestSetup: decision.suggestSetup };
  }
  const userType = session.tokenPayload.userType;
  const sessionKind = next || userType;
  const { token, expiresInSeconds } = issueMfaPendingToken({
    userId,
    userType,
    tokenEpoch: session.tokenPayload.tokenEpoch,
    stage: decision.action,
    via,
    next: sessionKind,
  });
  await logSecurityEvent('auth.totp.challenge', {
    req,
    actorUserType: userType,
    actorUserId: userId,
    targetType: userType,
    targetId: userId,
    payload: { via, stage: decision.action, enforcement },
  });
  return {
    kind: 'challenge',
    challenge: {
      mfaRequired: true,
      mfaToken: token,
      stage: decision.action,
      next: sessionKind,
      expiresInSeconds,
      displayName: session.tokenPayload.displayName || null,
      // Enrôlement imposé sans clé de chiffrement : l'écran le dit au lieu d'échouer en 503.
      setupAvailable: decision.action === 'enroll' ? isTotpKeyConfigured() : true,
    },
  };
}

/**
 * Charge `#oauth=` (retour Google ou Moodle/LTI) qui remplace la session quand le second
 * facteur est requis : le front affiche l'étape TOTP au lieu d'enregistrer un jeton.
 */
function oauthMfaPayload(challenge) {
  return {
    type: 'mfa',
    mfaToken: challenge.mfaToken,
    stage: challenge.stage,
    next: challenge.next,
    expiresInSeconds: challenge.expiresInSeconds,
    displayName: challenge.displayName,
    setupAvailable: challenge.setupAvailable,
  };
}

/**
 * Avertit le titulaire du compte (e-mail, sans attendre ni bloquer) d'un changement de sa
 * double authentification.
 * @param {string} userId
 * @param {'enabled'|'device_changed'|'backup_codes_regenerated'|'backup_code_used'|'reset'} event
 */
function notifyTotpChange(userId, event) {
  Promise.resolve()
    .then(async () => {
      const row = await queryOne(
        'SELECT email, display_name, first_name, last_name FROM users WHERE id = ? LIMIT 1',
        [String(userId)],
      );
      if (!row?.email) return false;
      const { sendTotpSecurityNotice } = require('../mailer');
      return sendTotpSecurityNotice({
        to: row.email,
        displayName:
          row.display_name || `${row.first_name || ''} ${row.last_name || ''}`.trim() || '',
        event,
      });
    })
    .catch((err) => {
      logger.warn({ err, userId: String(userId), event }, 'Avertissement double authentification');
    });
}

module.exports = { gateLoginSession, oauthMfaPayload, notifyTotpChange };
