'use strict';

/**
 * Purge planifiée — socle (migration 319) :
 *   - migration idempotente (rejouée deux fois), utf8mb4 ;
 *   - `users.deactivated_at` posé au passage actif → inactif, effacé à la réactivation ;
 *   - simulation par défaut : `--apply` ET `RETENTION_PURGE_APPLY=1` exigés ;
 *   - journal de purge : une ligne par exécution (mode, comptages, durée, issue), reprise
 *     d'une exécution interrompue, échec d'une catégorie isolé et nettoyé ;
 *   - verrou : deux purges ne tournent jamais ensemble.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const request = require('supertest');

const database = require('../database');
const { initSchema, queryAll, queryOne, execute, splitSqlStatements, pool } = database;
const { app } = require('../server');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { createDatedAccount, captureLog } = require('./helpers/retentionFixtures');

const ROOT = path.resolve(__dirname, '..');
const MIGRATION = path.join(ROOT, 'migrations', '319_retention_purge.sql');
const APPLY_ENV = { RETENTION_PURGE_APPLY: '1' };

let adminToken;

test.before(async () => {
  await initSchema();
  adminToken = await ensureAdminTeacherAuthToken();
});

/** Rejoue la migration instruction par instruction, comme le lanceur. */
async function replayMigration() {
  const statements = splitSqlStatements(fs.readFileSync(MIGRATION, 'utf8'));
  const conn = await pool.getConnection();
  try {
    for (const stmt of statements) await conn.query(stmt);
  } finally {
    conn.release();
  }
}

test('migration 319 : rejouée deux fois sans erreur, colonne, index et journal en utf8mb4', async () => {
  assert.ok(fs.existsSync(MIGRATION), 'migration 319 absente');
  // Compte désactivé avant la migration : rattrapé depuis `updated_at`, sans le modifier.
  const legacy = await createDatedAccount({ label: 'Ancien', isActive: 0, createdDaysAgo: 500 });
  await execute(
    'UPDATE users SET deactivated_at = NULL, updated_at = NOW() - INTERVAL 400 DAY WHERE id = ?',
    [legacy.id],
  );
  const before = await queryOne('SELECT updated_at FROM users WHERE id = ?', [legacy.id]);

  await replayMigration();
  await replayMigration();

  const column = await queryOne(
    `SELECT DATA_TYPE AS t, IS_NULLABLE AS n FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'deactivated_at'`,
  );
  assert.deepEqual(column, { t: 'datetime', n: 'YES' });
  const index = await queryAll(
    `SELECT COLUMN_NAME AS c FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
        AND INDEX_NAME = 'idx_users_type_deactivated' ORDER BY SEQ_IN_INDEX`,
  );
  assert.deepEqual(
    index.map((r) => r.c),
    ['user_type', 'is_active', 'deactivated_at'],
  );
  const table = await queryOne(
    `SELECT TABLE_COLLATION AS c FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'retention_purge_runs'`,
  );
  assert.equal(table?.c, 'utf8mb4_unicode_ci');

  const after = await queryOne('SELECT deactivated_at, updated_at FROM users WHERE id = ?', [
    legacy.id,
  ]);
  assert.equal(after.updated_at.getTime(), before.updated_at.getTime(), 'updated_at intact');
  assert.equal(
    after.deactivated_at.getTime(),
    before.updated_at.getTime(),
    'désactivation datée depuis updated_at (jamais plus tôt que la vraie date)',
  );
});

test('désactivation datée par le formulaire d’administration, effacée à la réactivation', async () => {
  const { activeStateParams, activeTransition } = require('../lib/accounts/deactivation');
  assert.equal(activeTransition(1, 0), 'deactivate');
  assert.equal(activeTransition(0, 1), 'activate');
  assert.equal(activeTransition(0, 0), 'none');
  assert.deepEqual(activeStateParams(1, 0), [0, 'deactivate']);
  assert.deepEqual(activeStateParams(0, 0), [0, 'none']);
  assert.deepEqual(activeStateParams(1, 1), [1, 'activate']);

  const student = await createDatedAccount({ label: 'Form', lastSeenDaysAgo: 3 });
  const patch = (body) =>
    request(app)
      .patch(`/api/rbac/users/student/${student.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body)
      .expect(200);
  const read = () =>
    queryOne('SELECT is_active, deactivated_at FROM users WHERE id = ?', [student.id]);

  await patch({ is_active: false });
  const off = await read();
  assert.equal(Number(off.is_active), 0);
  assert.ok(off.deactivated_at instanceof Date, 'date de départ posée');

  // Une autre modification d'un compte resté inactif ne déplace pas la date.
  await execute('UPDATE users SET deactivated_at = NOW() - INTERVAL 30 DAY WHERE id = ?', [
    student.id,
  ]);
  const backdated = await read();
  await patch({ description: 'autre champ' });
  assert.equal((await read()).deactivated_at.getTime(), backdated.deactivated_at.getTime());

  await patch({ is_active: true });
  const on = await read();
  assert.equal(Number(on.is_active), 1);
  assert.equal(on.deactivated_at, null, 'date effacée à la réactivation');
});

test('mode : simulation sauf --apply ET RETENTION_PURGE_APPLY=1 ; options strictes', () => {
  const { resolveMode, parseRetentionArgs } = require('../lib/retention/retentionPurge');
  assert.equal(resolveMode([], {}).apply, false);
  assert.equal(resolveMode(['--apply'], {}).apply, false, '--apply seul : simulation');
  assert.equal(resolveMode([], APPLY_ENV).apply, false, 'variable seule : simulation');
  assert.equal(resolveMode(['--apply'], { RETENTION_PURGE_APPLY: 'true' }).apply, false);
  assert.equal(resolveMode(['--apply'], APPLY_ENV).apply, true);

  assert.throws(() => parseRetentionArgs(['--aply'], {}), /Option inconnue : --aply/);
  assert.throws(() => parseRetentionArgs(['--only=inconnue'], {}), /Catégorie inconnue/);
  assert.throws(() => parseRetentionArgs(['--row-batch-size=5'], {}), /--row-batch-size/);
  const parsed = parseRetentionArgs(['--only=desactivations', '--row-batch-size=200'], {});
  assert.deepEqual([...parsed.only], ['desactivations']);
  assert.equal(parsed.rowBatchSize, 200);
});

test('simulation : rien n’est modifié, une ligne de journal ; exécution réelle : dates rattrapées', async () => {
  const { runRetentionPurge } = require('../lib/retention/retentionPurge');
  const undated = await createDatedAccount({ label: 'SansDate', isActive: 0, createdDaysAgo: 50 });
  await execute('UPDATE users SET deactivated_at = NULL WHERE id = ?', [undated.id]);
  const stale = await createDatedAccount({ label: 'Reactive', lastSeenDaysAgo: 1 });
  await execute('UPDATE users SET deactivated_at = NOW() - INTERVAL 800 DAY WHERE id = ?', [
    stale.id,
  ]);
  const snapshot = () =>
    queryAll('SELECT id, deactivated_at, updated_at FROM users WHERE id IN (?, ?) ORDER BY id', [
      undated.id,
      stale.id,
    ]);
  const before = await snapshot();
  const runsBefore = (await queryOne('SELECT COUNT(*) AS n FROM retention_purge_runs')).n;

  // `--apply` sans la variable : simulation.
  const out = captureLog();
  const sim = await runRetentionPurge({
    argv: ['--apply', '--only=desactivations'],
    env: {},
    log: out.log,
  });
  assert.equal(sim.exitCode, 0);
  assert.equal(sim.mode, 'simulation');
  assert.deepEqual(await snapshot(), before, 'simulation : aucune modification');
  assert.match(out.text(), /SIMULATION/);
  assert.match(out.text(), /--apply est ignoré/);
  assert.ok(sim.counts.desactivations.non_datees >= 1);
  assert.ok(sim.counts.desactivations.dates_obsoletes >= 1);

  const runsAfter = (await queryOne('SELECT COUNT(*) AS n FROM retention_purge_runs')).n;
  assert.equal(runsAfter, runsBefore + 1, 'une ligne de journal par exécution');
  const row = await queryOne('SELECT * FROM retention_purge_runs WHERE id = ?', [sim.runId]);
  assert.equal(row.mode, 'simulation');
  assert.equal(row.outcome, 'success');
  assert.ok(row.finished_at instanceof Date);
  assert.ok(Number.isInteger(row.duration_ms) && row.duration_ms >= 0);
  const counts =
    typeof row.counts_json === 'string' ? JSON.parse(row.counts_json) : row.counts_json;
  assert.deepEqual(Object.keys(counts), ['desactivations']);

  const real = await runRetentionPurge({
    argv: ['--apply', '--only=desactivations'],
    env: APPLY_ENV,
    log: () => {},
  });
  assert.equal(real.mode, 'apply');
  assert.equal(real.exitCode, 0);
  const [a, b] = await snapshot();
  const byId = Object.fromEntries([a, b].map((r) => [r.id, r]));
  assert.ok(byId[undated.id].deactivated_at instanceof Date, 'désactivation datée');
  assert.equal(byId[stale.id].deactivated_at, null, 'date d’un compte actif effacée');
  for (const r of before) {
    assert.equal(byId[r.id].updated_at.getTime(), r.updated_at.getTime(), 'updated_at intact');
  }
  const realRow = await queryOne('SELECT mode, outcome FROM retention_purge_runs WHERE id = ?', [
    real.runId,
  ]);
  assert.deepEqual({ ...realRow }, { mode: 'apply', outcome: 'success' });
});

test('journal : échec d’une catégorie isolé et nettoyé, exécution interrompue reprise', async () => {
  const { runRetentionPurge } = require('../lib/retention/retentionPurge');
  const stuck = await execute(
    "INSERT INTO retention_purge_runs (mode, outcome, started_at) VALUES ('apply', 'running', NOW(3) - INTERVAL 2 DAY)",
  );
  let secondRan = false;
  const categories = [
    {
      key: 'casse',
      label: 'catégorie en panne',
      async run() {
        throw new Error('Panne pour eleve.secret@exemple.test depuis 203.0.113.9');
      },
    },
    {
      key: 'suivante',
      label: 'catégorie suivante',
      async run() {
        secondRan = true;
        return { counts: { lignes: 0 } };
      },
    },
  ];
  const out = captureLog();
  const result = await runRetentionPurge({ argv: [], env: {}, log: out.log, categories });
  assert.equal(result.exitCode, 1);
  assert.equal(result.outcome, 'failure');
  assert.ok(secondRan, 'l’échec d’une catégorie n’empêche pas les suivantes');
  assert.doesNotMatch(out.text(), /eleve\.secret|203\.0\.113\.9/, 'sortie nettoyée');

  const row = await queryOne(
    'SELECT outcome, error_message FROM retention_purge_runs WHERE id = ?',
    [result.runId],
  );
  assert.equal(row.outcome, 'failure');
  assert.match(row.error_message, /casse/);
  assert.doesNotMatch(row.error_message, /eleve\.secret|203\.0\.113\.9/);
  const old = await queryOne('SELECT outcome, finished_at FROM retention_purge_runs WHERE id = ?', [
    stuck.insertId,
  ]);
  assert.equal(old.outcome, 'interrupted', 'exécution restée « running » marquée interrompue');
  assert.ok(old.finished_at instanceof Date);
});

test('verrou : une purge déjà en cours fait échouer la seconde, sans rien faire', async () => {
  const { runRetentionPurge, acquirePurgeLock } = require('../lib/retention/retentionPurge');
  const held = await acquirePurgeLock(pool);
  assert.ok(held, 'verrou pris');
  try {
    let ran = false;
    const out = captureLog();
    const result = await runRetentionPurge({
      argv: [],
      env: {},
      log: out.log,
      categories: [
        {
          key: 'x',
          label: 'x',
          async run() {
            ran = true;
            return { counts: {} };
          },
        },
      ],
    });
    assert.equal(result.exitCode, 1);
    assert.equal(ran, false);
    assert.match(out.text(), /déjà en cours/);
  } finally {
    await held.release();
  }
});

test('script : option inconnue → code 1 sans toucher la base ; simulation → code 0', () => {
  const env = { ...process.env, RETENTION_PURGE_APPLY: '' };
  const bad = spawnSync(process.execPath, ['scripts/retention-purge.js', '--aply'], {
    cwd: ROOT,
    env,
    encoding: 'utf8',
  });
  assert.equal(bad.status, 1, bad.stdout + bad.stderr);
  assert.match(bad.stdout, /Option inconnue/);

  const sim = spawnSync(process.execPath, ['scripts/retention-purge.js', '--only=desactivations'], {
    cwd: ROOT,
    env,
    encoding: 'utf8',
  });
  assert.equal(sim.status, 0, sim.stdout + sim.stderr);
  assert.match(sim.stdout, /SIMULATION/);
});
