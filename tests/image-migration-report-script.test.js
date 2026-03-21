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
  const zoneId = `zone-report-${Date.now()}`;
  const taskId = `task-report-${Date.now()}`;
  await execute(
    'INSERT INTO zones (id, name, x, y, width, height, current_plant, stage, special, points, color) VALUES (?, ?, 0, 0, 0, 0, ?, ?, 0, ?, ?)',
    [zoneId, 'Zone report', '', 'empty', '[]', '#86efac80']
  );
  await execute(
    'INSERT INTO tasks (id, title, description, zone_id, due_date, required_students, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [taskId, 'Task report', '', null, null, 1, 'available', new Date().toISOString()]
  );
  await execute(
    'INSERT INTO zone_photos (zone_id, image_data, image_path, caption, uploaded_at) VALUES (?, ?, ?, ?, ?)',
    [
      zoneId,
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5qXg8AAAAASUVORK5CYII=',
      null,
      'report',
      new Date().toISOString(),
    ]
  );
  await execute(
    'INSERT INTO task_logs (task_id, student_first_name, student_last_name, comment, image_data, image_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      taskId,
      'Report',
      'User',
      'legacy',
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5qXg8AAAAASUVORK5CYII=',
      null,
      new Date().toISOString(),
    ]
  );

  const report = await buildReport();
  assert.strictEqual(typeof report.zone_photos_legacy, 'number');
  assert.strictEqual(typeof report.task_logs_legacy, 'number');
  assert.strictEqual(typeof report.total_legacy, 'number');
  assert.strictEqual(typeof report.ready_for_clear, 'boolean');
  assert.ok(report.zone_photos_legacy >= 1);
  assert.ok(report.task_logs_legacy >= 1);
});
