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

  it('refuse validate / changement de statut sur une tâche archivée (lieux conservés)', async () => {
    const zone = await request(app)
      .post('/api/zones')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        name: `Zone archive validate ${Date.now()}`,
        map_id: 'foret',
        points: [
          { xp: 10, yp: 10 },
          { xp: 20, yp: 10 },
          { xp: 20, yp: 20 },
        ],
      })
      .expect(201);

    const task = await createTask({
      title: `Tâche archive validate ${Date.now()}`,
      required_students: 1,
      map_id: 'foret',
      zone_ids: [zone.body.id],
    });
    const zonesBefore = await queryOne('SELECT COUNT(*) AS n FROM task_zones WHERE task_id = ?', [
      task.id,
    ]);
    assert.ok(Number(zonesBefore.n) >= 1, 'tâche liée à une zone avant archivage');

    await request(app)
      .post(`/api/tasks/${task.id}/archive`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);

    await request(app)
      .post(`/api/tasks/${task.id}/validate`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(409);

    await request(app)
      .put(`/api/tasks/${task.id}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ status: 'validated' })
      .expect(409);

    const zonesAfter = await queryOne('SELECT COUNT(*) AS n FROM task_zones WHERE task_id = ?', [
      task.id,
    ]);
    assert.strictEqual(
      Number(zonesAfter.n),
      Number(zonesBefore.n),
      'les liaisons zone doivent rester intactes après refus',
    );
    const row = await queryOne('SELECT status, archived_at FROM tasks WHERE id = ?', [task.id]);
    assert.ok(row.archived_at, 'reste archivée');
    assert.notStrictEqual(row.status, 'validated');
  });

  it('changer le projet d’une tâche archivée cascadée évite la résurrection croisée', async () => {
    const projectA = await createProject({
      map_id: 'foret',
      title: `Projet A croisé ${Date.now()}`,
    });
    const projectB = await createProject({
      map_id: 'foret',
      title: `Projet B croisé ${Date.now()}`,
    });
    const task = await createTask({
      title: `Tâche croisée ${Date.now()}`,
      required_students: 1,
      map_id: 'foret',
      project_id: projectA.id,
    });

    await request(app)
      .post(`/api/task-projects/${projectA.id}/archive`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);

    const cascaded = await queryOne(
      'SELECT archived_at, archived_via_project, project_id FROM tasks WHERE id = ?',
      [task.id],
    );
    assert.ok(cascaded.archived_at);
    assert.ok(Number(cascaded.archived_via_project) === 1);

    // Édition en vue archives : rattachement au projet B actif.
    await request(app)
      .put(`/api/tasks/${task.id}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ project_id: projectB.id, map_id: 'foret', title: task.title })
      .expect(200);

    const moved = await queryOne(
      'SELECT archived_at, archived_via_project, project_id FROM tasks WHERE id = ?',
      [task.id],
    );
    assert.ok(moved.archived_at, 'reste archivée');
    assert.strictEqual(String(moved.project_id), String(projectB.id));
    assert.strictEqual(
      Number(moved.archived_via_project),
      0,
      'marqueur cascade effacé après changement de projet',
    );

    await request(app)
      .post(`/api/task-projects/${projectB.id}/archive`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
    await request(app)
      .post(`/api/task-projects/${projectB.id}/unarchive`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);

    const after = await queryOne('SELECT archived_at FROM tasks WHERE id = ?', [task.id]);
    assert.ok(
      after.archived_at,
      'ne doit pas être ressuscitée par le désarchivage du nouveau projet',
    );
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
