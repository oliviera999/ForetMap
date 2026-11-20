'use strict';

/**
 * Réexportation de compatibilité : le noyau des auto-liens vit désormais dans
 * `lib/shared/termAutolinkCore.js`, miroir CJS de `src/shared/glossary/termAutolinkCore.js`
 * généré par `npm run sync:shared-cores`. Ce chemin reste exigé par
 * `scripts/prepare-runtime-deploy.js`.
 */
module.exports = require('../shared/termAutolinkCore');
