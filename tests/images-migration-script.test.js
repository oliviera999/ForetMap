'use strict';

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const { initSchema, execute, queryOne } = require('../database');

const {
  parseFlags,
  targetPathForZonePhoto,
  targetPathForTaskLog,
  migrateTable,
  buildLegacyTableConfigs,
} = require('../scripts/migrate-images-to-disk');

test.before(async () => {
  await initSchema();
});

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

test('migrateTable en dry-run ne modifie pas la ligne', async () => {
  const zoneId = `zone-migrate-dry-${Date.now()}`;
  await execute(
    'INSERT INTO zones (id, name, x, y, width, height, current_plant, stage, special, points, color) VALUES (?, ?, 0, 0, 0, 0, ?, ?, 0, ?, ?)',
    [zoneId, 'Zone dry-run', '', 'empty', '[]', '#86efac80']
  );
  const tempTable = `tmp_legacy_images_${Date.now()}`;
  await execute(
    `CREATE TABLE ${tempTable} (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      zone_id VARCHAR(64) NOT NULL,
      image_data LONGTEXT DEFAULT NULL,
      image_path VARCHAR(512) DEFAULT NULL
    )`
  );
  const inserted = await execute(
    `INSERT INTO ${tempTable} (zone_id, image_data, image_path) VALUES (?, ?, ?)`,
    [zoneId, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5qXg8AAAAASUVORK5CYII=', null]
  );
  const photoId = inserted.insertId;

  try {
    const summary = await migrateTable(
      { dryRun: true, clearLegacy: false },
      {
        name: tempTable,
        selectSql: `SELECT id, zone_id, image_data FROM ${tempTable} WHERE id = ${photoId}`,
        relativePath: targetPathForZonePhoto,
        updateSql: `UPDATE ${tempTable} SET image_path = ? WHERE id = ?`,
        updateWithClearSql: `UPDATE ${tempTable} SET image_path = ?, image_data = NULL WHERE id = ?`,
      }
    );
    assert.ok(summary.migrated >= 1);

    const row = await queryOne(`SELECT image_path, image_data FROM ${tempTable} WHERE id = ?`, [photoId]);
    assert.strictEqual(row.image_path, null);
    assert.ok(row.image_data);
  } finally {
    await execute(`DROP TABLE ${tempTable}`);
  }
});

test('buildLegacyTableConfigs retourne vide si les colonnes legacy sont retirées', async () => {
  const tables = await buildLegacyTableConfigs();
  assert.deepStrictEqual(tables, []);
});
