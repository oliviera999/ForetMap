'use strict';

/**
 * Message d'erreur présentable au client (audit sécurité du 30/09/2026, AP2 ; = M4).
 *
 * Plusieurs routes renvoyaient `err.message` tel quel en 400. Pour une erreur métier c'est
 * voulu (« Colonne manquante », « Jeton invalide »…), mais une erreur technique y passait
 * aussi : message du pilote MySQL (deadlock, nom de table), erreur `fs` portant le **chemin
 * absolu** du serveur, `TypeError` interne.
 *
 * Règle :
 * - erreur porteuse d'un statut < 500 (`statusCode` / `status`) ou `expose === true` →
 *   message renvoyé (erreur métier explicite, cf. `lib/shared/httpError.js`) ;
 * - erreur technique (marqueurs MySQL `sqlMessage` / `sqlState` / code `ER_*`, erreur système
 *   Node `syscall` / `path` / code `E*` + `errno`, erreurs internes JS `TypeError`,
 *   `ReferenceError`…) ou statut ≥ 500 → message générique, erreur journalisée (Pino) ;
 * - `Error` simple sans marqueur technique (levée volontairement par un helper métier avec
 *   un message destiné à l'utilisateur) → message renvoyé : c'est le contrat historique des
 *   imports et du QCM, que l'on ne casse pas.
 *
 * Même convention que `http-errors` / Koa (`expose` : message sûr pour le client) —
 * https://github.com/jshttp/http-errors (MIT).
 */

const INTERNAL_ERROR_CLASSES = new Set([
  'TypeError',
  'ReferenceError',
  'RangeError',
  'SyntaxError',
  'EvalError',
  'URIError',
  'AggregateError',
]);

function readStatus(err) {
  const n = Number(err?.statusCode ?? err?.status);
  return Number.isInteger(n) && n >= 400 && n <= 599 ? n : null;
}

/** Vrai si l'erreur trahit un détail technique (pilote SQL, système de fichiers, bug JS). */
function isTechnicalError(err) {
  if (!err || typeof err !== 'object') return false;
  if (err.sqlMessage != null || err.sqlState != null || err.sql != null) return true;
  const code = typeof err.code === 'string' ? err.code : '';
  if (/^ER_/.test(code) || code === 'PROTOCOL_CONNECTION_LOST') return true;
  if (err.syscall != null || (typeof err.path === 'string' && err.path)) return true;
  if (/^E[A-Z0-9_]+$/.test(code) && err.errno != null) return true;
  const name = String(err.name || err.constructor?.name || '');
  if (INTERNAL_ERROR_CLASSES.has(name)) return true;
  return false;
}

/**
 * Vrai si le message de l'erreur peut être renvoyé tel quel au client.
 * @param {unknown} err
 */
function isPublicError(err) {
  if (!err || typeof err !== 'object') return false;
  if (err.expose === true) return true;
  if (err.expose === false) return false;
  const status = readStatus(err);
  if (status != null) return status < 500;
  return !isTechnicalError(err);
}

/**
 * Message à renvoyer au client : celui de l'erreur si elle est publique, sinon `fallback`
 * (l'erreur technique est alors journalisée).
 *
 * @param {unknown} err
 * @param {string} fallback message générique
 * @param {{ log?: { error: Function }, context?: string }} [options]
 * @returns {string}
 */
function publicErrorMessage(err, fallback, { log, context } = {}) {
  const message = err && typeof err.message === 'string' ? err.message.trim() : '';
  if (message && isPublicError(err)) return message;
  if (err) {
    try {
      const logger = log || require('../logger');
      logger.error({ err, context: context || null }, 'Erreur technique masquée au client');
    } catch (_) {
      /* journalisation au mieux */
    }
  }
  return fallback;
}

module.exports = { isPublicError, isTechnicalError, publicErrorMessage };
