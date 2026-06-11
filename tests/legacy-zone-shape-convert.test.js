'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  mapZoneLivingFields,
  normalizeSqliteMarkerRow,
  normalizeSqliteZoneRow,
  parseCulturesJson,
  rectPixelsToPolygonPoints,
  resolveZonePointsJson,
} = require('../lib/legacyZoneShapeConvert');
const { buildGardenImportSql } = require('../lib/sqliteGardenSqlExport');

describe('legacyZoneShapeConvert', () => {
  it('convertit un rectangle pixel en polygone %', () => {
    const pts = rectPixelsToPolygonPoints(160, 100, 80, 50);
    assert.equal(pts.length, 4);
    assert.deepEqual(pts[0], { xp: 10, yp: 10 });
    assert.deepEqual(pts[2], { xp: 15, yp: 15 });
  });

  it('conserve les points polygon existants', () => {
    const raw = JSON.stringify([{ xp: 1, yp: 2 }, { xp: 3, yp: 4 }, { xp: 5, yp: 6 }]);
    const out = resolveZonePointsJson({ shape: 'rect', points: raw, x: 1, y: 2, width: 3, height: 4 });
    assert.equal(out, raw);
  });

  it('mappe cultures vers living_beings', () => {
    const cultures = parseCulturesJson('[{"plant":"Choux","stage":"growing"},{"plant":"Fèves","stage":"ready"}]');
    assert.equal(cultures.length, 2);
    const mapped = mapZoneLivingFields({
      cultures: JSON.stringify(cultures),
      stage: 'empty',
    });
    assert.equal(mapped.stage, 'ready');
    assert.deepEqual(JSON.parse(mapped.living_beings), ['Choux', 'Fèves']);
    assert.equal(mapped.current_plant, '');
  });

  it('normalise une zone legacy rect', () => {
    const row = normalizeSqliteZoneRow({
      id: 'pg',
      name: 'Plantes Grasses',
      shape: 'rect',
      x: 183,
      y: 88,
      width: 56,
      height: 38,
      current_plant: 'Cactus',
      stage: 'growing',
      special: 0,
      color: '#86efac80',
      description: '',
    });
    assert.ok(row);
    assert.equal(row.map_id, 'foret');
    assert.equal(row.x, 0);
    const pts = JSON.parse(row.points);
    assert.equal(pts.length, 4);
    assert.equal(JSON.parse(row.living_beings)[0], 'Cactus');
  });

  it('normalise un repère SQLite', () => {
    const row = normalizeSqliteMarkerRow({
      id: 'm1',
      x_pct: 12.5,
      y_pct: 33.3,
      label: 'Ruches',
      plant_name: 'Abeille',
      note: 'note',
      emoji: '🐝',
      created_at: '2026-01-01',
    });
    assert.ok(row);
    assert.equal(row.map_id, 'foret');
    assert.deepEqual(JSON.parse(row.living_beings), ['Abeille']);
  });
});

describe('sqliteGardenSqlExport', () => {
  it('échappe les retours ligne dans les chaînes SQL', () => {
    const { sqlString } = require('../lib/sqliteGardenSqlExport');
    assert.equal(sqlString('a\nb'), "'a\\nb'");
  });

  it('génère un SQL transactionnel avec nettoyage des dépendances avant INSERT', () => {
    const Database = require('better-sqlite3');
    const sqlite = new Database(':memory:');
    sqlite.exec(`
      CREATE TABLE zones (
        id TEXT, name TEXT, x REAL, y REAL, width REAL, height REAL,
        current_plant TEXT, stage TEXT, special INTEGER, shape TEXT,
        points TEXT, color TEXT, description TEXT, cultures TEXT
      );
      CREATE TABLE map_markers (
        id TEXT, x_pct REAL, y_pct REAL, label TEXT, plant_name TEXT,
        note TEXT, emoji TEXT, created_at TEXT
      );
      INSERT INTO zones VALUES (
        'z1', 'Test', 0, 0, 160, 100, 'Tomate', 'growing', 0, 'rect',
        NULL, '#86efac80', '', NULL
      );
      INSERT INTO map_markers VALUES (
        'm1', 10, 20, 'Repère', '', '', '🌱', NULL
      );
    `);
    const { sql, counts } = buildGardenImportSql(sqlite, { mapId: 'foret' });
    sqlite.close();
    assert.equal(counts.zones, 1);
    assert.equal(counts.markers, 1);
    assert.match(sql, /START TRANSACTION;/);
    assert.doesNotMatch(sql, /FOREIGN_KEY_CHECKS\s*=\s*0/);
    assert.match(sql, /UPDATE tasks t INNER JOIN zones z ON z\.id = t\.zone_id SET t\.zone_id = NULL WHERE z\.map_id = 'foret'/);
    assert.match(sql, /DELETE tz FROM task_zones tz INNER JOIN zones z ON z\.id = tz\.zone_id WHERE z\.map_id = 'foret'/);
    assert.match(sql, /DELETE tm FROM task_markers tm INNER JOIN map_markers m ON m\.id = tm\.marker_id WHERE m\.map_id = 'foret'/);
    assert.match(sql, /DELETE vss FROM visit_seen_students vss INNER JOIN visit_zones vz ON vz\.id = vss\.target_id WHERE vss\.target_type = 'zone' AND vz\.map_id = 'foret'/);
    assert.match(sql, /DELETE FROM zones WHERE map_id = 'foret'/);
    assert.match(sql, /INSERT INTO zones/);
    assert.match(sql, /INSERT INTO map_markers/);
    assert.match(sql, /COMMIT;/);
  });
});
