'use strict';

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const { initSchema, execute } = require('../database');

const { parseFlags, buildReport } = require('../scripts/image-migration-report');

test.before(async () => {
  await initSchema();
});

test('parseFlags détecte --json', () => {
  const parsed = parseFlags(['--json']);
  assert.strictEqual(parsed.json, true);
});

test('parseFlags sans options', () => {
  const parsed = parseFlags([]);
  assert.strictEqual(parsed.json, false);
});

test('buildReport retourne une structure complète', async () => {
  const report = await buildReport();
  assert.strictEqual(typeof report.zone_photos_legacy, 'number');
  assert.strictEqual(typeof report.task_logs_legacy, 'number');
  assert.strictEqual(typeof report.total_legacy, 'number');
  assert.strictEqual(typeof report.ready_for_clear, 'boolean');
  assert.strictEqual(typeof report.legacy_columns_present, 'boolean');
  if (!report.legacy_columns_present) {
    assert.strictEqual(report.zone_photos_legacy, 0);
    assert.strictEqual(report.task_logs_legacy, 0);
    assert.strictEqual(report.total_legacy, 0);
    assert.strictEqual(report.ready_for_clear, true);
  }
});
