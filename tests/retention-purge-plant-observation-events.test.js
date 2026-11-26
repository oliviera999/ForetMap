'use strict';

/**
 * Purge planifiée — règle 4 de la catégorie `observations` : doublons
 * `user_plant_observation_events` (audit code 26/11, P8).
 */

require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { initSchema, queryOne, execute } = require('../database');
const fm = require('./helpers/fmFixtures');
const { createDatedAccount } = require('./helpers/retentionFixtures');
const policy = require('../lib/retention/policy');
const { runRetentionPurge } = require('../lib/retention/retentionPurge');

const APPLY_ENV = { RETENTION_PURGE_APPLY: '1' };
const ONLY = '--only=observations';

test('simulation puis apply : seuls les doublons anciens partent, la dernière par fiche reste', async () => {
  await initSchema();
  const plant = await fm.createPlant({ name: 'Purge UPOE test' });
  const student = await createDatedAccount({ label: 'Upoe' });
  const days = policy.PLANT_OBSERVATION_EVENT_RETENTION_DAYS + 5;
  const old = new Date(Date.now() - days * 86400000);
  const recent = new Date();

  await execute(
    'INSERT INTO user_plant_observation_events (user_id, plant_id, observed_at) VALUES (?, ?, ?), (?, ?, ?)',
    [student.id, plant.id, old, student.id, plant.id, recent],
  );

  const before = await queryOne(
    'SELECT COUNT(*) AS n FROM user_plant_observation_events WHERE user_id = ? AND plant_id = ?',
    [student.id, plant.id],
  );
  assert.equal(Number(before.n), 2);

  const preview = await runRetentionPurge({ argv: [ONLY], log: () => {} });
  assert.equal(preview.exitCode, 0);
  assert.ok(
    Number(preview.counts?.observations?.plant_observation_event_duplicates) >= 1,
    'comptage simulation',
  );
  assert.equal(
    Number(
      (
        await queryOne(
          'SELECT COUNT(*) AS n FROM user_plant_observation_events WHERE user_id = ? AND plant_id = ?',
          [student.id, plant.id],
        )
      ).n,
    ),
    2,
    'simulation ne supprime rien',
  );

  const applied = await runRetentionPurge({
    argv: ['--apply', ONLY],
    env: APPLY_ENV,
    log: () => {},
  });
  assert.equal(applied.exitCode, 0);
  const after = await queryOne(
    'SELECT COUNT(*) AS n, MAX(observed_at) AS last_at FROM user_plant_observation_events WHERE user_id = ? AND plant_id = ?',
    [student.id, plant.id],
  );
  assert.equal(Number(after.n), 1);
  assert.ok(new Date(after.last_at).getTime() >= recent.getTime() - 2000);
});
