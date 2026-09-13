'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');

const stamp = Date.now();
const PNG_BASE64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let studentToken = '';
let studentId = null;
let teacherToken = '';
let plantId = null;

before(async () => {
  await initSchema();
  teacherToken = await ensureAdminTeacherAuthToken({ elevated: true });

  const reg = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Journal', lastName: `User${stamp}`, password: 'pwd12345' })
    .expect(201);
  studentId = reg.body.id;
  studentToken = reg.body.authToken;
  const role = await queryOne("SELECT id FROM roles WHERE slug = 'eleve_novice' LIMIT 1");
  if (role?.id) {
    await execute(
      `INSERT INTO user_roles (user_type, user_id, role_id, is_primary)
       VALUES ('student', ?, ?, 1)
       ON DUPLICATE KEY UPDATE is_primary = 1`,
      [studentId, role.id],
    );
  }

  // Observation héritée posée AVANT toute lecture du carnet : la reprise
  // (`migrateObservationLogsOnce`) est mémoïsée par processus, elle ne repasse pas après coup.
  await execute(
    'INSERT INTO observation_logs (student_id, zone_id, content, created_at) VALUES (?, NULL, ?, ?)',
    [studentId, `Observation héritée ${stamp}`, new Date(Date.now() - 3600_000).toISOString()],
  );

  const plant = await queryOne('SELECT id FROM plants ORDER BY id ASC LIMIT 1');
  plantId = plant?.id || null;
  if (!plantId) {
    const ins = await execute(
      `INSERT INTO plants (name, created_at, updated_at) VALUES (?, NOW(), NOW())`,
      [`Plante journal ${stamp}`],
    );
    plantId = ins.insertId;
  }
});

test('GET /api/user-journal/me — carnet vide au départ', async () => {
  const res = await request(app)
    .get('/api/user-journal/me')
    .set('Authorization', `Bearer ${studentToken}`)
    .expect(200);
  assert.ok(Array.isArray(res.body.articles));
  assert.ok(Array.isArray(res.body.imports));
  assert.ok(res.body.limits);
});

test('POST /me/articles — crée un article puis mise à jour', async () => {
  const created = await request(app)
    .post('/api/user-journal/me/articles')
    .set('Authorization', `Bearer ${studentToken}`)
    .send({ title: 'Note terrain', bodyMarkdown: '## Observé\n\nBeau soleil.' })
    .expect(201);
  assert.ok(created.body.article.id);
  assert.strictEqual(created.body.article.title, 'Note terrain');

  const updated = await request(app)
    .put(`/api/user-journal/me/articles/${created.body.article.id}`)
    .set('Authorization', `Bearer ${studentToken}`)
    .send({ title: 'Note terrain 2', bodyMarkdown: 'Texte enrichi.' })
    .expect(200);
  assert.strictEqual(updated.body.article.title, 'Note terrain 2');
});

test('POST assets — ajoute une illustration', async () => {
  const created = await request(app)
    .post('/api/user-journal/me/articles')
    .set('Authorization', `Bearer ${studentToken}`)
    .send({ bodyMarkdown: '' })
    .expect(201);
  const id = created.body.article.id;
  const asset = await request(app)
    .post(`/api/user-journal/me/articles/${id}/assets`)
    .set('Authorization', `Bearer ${studentToken}`)
    .send({ imageData: PNG_BASE64 })
    .expect(201);
  assert.ok(asset.body.asset.url);
  assert.ok(asset.body.usage.assetCount >= 1);
});

test('POST /me/imports — 403 sans appris, 201 après observation espèce', async () => {
  await request(app)
    .post('/api/user-journal/me/imports')
    .set('Authorization', `Bearer ${studentToken}`)
    .send({ resourceType: 'plant', resourceRef: String(plantId), title: 'Espèce test' })
    .expect(403);

  await request(app)
    .post(`/api/plants/${plantId}/acknowledge-discovery`)
    .set('Authorization', `Bearer ${studentToken}`)
    .send({ confirm: true })
    .expect(200);

  const imp = await request(app)
    .post('/api/user-journal/me/imports')
    .set('Authorization', `Bearer ${studentToken}`)
    .send({ resourceType: 'plant', resourceRef: String(plantId), title: 'Espèce test' })
    .expect(201);
  assert.strictEqual(imp.body.import.resourceType, 'plant');

  const refs = await request(app)
    .get('/api/user-journal/me/imports/refs')
    .set('Authorization', `Bearer ${studentToken}`)
    .expect(200);
  assert.ok(
    refs.body.refs.some(
      (r) => r.resourceType === 'plant' && String(r.resourceRef) === String(plantId),
    ),
  );
});

test('pin article + lecture staff', async () => {
  const created = await request(app)
    .post('/api/user-journal/me/articles')
    .set('Authorization', `Bearer ${studentToken}`)
    .send({ title: 'À épingler', bodyMarkdown: 'x' })
    .expect(201);
  const id = created.body.article.id;
  await request(app)
    .put(`/api/user-journal/me/articles/${id}/pin`)
    .set('Authorization', `Bearer ${studentToken}`)
    .send({ pinned: true })
    .expect(200);

  const staff = await request(app)
    .get(`/api/user-journal/users/${studentId}`)
    .set('Authorization', `Bearer ${teacherToken}`)
    .expect(200);
  assert.ok(staff.body.articles.some((a) => a.id === id && a.pinned));
});

test('DELETE article', async () => {
  const created = await request(app)
    .post('/api/user-journal/me/articles')
    .set('Authorization', `Bearer ${studentToken}`)
    .send({ bodyMarkdown: 'à supprimer' })
    .expect(201);
  await request(app)
    .delete(`/api/user-journal/me/articles/${created.body.article.id}`)
    .set('Authorization', `Bearer ${studentToken}`)
    .expect(200);
});

/**
 * `observation_logs.created_at` est un `VARCHAR(32)` portant de l'ISO-8601 UTC (`…Z`), la
 * cible `user_journal_articles.created_at` un vrai `DATETIME`. Passer la chaîne telle quelle
 * faisait échouer l'INSERT en `ER_TRUNCATED_WRONG_VALUE` : `GET /api/user-journal/me`
 * répondait **500** dès qu'une observation restait à reprendre — invisible tant qu'aucun test
 * n'en laissait traîner une, et donc tombé seulement dans la suite complète.
 */
test('reprise : une observation héritée horodatée en ISO-8601 UTC devient un article', async () => {
  const res = await request(app)
    .get('/api/user-journal/me')
    .set('Authorization', `Bearer ${studentToken}`)
    .expect(200);

  assert.ok(
    res.body.articles.some((a) => String(a.bodyMarkdown || '').includes(`héritée ${stamp}`)),
    'l’observation héritée doit avoir été reprise en article',
  );
});

test('legacyTimestampToDate : ISO-8601 UTC, forme héritée locale, valeurs illisibles', () => {
  const { legacyTimestampToDate } = require('../lib/fmUserJournal');
  assert.strictEqual(
    legacyTimestampToDate('2026-09-13T12:37:27.071Z').toISOString(),
    '2026-09-13T12:37:27.071Z',
  );
  // Forme héritée sans fuseau : écrite en heure locale, relue en heure locale.
  assert.strictEqual(legacyTimestampToDate('2026-04-05 18:04:00').getHours(), 18);
  // Rien d'exploitable ne doit bloquer toute la reprise : on retombe sur maintenant.
  for (const invalide of ['pas-une-date', '', null, undefined, new Date('x')]) {
    const d = legacyTimestampToDate(invalide);
    assert.ok(d instanceof Date && !Number.isNaN(d.getTime()));
  }
});
