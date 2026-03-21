#!/usr/bin/env node
/**
 * Migration progressive des images legacy base64 (image_data) vers des fichiers disque (image_path).
 *
 * Usage:
 *   node scripts/migrate-images-to-disk.js --dry-run
 *   node scripts/migrate-images-to-disk.js
 *   node scripts/migrate-images-to-disk.js --clear-legacy
 *
 * Options:
 *   --dry-run       N'écrit rien : affiche uniquement ce qui serait migré.
 *   --clear-legacy  Après migration disque, vide image_data (à utiliser après validation).
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { queryAll, execute } = require('../database');
const { saveBase64ToDisk } = require('../lib/uploads');

function parseFlags(argv) {
  const args = new Set(argv);
  return {
    dryRun: args.has('--dry-run'),
    clearLegacy: args.has('--clear-legacy'),
  };
}

function targetPathForZonePhoto(row) {
  return `zones/${row.zone_id}/${row.id}.jpg`;
}

function targetPathForTaskLog(row) {
  return `task-logs/${row.task_id}_${row.id}.jpg`;
}

async function migrateTable(options, config) {
  const rows = await queryAll(config.selectSql);
  const summary = {
    table: config.name,
    scanned: rows.length,
    migrated: 0,
    failed: 0,
  };

  for (const row of rows) {
    const relativePath = config.relativePath(row);
    try {
      if (!options.dryRun) {
        saveBase64ToDisk(relativePath, row.image_data);
        if (options.clearLegacy) {
          await execute(config.updateWithClearSql, [relativePath, row.id]);
        } else {
          await execute(config.updateSql, [relativePath, row.id]);
        }
      }
      summary.migrated += 1;
    } catch (err) {
      summary.failed += 1;
      console.error(`[${config.name}] échec id=${row.id}:`, err.message || err);
    }
  }

  return summary;
}

async function main() {
  const options = parseFlags(process.argv.slice(2));
  const mode = options.dryRun ? 'DRY-RUN' : 'EXECUTION';
  console.log(`[migrate-images] mode=${mode} clearLegacy=${options.clearLegacy ? 'yes' : 'no'}`);

  const tables = [
    {
      name: 'zone_photos',
      selectSql: `
        SELECT id, zone_id, image_data
        FROM zone_photos
        WHERE (image_path IS NULL OR image_path = '')
          AND image_data IS NOT NULL
          AND image_data <> ''
      `,
      relativePath: targetPathForZonePhoto,
      updateSql: 'UPDATE zone_photos SET image_path = ? WHERE id = ?',
      updateWithClearSql: 'UPDATE zone_photos SET image_path = ?, image_data = NULL WHERE id = ?',
    },
    {
      name: 'task_logs',
      selectSql: `
        SELECT id, task_id, image_data
        FROM task_logs
        WHERE (image_path IS NULL OR image_path = '')
          AND image_data IS NOT NULL
          AND image_data <> ''
      `,
      relativePath: targetPathForTaskLog,
      updateSql: 'UPDATE task_logs SET image_path = ? WHERE id = ?',
      updateWithClearSql: 'UPDATE task_logs SET image_path = ?, image_data = NULL WHERE id = ?',
    },
  ];

  const results = [];
  for (const table of tables) {
    const summary = await migrateTable(options, table);
    results.push(summary);
  }

  const totals = results.reduce(
    (acc, r) => {
      acc.scanned += r.scanned;
      acc.migrated += r.migrated;
      acc.failed += r.failed;
      return acc;
    },
    { scanned: 0, migrated: 0, failed: 0 }
  );

  for (const r of results) {
    console.log(`[migrate-images] ${r.table}: scanned=${r.scanned} migrated=${r.migrated} failed=${r.failed}`);
  }
  console.log(
    `[migrate-images] total: scanned=${totals.scanned} migrated=${totals.migrated} failed=${totals.failed}`
  );

  if (totals.failed > 0) process.exit(1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[migrate-images] erreur fatale:', err.message || err);
    process.exit(1);
  });
}

module.exports = {
  parseFlags,
  targetPathForZonePhoto,
  targetPathForTaskLog,
  migrateTable,
};
