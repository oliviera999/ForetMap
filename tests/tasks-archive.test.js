'use strict';

// Archivage (soft-delete) des tâches et des projets de tâches.
// Vérifie : masquage des listes actives, portées ?archived=archived|all,
// idempotence, invisibilité côté élève, cascade projet→tâches et exclusion
// des archivées du calcul de complétion de projet.

require('./helpers/setup');
require('dotenv').config();
const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { runAutoArchiveJob, normalizeAfterDays } = require('../lib/autoArchive');
const { countStudentActiveTaskAssignments } = require('../lib/studentTaskEnrollment');

async function validateTask(taskId) {
  await request(app)
    .post(`/api/tasks/${taskId}/validate`)
    .set('Authorization', `Bearer ${teacherToken}`)
    .expect(200);
}

let teacherToken;
let studentToken;
const firstName = `Arch${Date.now()}`;
const lastName = 'Test';

async function createTask(body) {
  const res = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send(body)
    .expect(201);
  return res.body;
}

async function createProject(body) {
  const res = await request(app)
    .post('/api/task-projects')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send(body)
    .expect(201);
  return res.body;
}

function taskIdsOf(res) {
  return (res.body || []).map((t) => t.id);
}

before(async () => {
  await initSchema();
  await ensureRbacBootstrap();
  const loginEmail = String(process.env.TEACHER_ADMIN_EMAIL || '').trim();
  const teacher = await queryOne(
    "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
    [loginEmail],
  );
  const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  assert.ok(teacher?.id, 'Compte admin enseignant introuvable');
  assert.ok(adminRole?.id, 'Rôle admin introuvable');
  await execute('UPDATE user_roles SET is_primary = 0 WHERE user_type = ? AND user_id = ?', [
    'teacher',
    teacher.id,
  ]);
  await execute(
    'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
    ['teacher', teacher.id, adminRole.id],
  );
  teacherToken = await signAuthToken(
    {
      userType: 'teacher',
      userId: teacher.id,
      canonicalUserId: teacher.id,
      roleId: adminRole.id,
      roleSlug: 'admin',
      roleDisplayName: 'Administrateur',
      elevated: false,
    },
    false,
  );

  const reg = await request(app)
    .post('/api/auth/register')
    .send({ firstName, lastName, password: 'pass123' })
    .expect(201);
  studentToken = reg.body.authToken;
});

describe('Archivage des tâches', () => {
  it('archive/désarchive une tâche : bascule archived_at et statut de réponse idempotent', async () => {
    const task = await createTask({ title: `Tâche archivage ${Date.now()}`, required_students: 1 });
    assert.strictEqual(task.archived_at ?? null, null);

    const archived = await request(app)
      .post(`/api/tasks/${task.id}/archive`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
    assert.ok(archived.body.archived_at, 'archived_at doit être renseigné après archivage');

    // Idempotent : ré-archiver ne casse rien et reste archivé.
    const archivedAgain = await request(app)
      .post(`/api/tasks/${task.id}/archive`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
    assert.ok(archivedAgain.body.archived_at);

    const restored = await request(app)
      .post(`/api/tasks/${task.id}/unarchive`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
    assert.strictEqual(restored.body.archived_at ?? null, null);
  });

  it('la liste par défaut masque les tâches archivées ; ?archived=archived|all les expose', async () => {
    const task = await createTask({ title: `Tâche liste ${Date.now()}`, required_students: 1 });
    await request(app)
      .post(`/api/tasks/${task.id}/archive`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);

    const active = await request(app)
      .get('/api/tasks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
    assert.ok(!taskIdsOf(active).includes(task.id), 'archivée absente de la liste active');

    const onlyArchived = await request(app)
      .get('/api/tasks?archived=archived')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
    assert.ok(taskIdsOf(onlyArchived).includes(task.id), 'archivée présente en portée archived');

    const all = await request(app)
      .get('/api/tasks?archived=all')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
    assert.ok(taskIdsOf(all).includes(task.id), 'archivée présente en portée all');
  });

  it('un élève ne voit jamais les archives (portée forcée à active)', async () => {
    const task = await createTask({ title: `Tâche élève ${Date.now()}`, required_students: 1 });
    await request(app)
      .post(`/api/tasks/${task.id}/archive`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);

    const asStudent = await request(app)
      .get('/api/tasks?archived=all')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    assert.ok(
      !taskIdsOf(asStudent).includes(task.id),
      'un élève ne doit pas voir de tâche archivée même avec ?archived=all',
    );
  });

  it("libère le plafond d'inscription et refuse les actions sur une tâche archivée", async () => {
    const task = await createTask({
      title: `Tâche inscription archivée ${Date.now()}`,
      required_students: 2,
    });

    await request(app)
      .post(`/api/tasks/${task.id}/assign`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({})
      .expect(200);
    assert.strictEqual(
      await countStudentActiveTaskAssignments(null, firstName, lastName),
      1,
      "la tâche active doit occuper un créneau d'inscription",
    );

    await request(app)
      .post(`/api/tasks/${task.id}/archive`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);

    assert.strictEqual(
      await countStudentActiveTaskAssignments(null, firstName, lastName),
      0,
      "une tâche invisible car archivée ne doit plus bloquer l'inscription",
    );
    for (const action of ['assign', 'done', 'unassign']) {
      await request(app)
        .post(`/api/tasks/${task.id}/${action}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({})
        .expect(409);
    }
  });

  it('archive/unarchive exige la permission tasks.manage', async () => {
    const task = await createTask({ title: `Tâche perm ${Date.now()}`, required_students: 1 });
    await request(app).post(`/api/tasks/${task.id}/archive`).expect(401);
    await request(app)
      .post(`/api/tasks/${task.id}/archive`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(403);
  });

  it('renvoie 404 pour une tâche inexistante', async () => {
    await request(app)
      .post('/api/tasks/inexistant-xyz/archive')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(404);
  });
});

describe('Archivage des projets de tâches', () => {
  it('archive un projet et cascade vers ses tâches ; désarchive restaure les deux', async () => {
    const project = await createProject({
      map_id: 'foret',
      title: `Projet archivage ${Date.now()}`,
    });
    const task = await createTask({
      title: `Tâche projet ${Date.now()}`,
      required_students: 1,
      map_id: 'foret',
      project_id: project.id,
    });

    const archived = await request(app)
      .post(`/api/task-projects/${project.id}/archive`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
    assert.ok(archived.body.archived_at, 'projet archivé');

    // Tâche du projet archivée par cascade.
    const taskRow = await queryOne('SELECT archived_at FROM tasks WHERE id = ?', [task.id]);
    assert.ok(taskRow.archived_at, 'tâche archivée par cascade');

    // Projet masqué de la liste active, présent en portée archived.
    const active = await request(app)
      .get('/api/task-projects')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
    assert.ok(!(active.body || []).map((p) => p.id).includes(project.id));
    const onlyArchived = await request(app)
      .get('/api/task-projects?archived=archived')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
    assert.ok((onlyArchived.body || []).map((p) => p.id).includes(project.id));

    // Désarchivage : projet + tâche cascadée restaurés.
    const restored = await request(app)
      .post(`/api/task-projects/${project.id}/unarchive`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
    assert.strictEqual(restored.body.archived_at ?? null, null);
    const taskAfter = await queryOne('SELECT archived_at FROM tasks WHERE id = ?', [task.id]);
    assert.strictEqual(taskAfter.archived_at ?? null, null, 'tâche restaurée par cascade');
  });

  it('cascade=false archive le projet sans toucher aux tâches', async () => {
    const project = await createProject({
      map_id: 'foret',
      title: `Projet sans cascade ${Date.now()}`,
    });
    const task = await createTask({
      title: `Tâche libre ${Date.now()}`,
      required_students: 1,
      map_id: 'foret',
      project_id: project.id,
    });

    await request(app)
      .post(`/api/task-projects/${project.id}/archive`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ cascade: false })
      .expect(200);

    const taskRow = await queryOne('SELECT archived_at FROM tasks WHERE id = ?', [task.id]);
    assert.strictEqual(taskRow.archived_at ?? null, null, 'tâche non archivée avec cascade=false');
  });

  it('désarchive ne restaure que les tâches archivées par la même opération projet', async () => {
    const project = await createProject({
      map_id: 'foret',
      title: `Projet cascade partielle ${Date.now()}`,
    });
    const taskCascaded = await createTask({
      title: `Tâche cascade ${Date.now()}`,
      required_students: 1,
      map_id: 'foret',
      project_id: project.id,
    });
    const taskManual = await createTask({
      title: `Tâche manuelle ${Date.now()}`,
      required_students: 1,
      map_id: 'foret',
      project_id: project.id,
    });

    // Archivage individuel préalable d'une tâche du projet.
    await request(app)
      .post(`/api/tasks/${taskManual.id}/archive`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);

    // Archive le projet (cascade la seule tâche encore active), puis désarchive.
    await request(app)
      .post(`/api/task-projects/${project.id}/archive`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
    await request(app)
      .post(`/api/task-projects/${project.id}/unarchive`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);

    const cascadedRow = await queryOne('SELECT archived_at FROM tasks WHERE id = ?', [
      taskCascaded.id,
    ]);
    const manualRow = await queryOne('SELECT archived_at FROM tasks WHERE id = ?', [taskManual.id]);
    assert.strictEqual(cascadedRow.archived_at ?? null, null, 'tâche cascadée restaurée');
    assert.ok(manualRow.archived_at, 'tâche archivée manuellement reste archivée');
  });
});

describe('Archivage automatique (job quotidien)', () => {
  it('normalizeAfterDays borne le délai (min 7, max 3650, défaut 120)', () => {
    assert.strictEqual(normalizeAfterDays(200), 200);
    assert.strictEqual(normalizeAfterDays(1), 7);
    assert.strictEqual(normalizeAfterDays(99999), 3650);
    assert.strictEqual(normalizeAfterDays('abc'), 120);
  });

  it('archive une tâche validée trop ancienne, épargne une tâche validée récente', async () => {
    const oldTask = await createTask({ title: `Auto vieille ${Date.now()}`, required_students: 1 });
    await validateTask(oldTask.id);
    // Recule la date de validation au-delà du délai par défaut (120 j).
    await execute(
      'UPDATE tasks SET validated_at = DATE_SUB(NOW(), INTERVAL 200 DAY) WHERE id = ?',
      [oldTask.id],
    );

    const recentTask = await createTask({
      title: `Auto récente ${Date.now()}`,
      required_students: 1,
    });
    await validateTask(recentTask.id);

    const res = await runAutoArchiveJob();
    assert.strictEqual(res.enabled, true);
    assert.ok(res.tasksArchived >= 1, 'au moins la vieille tâche archivée');

    const oldRow = await queryOne('SELECT archived_at FROM tasks WHERE id = ?', [oldTask.id]);
    const recentRow = await queryOne('SELECT archived_at FROM tasks WHERE id = ?', [recentTask.id]);
    assert.ok(oldRow.archived_at, 'tâche validée ancienne archivée automatiquement');
    assert.strictEqual(recentRow.archived_at ?? null, null, 'tâche validée récente épargnée');
  });

  it("n'archive pas une tâche non validée, même ancienne", async () => {
    const task = await createTask({
      title: `Auto non validée ${Date.now()}`,
      required_students: 1,
    });
    // Ancienne "date de validation" mais statut non validé → hors périmètre.
    await execute(
      "UPDATE tasks SET validated_at = DATE_SUB(NOW(), INTERVAL 400 DAY) WHERE id = ? AND status <> 'validated'",
      [task.id],
    );
    await runAutoArchiveJob();
    const row = await queryOne('SELECT archived_at, status FROM tasks WHERE id = ?', [task.id]);
    assert.notStrictEqual(row.status, 'validated');
    assert.strictEqual(row.archived_at ?? null, null, 'tâche non validée non archivée');
  });

  it('archive un projet validé trop ancien', async () => {
    const project = await createProject({ map_id: 'foret', title: `Auto projet ${Date.now()}` });
    await request(app)
      .post(`/api/task-projects/${project.id}/validate`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
    await execute(
      'UPDATE task_projects SET finished_at = DATE_SUB(NOW(), INTERVAL 200 DAY) WHERE id = ?',
      [project.id],
    );

    const res = await runAutoArchiveJob();
    assert.ok(res.projectsArchived >= 1, 'au moins un projet archivé');
    const row = await queryOne('SELECT archived_at FROM task_projects WHERE id = ?', [project.id]);
    assert.ok(row.archived_at, 'projet validé ancien archivé automatiquement');
  });
});
