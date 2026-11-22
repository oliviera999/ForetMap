'use strict';

/**
 * Contrôle d'écart prod/dépôt (flux F7) : empreinte du schéma (`lib/schemaFingerprint.js`).
 *
 * - fonctions pures : normalisation des types et des défauts, comparaison, phrases ;
 * - **empreinte versionnée à jour** : `sql/schema_fingerprint.json` doit décrire exactement la
 *   base de test fraîche. Une migration qui change le schéma sans régénérer l'empreinte fait
 *   tomber ce test sous son nom — régénérer avec
 *   `node scripts/schema-fingerprint.js --write` sur une base fraîche à jour.
 *
 * Le contrôle n'est jamais bloquant ailleurs (démarrage, connecteur, cron) : seul ce test l'est.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { initSchema, queryAll } = require('../database');
const { listMigrationFiles } = require('../lib/migrationStatus');
const fp = require('../lib/schemaFingerprint');

function table(columns = {}, indexes = {}, foreignKeys = {}) {
  return { columns, indexes, foreignKeys };
}
const col = (type, nullable = true, dflt = null) => ({ type, nullable, default: dflt });

test('normalisation : largeur des entiers, défauts, valeurs d’ENUM intactes', () => {
  assert.equal(fp.normalizeColumnType('int(10) unsigned'), 'int unsigned');
  assert.equal(fp.normalizeColumnType('BIGINT(20) UNSIGNED'), 'bigint unsigned');
  assert.equal(fp.normalizeColumnType('tinyint(1)'), 'tinyint');
  assert.equal(fp.normalizeColumnType('varchar(64)'), 'varchar(64)');
  assert.equal(fp.normalizeColumnType("enum('A','b')"), "enum('A','b')");
  assert.equal(fp.normalizeDefault(null), null);
  assert.equal(fp.normalizeDefault('NULL'), null);
  assert.equal(fp.normalizeDefault("'foret'"), 'foret');
  assert.equal(fp.normalizeDefault("'l''arbre'"), "l'arbre");
  assert.equal(fp.normalizeDefault('current_timestamp()'), 'current_timestamp');
  assert.equal(fp.normalizeDefault('CURRENT_TIMESTAMP'), 'current_timestamp');
  assert.equal(fp.normalizeDefault('0'), '0');
  assert.deepEqual(fp.parseEnumValues("set('a','l''b')"), ['a', "l'b"]);
  assert.equal(fp.parseEnumValues('int'), null);
});

test('exclusions : tables gl_* et tables étrangères connues', () => {
  assert.equal(fp.isExcludedTable('gl_players'), true);
  assert.equal(fp.isExcludedTable('gl_players', { includeGl: true }), false);
  assert.equal(fp.isExcludedTable('doksvtal_zz_olution_fb_journal'), true);
  assert.equal(fp.isExcludedTable('plants'), false);
  for (const reason of Object.values(fp.KNOWN_FOREIGN_TABLES)) assert.ok(reason.trim());
});

test('comparaison : tables, colonnes, valeurs d’ENUM/SET, index, clés, vues', () => {
  const expected = {
    tables: {
      plants: table(
        {
          id: col('int unsigned', false),
          health_risk: col("set('rage','allergie')"),
          kind: col("enum('a','b')", false, 'a'),
        },
        {
          PRIMARY: { unique: true, columns: ['id'] },
          idx_old: { unique: false, columns: ['kind'] },
        },
      ),
      gone: table({ id: col('int') }),
    },
    views: ['v_a'],
  };
  const actual = {
    tables: {
      plants: table(
        {
          id: col('int unsigned', false),
          health_risk: col("set('rage','allergie','fievre_q')"),
          kind: col("enum('b','a')", true, 'a'),
          domestication: col("enum('sauvage')"),
        },
        {
          PRIMARY: { unique: true, columns: ['id'] },
          idx_new: { unique: false, columns: ['kind'] },
        },
        {
          fk_x: {
            columns: ['id'],
            references: 'plants',
            referencedColumns: ['id'],
            onDelete: 'SET NULL',
            onUpdate: 'RESTRICT',
          },
        },
      ),
      id_key_runs: table({ id: col('bigint unsigned', false) }),
    },
    views: ['v_a', 'v_b'],
  };
  const diff = fp.compareFingerprints(expected, actual);
  assert.equal(diff.ok, false);
  assert.deepEqual(diff.tables, { extra: ['id_key_runs'], missing: ['gone'] });
  assert.deepEqual(
    diff.columns.extra.map((c) => `${c.table}.${c.column}`),
    ['plants.domestication'],
  );
  assert.deepEqual(diff.enumValues.extra, [
    { table: 'plants', column: 'health_risk', values: ['fievre_q'] },
  ]);
  assert.deepEqual(
    diff.enumValues.reordered.map((c) => c.column),
    ['kind'],
  );
  assert.deepEqual(
    diff.columns.changed.map((c) => `${c.column}:${c.field}`),
    ['kind:nullable'],
  );
  assert.deepEqual(
    diff.indexes.extra.map((i) => i.name),
    ['idx_new'],
  );
  assert.deepEqual(
    diff.indexes.missing.map((i) => i.name),
    ['idx_old'],
  );
  assert.deepEqual(
    diff.foreignKeys.extra.map((i) => i.name),
    ['fk_x'],
  );
  assert.deepEqual(diff.views, { extra: ['v_b'], missing: [] });
  assert.equal(diff.total, 10);

  const lines = fp.describeDrift(diff);
  assert.ok(lines.length >= 8);
  for (const line of lines) assert.match(line, /à reprendre en migration\.$/);
  assert.ok(lines.some((l) => l.includes('plants.health_risk [fievre_q]')));

  const same = fp.compareFingerprints(expected, expected);
  assert.equal(same.ok, true);
  assert.equal(same.total, 0);
  assert.deepEqual(fp.describeDrift(same), []);
});

test('getSchemaDrift : empreinte absente → indisponible, jamais d’exception', async () => {
  const missing = path.join(os.tmpdir(), `absent-${process.pid}.json`);
  const res = await fp.getSchemaDrift({ queryAll: async () => [] }, { fingerprintPath: missing });
  assert.equal(res.available, false);
  assert.equal(res.ok, null);

  const file = path.join(os.tmpdir(), `fp-${process.pid}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify({ migration: '999_x.sql', tables: { t: table({ id: col('int') }) }, views: [] }),
  );
  try {
    const broken = await fp.getSchemaDrift(
      {
        queryAll: async () => {
          throw new Error('base injoignable');
        },
      },
      { fingerprintPath: file },
    );
    assert.equal(broken.available, false);
    assert.match(broken.reason, /base injoignable/);

    const stale = await fp.getSchemaDrift(
      { queryAll: async () => [] },
      { fingerprintPath: file, currentVersion: 12 },
    );
    assert.equal(stale.available, true);
    assert.equal(stale.ok, false);
    assert.equal(stale.stale, true);
    assert.deepEqual(stale.diff.tables.missing, ['t']);
  } finally {
    fs.rmSync(file, { force: true });
  }
});

describeVersioned();

function describeVersioned() {
  before(async () => {
    await initSchema();
  });

  test('empreinte versionnée = base de test fraîche (régénérer sinon)', async () => {
    const expected = fp.loadExpectedFingerprint();
    assert.ok(expected, 'sql/schema_fingerprint.json absent ou illisible');
    const files = listMigrationFiles();
    assert.equal(
      expected.migration,
      files[files.length - 1],
      'empreinte générée avant la dernière migration : node scripts/schema-fingerprint.js --write',
    );
    const actual = await fp.readSchemaFingerprint({ queryAll });
    const diff = fp.compareFingerprints(expected, actual);
    assert.deepEqual(
      fp.describeDrift(diff),
      [],
      'le schéma de la base fraîche diffère de sql/schema_fingerprint.json : régénérer avec ' +
        'node scripts/schema-fingerprint.js --write (base fraîche à jour)',
    );
  });
}
