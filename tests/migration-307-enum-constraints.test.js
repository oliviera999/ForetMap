'use strict';

// Migration 307 (audit du 25/09/2026, piste C) : collations explicites de `schema_version`
// et `rbac_seeded_permissions`, contraintes CHECK sur `tasks.status` et `tasks.*_level`.
// Vérifie l'état final, le refus d'une valeur hors référentiel, l'idempotence (deux passages),
// la normalisation sans effet visible et la garde qui ne pose pas une contrainte violée.
// BDD partagée : exécution séquentielle ; les contraintes sont toujours reposées à la fin.

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  initSchema,
  pool,
  queryAll,
  queryOne,
  execute,
  splitSqlStatements,
} = require('../database');

const MIGRATION_307 = path.join(
  __dirname,
  '..',
  'migrations',
  '307_enum_constraints_and_collations.sql',
);
const CONSTRAINTS = [
  'chk_tasks_danger_level',
  'chk_tasks_difficulty_level',
  'chk_tasks_importance_level',
  'chk_tasks_status',
];
const stamp = Date.now().toString(36);
const taskId = (suffix) => `mig307-${stamp}-${suffix}`;
const createdTaskIds = [];

/** Rejoue le fichier sur UNE connexion, comme le runner (variables de session, PREPARE). */
async function runMigration307() {
  const statements = splitSqlStatements(fs.readFileSync(MIGRATION_307, 'utf8'));
  const conn = await pool.getConnection();
  try {
    for (const stmt of statements) await conn.query(stmt);
  } finally {
    conn.release();
  }
}

async function taskCheckConstraints() {
  const rows = await queryAll(
    `SELECT CONSTRAINT_NAME AS name FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND CONSTRAINT_TYPE = 'CHECK'
      ORDER BY CONSTRAINT_NAME`,
  );
  return rows.map((r) => r.name);
}

async function tableCollation(table) {
  const row = await queryOne(
    `SELECT TABLE_COLLATION AS c FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table],
  );
  return row?.c;
}

async function insertTask(suffix, fields = {}) {
  const id = taskId(suffix);
  createdTaskIds.push(id);
  const columns = ['id', 'title', ...Object.keys(fields)];
  const values = [id, `Tâche migration 307 ${suffix}`, ...Object.values(fields)];
  await execute(
    `INSERT INTO tasks (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    values,
  );
  return id;
}

async function dropTaskConstraints() {
  for (const name of await taskCheckConstraints()) {
    if (CONSTRAINTS.includes(name)) await execute(`ALTER TABLE tasks DROP CONSTRAINT ${name}`);
  }
}

before(async () => {
  await initSchema();
});

after(async () => {
  if (createdTaskIds.length) {
    await execute(
      `DELETE FROM tasks WHERE id IN (${createdTaskIds.map(() => '?').join(', ')})`,
      createdTaskIds,
    );
  }
  // Quoi qu'il arrive plus haut : la base de test garde ses contraintes et ses collations.
  await runMigration307();
});

test('état final : collations alignées, quatre contraintes CHECK sur tasks', async () => {
  assert.equal(await tableCollation('schema_version'), 'utf8mb4_unicode_ci');
  assert.equal(await tableCollation('rbac_seeded_permissions'), 'utf8mb4_unicode_ci');
  assert.deepEqual(await taskCheckConstraints(), CONSTRAINTS);
  // La jointure qui levait ERROR 1267 (Illegal mix of collations) passe désormais.
  const row = await queryOne(
    `SELECT COUNT(*) AS n FROM rbac_seeded_permissions s
       JOIN role_permissions rp
         ON rp.role_id = s.role_id AND rp.permission_key = s.permission_key`,
  );
  assert.ok(Number(row.n) >= 0);
});

test('une valeur hors référentiel est refusée, NULL et les valeurs connues passent', async () => {
  await insertTask('ok', {
    status: 'on_hold',
    danger_level: 'very_dangerous',
    difficulty_level: 'very_hard',
    importance_level: 'absolute',
  });
  await insertTask('null', {
    status: null,
    danger_level: null,
    difficulty_level: null,
    importance_level: null,
  });
  for (const [column, value] of [
    ['status', 'todo'],
    ['danger_level', 'nope'],
    ['difficulty_level', 'impossible'],
    ['importance_level', 'urgentissime'],
  ]) {
    await assert.rejects(
      insertTask(`bad-${column}`, { [column]: value }),
      (err) => err.errno === 4025 || err.code === 'ER_CONSTRAINT_FAILED',
      `${column}=${value} aurait dû être refusé`,
    );
  }
});

test('idempotence : deux passages de plus, sans erreur ni contrainte en double', async () => {
  await runMigration307();
  await runMigration307();
  assert.deepEqual(await taskCheckConstraints(), CONSTRAINTS);
  assert.equal(await tableCollation('rbac_seeded_permissions'), 'utf8mb4_unicode_ci');
});

test('base historique : normalisation sans effet visible, garde sur une valeur inconnue', async () => {
  await dropTaskConstraints();
  await execute(
    'ALTER TABLE rbac_seeded_permissions CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci',
  );
  await execute(
    'ALTER TABLE schema_version CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci',
  );
  const spaced = await insertTask('spaced', {
    status: ' In_Progress ',
    danger_level: ' SAFE',
    difficulty_level: '',
    importance_level: 'High ',
  });
  const empty = await insertTask('empty', { status: '', importance_level: '' });
  const french = await insertTask('french', { status: 'terminée' });
  const unknown = await insertTask('unknown', { importance_level: 'urgentissime' });

  await runMigration307();

  assert.equal(await tableCollation('rbac_seeded_permissions'), 'utf8mb4_unicode_ci');
  assert.equal(await tableCollation('schema_version'), 'utf8mb4_unicode_ci');
  const rows = await queryAll(
    `SELECT id, status, danger_level, difficulty_level, importance_level FROM tasks
      WHERE id IN (?, ?, ?, ?)`,
    [spaced, empty, french, unknown],
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  const { id: _spacedId, ...spacedRow } = byId.get(spaced);
  assert.deepEqual(
    { ...spacedRow },
    {
      status: 'in_progress',
      danger_level: 'safe',
      difficulty_level: null,
      importance_level: 'high',
    },
  );
  assert.equal(byId.get(empty).status, 'available');
  assert.equal(byId.get(empty).importance_level, null);
  assert.equal(byId.get(french).status, 'done');
  // Valeur réellement inconnue : jamais écrasée, et la contrainte correspondante attend.
  assert.equal(byId.get(unknown).importance_level, 'urgentissime');
  assert.deepEqual(await taskCheckConstraints(), [
    'chk_tasks_danger_level',
    'chk_tasks_difficulty_level',
    'chk_tasks_status',
  ]);

  // Correction à la main, puis nouveau passage : la dernière contrainte est posée.
  await execute('UPDATE tasks SET importance_level = NULL WHERE id = ?', [unknown]);
  await runMigration307();
  assert.deepEqual(await taskCheckConstraints(), CONSTRAINTS);
});
