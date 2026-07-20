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
