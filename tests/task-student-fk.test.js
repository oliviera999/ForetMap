'use strict';

// Intégrité référentielle task_*/users : vérifie que la migration 150 a bien
// (re)posé les FK fk_task_assignments_student et fk_task_logs_student
// (student_id -> users(id) ON DELETE SET NULL), réparant le drift prod où ces
// contraintes avaient disparu du dump. On valide :
//   - la présence des 2 FK avec DELETE_RULE = 'SET NULL' (INFORMATION_SCHEMA) ;
//   - le comportement fonctionnel ON DELETE SET NULL (suppression d'un user) ;
//   - l'idempotence de la logique de réparation (rejeu sans erreur).

require('./helpers/setup');
require('dotenv').config();
const { describe, it, before } = require('node:test');
const assert = require('node:assert');

const { initSchema, queryOne, queryAll, execute } = require('../database');

before(async () => {
  await initSchema();
});

describe('Intégrité référentielle task_*/users (FK student)', () => {
  it("expose fk_task_assignments_student avec DELETE_RULE = 'SET NULL'", async () => {
    const rc = await queryOne(
      `SELECT rc.DELETE_RULE, kcu.REFERENCED_TABLE_NAME, kcu.COLUMN_NAME
         FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
         JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
           ON kcu.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA
          AND kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
        WHERE rc.CONSTRAINT_SCHEMA = DATABASE()
          AND rc.TABLE_NAME = 'task_assignments'
          AND rc.CONSTRAINT_NAME = 'fk_task_assignments_student'
        LIMIT 1`,
    );
    assert.ok(rc, 'FK fk_task_assignments_student absente');
    assert.strictEqual(rc.DELETE_RULE, 'SET NULL');
    assert.strictEqual(rc.REFERENCED_TABLE_NAME, 'users');
    assert.strictEqual(rc.COLUMN_NAME, 'student_id');
  });

  it("expose fk_task_logs_student avec DELETE_RULE = 'SET NULL'", async () => {
    const rc = await queryOne(
      `SELECT rc.DELETE_RULE, kcu.REFERENCED_TABLE_NAME, kcu.COLUMN_NAME
         FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
         JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
           ON kcu.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA
          AND kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
        WHERE rc.CONSTRAINT_SCHEMA = DATABASE()
          AND rc.TABLE_NAME = 'task_logs'
          AND rc.CONSTRAINT_NAME = 'fk_task_logs_student'
        LIMIT 1`,
    );
    assert.ok(rc, 'FK fk_task_logs_student absente');
    assert.strictEqual(rc.DELETE_RULE, 'SET NULL');
    assert.strictEqual(rc.REFERENCED_TABLE_NAME, 'users');
    assert.strictEqual(rc.COLUMN_NAME, 'student_id');
  });

  it('dispose d’un index sur la colonne référençante student_id (pré-requis InnoDB)', async () => {
    for (const table of ['task_assignments', 'task_logs']) {
      const idx = await queryOne(
        `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = ?
            AND COLUMN_NAME = 'student_id'
            AND SEQ_IN_INDEX = 1`,
        [table],
      );
      assert.ok((idx?.c ?? 0) >= 1, `Index sur ${table}.student_id manquant`);
    }
  });

  it('ON DELETE SET NULL : supprimer un user passe task_logs.student_id à NULL', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const userId = `fk-test-user-${suffix}`;
    const taskId = `fk-test-task-${suffix}`;

    // user réel référencé par la FK
    await execute(
      `INSERT INTO users (id, user_type, display_name, auth_provider, is_active)
       VALUES (?, 'student', ?, 'local', 1)`,
      [userId, `FK Test ${suffix}`],
    );
    // task parent (FK fk_task_logs_task)
    await execute(`INSERT INTO tasks (id, title, status) VALUES (?, ?, 'available')`, [
      taskId,
      'Tâche test FK student',
    ]);
    // task_log lié à l'élève
    const ins = await execute(
      `INSERT INTO task_logs (task_id, student_id, student_first_name, student_last_name, created_at)
       VALUES (?, ?, 'FK', 'Test', ?)`,
      [taskId, userId, new Date().toISOString()],
    );
    const logId = ins.insertId;

    const before = await queryOne('SELECT student_id FROM task_logs WHERE id = ?', [logId]);
    assert.strictEqual(before.student_id, userId);

    // suppression de l'élève : la FK doit basculer student_id -> NULL
    await execute('DELETE FROM users WHERE id = ?', [userId]);

    const after = await queryOne('SELECT student_id FROM task_logs WHERE id = ?', [logId]);
    assert.strictEqual(after.student_id, null, 'student_id aurait dû passer à NULL');

    // nettoyage (le task_log part en cascade avec la tâche)
    await execute('DELETE FROM tasks WHERE id = ?', [taskId]);
  });

  it('idempotence : aucun orphelin task_*/student_id ne subsiste après migration', async () => {
    // La migration 150 nettoie les orphelins AVANT de poser les FK ; une fois
    // les contraintes en place, plus aucun student_id ne peut pointer dans le vide.
    const orphansAssign = await queryAll(
      `SELECT ta.id FROM task_assignments ta
        WHERE ta.student_id IS NOT NULL
          AND ta.student_id NOT IN (SELECT id FROM users)`,
    );
    const orphansLogs = await queryAll(
      `SELECT tl.id FROM task_logs tl
        WHERE tl.student_id IS NOT NULL
          AND tl.student_id NOT IN (SELECT id FROM users)`,
    );
    assert.strictEqual(orphansAssign.length, 0, 'orphelins task_assignments.student_id');
    assert.strictEqual(orphansLogs.length, 0, 'orphelins task_logs.student_id');
  });
});
