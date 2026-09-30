'use strict';

/**
 * Réponse d'erreur sans fuite de message interne (audit sécurité 2026-09-30, AP2 / M4).
 *
 * Plusieurs routes répondaient `res.status(400).json({ error: err.message })` pour TOUTE
 * exception : un interblocage MySQL, une contrainte violée ou une erreur `fs` renvoyait alors
 * le message du pilote (requête, nom de table, chemin absolu du serveur) au client — y compris
 * à un invité G&L.
 *
 * Règle :
 * - erreur **métier** (`err.expose === true`, ou `statusCode`/`status` entre 400 et 499) →
 *   son message et son statut sont renvoyés tels quels ;
 * - toute autre erreur → journalisée (Pino), puis `500 { error: 'Erreur interne' }`.
 *
 * Mode `trustPlainErrors` (imports de fichiers seulement) : les analyseurs de classeurs lèvent
 * des `Error` nues dont le message décrit le fichier refusé (« Colonne manquante… ») — utile
 * au MJ, sans rien d'interne. On les renvoie alors en `fallbackStatus`, SAUF si l'erreur porte
 * la signature d'une panne (pilote SQL, appel système, erreur d'exécution JavaScript).
 */

const logger = require('./logger');

const GENERIC_INTERNAL_ERROR = 'Erreur interne';

function numericStatus(err) {
  const raw = err?.statusCode ?? err?.status;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

/** Erreur métier : message destiné au client. */
function isBusinessError(err) {
  if (!err) return false;
  const status = numericStatus(err);
  if (status != null && status >= 500) return false;
  if (err.expose === true) return true;
  return status != null && status >= 400 && status < 500;
}

/** Signature d'une panne technique (jamais exposée, même en mode `trustPlainErrors`). */
function looksInternal(err) {
  if (!err) return true;
  const status = numericStatus(err);
  if (status != null && status >= 500) return true;
  if (err.sqlMessage != null || err.sqlState != null || err.sql != null) return true;
  if (typeof err.errno === 'number' || err.syscall != null) return true;
  const code = typeof err.code === 'string' ? err.code : '';
  if (/^ER_/.test(code) || /^E[A-Z0-9]{2,}$/.test(code) || /^PROTOCOL_/.test(code)) return true;
  if (err instanceof TypeError || err instanceof ReferenceError || err instanceof RangeError) {
    return true;
  }
  return false;
}

/**
 * Envoie la réponse d'erreur adaptée.
 *
 * @param {import('express').Response} res
 * @param {unknown} err
 * @param {object} [options]
 * @param {number} [options.fallbackStatus=400] statut d'une erreur métier sans statut propre
 * @param {string} [options.fallbackMessage] message d'une erreur métier sans message
 * @param {boolean} [options.trustPlainErrors=false] cf. en-tête (imports de fichiers)
 * @param {object} [options.req] requête (identifiant de requête dans le journal)
 * @param {string} [options.context] libellé de journal (route, action)
 */
function sendSafeError(res, err, options = {}) {
  const {
    fallbackStatus = 400,
    fallbackMessage = 'Requête invalide',
    trustPlainErrors = false,
    req = null,
    context = null,
  } = options;
  if (isBusinessError(err)) {
    const status = numericStatus(err);
    const code = status != null && status >= 400 && status < 500 ? status : fallbackStatus;
    return res.status(code).json({ error: err.message || fallbackMessage });
  }
  if (trustPlainErrors && err instanceof Error && !looksInternal(err)) {
    return res.status(fallbackStatus).json({ error: err.message || fallbackMessage });
  }
  logger.error(
    {
      err,
      context: context || undefined,
      requestId: req?.requestId || req?.id || undefined,
      path: req?.originalUrl || undefined,
    },
    'Erreur interne masquée au client',
  );
  return res.status(500).json({ error: GENERIC_INTERNAL_ERROR });
}

module.exports = {
  GENERIC_INTERNAL_ERROR,
  isBusinessError,
  looksInternal,
  sendSafeError,
};
