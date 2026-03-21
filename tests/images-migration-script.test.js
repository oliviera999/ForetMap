'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  parseFlags,
  targetPathForZonePhoto,
  targetPathForTaskLog,
} = require('../scripts/migrate-images-to-disk');

test('parseFlags détecte dry-run et clear-legacy', () => {
  const f = parseFlags(['--dry-run', '--clear-legacy']);
  assert.strictEqual(f.dryRun, true);
  assert.strictEqual(f.clearLegacy, true);
});

test('parseFlags par défaut', () => {
  const f = parseFlags([]);
  assert.strictEqual(f.dryRun, false);
  assert.strictEqual(f.clearLegacy, false);
});

test('targetPathForZonePhoto construit un chemin stable', () => {
  const p = targetPathForZonePhoto({ id: 12, zone_id: 'zone-abc' });
  assert.strictEqual(p, 'zones/zone-abc/12.jpg');
});

test('targetPathForTaskLog construit un chemin stable', () => {
  const p = targetPathForTaskLog({ id: 7, task_id: 'task-42' });
  assert.strictEqual(p, 'task-logs/task-42_7.jpg');
});
