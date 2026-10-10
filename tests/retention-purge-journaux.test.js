'use strict';

/**
 * Purge planifiée — catégorie `journaux` : journaux et traces d'activité 12 mois au plus,
 * compteurs d'usage compris, suppression en lots bornés, simulation sans effet.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { initSchema, queryAll, queryOne, execute } = require('../database');
const { captureLog } = require('./helpers/retentionFixtures');

const TAG = `jr-${Date.now().toString(36)}${crypto.randomUUID().slice(0, 4)}`;
const APPLY_ENV = { RETENTION_PURGE_APPLY: '1' };

test.before(async () => {
  await initSchema();
});

test('journaux : toute durée au-delà de 12 mois est refusée (historiques de contenu exceptés)', async () => {
  const purge = require('../scripts/purge-audit-logs');
  assert.equal(purge.MAX_JOURNAL_RETENTION_DAYS, 365);
  assert.equal(purge.DEFAULT_VISITS_RETENTION_DAYS, 365, 'ouvertures : 12 mois, plus 13');
  const defaults = purge.parseArgs([]);
  assert.doesNotThrow(() => purge.assertRetentions(defaults));
  for (const flag of [
    '--days=400',
    '--activity-days=366',
    '--sync-days=400',
    '--visits-days=395',
    '--guest-days=400',
    '--ip-days=400',
  ]) {
    assert.throws(
      () => purge.assertRetentions(purge.parseArgs([flag])),
      /Maximum 365 jours/,
      `${flag} doit être refusé`,
    );
  }
  assert.doesNotThrow(
    () => purge.assertRetentions(purge.parseArgs(['--history-days=730'])),
    'les historiques de contenu ne sont pas des journaux',
  );
  await assert.rejects(
    purge.runPurge({ ...purge.parseArgs(['--days=400']) }, {}, () => {}),
    /Maximum 365 jours/,
  );

  // Purge planifiée : option ou `.env` trop longs → échec (code 1, donc alerte), rien d'écrit.
  const { runRetentionPurge } = require('../lib/retention/retentionPurge');
  const out = captureLog();
  const byFlag = await runRetentionPurge({ argv: ['--days=400'], env: {}, log: out.log });
  assert.equal(byFlag.exitCode, 1);
  assert.match(out.text(), /Maximum 365 jours/);
  const byEnv = await runRetentionPurge({
    argv: [],
    env: { FORETMAP_RETENTION_SECURITY_DAYS: '730' },
    log: () => {},
  });
  assert.equal(byEnv.exitCode, 1);
  assert.equal(byEnv.runId, null, 'refusé avant toute écriture');
});

/** Lignes datées dans chaque journal : une ancienne (400 j), une récente (10 j). */
async function seedJournals() {
  for (const days of [400, 10]) {
    await execute(
      `INSERT INTO security_events (occurred_at, action, ip_address) VALUES (NOW() - INTERVAL ? DAY, ?, NULL)`,
      [days, TAG],
    );
    await execute(
      `INSERT INTO audit_log (action, target_type, details, created_at, occurred_at)
       VALUES (?, 'test', NULL, UTC_TIMESTAMP(3) - INTERVAL ? DAY, UTC_TIMESTAMP() - INTERVAL ? DAY)`,
      [TAG, days, days],
    );
    await execute(
      `INSERT INTO user_activity_events (user_id, user_type, product, action, occurred_at)
       VALUES (NULL, NULL, 'foret', ?, NOW() - INTERVAL ? DAY)`,
      [TAG, days],
    );
    await execute(
      `INSERT INTO usage_counters (day, product, event, \`key\`, count)
       VALUES (CURDATE() - INTERVAL ? DAY, 'plan', 'search_empty', ?, 1)`,
      [days, TAG],
    );
  }
}

async function remaining() {
  const rows = await queryAll(
    `SELECT 'security_events' AS t, COUNT(*) AS n FROM security_events WHERE action = ?
     UNION ALL SELECT 'audit_log', COUNT(*) FROM audit_log WHERE action = ?
     UNION ALL SELECT 'user_activity_events', COUNT(*) FROM user_activity_events WHERE action = ?
     UNION ALL SELECT 'usage_counters', COUNT(*) FROM usage_counters WHERE \`key\` = ?`,
    [TAG, TAG, TAG, TAG],
  );
  return Object.fromEntries(rows.map((r) => [r.t, Number(r.n)]));
}

test('journaux : la simulation compte sans rien supprimer ; l’exécution réelle purge au-delà de 12 mois', async () => {
  const { runRetentionPurge } = require('../lib/retention/retentionPurge');
  await seedJournals();
  const all = { security_events: 2, audit_log: 2, user_activity_events: 2, usage_counters: 2 };
  assert.deepEqual(await remaining(), all);

  const sim = await runRetentionPurge({
    argv: ['--only=journaux'],
    env: APPLY_ENV,
    log: () => {},
  });
  assert.equal(sim.exitCode, 0);
  assert.equal(sim.mode, 'simulation', 'variable seule, sans --apply : simulation');
  assert.deepEqual(await remaining(), all, 'simulation : rien supprimé');
  for (const table of Object.keys(all)) {
    assert.ok(sim.counts.journaux.tables[table] >= 1, `${table} compté`);
  }

  const real = await runRetentionPurge({
    argv: ['--apply', '--only=journaux'],
    env: APPLY_ENV,
    log: () => {},
  });
  assert.equal(real.exitCode, 0);
  assert.equal(real.mode, 'apply');
  assert.deepEqual(
    await remaining(),
    { security_events: 1, audit_log: 1, user_activity_events: 1, usage_counters: 1 },
    'seules les lignes de plus de 12 mois partent',
  );
  const row = await queryOne(
    'SELECT counts_json, options_json FROM retention_purge_runs WHERE id = ?',
    [real.runId],
  );
  const counts =
    typeof row.counts_json === 'string' ? JSON.parse(row.counts_json) : row.counts_json;
  assert.ok(counts.journaux.total >= 4);
  const options =
    typeof row.options_json === 'string' ? JSON.parse(row.options_json) : row.options_json;
  assert.equal(options.journalRetentions.days, 365, 'durées enregistrées au journal de purge');
});

test('journaux : suppression en lots bornés (DELETE … LIMIT), jamais d’un seul bloc', async () => {
  const purge = require('../scripts/purge-audit-logs');
  for (let i = 0; i < 5; i += 1) {
    await execute(
      `INSERT INTO usage_counters (day, product, event, \`key\`, count)
       VALUES (CURDATE() - INTERVAL ? DAY, 'plan', 'search_empty', ?, 1)`,
      [500 + i, `${TAG}-lot`],
    );
  }
  const statements = [];
  const db = {
    queryOne: (sql, params) => require('../database').queryOne(sql, params),
    execute: (sql, params) => {
      statements.push(sql);
      return execute(sql, params);
    },
  };
  const report = await purge.purgeTargets(
    { ...purge.parseArgs([]), apply: true, batchSize: 2 },
    db,
    () => {},
  );
  const usageDeletes = statements.filter((sql) => sql.startsWith('DELETE FROM usage_counters'));
  assert.ok(
    usageDeletes.every((sql) => /LIMIT 2$/.test(sql)),
    'chaque DELETE est borné',
  );
  assert.ok(
    usageDeletes.length >= 3,
    `5 lignes en lots de 2 : 3 instructions (${usageDeletes.length})`,
  );
  assert.ok(report.deleted.usage_counters >= 5);
  const left = await queryOne('SELECT COUNT(*) AS n FROM usage_counters WHERE `key` = ?', [
    `${TAG}-lot`,
  ]);
  assert.equal(Number(left.n), 0);
});
