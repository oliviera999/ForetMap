const logger = require('./logger');
const logMetrics = require('./logMetrics');

/**
 * Journalise une erreur de route API (réponses 500) pour le diagnostic serveur.
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {string} [context]
 */
function logRouteError(err, req, context = 'Erreur route API') {
  logMetrics.recordRouteError();
  logger.error(
    {
      err,
      path: req.path,
      method: req.method,
      requestId: req.requestId,
    },
    context
  );
}

/**
 * Réponse 500 standard : journalise côté serveur, message générique au client.
 * @param {import('express').Response} res
 * @param {import('express').Request} req
 * @param {Error} err
 * @param {string} [message]
 * @param {{ exposeDetail?: boolean }} [opts]
 */
function respondInternalError(res, req, err, message = 'Erreur serveur', opts = {}) {
  logRouteError(err, req);
  const body = { error: message };
  if (opts.exposeDetail && err) {
    body.debugDetail = String(err.message || '');
    if (err.code != null) body.debugCode = String(err.code);
  }
  return res.status(500).json(body);
}

module.exports = { logRouteError, respondInternalError };
