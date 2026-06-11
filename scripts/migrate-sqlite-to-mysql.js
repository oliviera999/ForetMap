#!/usr/bin/env node
/**
 * Migration SQLite (foretmap.db) → MySQL (oliviera_foretmap).
 * Usage: depuis la racine ForetMap, avec .env configuré pour MySQL :
 *   node scripts/migrate-sqlite-to-mysql.js
 *   npm run migrate:sqlite-to-mysql
 *
 * Prérequis : MySQL schéma déjà appliqué (npm run db:init ou sql/schema_foretmap.sql).
 * Optionnel : SQLITE_PATH=./foretmap.db (défaut : foretmap.db à la racine du projet).
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const fs = require('fs');

const sqlitePath = path.resolve(process.cwd(), process.env.SQLITE_PATH || 'foretmap.db');
if (!fs.existsSync(sqlitePath)) {
  console.error('Fichier SQLite introuvable:', sqlitePath);
  process.exit(1);
}

const Database = require('better-sqlite3');
const mysql = require('mysql2/promise');
const { saveBase64ToDisk } = require('../lib/uploads');
const {
  normalizeSqliteMarkerRow,
  normalizeSqliteZoneRow,
} = require('../lib/legacyZoneShapeConvert');

const sqlite = new Database(sqlitePath, { readonly: true });

async function getMysqlPool() {
  return mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    charset: 'utf8mb4',
  });
}

async function main() {
  const pool = await getMysqlPool();
  const conn = await pool.getConnection();

  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    const deleteOrder = [
      'task_logs', 'task_assignments', 'zone_photos', 'zone_history',
      'tasks', 'zones', 'users', 'plants', 'map_markers'
    ];
    for (const table of deleteOrder) {
      await conn.query(`DELETE FROM \`${table}\``);
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    // ─── zones (carte foret, polygones % + living_beings) ───
    const zones = sqlite.prepare('SELECT * FROM zones').all();
    let zonesInserted = 0;
    for (const z of zones) {
      const row = normalizeSqliteZoneRow(z, { mapId: 'foret' });
      if (!row) {
        console.warn('zone ignorée (géométrie invalide):', z.id, z.name);
        continue;
      }
      await conn.execute(
        `INSERT INTO zones (id, map_id, name, x, y, width, height, current_plant, living_beings, stage, special, shape, points, color, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id, row.map_id, row.name, row.x, row.y, row.width, row.height,
          row.current_plant, row.living_beings, row.stage, row.special, row.shape,
          row.points, row.color, row.description,
        ]
      );
      zonesInserted += 1;
    }
    console.log('zones:', zonesInserted, '/', zones.length);

    // ─── zone_history ───
    const zoneHistory = sqlite.prepare('SELECT * FROM zone_history').all();
    for (const h of zoneHistory) {
      await conn.execute(
        'INSERT INTO zone_history (zone_id, plant, harvested_at) VALUES (?, ?, ?)',
        [h.zone_id, h.plant, h.harvested_at]
      );
    }
    console.log('zone_history:', zoneHistory.length);

    // ─── plants ───
    const plants = sqlite.prepare('SELECT * FROM plants').all();
    for (const p of plants) {
      await conn.execute(
        'INSERT INTO plants (id, name, emoji, description) VALUES (?, ?, ?, ?)',
        [p.id, p.name, p.emoji ?? null, p.description ?? null]
      );
    }
    console.log('plants:', plants.length);

    // ─── users (students) ───
    const students = sqlite.prepare('SELECT * FROM students').all();
    for (const s of students) {
      await conn.execute(
        `INSERT INTO users
          (id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name, description, avatar_path, affiliation, password_hash, auth_provider, is_active, last_seen, created_at, updated_at)
         VALUES (?, 'student', NULL, NULL, NULL, ?, ?, ?, NULL, NULL, 'both', ?, 'local', 1, ?, NOW(), NOW())`,
        [s.id, s.first_name, s.last_name, `${s.first_name || ''} ${s.last_name || ''}`.trim(), s.password ?? null, s.last_seen ?? null]
      );
    }
    console.log('users/students:', students.length);

    // ─── tasks ───
    const tasks = sqlite.prepare('SELECT * FROM tasks').all();
    for (const t of tasks) {
      await conn.execute(
        `INSERT INTO tasks (id, title, description, zone_id, due_date, required_students, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          t.id, t.title, t.description ?? null, t.zone_id ?? null, t.due_date ?? null,
          t.required_students ?? 1, t.status ?? 'available', t.created_at ?? null
        ]
      );
    }
    console.log('tasks:', tasks.length);

    // ─── task_assignments ───
    const taskAssignments = sqlite.prepare('SELECT * FROM task_assignments').all();
    for (const a of taskAssignments) {
      await conn.execute(
        'INSERT INTO task_assignments (task_id, student_id, student_first_name, student_last_name, assigned_at) VALUES (?, ?, ?, ?, ?)',
        [a.task_id, a.student_id ?? null, a.student_first_name, a.student_last_name, a.assigned_at ?? null]
      );
    }
    console.log('task_assignments:', taskAssignments.length);

    // ─── task_logs (images sur disque) ───
    const taskLogs = sqlite.prepare('SELECT * FROM task_logs').all();
    for (const l of taskLogs) {
      const [inserted] = await conn.execute(
        `INSERT INTO task_logs (task_id, student_id, student_first_name, student_last_name, comment, image_path, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          l.task_id, l.student_id ?? null, l.student_first_name, l.student_last_name,
          l.comment ?? null, null, l.created_at ?? null
        ]
      );
      if (l.image_data) {
        const relativePath = `task-logs/${l.task_id}_${inserted.insertId}.jpg`;
        saveBase64ToDisk(relativePath, l.image_data);
        await conn.execute('UPDATE task_logs SET image_path = ? WHERE id = ?', [relativePath, inserted.insertId]);
      }
    }
    console.log('task_logs:', taskLogs.length);

    // ─── zone_photos (images sur disque) ───
    const zonePhotos = sqlite.prepare('SELECT * FROM zone_photos').all();
    for (const p of zonePhotos) {
      const [inserted] = await conn.execute(
        'INSERT INTO zone_photos (zone_id, image_path, caption, uploaded_at) VALUES (?, ?, ?, ?)',
        [p.zone_id, null, p.caption ?? '', p.uploaded_at ?? null]
      );
      if (p.image_data) {
        const relativePath = `zones/${p.zone_id}/${inserted.insertId}.jpg`;
        saveBase64ToDisk(relativePath, p.image_data);
        await conn.execute('UPDATE zone_photos SET image_path = ? WHERE id = ?', [relativePath, inserted.insertId]);
      }
    }
    console.log('zone_photos:', zonePhotos.length);

    // ─── map_markers (carte foret) ───
    const mapMarkers = sqlite.prepare('SELECT * FROM map_markers').all();
    let markersInserted = 0;
    for (const m of mapMarkers) {
      const row = normalizeSqliteMarkerRow(m, { mapId: 'foret' });
      if (!row) {
        console.warn('repère ignoré (coordonnées invalides):', m.id, m.label);
        continue;
      }
      await conn.execute(
        `INSERT INTO map_markers (id, map_id, x_pct, y_pct, label, plant_name, living_beings, note, emoji, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id, row.map_id, row.x_pct, row.y_pct, row.label, row.plant_name,
          row.living_beings, row.note, row.emoji, row.created_at,
        ]
      );
      markersInserted += 1;
    }
    console.log('map_markers:', markersInserted, '/', mapMarkers.length);

    console.log('\nMigration SQLite → MySQL terminée.');
  } finally {
    conn.release();
    sqlite.close();
    pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
