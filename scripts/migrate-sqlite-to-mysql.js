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
      'tasks', 'zones', 'students', 'plants', 'map_markers'
    ];
    for (const table of deleteOrder) {
      await conn.query(`DELETE FROM \`${table}\``);
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    // ─── zones ───
    const zones = sqlite.prepare('SELECT * FROM zones').all();
    for (const z of zones) {
      await conn.execute(
        `INSERT INTO zones (id, name, x, y, width, height, current_plant, stage, special, shape, points, color, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          z.id, z.name, z.x, z.y, z.width, z.height,
          z.current_plant ?? '', z.stage ?? 'empty', z.special ? 1 : 0, z.shape ?? 'rect',
          z.points ?? null, z.color ?? '#86efac80', z.description ?? ''
        ]
      );
    }
    console.log('zones:', zones.length);

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

    // ─── students ───
    const students = sqlite.prepare('SELECT * FROM students').all();
    for (const s of students) {
      await conn.execute(
        'INSERT INTO students (id, first_name, last_name, password, last_seen) VALUES (?, ?, ?, ?, ?)',
        [s.id, s.first_name, s.last_name, s.password ?? null, s.last_seen ?? null]
      );
    }
    console.log('students:', students.length);

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
        'INSERT INTO task_assignments (task_id, student_first_name, student_last_name, assigned_at) VALUES (?, ?, ?, ?)',
        [a.task_id, a.student_first_name, a.student_last_name, a.assigned_at ?? null]
      );
    }
    console.log('task_assignments:', taskAssignments.length);

    // ─── task_logs (images sur disque) ───
    const taskLogs = sqlite.prepare('SELECT * FROM task_logs').all();
    for (const l of taskLogs) {
      const [inserted] = await conn.execute(
        `INSERT INTO task_logs (task_id, student_first_name, student_last_name, comment, image_path, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          l.task_id, l.student_first_name, l.student_last_name,
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

    // ─── map_markers ───
    const mapMarkers = sqlite.prepare('SELECT * FROM map_markers').all();
    for (const m of mapMarkers) {
      await conn.execute(
        `INSERT INTO map_markers (id, x_pct, y_pct, label, plant_name, note, emoji, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          m.id, m.x_pct, m.y_pct, m.label, m.plant_name ?? '', m.note ?? '',
          m.emoji ?? '🌱', m.created_at ?? null
        ]
      );
    }
    console.log('map_markers:', mapMarkers.length);

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
