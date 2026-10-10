'use strict';

/**
 * Marqueur « second facteur validé » porté par le jeton de session.
 *
 * `mfa: true` est posé à l'émission qui suit la vérification du second facteur (code TOTP,
 * code de secours, ou confirmation d'enrôlement), avec `mfaMethod` (`totp` | `backup_code`).
 * Les ré-émissions d'une même session (renouvellement glissant, changement de mot de passe
 * ou d'e-mail) le **reconduisent** : sans cela, la session d'un administrateur tomberait à la
 * requête suivante dès que la double authentification est obligatoire.
 */

const MFA_METHODS = Object.freeze(['totp', 'backup_code']);

/** Copie de la charge de jeton marquée « second facteur validé ». */
function markSessionMfa(tokenPayload, method = 'totp') {
  return {
    ...tokenPayload,
    mfa: true,
    mfaMethod: MFA_METHODS.includes(method) ? method : 'totp',
  };
}

/**
 * Reconduit le marqueur d'une session hydratée (`req.auth`) ou de revendications vérifiées
 * vers une nouvelle charge de jeton. Sans marqueur à reconduire, la charge est rendue telle
 * quelle.
 */
function carryMfaClaims(tokenPayload, source) {
  if (!source?.mfa) return tokenPayload;
  return markSessionMfa(tokenPayload, source.mfaMethod);
}

module.exports = { MFA_METHODS, markSessionMfa, carryMfaClaims };
