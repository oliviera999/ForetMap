'use strict';

/**
 * Renouvellement glissant des sessions JWT.
 *
 * Jusqu'ici un jeton vivait exactement `security.jwt_ttl_base_seconds` (1 h 30 par défaut)
 * et rien ne le prolongeait : `/api/auth/me` ne ré-émettait qu'en cas de changement de rôle
 * ou de permissions. Une session **active** mourait donc en plein travail, toutes les
 * 90 minutes — la déconnexion signalée en exploitation, souvent confondue avec le
 * redéploiement automatique parce qu'elle se révélait au rechargement de l'app.
 *
 * Le principe retenu : quand un jeton entre dans le **dernier tiers** de sa durée de vie,
 * `/api/auth/me` en ré-émet un neuf. Une session utilisée ne s'interrompt plus ; une session
 * abandonnée expire comme avant, au plus tard un TTL après la dernière requête.
 *
 * Contrepartie assumée et bornée : prolonger sans limite reviendrait à rendre un jeton volé
 * éternel. Chaque jeton porte donc `sessionStartedAt`, posé à la **première** émission
 * (connexion) et reconduit tel quel par les renouvellements ; au-delà de
 * `security.jwt_sliding_max_seconds` (12 h par défaut) la prolongation est refusée et
 * l'utilisateur se reconnecte. Les jetons émis avant cette évolution n'ont pas le claim :
 * on retombe sur leur `iat`, ce qui leur accorde au plus une fenêtre supplémentaire.
 */

/** Part de la durée de vie en dessous de laquelle on ré-émet (dernier tiers). */
const RENEW_RATIO = 1 / 3;

/** Horodatage (secondes epoch) du début de session, `iat` à défaut du claim dédié. */
function resolveSessionStartedAt(claims) {
  const explicit = Number(claims?.sessionStartedAt || 0);
  if (Number.isFinite(explicit) && explicit > 0) return Math.floor(explicit);
  const iat = Number(claims?.iat || 0);
  return Number.isFinite(iat) && iat > 0 ? Math.floor(iat) : 0;
}

/**
 * Faut-il ré-émettre ce jeton ?
 *
 * @param {object} claims Claims JWT **déjà vérifiés** (`iat`, `exp`, `sessionStartedAt`).
 * @param {object} [options]
 * @param {number} [options.now] Instant de référence en secondes epoch (tests).
 * @param {number} [options.slidingMaxSeconds] Durée absolue d'une session ; 0 = sans plafond.
 * @returns {boolean}
 */
function shouldRenewAuthToken(claims, options = {}) {
  const now = Number.isFinite(options.now)
    ? Math.floor(options.now)
    : Math.floor(Date.now() / 1000);
  const slidingMaxSeconds = Number(options.slidingMaxSeconds || 0);
  const exp = Number(claims?.exp || 0);
  const iat = Number(claims?.iat || 0);
  // Jeton sans horodatage exploitable : on ne devine pas une fenêtre de renouvellement.
  if (!Number.isFinite(exp) || !Number.isFinite(iat) || exp <= iat) return false;
  const remaining = exp - now;
  // Déjà expiré : il n'y a plus de session à prolonger (`requireAuth` aurait rendu 401).
  if (remaining <= 0) return false;
  if (remaining > (exp - iat) * RENEW_RATIO) return false;
  if (slidingMaxSeconds > 0) {
    const startedAt = resolveSessionStartedAt(claims);
    if (startedAt > 0 && now - startedAt >= slidingMaxSeconds) return false;
  }
  return true;
}

/**
 * Reconduit le repère de début de session d'un jeton vers son remplaçant. À appeler pour
 * **toute** ré-émission (renouvellement glissant, changement de rôle, resynchronisation de
 * groupe) : sans cela, la moindre ré-émission remettrait le plafond absolu à zéro.
 *
 * @param {object} tokenPayload Charge utile du nouveau jeton.
 * @param {object|null} claims Claims du jeton présenté par le client.
 * @returns {object} Copie de `tokenPayload` portant `sessionStartedAt`.
 */
function carrySessionStart(tokenPayload, claims) {
  const startedAt = resolveSessionStartedAt(claims);
  if (!startedAt) return { ...tokenPayload };
  return { ...tokenPayload, sessionStartedAt: startedAt };
}

module.exports = {
  RENEW_RATIO,
  resolveSessionStartedAt,
  shouldRenewAuthToken,
  carrySessionStart,
};
