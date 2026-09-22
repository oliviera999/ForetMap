require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { initDatabase, initSchema, execute, queryOne } = require('../database');
const { app } = require('../server');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { addStudentToN3beurTestGroup, setStudentPrimaryRole } = require('./helpers/studentRoles');

/**
 * Visibilité des blocs de `GET /api/stats/me/:userId` selon le statut n3beur.
 *
 * Un compte hors groupe n3 (visiteur, personnel, encadrant) n'a ni palier n3beur ni tâches :
 * le serveur ne lui renvoie ni `progression` ni `assignments`, mais garde les compteurs
 * biodiversité et tutoriels (docs/reference/foretmap/stats-forum-et-suivi.md).
 */

test.before(async () => {
  await initSchema();
  await initDatabase();
  await ensureRbacBootstrap();
});

/** Inscrit un compte élève (profil `visiteur` par défaut, sans groupe). */
async function registerVisitorStudent(label) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ firstName: label, lastName: `N3Vis${Date.now()}`, password: 'pass1234' })
    .expect(201);
  return res.body;
}

test('GET /api/stats/me/:id — compte hors groupe n3 : ni progression ni activité de tâches', async () => {
  const student = await registerVisitorStudent('Hors');

  const res = await request(app)
    .get(`/api/stats/me/${student.id}`)
    .set('Authorization', `Bearer ${student.authToken}`)
    .expect(200);

  assert.strictEqual(res.body.is_n3beur, false);
  assert.strictEqual(res.body.progression, null);
  assert.deepStrictEqual(res.body.assignments, []);
  assert.strictEqual(res.body.stats.done, 0);
  assert.strictEqual(res.body.stats.total, 0);
  // Le volet biodiversité & tutoriels reste servi.
  assert.strictEqual(typeof res.body.stats.plant_species_observed, 'number');
  assert.strictEqual(typeof res.body.stats.plant_observation_events, 'number');
  assert.strictEqual(typeof res.body.stats.tutorials_read, 'number');
});

test('GET /api/stats/me/:id — compte hors groupe n3 : biodiversité et tutoriels comptés', async () => {
  const student = await registerVisitorStudent('Biodiv');
  const plant = await queryOne('SELECT id FROM plants ORDER BY id ASC LIMIT 1');
  const tutorial = await queryOne('SELECT id FROM tutorials ORDER BY id ASC LIMIT 1');
  assert.ok(plant?.id, 'au moins une fiche plants en base de test');
  assert.ok(tutorial?.id, 'au moins un tutoriel en base de test');
  const ts = new Date();
  await execute(
    'INSERT INTO user_plant_observation_events (user_id, plant_id, observed_at) VALUES (?, ?, ?)',
    [student.id, Number(plant.id), ts],
  );
  await execute(
    `INSERT INTO user_tutorial_reads (user_id, tutorial_id, acknowledged_at) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE acknowledged_at = VALUES(acknowledged_at)`,
    [student.id, tutorial.id, ts],
  );

  const res = await request(app)
    .get(`/api/stats/me/${student.id}`)
    .set('Authorization', `Bearer ${student.authToken}`)
    .expect(200);

  assert.strictEqual(res.body.is_n3beur, false);
  assert.strictEqual(res.body.stats.plant_species_observed, 1);
  assert.strictEqual(res.body.stats.plant_observation_events, 1);
  assert.strictEqual(res.body.stats.tutorials_read, 1);
});

test('GET /api/stats/me/:id — rattachement à un groupe n3beur : progression rendue visible', async () => {
  const student = await registerVisitorStudent('Rattache');

  const before = await request(app)
    .get(`/api/stats/me/${student.id}`)
    .set('Authorization', `Bearer ${student.authToken}`)
    .expect(200);
  assert.strictEqual(before.body.is_n3beur, false);

  await addStudentToN3beurTestGroup(student.id, 'eleve_novice');

  const after = await request(app)
    .get(`/api/stats/me/${student.id}`)
    .set('Authorization', `Bearer ${student.authToken}`)
    .expect(200);
  assert.strictEqual(after.body.is_n3beur, true);
  assert.ok(after.body.progression);
  assert.ok(Array.isArray(after.body.progression.steps));
  assert.ok(Array.isArray(after.body.assignments));
});

test('GET /api/stats/me/:id — palier n3beur attribué : progression servie', async () => {
  const student = await registerVisitorStudent('Palier');
  await setStudentPrimaryRole(student.id, 'eleve_novice');

  const res = await request(app)
    .get(`/api/stats/me/${student.id}`)
    .set('Authorization', `Bearer ${student.authToken}`)
    .expect(200);

  assert.strictEqual(res.body.is_n3beur, true);
  assert.strictEqual(res.body.progression?.roleSlug, 'eleve_novice');
});

test('GET /api/stats/me/:id — compte d’encadrement : pas de progression n3beur', async () => {
  const token = await ensureAdminTeacherAuthToken({ elevated: true });
  const me = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  const adminId = me.body?.auth?.userId || me.body?.user?.id;
  assert.ok(adminId, 'identifiant du compte admin');

  const res = await request(app)
    .get(`/api/stats/me/${adminId}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  assert.strictEqual(res.body.is_n3beur, false);
  assert.strictEqual(res.body.progression, null);
  assert.deepStrictEqual(res.body.assignments, []);
});
