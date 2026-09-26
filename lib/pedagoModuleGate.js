'use strict';

/**
 * Garde des modules pédagogiques activables — clés d'identification, individus suivis et
 * séances pédagogiques (`ui.modules.{id_keys,individuals,pedago_sessions}_enabled`).
 *
 * Décision du mainteneur (25/09/2026, révisée) : l'interrupteur éteint le module **pour les
 * élèves**, pas pour ceux qui le préparent. Module éteint :
 *  - un compte qui porte la **permission de gestion** du module passe, sur toutes les routes
 *    du module (lecture des brouillons, écriture, démonstration d'une séance) ;
 *  - tout autre appelant — élève, visiteur, invité non connecté — reçoit
 *    `503 { error: '… désactivé(e)s' }`, le même corps que les autres modules.
 *
 * Le forum et le carnet gardent leur propre convention (module éteint → fermé à tous, via
 * `requireModuleEnabled` de `lib/shared/moduleGate.js`) : cette garde ne les concerne pas.
 * Les récompenses n'ont aucune route de gestion et suivent aussi la garde commune.
 *
 * Miroir front : `resolvePedagoModuleAccess` (`src/utils/appAccess.js`).
 */

const {
  hasPermission,
  parseBearerToken,
  hydrateAuthFromTokenClaims,
  JWT_SECRET,
} = require('../middleware/requireTeacher');
const { verifyJwtToken } = require('./auth/jwtPipeline');
const { isModuleEnabled } = require('./shared/moduleGate');

/** Permission de gestion qui garde un module ouvert quand son interrupteur est éteint. */
const PEDAGO_MODULE_MANAGE_PERMISSIONS = Object.freeze({
  id_keys: 'id_keys.manage',
  individuals: 'individuals.manage',
  // Les séances se gèrent sous `plants.manage` (création, suivi, partage) : même clé ici.
  pedago_sessions: 'plants.manage',
});

/**
 * Identité facultative : les routes de lecture de ces modules sont publiques, le jeton n'y
 * est donc pas exigé. Un jeton absent, invalide ou révoqué vaut « pas gestionnaire ».
 */
async function resolveOptionalAuth(req) {
  if (req.auth) return req.auth;
  try {
    const token = parseBearerToken(req);
    if (!token) return null;
    const claims = verifyJwtToken(token, JWT_SECRET);
    return await hydrateAuthFromTokenClaims(claims);
  } catch {
    return null;
  }
}

/**
 * Middleware : module allumé → suite ; éteint → suite pour le gestionnaire, 503 sinon.
 * @param {'id_keys'|'individuals'|'pedago_sessions'} logicalKey
 * @param {string} message corps `error` du 503 (ex. « Séances pédagogiques désactivées »)
 */
function requirePedagoModuleOrManager(logicalKey, message) {
  const permission = PEDAGO_MODULE_MANAGE_PERMISSIONS[logicalKey];
  if (!permission) throw new Error(`Module pédagogique inconnu : ${logicalKey}`);
  return async function pedagoModuleGate(req, res, next) {
    try {
      if (await isModuleEnabled('foret', logicalKey)) return next();
      const auth = await resolveOptionalAuth(req);
      if (hasPermission(auth, permission)) return next();
      return res.status(503).json({ error: message });
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = {
  PEDAGO_MODULE_MANAGE_PERMISSIONS,
  requirePedagoModuleOrManager,
};
