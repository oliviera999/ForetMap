'use strict';

/**
 * Jeton intermédiaire « mfa pending » : délivré quand le premier facteur (mot de passe,
 * Google, Moodle/LTI) est validé mais que le second reste à fournir.
 *
 * Il est signé avec une clé **dérivée** de `JWT_SECRET` (HMAC-SHA-256 sur un libellé fixe),
 * jamais avec `JWT_SECRET` lui-même. Toutes les vérifications de session du dépôt
 * (`requireAuth`, garde produit de `server.js`, `/api/sync-state`, Socket.IO, limiteurs…)
 * utilisent `JWT_SECRET` : ce jeton y échoue donc **par construction**, sans qu'aucune d'elles
 * ait à le connaître. Il n'ouvre que les routes `/api/auth/totp/*` qui l'attendent.
 *
 * Revendications : `purpose`, `userId`, `userType`, `tokenEpoch` (un mot de passe changé
 * entre-temps l'invalide), `stage` (`verify` | `enroll`), `via` (`password` | `google` | `lti`),
 * `next` (type de session attendu par le front : `teacher` | `student` | `staff`), `jti`.
 *
 * Usage unique : le `jti` est consommé au succès (mémoire du processus, bornée par la durée
 * de vie du jeton). Après un redémarrage, un jeton encore vivant pourrait être représenté —
 * sans effet sans un **nouveau** code valide, l'anti-rejeu étant tenu en base.
 */

const crypto = require('node:crypto');
const { signJwtToken, verifyJwtToken } = require('./jwtPipeline');
const { JWT_SECRET } = require('../../middleware/requireTeacher');

const MFA_PENDING_PURPOSE = 'mfa_pending';
const MFA_PENDING_TTL_SECONDS = Object.freeze({ verify: 5 * 60, enroll: 15 * 60 });
const DERIVATION_LABEL = 'foretmap:mfa-pending:v1';

const consumedJtis = new Map();

function pendingKey() {
  if (!JWT_SECRET) return null;
  return crypto.createHmac('sha256', JWT_SECRET).update(DERIVATION_LABEL).digest('hex');
}

function pruneConsumed(nowSec) {
  for (const [jti, exp] of consumedJtis) {
    if (exp <= nowSec) consumedJtis.delete(jti);
  }
}

/**
 * @param {{ userId: string, userType: string, tokenEpoch: number, stage: 'verify'|'enroll', via: string, next: string }} params
 * @returns {{ token: string, expiresInSeconds: number }}
 */
function issueMfaPendingToken({ userId, userType, tokenEpoch, stage, via, next }) {
  const key = pendingKey();
  if (!key) throw new Error('JWT non configuré');
  const expiresInSeconds = MFA_PENDING_TTL_SECONDS[stage] || MFA_PENDING_TTL_SECONDS.verify;
  const token = signJwtToken(
    {
      purpose: MFA_PENDING_PURPOSE,
      userId: String(userId),
      userType: String(userType),
      tokenEpoch: Number(tokenEpoch || 0),
      stage,
      via: String(via || 'password'),
      next: String(next || userType),
      jti: crypto.randomBytes(16).toString('hex'),
    },
    key,
    { expiresIn: expiresInSeconds },
  );
  return { token, expiresInSeconds };
}

/**
 * Lit un jeton intermédiaire (signature, expiration, objet, usage unique). Ne vérifie pas
 * l'état du compte : c'est à l'appelant de relire `is_active` et `token_epoch`.
 * @returns {object|null} revendications, ou `null` si le jeton n'est pas recevable
 */
function readMfaPendingToken(token) {
  const key = pendingKey();
  if (!key || !token) return null;
  let claims;
  try {
    claims = verifyJwtToken(String(token), key);
  } catch (_) {
    return null;
  }
  if (claims?.purpose !== MFA_PENDING_PURPOSE || !claims.userId || !claims.jti) return null;
  if (!['verify', 'enroll'].includes(claims.stage)) return null;
  pruneConsumed(Math.floor(Date.now() / 1000));
  if (consumedJtis.has(claims.jti)) return null;
  return claims;
}

/** Marque le jeton comme utilisé (après succès). */
function consumeMfaPendingToken(claims) {
  if (!claims?.jti) return;
  consumedJtis.set(claims.jti, Number(claims.exp) || Math.floor(Date.now() / 1000) + 900);
}

module.exports = {
  MFA_PENDING_PURPOSE,
  MFA_PENDING_TTL_SECONDS,
  issueMfaPendingToken,
  readMfaPendingToken,
  consumeMfaPendingToken,
};
