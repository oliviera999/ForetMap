'use strict';

/**
 * Migration 329 (métier, format, phase, type de projet, auteur de proposition ; badges
 * manuels) : colonnes, index, clés étrangères, idempotence, reprise des auteurs depuis
 * `audit_log`, permission `rewards.award`.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  initSchema,
  queryAll,
  queryOne,
  execute,
  pool,
  splitSqlStatements,
} = require('../database');
const { PERMISSIONS, ROLE_PERMISSION_MATRIX } = require('../lib/rbac');

const FILE = path.join(__dirname, '..', 'migrations', '329_task_taxonomy_rewards.sql');

async function replayMigration() {
  const sql = fs.readFileSync(FILE, 'utf8');
  const conn = await pool.getConnection();
  try {
    for (const stmt of splitSqlStatements(sql)) await conn.query(stmt);
  } finally {
    conn.release();
  }
}

function uid(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

async function createStudent() {
  const id = uid('m329-stu');
  await execute(
    `INSERT INTO users (id, user_type, first_name, last_name, display_name, password_hash,
                        auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'student', 'Mig', 'Ration', 'Mig Ration', 'x', 'local', 1, NOW(), NOW())`,
    [id],
  );
  return id;
}

async function createTask(title) {
  const id = uid('m329-task');
  await execute(
    `INSERT INTO tasks (id, title, description, map_id, required_students, status, created_at)
     VALUES (?, ?, '', 'foret', 1, 'available', ?)`,
    [id, title, new Date()],
  );
  return id;
}

async function auditProposal(taskId, actorId, createdAt) {
  await execute(
    `INSERT INTO audit_log (action, target_type, target_id, details, created_at, actor_user_type, actor_user_id)
     VALUES ('propose_task', 'task', ?, 'proposition', ?, 'student', ?)`,
    [taskId, createdAt, actorId],
  );
}

test.before(async () => {
  await initSchema();
});

test('migration 329 rejouable (idempotente)', async () => {
  await replayMigration();
  await replayMigration();
});

test('colonnes, index et clés étrangères présents', async () => {
  const cols = await queryAll(
    `SELECT TABLE_NAME AS t, COLUMN_NAME AS c, COLUMN_TYPE AS ct, IS_NULLABLE AS n
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND ((TABLE_NAME = 'tasks' AND COLUMN_NAME IN ('category','format','project_phase','proposed_by_user_id'))
          OR (TABLE_NAME = 'task_projects' AND COLUMN_NAME = 'project_type')
          OR (TABLE_NAME = 'user_rewards' AND COLUMN_NAME IN ('awarded_by_user_id','note','seen_at')))`,
  );
  const byKey = new Map(cols.map((r) => [`${r.t}.${r.c}`, r]));
  const expected = {
    'tasks.category': 'varchar(32)',
    'tasks.format': 'varchar(16)',
    'tasks.project_phase': 'varchar(16)',
    'tasks.proposed_by_user_id': 'varchar(64)',
    'task_projects.project_type': 'varchar(24)',
    'user_rewards.awarded_by_user_id': 'varchar(64)',
    'user_rewards.note': 'varchar(280)',
    'user_rewards.seen_at': 'datetime',
  };
  for (const [key, type] of Object.entries(expected)) {
    const col = byKey.get(key);
    assert.ok(col, `colonne absente : ${key}`);
    assert.equal(String(col.ct).toLowerCase(), type, `${key} : type`);
    assert.equal(col.n, 'YES', `${key} : NULL admis`);
  }

  const idx = await queryAll(
    `SELECT DISTINCT TABLE_NAME AS t, INDEX_NAME AS i FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('tasks', 'user_rewards')`,
  );
  const names = new Set(idx.map((r) => r.i));
  for (const name of [
    'idx_tasks_category',
    'idx_tasks_project_phase',
    'idx_tasks_proposed_by_user',
    'idx_user_rewards_awarded_by',
  ]) {
    assert.ok(names.has(name), `index absent : ${name}`);
  }

  const fks = await queryAll(
    `SELECT CONSTRAINT_NAME AS name, DELETE_RULE AS del, REFERENCED_TABLE_NAME AS ref
       FROM information_schema.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE()
        AND CONSTRAINT_NAME IN ('fk_tasks_proposed_by_user', 'fk_user_rewards_awarded_by')`,
  );
  assert.equal(fks.length, 2);
  for (const fk of fks) {
    assert.equal(fk.ref, 'users');
    assert.equal(fk.del, 'SET NULL');
  }
});

test('reprise des auteurs : plus ancienne ligne, tâche et acteur existants seulement', async () => {
  const first = await createStudent();
  const second = await createStudent();
  const gone = await createStudent();

  const twoLines = await createTask('Deux lignes');
  await auditProposal(twoLines, first, '2026-10-01 10:00:00');
  await auditProposal(twoLines, second, '2026-10-02 10:00:00');

  const actorDeleted = await createTask('Acteur supprimé');
  await auditProposal(actorDeleted, gone, '2026-10-01 10:00:00');
  await execute('DELETE FROM users WHERE id = ?', [gone]);

  // Proposition dont la tâche a été supprimée : rien à écrire, aucune erreur.
  await auditProposal(uid('m329-deleted-task'), first, '2026-10-01 10:00:00');

  const alreadySet = await createTask('Déjà renseignée');
  await execute('UPDATE tasks SET proposed_by_user_id = ? WHERE id = ?', [second, alreadySet]);
  await auditProposal(alreadySet, first, '2026-10-01 10:00:00');

  await replayMigration();

  const author = async (id) =>
    (await queryOne('SELECT proposed_by_user_id AS a FROM tasks WHERE id = ?', [id]))?.a ?? null;
  assert.equal(await author(twoLines), first, 'la plus ancienne ligne gagne');
  assert.equal(await author(actorDeleted), null, 'acteur absent de users : reste NULL');
  assert.equal(await author(alreadySet), second, 'une valeur déjà posée n’est pas réécrite');
});

test('permission rewards.award : admin et prof', async () => {
  const rows = await queryAll(
    `SELECT r.slug FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
      WHERE rp.permission_key = 'rewards.award'`,
  );
  assert.deepEqual(rows.map((r) => r.slug).sort(), ['admin', 'prof']);
  assert.ok(PERMISSIONS.some((p) => p[0] === 'rewards.award'));
  assert.ok(ROLE_PERMISSION_MATRIX.admin.includes('rewards.award'));
  assert.ok(ROLE_PERMISSION_MATRIX.prof.includes('rewards.award'));
});
