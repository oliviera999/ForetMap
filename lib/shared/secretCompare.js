'use strict';

const crypto = require('node:crypto');

/**
 * Comparaison de secret à temps constant (évite l'oracle temporel d'un `===`).
 *
 * Extrait de `routes/admin-ops.js` (garde `DEPLOY_SECRET`) pour être partagé avec le secret
 * de test de charge (`lib/rateLimit.js`, AC8 de l'audit du 30/09/2026). Une valeur vide ne
 * correspond jamais, même à une autre valeur vide.
 *
 * @param {unknown} provided valeur reçue (en-tête, corps)
 * @param {unknown} expected valeur attendue (variable d'environnement)
 * @returns {boolean}
 */
function timingSafeSecretEqual(provided, expected) {
  const a = Buffer.from(String(provided == null ? '' : provided));
  const b = Buffer.from(String(expected == null ? '' : expected));
  if (a.length !== b.length || a.length === 0) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { timingSafeSecretEqual };
