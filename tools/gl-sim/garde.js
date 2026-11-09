'use strict';

/**
 * Garde-fou n° 10 du banc de simulation « Tenir à deux » : il ne s'exécute **jamais** contre la
 * base de production. Refus codé en dur :
 * - le nom de base doit finir par `_sim` ou `_test` ;
 * - `NODE_ENV=production` est refusé sauf `GL_SIM_ALLOW=1` explicite.
 *
 * Fonction pure (testée dans `tests/gl-sim-pur.test.js`) ; `assertSimDatabaseAllowedFromEnv`
 * l'applique à `process.env`.
 */

const SUFFIXES_AUTORISES = Object.freeze(['_sim', '_test']);

class SimGardeError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'SimGardeError';
    this.code = code;
  }
}

/**
 * @param {{ dbName?: string, nodeEnv?: string, glSimAllow?: string }} input
 * @returns {{ ok: true, dbName: string }}
 * @throws {SimGardeError} `SIM_DB_NOM` ou `SIM_PRODUCTION`
 */
function assertSimDatabaseAllowed({ dbName, nodeEnv, glSimAllow } = {}) {
  const name = String(dbName || '').trim();
  if (!name || !SUFFIXES_AUTORISES.some((s) => name.endsWith(s))) {
    throw new SimGardeError(
      `Refus : la base « ${name || '(vide)'} » ne finit ni par _sim ni par _test — le banc ne ` +
        'touche jamais une base de production.',
      'SIM_DB_NOM',
    );
  }
  const env = String(nodeEnv || '')
    .trim()
    .toLowerCase();
  if (env === 'production' && String(glSimAllow || '').trim() !== '1') {
    throw new SimGardeError(
      'Refus : NODE_ENV=production sans GL_SIM_ALLOW=1 — le banc ne tourne pas en production.',
      'SIM_PRODUCTION',
    );
  }
  return { ok: true, dbName: name };
}

function assertSimDatabaseAllowedFromEnv(env = process.env) {
  return assertSimDatabaseAllowed({
    dbName: env.DB_NAME,
    nodeEnv: env.NODE_ENV,
    glSimAllow: env.GL_SIM_ALLOW,
  });
}

module.exports = {
  SUFFIXES_AUTORISES,
  SimGardeError,
  assertSimDatabaseAllowed,
  assertSimDatabaseAllowedFromEnv,
};
