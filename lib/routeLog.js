const logger = require('./logger');

/**
 * Journalise une erreur de route API (réponses 500) pour le diagnostic serveur.
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {string} [context]
 */
function logRouteError(err, req, context = 'Erreur route API') {
  logger.error(
    { err, path: req.path, method: req.method },
    context
  );
}

module.exports = { logRouteError };
