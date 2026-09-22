'use strict';

require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert');
const { initSchema, queryAll, queryOne } = require('../database');

test('v_visit_coverage expose statut_short (migration 269)', async () => {
  await initSchema();

  const viewRows = await queryAll(
    `SELECT table_name FROM information_schema.views
     WHERE table_schema = DATABASE() AND table_name = 'v_visit_coverage'`,
  );
  assert.strictEqual(viewRows.length, 1, 'vue v_visit_coverage absente');

  const cols = await queryAll(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'v_visit_coverage'
     ORDER BY ordinal_position`,
  );
  const names = cols.map((c) => String(c.column_name || c.COLUMN_NAME || '').toLowerCase());
  assert.ok(names.includes('statut_short'), `colonnes vue: ${names.join(', ')}`);
  assert.ok(!names.includes('name_exp_11'), 'alias Name_exp_11 encore présent');

  const sample = await queryOne('SELECT statut_short FROM v_visit_coverage LIMIT 1');
  if (sample) {
    assert.ok(
      ['vide', 'trop court', 'trop long', 'ok'].includes(String(sample.statut_short)),
      `statut_short inattendu: ${sample.statut_short}`,
    );
  }
});
