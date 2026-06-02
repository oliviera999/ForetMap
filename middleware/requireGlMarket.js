'use strict';

const { getGlModulesSettings, getGameplaySettings } = require('../lib/glSettings');

function requireGlMarket(req, res, next) {
  Promise.all([getGlModulesSettings(), getGameplaySettings()])
    .then(([modules, gameplay]) => {
      if (!modules.marketEnabled) {
        return res.status(503).json({ error: 'Marché désactivé' });
      }
      if (!gameplay.vitalityEnabled) {
        return res.status(503).json({ error: 'Vitalité désactivée' });
      }
      return next();
    })
    .catch(next);
}

function requireGlPlayer(req, res, next) {
  if (String(req.glAuth?.userType || '') !== 'gl_player') {
    return res.status(403).json({ error: 'Réservé aux joueurs' });
  }
  return next();
}

module.exports = {
  requireGlMarket,
  requireGlPlayer,
};
