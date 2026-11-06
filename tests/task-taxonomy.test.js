'use strict';

/**
 * Taxonomie des tâches (migration 329) : métier, format, phase de projet, type de projet.
 * Validation (400 sur valeur inconnue), forçage `routine`, phase hors projet, propagation
 * (occurrence récurrente, duplication de tâche et de projet, import), filtres de liste,
 * avancement par phase, auteur de proposition non modifiable par l'API.
 */

require('./helpers/setup');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, queryAll, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { spawnRecurringTaskNow } = require('../lib/recurringTasks');
const { setStudentPrimaryRole } = require('./helpers/studentRoles');
const {
  TASK_CATEGORY_KEYS,
  PROJECT_PHASE_KEYS,
  parseTaxonomyInput,
  computePhaseProgress,
} = require('../lib/shared/taskTaxonomyCore');

let teacherToken;
let savedThresholds = [];
const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function auth(req) {
  return req.set('Authorization', `Bearer ${teacherToken}`);
}

async function createTask(body, expected = 201) {
  return auth(request(app).post('/api/tasks'))
    .send({ title: `Taxo ${unique()}`, required_students: 1, map_id: 'foret', ...body })
    .expect(expected);
}

async function createProject(body = {}) {
  const res = await auth(request(app).post('/api/task-projects'))
    .send({ map_id: 'foret', title: `Projet taxo ${unique()}`, ...body })
    .expect(201);
  return res.body;
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
  savedThresholds = await queryAll(
    "SELECT slug, min_done_tasks FROM roles WHERE slug IN ('eleve_novice', 'eleve_avance', 'eleve_chevronne')",
  );
});

after(async () => {
  for (const row of savedThresholds) {
    await execute('UPDATE roles SET min_done_tasks = ? WHERE slug = ?', [
      row.min_done_tasks,
      row.slug,
    ]);
  }
});

describe('Noyau de taxonomie', () => {
  it('huit métiers, cinq phases ; clé ou libellé acceptés, valeur inconnue en erreur', () => {
    assert.equal(TASK_CATEGORY_KEYS.length, 8);
    assert.deepEqual(
      [...PROJECT_PHASE_KEYS],
      ['concevoir', 'preparer', 'realiser', 'tester', 'transmettre'],
    );
    assert.deepEqual(parseTaxonomyInput('category', 'Électronique et code'), {
      value: 'electronique',
    });
    assert.deepEqual(parseTaxonomyInput('format', 'SÉANCE'), { value: 'seance' });
    assert.deepEqual(parseTaxonomyInput('format', ''), { value: null });
    assert.deepEqual(parseTaxonomyInput('format', undefined), { value: undefined });
    assert.ok(parseTaxonomyInput('category', 'cuisine').error);
  });

  it('avancement par phase : phase courante = première phase non terminée', () => {
    const progress = computePhaseProgress([
      { project_phase: 'concevoir', status: 'validated' },
      { project_phase: 'realiser', status: 'validated' },
      { project_phase: 'realiser', status: 'available' },
      { project_phase: 'transmettre', status: 'available' },
      { project_phase: null, status: 'available' },
    ]);
    assert.equal(progress.currentPhase, 'realiser');
    assert.equal(progress.unphased, 1);
    const preparer = progress.phases.find((p) => p.key === 'preparer');
    assert.deepEqual([preparer.total, preparer.validated], [0, 0]);
    assert.equal(computePhaseProgress([]).currentPhase, null);
  });
});

describe('Règles serveur à l’écriture', () => {
  it('valeur inconnue → 400, jamais un NULL silencieux', async () => {
    const r1 = await createTask({ category: 'cuisine' }, 400);
    assert.match(r1.body.error, /Métier inconnu/);
    const r2 = await createTask({ format: 'marathon' }, 400);
    assert.match(r2.body.error, /Format inconnu/);
    const created = await createTask({ category: 'jardinage', format: 'flash' });
    const r3 = await auth(request(app).put(`/api/tasks/${created.body.id}`))
      .send({ category: 'cuisine' })
      .expect(400);
    assert.match(r3.body.error, /Métier inconnu/);
    const row = await queryOne('SELECT category FROM tasks WHERE id = ?', [created.body.id]);
    assert.equal(row.category, 'jardinage');
  });

  it('libellé accepté, champs facultatifs à l’API', async () => {
    const withLabel = await createTask({ category: 'Soin aux animaux', format: 'Séance' });
    assert.equal(withLabel.body.category, 'animaux');
    assert.equal(withLabel.body.format, 'seance');
    const bare = await createTask({});
    assert.equal(bare.body.category, null);
    assert.equal(bare.body.format, null);
  });

  it('récurrence non nulle ⇒ format routine (création et modification)', async () => {
    const res = await createTask({ recurrence: 'weekly', format: 'flash', category: 'jardinage' });
    assert.equal(res.body.format, 'routine');
    const plain = await createTask({ format: 'seance' });
    const upd = await auth(request(app).put(`/api/tasks/${plain.body.id}`))
      .send({ recurrence: 'monthly' })
      .expect(200);
    assert.equal(upd.body.format, 'routine');
  });

  it('phase refusée hors projet, remise à NULL quand la tâche quitte son projet', async () => {
    const refused = await createTask({ project_phase: 'realiser' }, 400);
    assert.match(refused.body.error, /phase de projet/i);
    const project = await createProject();
    const task = await createTask({ project_id: project.id, project_phase: 'tester' });
    assert.equal(task.body.project_phase, 'tester');
    const invalid = await auth(request(app).put(`/api/tasks/${task.body.id}`))
      .send({ project_phase: 'demolir' })
      .expect(400);
    assert.match(invalid.body.error, /Phase de projet inconnu/);
    const detached = await auth(request(app).put(`/api/tasks/${task.body.id}`))
      .send({ project_id: null })
      .expect(200);
    assert.equal(detached.body.project_phase, null);
  });

  it('proposed_by_user_id n’est ni modifiable ni exposé par l’API', async () => {
    const student = await queryOne("SELECT id FROM users WHERE user_type = 'student' LIMIT 1");
    const task = await createTask({ category: 'entretien' });
    assert.equal(task.body.proposed_by_user_id, undefined);
    await auth(request(app).put(`/api/tasks/${task.body.id}`))
      .send({ proposed_by_user_id: student?.id || 'x', title: 'Titre modifié' })
      .expect(200);
    const row = await queryOne('SELECT proposed_by_user_id FROM tasks WHERE id = ?', [
      task.body.id,
    ]);
    assert.equal(row.proposed_by_user_id, null);
  });

  it('la route de proposition renseigne l’auteur (élève du jeton)', async () => {
    const studentRes = await request(app)
      .post('/api/auth/register')
      .send({ firstName: 'Semeur', lastName: `Idees${Date.now()}`, password: 'pwd1pwd1' })
      .expect(201);
    await execute('UPDATE roles SET min_done_tasks = ? WHERE slug = ?', [1, 'eleve_novice']);
    await execute('UPDATE roles SET min_done_tasks = ? WHERE slug = ?', [0, 'eleve_avance']);
    await execute('UPDATE roles SET min_done_tasks = ? WHERE slug = ?', [9999, 'eleve_chevronne']);
    await setStudentPrimaryRole(studentRes.body.id, 'eleve_avance');
    const zones = await request(app).get('/api/zones').expect(200);
    const res = await request(app)
      .post('/api/tasks/proposals')
      .set('Authorization', `Bearer ${studentRes.body.authToken}`)
      .send({
        title: `Proposition taxo ${unique()}`,
        zone_id: zones.body[0]?.id,
        required_students: 1,
        category: 'jardinage',
        firstName: studentRes.body.first_name,
        lastName: studentRes.body.last_name,
        studentId: studentRes.body.id,
      })
      .expect(201);
    const row = await queryOne('SELECT proposed_by_user_id, category FROM tasks WHERE id = ?', [
      res.body.id,
    ]);
    assert.equal(row.proposed_by_user_id, studentRes.body.id);
    assert.equal(row.category, 'jardinage');
  });
});

describe('Propagation', () => {
  it('occurrence récurrente : métier, phase et auteur copiés, format routine', async () => {
    const project = await createProject();
    const student = await queryOne("SELECT id FROM users WHERE user_type = 'student' LIMIT 1");
    const task = await createTask({
      recurrence: 'weekly',
      category: 'animaux',
      project_id: project.id,
      project_phase: 'realiser',
    });
    await execute(
      "UPDATE tasks SET status = 'validated', validated_at = NOW(), proposed_by_user_id = ? WHERE id = ?",
      [student?.id || null, task.body.id],
    );
    const spawned = await spawnRecurringTaskNow(task.body.id);
    assert.ok(spawned.created, `occurrence non créée : ${spawned.reason}`);
    const copy = await queryOne(
      'SELECT category, format, project_phase, proposed_by_user_id FROM tasks WHERE id = ?',
      [spawned.created],
    );
    assert.deepEqual(
      { ...copy },
      {
        category: 'animaux',
        format: 'routine',
        project_phase: 'realiser',
        proposed_by_user_id: student?.id || null,
      },
    );
  });

  it('duplication d’une tâche : métier, format et phase copiés', async () => {
    const project = await createProject();
    const task = await createTask({
      category: 'bricolage',
      format: 'seance',
      project_id: project.id,
      project_phase: 'preparer',
    });
    const dup = await auth(request(app).post(`/api/tasks/${task.body.id}/duplicate`))
      .send({})
      .expect(201);
    const row = await queryOne('SELECT category, format, project_phase FROM tasks WHERE id = ?', [
      dup.body.id,
    ]);
    assert.deepEqual(
      { ...row },
      { category: 'bricolage', format: 'seance', project_phase: 'preparer' },
    );
  });

  it('projet : type validé, modifiable, copié à la duplication avec les phases', async () => {
    const bad = await auth(request(app).post('/api/task-projects'))
      .send({ map_id: 'foret', title: `Projet ${unique()}`, project_type: 'fusee' })
      .expect(400);
    assert.match(bad.body.error, /Type de projet inconnu/);
    const project = await createProject({ project_type: 'construction' });
    assert.equal(project.project_type, 'construction');
    const upd = await auth(request(app).put(`/api/task-projects/${project.id}`))
      .send({ project_type: 'Événement' })
      .expect(200);
    assert.equal(upd.body.project_type, 'evenement');
    await createTask({
      project_id: project.id,
      project_phase: 'transmettre',
      category: 'communication',
    });
    const dup = await auth(request(app).post(`/api/task-projects/${project.id}/duplicate`))
      .send({})
      .expect(201);
    const newId = dup.body.id || dup.body.project?.id;
    const copied = await queryOne('SELECT project_type FROM task_projects WHERE id = ?', [newId]);
    assert.equal(copied.project_type, 'evenement');
    const tasks = await queryAll('SELECT project_phase, category FROM tasks WHERE project_id = ?', [
      newId,
    ]);
    assert.deepEqual(
      tasks.map((t) => ({ ...t })),
      [{ project_phase: 'transmettre', category: 'communication' }],
    );
  });

  it('import CSV : colonnes Métier, Format, Phase (clés ou libellés)', async () => {
    const id = unique();
    const projectTitle = `Projet import taxo ${id}`;
    const header =
      'Type (project|task);Carte (map_id);Projet;Description projet;Tâche;Description tâche;n3beurs requis;Statut (available|in_progress|done|validated|proposed);Récurrence (weekly|biweekly|monthly);Métier;Format (flash|routine|seance);Phase de projet';
    const csv = [
      header,
      `project;foret;${projectTitle};;;;;;;;;`,
      `task;foret;${projectTitle};;Tâche A ${id};;2;available;;Électronique et code;Séance;Tester`,
      `task;foret;;;Tâche B ${id};;1;available;weekly;jardinage;flash;`,
      `task;foret;;;Tâche C ${id};;1;available;;cuisine;;`,
      `task;foret;;;Tâche D ${id};;1;available;;;;realiser`,
    ].join('\n');
    const res = await auth(request(app).post('/api/tasks/import'))
      .send({
        fileName: 'taxo.csv',
        fileDataBase64: Buffer.from(csv, 'utf8').toString('base64'),
        dryRun: false,
      })
      .expect(200);
    const fields = res.body.report.errors.map((e) => e.field).sort();
    assert.deepEqual(fields, ['category', 'project_phase']);
    const a = await queryOne('SELECT category, format, project_phase FROM tasks WHERE title = ?', [
      `Tâche A ${id}`,
    ]);
    assert.deepEqual(
      { ...a },
      { category: 'electronique', format: 'seance', project_phase: 'tester' },
    );
    const b = await queryOne('SELECT category, format, project_phase FROM tasks WHERE title = ?', [
      `Tâche B ${id}`,
    ]);
    assert.deepEqual({ ...b }, { category: 'jardinage', format: 'routine', project_phase: null });
  });
});

describe('Lecture', () => {
  it('GET /api/tasks : filtres category, format, project_phase (valeurs multiples)', async () => {
    const project = await createProject();
    const a = await createTask({
      category: 'rangement',
      format: 'flash',
      project_id: project.id,
      project_phase: 'preparer',
    });
    const b = await createTask({
      category: 'terrassement',
      format: 'seance',
      project_id: project.id,
      project_phase: 'realiser',
    });
    await createTask({ category: 'jardinage', format: 'flash', project_id: project.id });
    const ids = (res) => res.body.map((t) => t.id).sort();
    const byCat = await auth(
      request(app).get(`/api/tasks?project_id=${project.id}&category=rangement,terrassement`),
    ).expect(200);
    assert.deepEqual(ids(byCat), [a.body.id, b.body.id].sort());
    const byFormat = await auth(
      request(app).get(`/api/tasks?project_id=${project.id}&format=seance`),
    ).expect(200);
    assert.deepEqual(ids(byFormat), [b.body.id]);
    const byPhase = await auth(
      request(app).get(`/api/tasks?project_id=${project.id}&project_phase=preparer`),
    ).expect(200);
    assert.deepEqual(ids(byPhase), [a.body.id]);
    assert.equal(byPhase.body[0].category, 'rangement');
    const bad = await auth(request(app).get('/api/tasks?category=cuisine')).expect(400);
    assert.match(bad.body.error, /Métier inconnu/);
  });

  it('GET /api/task-projects/:id : avancement par phase et phase courante', async () => {
    const project = await createProject({ project_type: 'amenagement' });
    const t1 = await createTask({ project_id: project.id, project_phase: 'concevoir' });
    await createTask({ project_id: project.id, project_phase: 'realiser' });
    await createTask({ project_id: project.id });
    await execute("UPDATE tasks SET status = 'validated', validated_at = NOW() WHERE id = ?", [
      t1.body.id,
    ]);
    const res = await auth(request(app).get(`/api/task-projects/${project.id}`)).expect(200);
    assert.equal(res.body.project_type, 'amenagement');
    assert.equal(res.body.phase_progress.current_phase, 'realiser');
    assert.equal(res.body.phase_progress.without_phase, 1);
    const concevoir = res.body.phase_progress.phases.find((p) => p.key === 'concevoir');
    assert.deepEqual([concevoir.total, concevoir.validated], [1, 1]);
  });
});
