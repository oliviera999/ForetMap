'use strict';

require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert');
const { assertNoNewDuplicateMigrationNumbers, queryAll, initSchema } = require('../database');

test('tolère les doublons de numéros historiques (021, 037)', () => {
  assert.doesNotThrow(() =>
    assertNoNewDuplicateMigrationNumbers([
      '021_add_new_tutorials_seed.sql',
      '021_visit_public_flow.sql',
      '037_message_reactions.sql',
      '037_visitor_role_default.sql',
      '161_perf_indexes_audit.sql',
    ]),
  );
});

test('lève sur tout nouveau doublon de numéro de migration', () => {
  assert.throws(
    () => assertNoNewDuplicateMigrationNumbers(['162_feature_a.sql', '162_feature_b.sql']),
    /Numéro de migration dupliqué \(162\)/,
  );
});

test('F4 : les tables visite V1 sont supprimées après initSchema (migration 166)', async () => {
  await initSchema();
  const tableExists = async (name) =>
    queryAll(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
      [name],
    );
  for (const table of ['visit_zone_content', 'visit_marker_content']) {
    const rows = await tableExists(table);
    assert.strictEqual(rows.length, 0, `table V1 ${table} encore présente`);
  }
  const v2 = await tableExists('visit_zones');
  assert.strictEqual(v2.length, 1, 'table V2 visit_zones absente');
});

test('les index de performance (audit §2.1) existent après initSchema', async () => {
  await initSchema();
  const expected = [
    ['task_assignments', 'idx_task_assignments_student_name'],
    ['task_logs', 'idx_task_logs_student_name'],
    ['zone_history', 'idx_zone_history_zone_harvested'],
    ['observation_logs', 'idx_observation_logs_created'],
  ];
  for (const [table, indexName] of expected) {
    const rows = await queryAll(`SHOW INDEX FROM ${table} WHERE Key_name = ?`, [indexName]);
    assert.ok(rows.length > 0, `index ${indexName} absent de ${table}`);
  }
});
