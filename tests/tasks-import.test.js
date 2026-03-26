require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne } = require('../database');

let teacherToken;

test.before(async () => {
  await initSchema();
  const auth = await request(app)
    .post('/api/auth/teacher')
    .send({ pin: process.env.TEACHER_PIN || '1234' })
    .expect(200);
  teacherToken = auth.body.token;
});

test('GET /api/tasks/import/template retourne un modèle CSV', async () => {
  const res = await request(app)
    .get('/api/tasks/import/template?format=csv')
    .set('Authorization', 'Bearer ' + teacherToken)
    .expect(200);

  assert.ok((res.headers['content-type'] || '').includes('text/csv'));
  assert.ok((res.text || '').includes('Type (project|task);Carte (map_id);Projet'));
  assert.ok((res.text || '').includes('project;foret;Semis printemps'));
  assert.ok((res.text || '').includes('task;foret;Semis printemps;'));
});

test('POST /api/tasks/import dryRun valide un CSV mixte', async () => {
  const unique = Date.now();
  const csv = [
    'Type (project|task);Carte (map_id);Projet;Description projet;Tâche;Description tâche;Date limite (YYYY-MM-DD);Élèves requis;Statut (available|in_progress|done|validated|proposed);Récurrence (weekly|biweekly|monthly)',
    `project;foret;Projet Import ${unique};Description projet;;;;;;;`,
    `task;foret;Projet Import ${unique};;Tâche Import ${unique};Description tâche;2026-05-01;2;available;weekly`,
    'task;foret;;; ;Description invalide;2026-05-01;2;available;weekly',
  ].join('\n');
  const fileDataBase64 = Buffer.from(csv, 'utf8').toString('base64');

  const res = await request(app)
    .post('/api/tasks/import')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      fileName: 'tasks-projects.csv',
      fileDataBase64,
      dryRun: true,
    })
    .expect(200);

  assert.ok(res.body.report);
  assert.strictEqual(res.body.report.totals.received, 3);
  assert.strictEqual(res.body.report.totals.valid, 2);
  assert.strictEqual(res.body.report.totals.created_projects, 0);
  assert.strictEqual(res.body.report.totals.created_tasks, 0);
  assert.strictEqual(res.body.report.totals.skipped_invalid, 1);
  assert.ok(Array.isArray(res.body.report.errors));
  assert.ok(res.body.report.errors.length >= 1);
});

test('POST /api/tasks/import crée un projet et sa tâche', async () => {
  const unique = Date.now();
  const projectTitle = `Projet Réel ${unique}`;
  const taskTitle = `Tâche Réelle ${unique}`;
  const csv = [
    'Type (project|task);Carte (map_id);Projet;Description projet;Tâche;Description tâche;Date limite (YYYY-MM-DD);Élèves requis;Statut (available|in_progress|done|validated|proposed);Récurrence (weekly|biweekly|monthly)',
    `project;foret;${projectTitle};Description réelle;;;;;;;`,
    `task;foret;${projectTitle};;${taskTitle};Description tâche réelle;2026-05-07;3;available;biweekly`,
  ].join('\n');
  const fileDataBase64 = Buffer.from(csv, 'utf8').toString('base64');

  const res = await request(app)
    .post('/api/tasks/import')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      fileName: 'tasks-projects.csv',
      fileDataBase64,
      dryRun: false,
    })
    .expect(200);

  assert.strictEqual(res.body.report.totals.created_projects, 1);
  assert.strictEqual(res.body.report.totals.created_tasks, 1);

  const project = await queryOne(
    'SELECT * FROM task_projects WHERE map_id = ? AND title = ?',
    ['foret', projectTitle]
  );
  assert.ok(project);

  const task = await queryOne(
    'SELECT * FROM tasks WHERE title = ? AND project_id = ?',
    [taskTitle, project.id]
  );
  assert.ok(task);
  assert.strictEqual(task.map_id, 'foret');
  assert.strictEqual(Number(task.required_students), 3);
  assert.strictEqual(String(task.recurrence || ''), 'biweekly');
});
