'use strict';

/**
 * Charge de session ForetMap : revendications du jeton émis à la connexion (mot de passe,
 * Google, prise de contrôle, ré-émission) et droits RBAC résolus.
 *
 * Déplacé tel quel depuis `routes/auth.js` (piste B, étape B6) pour être partagé entre les
 * routes d'authentification et le service de connexion Google (`lib/auth/googleAuthService.js`).
 */

const { queryOne } = require('../../database');
const { buildAuthzPayload } = require('../rbac');
const { getUserTokenEpoch } = require('./tokenEpoch');
const { normalizeOptionalString } = require('../shared/httpHelpers');

/**
 * @param {'teacher'|'student'} userType
 * @param {string} userId
 * @returns {Promise<{ tokenPayload: object, authz: object } | null>} `null` si le compte n'a
 *   aucun profil RBAC résolu.
 */
async function buildSessionPayload(userType, userId) {
  const authz = await buildAuthzPayload(userType, userId);
  if (!authz) return null;
  // Époque de jeton : un changement de mot de passe l'incrémente et invalide les sessions.
  const tokenEpoch = await getUserTokenEpoch(userId);
  // Nom du compte (jamais le nom du profil) pour l'en-tête et les bandeaux (CDG-30).
  const named = await queryOne(
    'SELECT display_name, first_name, last_name, pseudo, email FROM users WHERE id = ? LIMIT 1',
    [String(userId)],
  );
  const displayName =
    normalizeOptionalString(named?.display_name) ||
    `${named?.first_name || ''} ${named?.last_name || ''}`.trim() ||
    normalizeOptionalString(named?.pseudo) ||
    normalizeOptionalString(named?.email) ||
    null;
  return {
    tokenPayload: {
      userType,
      userId,
      tokenEpoch,
      displayName,
      roleId: authz.roleId,
      roleSlug: authz.roleSlug,
      roleDisplayName: authz.roleDisplayName,
      permissions: authz.permissions,
      nativePrivileged: !!authz.nativePrivileged,
    },
    authz,
  };
}

module.exports = { buildSessionPayload };
