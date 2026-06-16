const { normalizeSqliteMarkerRow, normalizeSqliteZoneRow } = require('./legacyZoneShapeConvert');

function sqlString(value) {
  if (value == null) return 'NULL';
  return `'${String(value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "''")
    .replace(/\r\n/g, '\\n')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\n')}'`;
}

function sqlNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : 'NULL';
}

function buildZoneInsert(row) {
  return `INSERT INTO zones (id, map_id, name, x, y, width, height, current_plant, living_beings, stage, special, shape, points, color, description) VALUES (${[
    sqlString(row.id),
    sqlString(row.map_id),
    sqlString(row.name),
    sqlNumber(row.x),
    sqlNumber(row.y),
    sqlNumber(row.width),
    sqlNumber(row.height),
    sqlString(row.current_plant),
    row.living_beings == null ? 'NULL' : sqlString(row.living_beings),
    sqlString(row.stage),
    sqlNumber(row.special),
    sqlString(row.shape),
    sqlString(row.points),
    sqlString(row.color),
    sqlString(row.description),
  ].join(', ')});`;
}

function buildMarkerInsert(row) {
  return `INSERT INTO map_markers (id, map_id, x_pct, y_pct, label, plant_name, living_beings, note, emoji, created_at) VALUES (${[
    sqlString(row.id),
    sqlString(row.map_id),
    sqlNumber(row.x_pct),
    sqlNumber(row.y_pct),
    sqlString(row.label),
    sqlString(row.plant_name),
    row.living_beings == null ? 'NULL' : sqlString(row.living_beings),
    sqlString(row.note),
    sqlString(row.emoji),
    row.created_at == null ? 'NULL' : sqlString(row.created_at),
  ].join(', ')});`;
}

/**
 * @param {import('better-sqlite3').Database} sqlite
 * @param {{ mapId?: string, mapWidth?: number, mapHeight?: number }} [options]
 */
function readSqliteGardenRows(sqlite, options = {}) {
  const mapId = String(options.mapId || 'foret').trim() || 'foret';
  const zones = sqlite.prepare('SELECT * FROM zones ORDER BY name ASC, id ASC').all();
  const markers = sqlite.prepare('SELECT * FROM map_markers ORDER BY label ASC, id ASC').all();
  const normalizedZones = [];
  const skippedZones = [];
  for (const zone of zones) {
    const row = normalizeSqliteZoneRow(zone, { ...options, mapId });
    if (row) normalizedZones.push(row);
    else skippedZones.push({ id: zone.id, name: zone.name, reason: 'points_invalides' });
  }
  const normalizedMarkers = [];
  const skippedMarkers = [];
  for (const marker of markers) {
    const row = normalizeSqliteMarkerRow(marker, { mapId });
    if (row) normalizedMarkers.push(row);
    else
      skippedMarkers.push({ id: marker.id, label: marker.label, reason: 'coordonnees_invalides' });
  }
  return {
    mapId,
    zones: normalizedZones,
    markers: normalizedMarkers,
    skippedZones,
    skippedMarkers,
  };
}

/**
 * @param {import('better-sqlite3').Database} sqlite
 * @param {{ mapId?: string, mapWidth?: number, mapHeight?: number, replaceMap?: boolean }} [options]
 */
function buildGardenImportSql(sqlite, options = {}) {
  const { mapId, zones, markers, skippedZones, skippedMarkers } = readSqliteGardenRows(
    sqlite,
    options,
  );
  const replaceMap = options.replaceMap !== false;
  const lines = [
    '-- ForetMap — import zones et repères (carte forêt comestible)',
    `-- map_id: ${mapId}`,
    `-- zones: ${zones.length} | repères: ${markers.length}`,
    `-- généré: ${new Date().toISOString()}`,
    '--',
    '-- Exécuter sur la base MySQL ForetMap (phpMyAdmin, mysql CLI, etc.).',
    '-- Par défaut, supprime les zones/repères existants de cette carte avant insertion.',
    '',
    'SET NAMES utf8mb4;',
    'SET FOREIGN_KEY_CHECKS = 0;',
  ];
  if (replaceMap) {
    lines.push(
      '',
      `-- Nettoyage carte « ${mapId} »`,
      `DELETE mp FROM marker_photos mp INNER JOIN map_markers m ON m.id = mp.marker_id WHERE m.map_id = ${sqlString(mapId)};`,
      `DELETE zp FROM zone_photos zp INNER JOIN zones z ON z.id = zp.zone_id WHERE z.map_id = ${sqlString(mapId)};`,
      `DELETE zh FROM zone_history zh INNER JOIN zones z ON z.id = zh.zone_id WHERE z.map_id = ${sqlString(mapId)};`,
      `DELETE FROM visit_markers WHERE map_id = ${sqlString(mapId)};`,
      `DELETE FROM visit_zones WHERE map_id = ${sqlString(mapId)};`,
      `DELETE FROM map_markers WHERE map_id = ${sqlString(mapId)};`,
      `DELETE FROM zones WHERE map_id = ${sqlString(mapId)};`,
    );
  }
  if (zones.length > 0) {
    lines.push('', '-- Zones');
    for (const row of zones) lines.push(buildZoneInsert(row));
  }
  if (markers.length > 0) {
    lines.push('', '-- Repères');
    for (const row of markers) lines.push(buildMarkerInsert(row));
  }
  lines.push('', 'SET FOREIGN_KEY_CHECKS = 1;', '');
  if (skippedZones.length > 0 || skippedMarkers.length > 0) {
    lines.push('-- Éléments ignorés (non importables) :');
    for (const s of skippedZones) lines.push(`-- zone ${s.id} (${s.name}) : ${s.reason}`);
    for (const s of skippedMarkers) lines.push(`-- repère ${s.id} (${s.label}) : ${s.reason}`);
    lines.push('');
  }
  return {
    sql: lines.join('\n'),
    mapId,
    counts: { zones: zones.length, markers: markers.length },
    skipped: { zones: skippedZones, markers: skippedMarkers },
  };
}

module.exports = {
  buildGardenImportSql,
  buildMarkerInsert,
  buildZoneInsert,
  readSqliteGardenRows,
  sqlNumber,
  sqlString,
};
