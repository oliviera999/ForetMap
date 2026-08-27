'use strict';

const fs = require('fs');

/** Version majeure Express (4 vs 5) — syntaxe wildcard différente pour le fallback SPA. */
const EXPRESS_MAJOR = Number(String(require('express/package.json').version).split('.')[0] || 0);

function resolveSpaIndexPath(req, options) {
  const { serveDist, distSpaIndex, distGlIndex, deployHelpPath, resolveProductFromRequest } =
    options;
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
          {
            err,
            path: req.path,
            resolvedPath: indexPath,
            code: err.code,
            requestId: req.requestId,
          },
          'Envoi index.html en échec',
        );
        if (!res.headersSent) res.status(500).json({ error: 'Erreur serveur' });
      }
    });
  };
}

/**
 * 404 JSON pour les chemins `/api` qu'aucun routeur n'a servis.
 *
 * Sans cette garde, le wildcard ci-dessous attrapait aussi `/api/…` et renvoyait
 * **`200 text/html`** — l'index de la SPA — pour un endpoint supprimé ou mal orthographié.
 * Trois dégâts : le client recevait un succès puis `res.json()` échouait sur `<!doctype
 * html>` avec un message qui ne désignait pas la cause ; la supervision ne pouvait pas
 * distinguer « endpoint disparu » de « tout va bien », les deux étant des `200` ; et un
 * sondage de l'API concluait à tort qu'une route inexistante était exposée sans
 * authentification (piège vécu à l'audit du 26/08, §2.2).
 *
 * Monté en `use` et non en `get` : un POST vers un chemin inconnu doit lui aussi répondre
 * en JSON, comme le fait déjà le gestionnaire d'erreurs central pour les `next(err)`.
 */
function apiNotFoundHandler(req, res) {
  res.status(404).json({ error: 'Route introuvable' });
}

/**
 * Fallback SPA : GET / explicite + wildcard selon Express 4 ou 5.
 * Express 5 : `/{*splat}` (racine + sous-chemins).
 * Express 4 : `*` (historique) — `/` est couvert par la route explicite.
 *
 * L'ordre compte : la garde `/api` doit précéder le wildcard. Elle est posée ici plutôt
 * que dans `server.js` pour qu'elle suive le fallback si son point de montage bouge — les
 * deux ne se raisonnent que l'un par rapport à l'autre.
 */
function registerSpaFallbackRoutes(app, handler) {
  app.use('/api', apiNotFoundHandler);
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
  apiNotFoundHandler,
};
