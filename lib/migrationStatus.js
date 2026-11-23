'use strict';

/**
 * État des migrations : version du schéma en base (`schema_version`) comparée au dernier
 * fichier de `migrations/`.
 *
 * Contrôle d'écart du schéma (flux F7) en option : `includeDrift` compare aussi la structure
 * réelle à l'empreinte versionnée (`lib/schemaFingerprint.js`), sans jamais rien bloquer.
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
 * @param {{ migrationsDir?: string, includeDrift?: boolean, fingerprintPath?: string }} [options]
 *   `includeDrift` (exige `queryAll`) : ajoute `drift`, le contrôle d'écart entre la base et
 *   l'empreinte versionnée du schéma attendu (`lib/schemaFingerprint.js`, flux F7). **Jamais
 *   bloquant** : `upToDate` n'en dépend pas, une erreur de lecture rend `drift.available: false`.
 */
async function getMigrationStatus(
  db,
  { migrationsDir = DEFAULT_MIGRATIONS_DIR, includeDrift = false, fingerprintPath } = {},
) {
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
  const status = compareSchemaVersion(current, listMigrationNumbers(migrationsDir), { skipped });
  if (includeDrift) status.drift = await readDrift(db, { current, fingerprintPath });
  return status;
}

/** Contrôle d'écart, sans jamais lever : le signalement ne doit rien casser. */
async function readDrift(db, { current, fingerprintPath }) {
  if (typeof db.queryAll !== 'function') {
    return { available: false, ok: null, reason: 'lecture du schéma indisponible' };
  }
  try {
    const { getSchemaDrift } = require('./schemaFingerprint');
    return await getSchemaDrift(db, {
      currentVersion: current,
      ...(fingerprintPath ? { fingerprintPath } : {}),
    });
  } catch (err) {
    return { available: false, ok: null, reason: `contrôle impossible : ${err.message}` };
  }
}

/**
 * Version abrégée du contrôle d'écart pour un rapport (santé, connecteur) : compteurs et
 * phrases, sans le détail colonne par colonne.
 * @param {object|undefined} drift champ `drift` de `getMigrationStatus`
 */
function summarizeDrift(drift) {
  if (!drift) return null;
  if (!drift.available) return { available: false, ok: null, reason: drift.reason || null };
  const d = drift.diff || {};
  const n = (group) =>
    Object.values(group || {}).reduce(
      (acc, list) => acc + (Array.isArray(list) ? list.length : 0),
      0,
    );
  return {
    available: true,
    ok: drift.ok,
    total: drift.total,
    stale: !!drift.stale,
    expected_migration: drift.expected_migration || null,
    counts: {
      tables: n(d.tables),
      columns: n(d.columns),
      enum_values: n(d.enumValues),
      indexes: n(d.indexes),
      foreign_keys: n(d.foreignKeys),
      views: n(d.views),
    },
    messages: drift.messages || [],
    excluded: drift.excluded || null,
  };
}

module.exports = {
  DEFAULT_MIGRATIONS_DIR,
  listMigrationNumbers,
  listMigrationFiles,
  findSkippedMigrationFiles,
  compareSchemaVersion,
  getMigrationStatus,
  summarizeDrift,
};
