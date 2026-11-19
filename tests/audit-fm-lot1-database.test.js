'use strict';

// Ces tests rejouent `initSchema()` pour de vrai (ce que fait `db:migrate`) : la mémoïsation
// de la suite (`tests/helpers/setup.js`) le court-circuiterait.
process.env.FORETMAP_TESTS_SCHEMA_MEMO = '0';
require('./helpers/setup');

/**
 * Audit ForetMap du 19/11/2026, lot 1 — S8 et S13 (`sql/schema_foretmap.sql`, `database.js`,
 * `lib/migrationStatus.js`).
 *
 * S8 : chaque `db:migrate` (initSchema) recréait la catégorie de lieu « Infrastructure »
 * supprimée par un prof (`INSERT IGNORE` inconditionnel du schéma rejoué).
 *
 * S13 : une migration de numéro inférieur à `schema_version` était ignorée sans bruit, et
 * `db:status` répondait « à jour ».
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const logger = require('../lib/logger');
const database = require('../database');
const { initSchema, queryAll, queryOne, execute } = database;
const {
  findSkippedMigrationFiles,
  compareSchemaVersion,
  getMigrationStatus,
} = require('../lib/migrationStatus');

test('S8 — une catégorie « Infrastructure » supprimée n’est pas recréée par initSchema', async () => {
  await initSchema();
  const row = await queryOne('SELECT * FROM location_categories WHERE id = ?', [
    'cat-infrastructure',
  ]);
  const zoneLinks = await queryAll('SELECT * FROM zone_categories WHERE category_id = ?', [
    'cat-infrastructure',
  ]);
  const markerLinks = await queryAll('SELECT * FROM marker_categories WHERE category_id = ?', [
    'cat-infrastructure',
  ]);
  try {
    await execute('DELETE FROM location_categories WHERE id = ?', ['cat-infrastructure']);
    await initSchema(); // ce que rejoue `npm run db:migrate`
    const after = await queryOne('SELECT id FROM location_categories WHERE id = ?', [
      'cat-infrastructure',
    ]);
    assert.strictEqual(after, undefined, 'la suppression par un prof est respectée');
  } finally {
    // Restauration : les autres fichiers de test partagent la base.
    if (row) {
      const cols = Object.keys(row);
      await execute(
        `INSERT IGNORE INTO location_categories (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        cols.map((c) => row[c]),
      );
      for (const [table, links] of [
        ['zone_categories', zoneLinks],
        ['marker_categories', markerLinks],
      ]) {
        for (const link of links) {
          const lc = Object.keys(link);
          await execute(
            `INSERT IGNORE INTO ${table} (${lc.join(', ')}) VALUES (${lc.map(() => '?').join(', ')})`,
            lc.map((c) => link[c]),
          );
        }
      }
    }
  }
});

test('S8 — base vierge : la catégorie de démarrage est semée (table vide seulement)', async () => {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema_foretmap.sql'), 'utf8');
  const seed = schema.slice(schema.indexOf('INSERT IGNORE INTO location_categories'));
  const statement = seed.slice(0, seed.indexOf(';') + 1);
  assert.match(statement, /'cat-infrastructure'/);
  assert.match(statement, /WHERE NOT EXISTS \(SELECT 1 FROM location_categories\)/);
});

test('S13 — findSkippedMigrationFiles / compareSchemaVersion', () => {
  const files = ['100_a.sql', '200_b.sql', '250_late.sql', '300_c.sql'];
  const known = new Set(['100_a.sql', '200_b.sql', '300_c.sql']);
  assert.deepStrictEqual(findSkippedMigrationFiles(files, 300, known), ['250_late.sql']);
  // Registre vide (premier passage) : impossible de distinguer, rien n'est signalé.
  assert.deepStrictEqual(findSkippedMigrationFiles(files, 300, new Set()), []);
  assert.deepStrictEqual(findSkippedMigrationFiles(files, null, known), []);
  // Numéro égal ou supérieur au curseur : en attente, pas « ignoré ».
  assert.deepStrictEqual(findSkippedMigrationFiles(['300_c.sql', '301_d.sql'], 300, known), []);

  const status = compareSchemaVersion(300, [100, 200, 250, 300], { skipped: ['250_late.sql'] });
  assert.deepStrictEqual(status.pending, []);
  assert.deepStrictEqual(status.skipped, ['250_late.sql']);
  assert.strictEqual(status.upToDate, false, 'une migration ignorée n’est pas « à jour »');
});

test('S13 — getMigrationStatus signale un fichier sous le curseur jamais vu', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-lot1-mig-'));
  try {
    for (const f of ['100_a.sql', '250_late.sql', '300_c.sql']) {
      fs.writeFileSync(path.join(dir, f), 'SELECT 1;');
    }
    const db = {
      queryOne: async () => ({ version: 300 }),
      queryAll: async () => [{ file_name: '100_a.sql' }, { file_name: '300_c.sql' }],
    };
    const status = await getMigrationStatus(db, { migrationsDir: dir });
    assert.deepStrictEqual(status.skipped, ['250_late.sql']);
    assert.strictEqual(status.upToDate, false);

    // Registre absent (base antérieure au contrôle) : pas d'erreur, rien de signalé.
    const noTable = {
      queryOne: async () => ({ version: 300 }),
      queryAll: async () => {
        const err = new Error("Table 'schema_migration_files' doesn't exist");
        err.code = 'ER_NO_SUCH_TABLE';
        throw err;
      },
    };
    const status2 = await getMigrationStatus(noTable, { migrationsDir: dir });
    assert.deepStrictEqual(status2.skipped, []);
    assert.strictEqual(status2.upToDate, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('S13 — initSchema : migration sous schema_version jamais vue → avertissement, db:status « pas à jour »', async () => {
  await initSchema();
  const registered = await queryAll('SELECT file_name FROM schema_migration_files');
  const migrationFiles = fs
    .readdirSync(path.join(__dirname, '..', 'migrations'))
    .filter((f) => /^\d{3}_.*\.sql$/.test(f));
  assert.strictEqual(
    registered.length,
    migrationFiles.length,
    'tous les fichiers sont enregistrés après initSchema',
  );

  const before = await getMigrationStatus(database);
  assert.deepStrictEqual(before.skipped, []);
  assert.strictEqual(before.upToDate, true);

  // Rejeu : un fichier de numéro inférieur au curseur, que le runner n'a jamais vu (arrivé par
  // une PR parallèle après un numéro supérieur). Le plus simple est de le retirer du registre.
  const late = migrationFiles.sort().find((f) => /^150_/.test(f)) || migrationFiles.sort()[100];
  await execute('DELETE FROM schema_migration_files WHERE file_name = ?', [late]);
  const warnings = [];
  const realWarn = logger.warn;
  logger.warn = function patchedWarn(obj, msg) {
    warnings.push({ obj, msg });
    return realWarn.apply(this, arguments);
  };
  try {
    await initSchema();
  } finally {
    logger.warn = realWarn;
  }
  try {
    const warned = warnings.find((w) => Array.isArray(w.obj?.skipped));
    assert.ok(warned, 'un avertissement est émis au démarrage / db:migrate');
    assert.deepStrictEqual(warned.obj.skipped, [late]);

    const status = await getMigrationStatus(database);
    assert.deepStrictEqual(status.skipped, [late], 'db:status / check:runtime le voient');
    assert.strictEqual(status.upToDate, false);
    // Toujours non enregistré : le signal persiste tant que le fichier n'est pas renuméroté.
    const still = await queryOne(
      'SELECT file_name FROM schema_migration_files WHERE file_name = ?',
      [late],
    );
    assert.strictEqual(still, undefined);
  } finally {
    await execute('INSERT IGNORE INTO schema_migration_files (file_name) VALUES (?)', [late]);
  }
});
