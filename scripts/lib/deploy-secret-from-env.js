'use strict';

/**
 * Secret pour appels admin distants depuis la machine locale (.env non versionné).
 * Même valeur que DEPLOY_SECRET sur le serveur ForetMap.
 *
 * Ordre : DEPLOY_SECRET (canonique, aligné prod) → alias check → alias MCP Cursor.
 */
function deploySecretFromEnv() {
  return String(
    process.env.DEPLOY_SECRET ||
      process.env.FORETMAP_DEPLOY_CHECK_SECRET ||
      process.env.FORETMAP_DEPLOY_SECRET ||
      ''
  ).trim();
}

module.exports = { deploySecretFromEnv };
