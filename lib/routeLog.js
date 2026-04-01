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

module.exports = { logRouteError };
