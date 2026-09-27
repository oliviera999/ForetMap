'use strict';

// Service des tâches (`lib/tasks/taskService.js`, piste B, étape B5) appelé sans Express : les
// refus métier sont des `TaskRuleError` (statut HTTP + message), que la route traduit en
// `{ error }`. Le comportement HTTP complet est figé par `tasks-put-characterization.test.js`.

require('./helpers/setup');
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { initSchema, execute } = require('../database');
const { ensureRbacBootstrap } = require('../lib/rbac');
const {
  TaskRuleError,
  MAX_TASK_REFERENTS,
  updateTask,
  normalizeTaskRecurrenceInput,
  validateReferentUserIds,
} = require('../lib/tasks/taskService');

before(async () => {
  await initSchema();
  await ensureRbacBootstrap();
});

describe('taskService — règles pures', () => {
  it('normalizeTaskRecurrenceInput : liste blanche, vide → null', () => {
    assert.deepEqual(normalizeTaskRecurrenceInput(undefined), { value: null });
    assert.deepEqual(normalizeTaskRecurrenceInput(''), { value: null });
    assert.deepEqual(normalizeTaskRecurrenceInput('   '), { value: null });
    assert.deepEqual(normalizeTaskRecurrenceInput(' Weekly '), { value: 'weekly' });
    assert.deepEqual(normalizeTaskRecurrenceInput('biweekly'), { value: 'biweekly' });
    assert.deepEqual(normalizeTaskRecurrenceInput('daily'), {
      error: 'Récurrence invalide (weekly, biweekly ou monthly)',
    });
  });

  it('validateReferentUserIds : plafond vérifié avant toute lecture', async () => {
    const ids = Array.from({ length: MAX_TASK_REFERENTS + 1 }, (_, i) => `r${i}`);
    assert.deepEqual(await validateReferentUserIds(ids), {
      error: `Au plus ${MAX_TASK_REFERENTS} référents par tâche`,
    });
    assert.deepEqual(await validateReferentUserIds([]), { userIds: [] });
  });
});

describe('taskService — updateTask sans Express', () => {
  it('tâche inconnue → TaskRuleError 404', async () => {
    await assert.rejects(
      updateTask({ taskId: 'tache-inconnue-service', body: {}, auth: null }),
      (err) =>
        err instanceof TaskRuleError && err.status === 404 && err.message === 'Tâche introuvable',
    );
  });

  it('tâche archivée → 409 ; appelant anonyme → 403', async () => {
    const archived = `svc-arch-${Date.now()}`;
    const open = `svc-open-${Date.now()}`;
    await execute(
      "INSERT INTO tasks (id, title, description, status, archived_at, created_at) VALUES (?, 'Archivée', '', 'available', NOW(), NOW())",
      [archived],
    );
    await execute(
      "INSERT INTO tasks (id, title, description, status, created_at) VALUES (?, 'Ouverte', '', 'available', NOW())",
      [open],
    );
    await assert.rejects(
      updateTask({ taskId: archived, body: {}, auth: null }),
      (err) => err instanceof TaskRuleError && err.status === 409,
    );
    await assert.rejects(
      updateTask({ taskId: open, body: { title: 'x' }, auth: null }),
      (err) => err instanceof TaskRuleError && err.status === 403 && err.message === 'Accès refusé',
    );
  });
});
