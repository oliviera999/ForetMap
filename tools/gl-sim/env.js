'use strict';

/**
 * Amorçage de l'environnement du banc : `.env` du dépôt, base cible (`--db`, défaut
 * `foretmap_sim`), garde-fou n° 10, `GL_SIM_ALLOW=1` (horloge `X-GL-Sim-Clock`),
 * `GL_RANDOM_SEED` (aléa serveur rejouable), rate limit désactivé, synchronisation des
 * catalogues au démarrage laissée au banc (`GL_TENIR_SYNC=0`). À appeler **avant** tout
 * `require('../../database')` (le pool lit `DB_NAME` au chargement).
 */

const path = require('node:path');
const { assertSimDatabaseAllowedFromEnv } = require('./garde');

const RACINE = path.join(__dirname, '..', '..');

function preparerEnvironnement({ dbName = null, seed = null, logLevel = null } = {}) {
  require('dotenv').config({ path: path.join(RACINE, '.env'), quiet: true });
  if (dbName) process.env.DB_NAME = String(dbName);
  else if (process.env.GL_SIM_DB) process.env.DB_NAME = String(process.env.GL_SIM_DB);
  if (!process.env.NODE_ENV) process.env.NODE_ENV = 'test';
  assertSimDatabaseAllowedFromEnv();
  process.env.GL_SIM_ALLOW = '1';
  if (seed != null) process.env.GL_RANDOM_SEED = String(seed);
  if (!process.env.GL_TENIR_SYNC) process.env.GL_TENIR_SYNC = '0';
  process.env.E2E_DISABLE_RATE_LIMIT = '1';
  if (!process.env.TEACHER_ADMIN_EMAIL)
    process.env.TEACHER_ADMIN_EMAIL = 'admin.sim@foretmap.local';
  if (!process.env.TEACHER_ADMIN_PASSWORD) process.env.TEACHER_ADMIN_PASSWORD = 'admin-sim-1234';
  if (!process.env.LOG_LEVEL) process.env.LOG_LEVEL = logLevel || 'warn';
  return { dbName: process.env.DB_NAME, nodeEnv: process.env.NODE_ENV };
}

module.exports = { RACINE, preparerEnvironnement };
