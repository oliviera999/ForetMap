'use strict';

const fs = require('fs');

/** Version majeure Express (4 vs 5) — syntaxe wildcard différente pour le fallback SPA. */
const EXPRESS_MAJOR = Number(String(require('express/package.json').version).split('.')[0] || 0);

function resolveSpaIndexPath(req, options) {
  const {
    serveDist,
    distSpaIndex,
    distGlIndex,
    deployHelpPath,
    resolveProductFromRequest,
  } = options;
  let indexPath = deployHelpPath;
  if (serveDist) {
    const product = resolveProductFromRequest(req);
    const glIndexExists = fs.existsSync(distGlIndex);
    indexPath = product === 'gl' && glIndexExists ? distGlIndex : distSpaIndex;
  }
  return indexPath;
}

function createSpaFallbackHandler(options) {
  const { logger } = options;
  return (req, res) => {
    const indexPath = resolveSpaIndexPath(req, options);
    res.sendFile(indexPath, (err) => {
      if (err) {
        logger.error(
          { err, path: req.path, resolvedPath: indexPath, code: err.code, requestId: req.requestId },
          'Envoi index.html en échec'
        );
        if (!res.headersSent) res.status(500).json({ error: 'Erreur serveur' });
      }
    });
  };
}

/**
 * Fallback SPA : GET / explicite + wildcard selon Express 4 ou 5.
 * Express 5 : `/{*splat}` (racine + sous-chemins).
 * Express 4 : `*` (historique) — `/` est couvert par la route explicite.
 */
function registerSpaFallbackRoutes(app, handler) {
  app.get('/', handler);
  if (EXPRESS_MAJOR >= 5) {
    app.get('/{*splat}', handler);
  } else {
    app.get('*', handler);
  }
}

module.exports = {
  EXPRESS_MAJOR,
  resolveSpaIndexPath,
  createSpaFallbackHandler,
  registerSpaFallbackRoutes,
};
