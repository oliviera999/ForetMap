'use strict';

// Tests de non-régression du lot « audit général du code » :
// validation avant écriture (tutoriels, réglages), transactions tâches, cycles de groupes,
// géométrie de zones, zone d'observation inexistante, changement de carte d'un projet.
require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');

let teacherToken;

test.before(async () => {
  await initSchema();
  teacherToken = await ensureAdminTeacherAuthToken({ elevated: true });
});

test.beforeEach(async () => {
  teacherToken = await ensureAdminTeacherAuthToken({ elevated: true });
});

test('POST /api/tutorials : zone inconnue → 400 SANS créer de tutoriel orphelin', async () => {
  const title = `Tuto audit orphelin ${Date.now()}`;
  const res = await request(app)
    .post('/api/tutorials')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({
      title,
      type: 'html',
      html_content: '<p>contenu</p>',
      zone_ids: ['zone-inexistante-audit'],
    });
  assert.strictEqual(res.status, 400);
  const orphan = await queryOne('SELECT id FROM tutorials WHERE title = ? LIMIT 1', [title]);
  assert.strictEqual(
    orphan,
    undefined,
    'aucun tutoriel ne doit être créé quand la validation échoue',
  );
});

test('PUT /api/tasks/:id : titre vide explicite → 400 « Titre requis »', async () => {
  const created = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ title: 'Tâche audit titre', required_students: 1 })
    .expect(201);
  const putEmpty = await request(app)
    .put(`/api/tasks/${created.body.id}`)
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ title: '   ' });
  assert.strictEqual(putEmpty.status, 400);
  assert.strictEqual(putEmpty.body.error, 'Titre requis');
  const row = await queryOne('SELECT title FROM tasks WHERE id = ?', [created.body.id]);
  assert.strictEqual(row.title, 'Tâche audit titre');
});

test('PATCH /api/groups/:id : parenté circulaire → 400', async () => {
  const stamp = Date.now();
  const a = await request(app)
    .post('/api/groups')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ name: `Groupe cycle A ${stamp}`, slug: `cycle-a-${stamp}`, kind: 'class' })
    .expect(201);
  const b = await request(app)
    .post('/api/groups')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({
      name: `Groupe cycle B ${stamp}`,
      slug: `cycle-b-${stamp}`,
      kind: 'team',
      parent_group_id: a.body.id,
    })
    .expect(201);
  const cycle = await request(app)
    .patch(`/api/groups/${a.body.id}`)
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ parent_group_id: b.body.id });
  assert.strictEqual(cycle.status, 400);
  assert.match(String(cycle.body.error || ''), /circulaire/i);
});

test('POST /api/zones : points non tableau (chaîne) → 400 ; polygone valide → 201', async () => {
  const bad = await request(app)
    .post('/api/zones')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ name: 'Zone audit points', points: 'abc' });
  assert.strictEqual(bad.status, 400);

  const badItems = await request(app)
    .post('/api/zones')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ name: 'Zone audit points', points: [{ xp: 1, yp: 1 }, { xp: 2 }, { xp: 3, yp: 3 }] });
  assert.strictEqual(badItems.status, 400);

  const ok = await request(app)
    .post('/api/zones')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({
      name: `Zone audit valide ${Date.now()}`,
      points: [
        { xp: 10, yp: 10 },
        { xp: 20, yp: 10 },
        { xp: 15, yp: 20 },
      ],
    });
  assert.strictEqual(ok.status, 201);

  const putBad = await request(app)
    .put(`/api/zones/${ok.body.id}`)
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ points: 'zzz' });
  assert.strictEqual(putBad.status, 400);
});

test('POST /api/observations : zone_id inconnu → 400 « Zone introuvable » (pas 500)', async () => {
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Audit', lastName: `Obs${Date.now()}`, password: 'pass1234' })
    .expect(201);
  const res = await request(app)
    .post('/api/observations')
    .set('Authorization', `Bearer ${reg.body.authToken}`)
    .send({
      studentId: reg.body.id,
      content: 'Observation zone fantôme',
      zone_id: 'zone-fantome-audit',
    });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.error, 'Zone introuvable');
});

test('PUT /api/task-projects/:id : changement de carte refusé si des tâches restent sur l’ancienne', async () => {
  const stamp = Date.now();
  const mapId = `audit-map-${String(stamp).slice(-8)}`;
  await request(app)
    .post('/api/settings/admin/maps')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ id: mapId, label: `Carte audit ${stamp}` })
    .expect(201);

  const defaultMap = await queryOne('SELECT id FROM maps ORDER BY sort_order ASC LIMIT 1');
  const project = await request(app)
    .post('/api/task-projects')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ title: `Projet audit carte ${stamp}`, map_id: defaultMap.id })
    .expect(201);

  await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({
      title: `Tâche audit projet ${stamp}`,
      required_students: 1,
      project_id: project.body.id,
      map_id: defaultMap.id,
    })
    .expect(201);

  const denied = await request(app)
    .put(`/api/task-projects/${project.body.id}`)
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ map_id: mapId });
  assert.strictEqual(denied.status, 400);
  assert.match(String(denied.body.error || ''), /Impossible de changer la carte/);

  // Sans tâche liée, le changement de carte reste permis.
  const emptyProject = await request(app)
    .post('/api/task-projects')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ title: `Projet audit vide ${stamp}`, map_id: defaultMap.id })
    .expect(201);
  await request(app)
    .put(`/api/task-projects/${emptyProject.body.id}`)
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ map_id: mapId })
    .expect(200);
});

test('PUT /api/settings/admin/:key : clé inconnue → 400 sans persistance', async () => {
  const res = await request(app)
    .put('/api/settings/admin/cle.inconnue.audit')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ value: true });
  assert.strictEqual(res.status, 400);
  const row = await queryOne('SELECT `key` FROM app_settings WHERE `key` = ? LIMIT 1', [
    'cle.inconnue.audit',
  ]);
  assert.strictEqual(row, undefined);
});
