'use strict';

/**
 * État des migrations : version du schéma en base (`schema_version`) comparée au dernier
 * fichier de `migrations/`.
 *
 * Trois consommateurs :
 *   - `scripts/db-migration-status.js` (`npm run db:status`), que le cron de déploiement
 *     interroge pour rattraper une base restée en retard ;
 *   - `scripts/check-runtime.js` (`npm run check:runtime`), lançable sans terminal par le
 *     bouton « Run JS Script » de cPanel ;
 *   - `GET /api/admin/diagnostics` (champ `schema`).
 *
 * Pourquoi : jusqu'ici le cron ne migrait que si le lot déployé **contenait** un fichier de
 * migration. Une base restée en retard (migration oubliée, `DEPLOY_AUTO_MIGRATE` activé
 * après coup) le restait jusqu'au prochain lot porteur de migration, alors que le code
 * déployé écrivait déjà les nouvelles colonnes (cas de la migration 296, septembre 2026).
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const MIGRATION_FILE_RE = /^(\d{3})_.*\.sql$/;

/**
 * Numéros des fichiers de migration présents, triés et sans doublon.
 * @param {string} [dir]
 * @returns {number[]}
 */
function listMigrationNumbers(dir = DEFAULT_MIGRATIONS_DIR) {
  if (!fs.existsSync(dir)) return [];
  const numbers = new Set();
  for (const name of fs.readdirSync(dir)) {
    const match = MIGRATION_FILE_RE.exec(name);
    if (match) numbers.add(Number.parseInt(match[1], 10));
  }
  return [...numbers].sort((a, b) => a - b);
}

/**
 * Compare la version en base aux fichiers présents.
 * @param {number|null} current version lue dans `schema_version` (`null` si illisible)
 * @param {number[]} numbers numéros des fichiers (voir `listMigrationNumbers`)
 * @returns {{ current: number|null, latest: number|null, pending: number[], upToDate: boolean }}
 */
function compareSchemaVersion(current, numbers) {
  const latest = numbers.length ? numbers[numbers.length - 1] : null;
  if (current === null || current === undefined || !Number.isFinite(Number(current))) {
    return { current: null, latest, pending: [...numbers], upToDate: numbers.length === 0 };
  }
  const version = Number(current);
  // Même règle que `runMigrations` : un numéro inférieur à la version courante n'est jamais
  // rejoué ; seuls les numéros strictement supérieurs sont « en attente ».
  const pending = numbers.filter((n) => n > version);
  return { current: version, latest, pending, upToDate: pending.length === 0 };
}

/**
 * Lit `schema_version` puis compare aux fichiers.
 * @param {{ queryOne: (sql: string, params?: unknown[]) => Promise<any> }} db
 * @param {{ migrationsDir?: string }} [options]
 */
async function getMigrationStatus(db, { migrationsDir = DEFAULT_MIGRATIONS_DIR } = {}) {
  let current = null;
  try {
    const row = await db.queryOne('SELECT version FROM schema_version LIMIT 1');
    if (row && row.version !== undefined && row.version !== null) current = Number(row.version);
  } catch (err) {
    // Table absente (base vierge) : tout est « en attente ». Toute autre erreur remonte.
    if (!(err && (err.errno === 1146 || err.code === 'ER_NO_SUCH_TABLE'))) throw err;
  }
  return compareSchemaVersion(current, listMigrationNumbers(migrationsDir));
}

module.exports = {
  DEFAULT_MIGRATIONS_DIR,
  listMigrationNumbers,
  compareSchemaVersion,
  getMigrationStatus,
};
