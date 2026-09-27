'use strict';

// État des migrations (lib/migrationStatus.js) : base de `npm run db:status`, du rattrapage
// par le cron de déploiement et du champ `schema` de GET /api/admin/diagnostics.

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const {
  listMigrationNumbers,
  compareSchemaVersion,
  getMigrationStatus,
} = require('../lib/migrationStatus');
const { formatReport, checkModule } = require('../scripts/check-runtime');
const { initSchema, queryOne } = require('../database');
const { app } = require('../server');

before(async () => {
  await initSchema();
});

test('listMigrationNumbers : numéros triés, doublons historiques fusionnés, autres fichiers ignorés', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-migrations-'));
  for (const name of [
    '002_b.sql',
    '001_a.sql',
    '021_x.sql',
    '021_y.sql',
    'README.md',
    '1234_trop_long.sql',
    '010_pas_sql.txt',
  ]) {
    fs.writeFileSync(path.join(dir, name), '-- vide\n');
  }
  assert.deepEqual(listMigrationNumbers(dir), [1, 2, 21]);
  assert.deepEqual(listMigrationNumbers(path.join(dir, 'absent')), []);
});

test('compareSchemaVersion : à jour, en retard, base vierge', () => {
  assert.deepEqual(compareSchemaVersion(301, [299, 300, 301]), {
    current: 301,
    latest: 301,
    pending: [],
    upToDate: true,
  });
  assert.deepEqual(compareSchemaVersion(297, [296, 297, 298, 299, 300, 301]), {
    current: 297,
    latest: 301,
    pending: [298, 299, 300, 301],
    upToDate: false,
  });
  // Même règle que runMigrations : un numéro inférieur à la version courante n'est jamais
  // rejoué, il n'est donc pas « en attente ».
  assert.deepEqual(compareSchemaVersion(301, [150, 301]).pending, []);
  const vierge = compareSchemaVersion(null, [1, 2]);
  assert.equal(vierge.upToDate, false);
  assert.deepEqual(vierge.pending, [1, 2]);
});

test('getMigrationStatus : table absente = tout en attente ; autre erreur remontée', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-migrations-'));
  fs.writeFileSync(path.join(dir, '001_a.sql'), '-- vide\n');
  const missingTable = {
    queryOne: async () => {
      const err = new Error("Table 'x.schema_version' doesn't exist");
      err.errno = 1146;
      throw err;
    },
  };
  const status = await getMigrationStatus(missingTable, { migrationsDir: dir });
  assert.equal(status.current, null);
  assert.deepEqual(status.pending, [1]);

  const down = {
    queryOne: async () => {
      throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    },
  };
  await assert.rejects(() => getMigrationStatus(down, { migrationsDir: dir }), /ECONNREFUSED/);
});

test('getMigrationStatus : la base de test est à jour sur le dernier fichier', async () => {
  const status = await getMigrationStatus({ queryOne });
  const numbers = listMigrationNumbers();
  assert.equal(status.latest, numbers[numbers.length - 1]);
  assert.equal(status.current, status.latest);
  assert.equal(status.upToDate, true);
});

test('GET /api/admin/diagnostics expose la version du schéma', async () => {
  const prev = process.env.DEPLOY_SECRET;
  process.env.DEPLOY_SECRET = 'secret-diag-schema';
  try {
    const res = await request(app)
      .get('/api/admin/diagnostics')
      .set('X-Deploy-Secret', 'secret-diag-schema')
      .expect(200);
    assert.equal(res.body.schema.ok, true);
    assert.equal(res.body.schema.current, res.body.schema.latest);
    assert.deepEqual(res.body.schema.pending, []);
  } finally {
    if (prev === undefined) delete process.env.DEPLOY_SECRET;
    else process.env.DEPLOY_SECRET = prev;
  }
});

test('check-runtime : un module facultatif absent n’échoue pas, un obligatoire si', () => {
  const absentOptional = checkModule('module-inexistant-foretmap', {
    required: false,
    purpose: 'test',
  });
  assert.equal(absentOptional.ok, false);
  assert.match(absentOptional.detail, /absent/);
  const okReport = formatReport([
    { label: 'a', ok: true, required: true, detail: 'ok' },
    absentOptional,
  ]);
  assert.equal(okReport.ok, true);
  assert.match(okReport.lines[1], /^⚠/);

  const koReport = formatReport([{ label: 'schéma BDD', ok: false, required: true, detail: 'x' }]);
  assert.equal(koReport.ok, false);
  assert.match(koReport.lines[0], /^✖/);
});
