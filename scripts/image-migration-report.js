#!/usr/bin/env node
/**
 * Reporting des reliquats image_data (legacy) avant bascule finale.
 *
 * Usage:
 *   node scripts/image-migration-report.js
 *   node scripts/image-migration-report.js --json
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { queryOne } = require('../database');

function parseFlags(argv) {
  const args = new Set(argv);
  return { json: args.has('--json') };
}

async function fetchCount(sql) {
  const row = await queryOne(sql);
  return row ? Number(row.c || 0) : 0;
}

async function hasImageDataColumn(tableName) {
  const row = await queryOne(
    `SELECT COUNT(*) AS c
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = 'image_data'`,
    [tableName]
  );
  return Number(row?.c || 0) > 0;
}

async function buildReport() {
  const hasZoneLegacy = await hasImageDataColumn('zone_photos');
  const hasTaskLegacy = await hasImageDataColumn('task_logs');

  if (!hasZoneLegacy && !hasTaskLegacy) {
    return {
      zone_photos_legacy: 0,
      task_logs_legacy: 0,
      total_legacy: 0,
      ready_for_clear: true,
      legacy_columns_present: false,
    };
  }

  const zonePhotosLegacy = await fetchCount(`
    SELECT COUNT(*) AS c
    FROM zone_photos
    WHERE (image_path IS NULL OR image_path = '')
      AND image_data IS NOT NULL
      AND image_data <> ''
  `);

  const taskLogsLegacy = await fetchCount(`
    SELECT COUNT(*) AS c
    FROM task_logs
    WHERE (image_path IS NULL OR image_path = '')
      AND image_data IS NOT NULL
      AND image_data <> ''
  `);

  const totalLegacy = zonePhotosLegacy + taskLogsLegacy;
  return {
    zone_photos_legacy: zonePhotosLegacy,
    task_logs_legacy: taskLogsLegacy,
    total_legacy: totalLegacy,
    ready_for_clear: totalLegacy === 0,
    legacy_columns_present: true,
  };
}

function printHuman(report) {
  console.log('[image-report] zone_photos legacy:', report.zone_photos_legacy);
  console.log('[image-report] task_logs legacy:', report.task_logs_legacy);
  console.log('[image-report] total legacy:', report.total_legacy);
  console.log(
    `[image-report] bascule clear-legacy: ${report.ready_for_clear ? 'OK (aucun reliquat)' : 'NON (reliquats présents)'}`
  );
  if (!report.legacy_columns_present) {
    console.log('[image-report] legacy désactivé: colonnes image_data déjà retirées.');
  }
}

async function main() {
  const { json } = parseFlags(process.argv.slice(2));
  const report = await buildReport();
  if (json) {
    console.log(JSON.stringify(report));
    return;
  }
  printHuman(report);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[image-report] erreur fatale:', err.message || err);
    process.exit(1);
  });
}

module.exports = { parseFlags, buildReport };
