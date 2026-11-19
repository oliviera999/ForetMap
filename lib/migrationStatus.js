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
 * Noms des fichiers de migration présents, triés.
 * @param {string} [dir]
 * @returns {string[]}
 */
function listMigrationFiles(dir = DEFAULT_MIGRATIONS_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => MIGRATION_FILE_RE.test(name))
    .sort();
}

/**
 * Fichiers que `runMigrations` n'appliquera jamais : numéro strictement inférieur au curseur
 * `schema_version`, et absents du registre `schema_migration_files` (audit du 19/11/2026,
 * S13). Registre vide (premier passage, ou table absente) : rien n'est signalé — on ne sait
 * pas distinguer un fichier ancien d'un fichier en retard.
 * @param {string[]} files noms des fichiers (`NNN_xxx.sql`)
 * @param {number|null} cursor version lue dans `schema_version`
 * @param {Set<string>|null} known fichiers déjà enregistrés
 * @returns {string[]}
 */
function findSkippedMigrationFiles(files, cursor, known) {
  if (!known || known.size === 0) return [];
  const version = Number(cursor);
  if (cursor === null || cursor === undefined || !Number.isFinite(version) || version < 0) {
    return [];
  }
  return files.filter((name) => {
    const match = MIGRATION_FILE_RE.exec(name);
    return match && Number.parseInt(match[1], 10) < version && !known.has(name);
  });
}

/**
 * Compare la version en base aux fichiers présents.
 * @param {number|null} current version lue dans `schema_version` (`null` si illisible)
 * @param {number[]} numbers numéros des fichiers (voir `listMigrationNumbers`)
 * @param {{ skipped?: string[] }} [options] fichiers ignorés (voir `findSkippedMigrationFiles`)
 * @returns {{ current: number|null, latest: number|null, pending: number[], skipped: string[],
 *   upToDate: boolean }} `upToDate` est faux s'il reste des migrations en attente OU ignorées.
 */
function compareSchemaVersion(current, numbers, { skipped = [] } = {}) {
  const latest = numbers.length ? numbers[numbers.length - 1] : null;
  if (current === null || current === undefined || !Number.isFinite(Number(current))) {
    return {
      current: null,
      latest,
      pending: [...numbers],
      skipped: [],
      upToDate: numbers.length === 0,
    };
  }
  const version = Number(current);
  // Même règle que `runMigrations` : un numéro inférieur à la version courante n'est jamais
  // rejoué ; seuls les numéros strictement supérieurs sont « en attente ». Ceux qui sont
  // inférieurs sans avoir jamais été vus sont « ignorés » (`skipped`) : `db:migrate` ne les
  // appliquera pas, il faut les renuméroter.
  const pending = numbers.filter((n) => n > version);
  const ignored = [...skipped];
  return {
    current: version,
    latest,
    pending,
    skipped: ignored,
    upToDate: pending.length === 0 && ignored.length === 0,
  };
}

/**
 * Registre `schema_migration_files` (S13) : `null` si la table n'existe pas encore (base
 * antérieure à ce contrôle, `db:migrate` pas encore passé).
 */
async function readKnownMigrationFiles(db) {
  if (typeof db.queryAll !== 'function') return null;
  try {
    const rows = await db.queryAll('SELECT file_name FROM schema_migration_files');
    return new Set((rows || []).map((r) => String(r.file_name)));
  } catch (err) {
    if (err && (err.errno === 1146 || err.code === 'ER_NO_SUCH_TABLE')) return null;
    throw err;
  }
}

/**
 * Lit `schema_version` puis compare aux fichiers.
 * @param {{ queryOne: (sql: string, params?: unknown[]) => Promise<any>,
 *   queryAll?: (sql: string, params?: unknown[]) => Promise<any[]> }} db `queryAll` permet de
 *   détecter les migrations ignorées (S13) ; sans lui, ce contrôle est sauté.
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
  const known = current === null ? null : await readKnownMigrationFiles(db);
  const skipped = findSkippedMigrationFiles(listMigrationFiles(migrationsDir), current, known);
  return compareSchemaVersion(current, listMigrationNumbers(migrationsDir), { skipped });
}

module.exports = {
  DEFAULT_MIGRATIONS_DIR,
  listMigrationNumbers,
  listMigrationFiles,
  findSkippedMigrationFiles,
  compareSchemaVersion,
  getMigrationStatus,
};
