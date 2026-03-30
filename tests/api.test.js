require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const { initDatabase, queryAll, queryOne, execute } = require('../database');
const { app } = require('../server');
const request = require('supertest');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ensureRbacBootstrap } = require('../lib/rbac');

test.before(async () => {
  await initDatabase();
  await ensureRbacBootstrap();
});

async function getAdminAuthToken() {
  const loginEmail = String(process.env.TEACHER_ADMIN_EMAIL || '').trim();
  const teacher = await queryOne(
    "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
    [loginEmail]
  );
  const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  assert.ok(teacher?.id, 'Compte admin enseignant introuvable');
  assert.ok(adminRole?.id, 'Rôle admin introuvable');
  const requiredPermissions = [
    'stats.read.all', 'stats.export',
    'tasks.manage', 'tasks.read.logs',
    'zones.manage', 'visit.manage',
    'plants.manage',
    'admin.settings.read', 'admin.settings.write',
    'admin.roles.manage', 'admin.users.assign_roles',
  ];
  for (const key of requiredPermissions) {
    await execute(
      'INSERT IGNORE INTO permissions (`key`, label, description) VALUES (?, ?, ?)',
      [key, key, 'Permission auto-seed tests']
    );
    await execute(
      'INSERT IGNORE INTO role_permissions (role_id, permission_key, requires_elevation) VALUES (?, ?, 1)',
      [adminRole.id, key]
    );
  }
  if (teacher?.id && adminRole?.id) {
    await execute('UPDATE user_roles SET is_primary = 0 WHERE user_type = ? AND user_id = ?', ['teacher', teacher.id]);
    await execute(
      'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
      ['teacher', teacher.id, adminRole.id]
    );
  }
  return signAuthToken({
    userType: 'teacher',
    userId: teacher?.id || null,
    canonicalUserId: teacher?.id || null,
    roleId: adminRole?.id || null,
    roleSlug: 'admin',
    roleDisplayName: 'Administrateur',
    elevated: false,
  }, false);
}

async function setStudentPrimaryRole(studentId, roleSlug) {
  const role = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [roleSlug]);
  assert.ok(role?.id, `Rôle introuvable: ${roleSlug}`);
  await execute('UPDATE user_roles SET is_primary = 0 WHERE user_type = ? AND user_id = ?', ['student', studentId]);
  await execute(
    'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
    ['student', studentId, role.id]
  );
}

async function allowStudentProposalsAtZeroDone() {
  await execute('UPDATE roles SET min_done_tasks = ? WHERE slug = ?', [1, 'eleve_novice']);
  await execute('UPDATE roles SET min_done_tasks = ? WHERE slug = ?', [0, 'eleve_avance']);
  await execute('UPDATE roles SET min_done_tasks = ? WHERE slug = ?', [9999, 'eleve_chevronne']);
}

// ─── Auth ─────────────────────────────────────────────────────────────────
test('POST /api/auth/register crée un élève et renvoie 201', async () => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Test', lastName: 'Auth' + Date.now(), password: 'pass1234' })
    .expect(201);
  assert.ok(res.body.id);
  assert.strictEqual(res.body.first_name, 'Test');
  assert.strictEqual(res.body.password_hash, undefined);
  assert.ok(['visiteur', 'eleve_novice'].includes(String(res.body?.auth?.roleSlug || '')));
});

test('POST /api/auth/login avec mauvais mot de passe renvoie 401', async () => {
  const last = 'User' + Date.now();
  const email = `badpass_${Date.now()}@example.com`;
  await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'BadPass', lastName: last, email, password: 'good' });
  const res = await request(app)
    .post('/api/auth/login')
    .send({ identifier: email, password: 'wrong' })
    .expect(401);
  assert.ok(res.body.error);
});

test('GET /api/stats/me/:studentId autorise le propriétaire connecté', async () => {
  const studentRes = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Legacy', lastName: 'Stats' + Date.now(), password: 'pass1234' })
    .expect(201);
  const studentId = studentRes.body.id;

  const res = await request(app)
    .get(`/api/stats/me/${studentId}`)
    .set('Authorization', `Bearer ${studentRes.body.authToken}`)
    .expect(200);

  assert.strictEqual(res.body.id, studentId);
  assert.ok(res.body.stats);
});

test('GET /api/stats/me/:studentId synchronise le profil élève selon les seuils configurés', async () => {
  const teacherToken = await getAdminAuthToken();

  await execute('UPDATE roles SET min_done_tasks = ?, emoji = ?, display_order = ? WHERE slug = ?', [0, '🪨', 50, 'eleve_novice']);
  await execute('UPDATE roles SET min_done_tasks = ?, emoji = ?, display_order = ? WHERE slug = ?', [1, '🌿', 40, 'eleve_avance']);
  await execute('UPDATE roles SET min_done_tasks = ?, emoji = ?, display_order = ? WHERE slug = ?', [2, '🏆', 30, 'eleve_chevronne']);

  const studentRes = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Profil', lastName: `Sync${Date.now()}`, password: 'pass1234' })
    .expect(201);
  const { id: studentId, first_name: firstName, last_name: lastName, authToken: studentAuthToken } = studentRes.body;
  await setStudentPrimaryRole(studentId, 'eleve_novice');

  const zones = await request(app).get('/api/zones').expect(200);
  const zoneId = zones.body[0]?.id || 'pg';
  for (let i = 0; i < 2; i += 1) {
    const task = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ title: `Progression profil ${Date.now()}-${i}`, zone_id: zoneId, required_students: 1 })
      .expect(201);
    await request(app)
      .post(`/api/tasks/${task.body.id}/assign`)
      .set('Authorization', `Bearer ${studentAuthToken}`)
      .send({ firstName, lastName, studentId })
      .expect(200);
    await request(app)
      .post(`/api/tasks/${task.body.id}/done`)
      .set('Authorization', `Bearer ${studentAuthToken}`)
      .send({ firstName, lastName, studentId })
      .expect(200);
    await request(app)
      .post(`/api/tasks/${task.body.id}/validate`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
  }

  const stats = await request(app)
    .get(`/api/stats/me/${studentId}`)
    .set('Authorization', `Bearer ${studentRes.body.authToken}`)
    .expect(200);
  assert.strictEqual(stats.body?.progression?.roleSlug, 'eleve_chevronne');

  const role = await queryOne(
    `SELECT r.slug
       FROM user_roles ur
       INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_type = 'student' AND ur.user_id = ? AND ur.is_primary = 1
      LIMIT 1`,
    [studentId]
  );
  assert.strictEqual(role?.slug, 'eleve_chevronne');

  // Remise aux valeurs par défaut.
  await execute('UPDATE roles SET min_done_tasks = ?, emoji = ?, display_order = ? WHERE slug = ?', [0, '🪨', 50, 'eleve_novice']);
  await execute('UPDATE roles SET min_done_tasks = ?, emoji = ?, display_order = ? WHERE slug = ?', [5, '🌿', 40, 'eleve_avance']);
  await execute('UPDATE roles SET min_done_tasks = ?, emoji = ?, display_order = ? WHERE slug = ?', [10, '🏆', 30, 'eleve_chevronne']);
});

test('POST /api/auth/teacher avec mauvais PIN renvoie 401', async () => {
  const res = await request(app)
    .post('/api/auth/teacher')
    .send({ pin: '0000' })
    .expect(401);
  assert.ok(res.body.error);
});

test('POST /api/auth/teacher avec bon PIN et token renvoie 200 et un token', async () => {
  const baseToken = await getAdminAuthToken();
  const res = await request(app)
    .post('/api/auth/teacher')
    .set('Authorization', `Bearer ${baseToken}`)
    .send({ pin: process.env.TEACHER_PIN || '1234' })
    .expect(200);
  assert.ok(res.body.token);
});

test('Forum: le profil visiteur ne peut pas accéder aux sujets', async () => {
  const visitorRes = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Visit', lastName: `Forum${Date.now()}`, password: 'pass1234' })
    .expect(201);
  await setStudentPrimaryRole(visitorRes.body.id, 'visiteur');

  await request(app)
    .get('/api/forum/threads')
    .set('Authorization', `Bearer ${visitorRes.body.authToken}`)
    .expect(403);
});

test('GET /api/tasks/:id/logs refuse le profil visiteur', async () => {
  const teacherToken = await getAdminAuthToken();

  const zones = await request(app).get('/api/zones').expect(200);
  const zoneId = zones.body[0]?.id || 'pg';
  const taskRes = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ title: `Logs privés ${Date.now()}`, zone_id: zoneId, required_students: 1 })
    .expect(201);
  const taskId = taskRes.body.id;

  const studentRes = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Logs', lastName: `Auteur${Date.now()}`, password: 'pass1234' })
    .expect(201);
  await setStudentPrimaryRole(studentRes.body.id, 'eleve_novice');

  await request(app)
    .post(`/api/tasks/${taskId}/assign`)
    .set('Authorization', `Bearer ${studentRes.body.authToken}`)
    .send({ firstName: studentRes.body.first_name, lastName: studentRes.body.last_name, studentId: studentRes.body.id })
    .expect(200);
  await request(app)
    .post(`/api/tasks/${taskId}/done`)
    .set('Authorization', `Bearer ${studentRes.body.authToken}`)
    .send({
      firstName: studentRes.body.first_name,
      lastName: studentRes.body.last_name,
      studentId: studentRes.body.id,
      comment: 'Rapport test visiteur',
    })
    .expect(200);

  const visitorRes = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Visit', lastName: `Logs${Date.now()}`, password: 'pass1234' })
    .expect(201);
  await setStudentPrimaryRole(visitorRes.body.id, 'visiteur');

  await request(app)
    .get(`/api/tasks/${taskId}/logs`)
    .set('Authorization', `Bearer ${visitorRes.body.authToken}`)
    .expect(403);
});

test('GET /api/maps renvoie les cartes configurées', async () => {
  const res = await request(app)
    .get('/api/maps')
    .expect(200);
  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.some(m => m.id === 'foret'));
  assert.ok(res.body.some(m => m.id === 'n3'));
});

// ─── Statuts tâches (assign / unassign) ───────────────────────────────────
test('Assign puis unassign met à jour le statut de la tâche', async () => {
  const token = await getAdminAuthToken();

  const zones = await request(app).get('/api/zones').expect(200);
  const zoneId = zones.body[0]?.id || 'pg';
  const createRes = await request(app)
    .post('/api/tasks')
    .set('Authorization', 'Bearer ' + token)
    .send({ title: 'Tâche test statut', zone_id: zoneId, required_students: 1 })
    .expect(201);
  const taskId = createRes.body.id;

  const studentRes = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Statut', lastName: 'Elève' + Date.now(), password: 'pwd1' })
    .expect(201);
  const { first_name, last_name, id: studentId, authToken: studentAuthToken } = studentRes.body;

  await request(app)
    .post(`/api/tasks/${taskId}/assign`)
    .set('Authorization', 'Bearer ' + studentAuthToken)
    .send({ firstName: first_name, lastName: last_name, studentId })
    .expect(200);
  const assignmentRow = await queryOne(
    'SELECT student_id FROM task_assignments WHERE task_id = ? AND (student_id = ? OR (student_first_name = ? AND student_last_name = ?)) LIMIT 1',
    [taskId, studentId, first_name, last_name]
  );
  assert.strictEqual(assignmentRow?.student_id, studentId);
  const afterAssign = await request(app).get(`/api/tasks/${taskId}`).expect(200);
  assert.strictEqual(afterAssign.body.status, 'in_progress');

  await request(app)
    .post(`/api/tasks/${taskId}/unassign`)
    .set('Authorization', 'Bearer ' + studentAuthToken)
    .send({ firstName: first_name, lastName: last_name, studentId })
    .expect(200);
  const afterUnassign = await request(app).get(`/api/tasks/${taskId}`).expect(200);
  assert.strictEqual(afterUnassign.body.status, 'available');
});

test('POST /api/tasks/:id/validate refuse une tâche non terminée', async () => {
  const token = await getAdminAuthToken();

  const createRes = await request(app)
    .post('/api/tasks')
    .set('Authorization', 'Bearer ' + token)
    .send({ title: `Validation guard ${Date.now()}`, required_students: 1 })
    .expect(201);
  const taskId = createRes.body.id;

  await request(app)
    .post(`/api/tasks/${taskId}/validate`)
    .set('Authorization', 'Bearer ' + token)
    .expect(400);
});

test('GET /api/tasks côté élève expose assigned_count global', async () => {
  const teacherToken = await getAdminAuthToken();

  const zones = await request(app).get('/api/zones').expect(200);
  const zoneId = zones.body[0]?.id || 'pg';
  const createRes = await request(app)
    .post('/api/tasks')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({ title: `Tâche capacité ${Date.now()}`, zone_id: zoneId, required_students: 3 })
    .expect(201);
  const taskId = createRes.body.id;

  const studentARes = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'CapA', lastName: 'Eleve' + Date.now(), password: 'pwd1' })
    .expect(201);
  const studentBRes = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'CapB', lastName: 'Eleve' + Date.now(), password: 'pwd1' })
    .expect(201);

  await request(app)
    .post(`/api/tasks/${taskId}/assign`)
    .set('Authorization', `Bearer ${studentARes.body.authToken}`)
    .send({ firstName: studentARes.body.first_name, lastName: studentARes.body.last_name, studentId: studentARes.body.id })
    .expect(200);
  await request(app)
    .post(`/api/tasks/${taskId}/assign`)
    .set('Authorization', `Bearer ${studentBRes.body.authToken}`)
    .send({ firstName: studentBRes.body.first_name, lastName: studentBRes.body.last_name, studentId: studentBRes.body.id })
    .expect(200);

  const studentAToken = signAuthToken({
    userType: 'student',
    userId: studentARes.body.id,
    roleId: null,
    roleSlug: 'eleve_novice',
    roleDisplayName: 'Élève',
    permissions: [],
    elevated: false,
  }, false);

  const listRes = await request(app)
    .get('/api/tasks?map_id=foret')
    .set('Authorization', 'Bearer ' + studentAToken)
    .expect(200);
  const task = listRes.body.find((t) => t.id === taskId);
  assert.ok(task);
  assert.strictEqual(Number(task.assigned_count), 2);
  assert.ok(Array.isArray(task.assignments));
  assert.strictEqual(task.assignments.length, 2);
});

test('Un élève peut proposer une tâche en statut proposed', async () => {
  const studentRes = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Prop', lastName: 'Eleve' + Date.now(), password: 'pwd1' })
    .expect(201);
  const { first_name, last_name, id: studentId } = studentRes.body;
  await allowStudentProposalsAtZeroDone();
  await setStudentPrimaryRole(studentId, 'eleve_avance');

  const zones = await request(app).get('/api/zones').expect(200);
  const zoneId = zones.body[0]?.id || 'pg';

  const res = await request(app)
    .post('/api/tasks/proposals')
    .send({
      title: `Proposition ${Date.now()}`,
      description: 'On pourrait ajouter cette tâche.',
      zone_id: zoneId,
      required_students: 3,
      firstName: first_name,
      lastName: last_name,
      studentId,
    })
    .expect(201);

  assert.strictEqual(res.body.status, 'proposed');
  assert.ok(String(res.body.description || '').includes('Proposition élève:'));
  assert.strictEqual(res.body.zone_id, zoneId);
  assert.strictEqual(Number(res.body.required_students), 3);
});

test('Un enseignant peut modifier une proposition élève', async () => {
  const studentRes = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Edit', lastName: 'Prop' + Date.now(), password: 'pwd1' })
    .expect(201);
  const { first_name, last_name, id: studentId } = studentRes.body;
  await allowStudentProposalsAtZeroDone();
  await setStudentPrimaryRole(studentId, 'eleve_avance');

  const zones = await request(app).get('/api/zones').expect(200);
  const zoneId = zones.body[0]?.id || 'pg';

  const created = await request(app)
    .post('/api/tasks/proposals')
    .send({
      title: `Proposition edit ${Date.now()}`,
      description: 'Version initiale',
      zone_id: zoneId,
      required_students: 2,
      firstName: first_name,
      lastName: last_name,
      studentId,
    })
    .expect(201);

  const teacherToken = await getAdminAuthToken();

  const updated = await request(app)
    .put(`/api/tasks/${created.body.id}`)
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      title: 'Proposition modifiée',
      description: 'Description modifiée',
      required_students: 4,
    })
    .expect(200);

  assert.strictEqual(updated.body.title, 'Proposition modifiée');
  assert.ok(String(updated.body.description || '').includes('Description modifiée'));
  assert.strictEqual(Number(updated.body.required_students), 4);
  assert.strictEqual(updated.body.status, 'proposed');
  assert.strictEqual(String(updated.body.proposed_by_student_id || ''), String(studentId));
});

test("Un élève ne peut pas modifier la proposition d'un autre élève", async () => {
  const proposerRes = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Owner', lastName: 'Prop' + Date.now(), password: 'pwd1' })
    .expect(201);
  const otherRes = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Other', lastName: 'Prop' + Date.now(), password: 'pwd1' })
    .expect(201);
  await allowStudentProposalsAtZeroDone();
  await setStudentPrimaryRole(proposerRes.body.id, 'eleve_avance');
  await setStudentPrimaryRole(otherRes.body.id, 'eleve_avance');

  const zones = await request(app).get('/api/zones').expect(200);
  const zoneId = zones.body[0]?.id || 'pg';

  const created = await request(app)
    .post('/api/tasks/proposals')
    .send({
      title: `Proposition owner ${Date.now()}`,
      description: 'Ne doit pas être modifiée par un autre.',
      zone_id: zoneId,
      required_students: 1,
      firstName: proposerRes.body.first_name,
      lastName: proposerRes.body.last_name,
      studentId: proposerRes.body.id,
    })
    .expect(201);

  await request(app)
    .put(`/api/tasks/${created.body.id}`)
    .set('Authorization', 'Bearer ' + otherRes.body.authToken)
    .send({ title: 'Tentative refusée' })
    .expect(403);
});

test("Le proposeur ne peut pas changer le statut d'une proposition", async () => {
  const studentRes = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Status', lastName: 'Block' + Date.now(), password: 'pwd1' })
    .expect(201);
  await allowStudentProposalsAtZeroDone();
  await setStudentPrimaryRole(studentRes.body.id, 'eleve_avance');

  const zones = await request(app).get('/api/zones').expect(200);
  const zoneId = zones.body[0]?.id || 'pg';
  const created = await request(app)
    .post('/api/tasks/proposals')
    .send({
      title: `Proposition statut ${Date.now()}`,
      description: 'Test blocage statut',
      zone_id: zoneId,
      required_students: 1,
      firstName: studentRes.body.first_name,
      lastName: studentRes.body.last_name,
      studentId: studentRes.body.id,
    })
    .expect(201);

  await request(app)
    .put(`/api/tasks/${created.body.id}`)
    .set('Authorization', 'Bearer ' + studentRes.body.authToken)
    .send({ status: 'available' })
    .expect(403);
});

test("Le proposeur ne peut pas changer le mode de validation d'une proposition", async () => {
  const studentRes = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Mode', lastName: 'Block' + Date.now(), password: 'pwd1' })
    .expect(201);
  await allowStudentProposalsAtZeroDone();
  await setStudentPrimaryRole(studentRes.body.id, 'eleve_avance');

  const zones = await request(app).get('/api/zones').expect(200);
  const zoneId = zones.body[0]?.id || 'pg';
  const created = await request(app)
    .post('/api/tasks/proposals')
    .send({
      title: `Proposition mode ${Date.now()}`,
      description: 'Test blocage completion_mode',
      zone_id: zoneId,
      required_students: 1,
      firstName: studentRes.body.first_name,
      lastName: studentRes.body.last_name,
      studentId: studentRes.body.id,
    })
    .expect(201);

  await request(app)
    .put(`/api/tasks/${created.body.id}`)
    .set('Authorization', 'Bearer ' + studentRes.body.authToken)
    .send({ completion_mode: 'all_assignees_done' })
    .expect(403);
});

test('Zones et tâches supportent le filtrage multi-cartes', async () => {
  const token = await getAdminAuthToken();

  const zoneN3 = await request(app)
    .post('/api/zones')
    .set('Authorization', 'Bearer ' + token)
    .send({
      name: 'Zone test N3',
      map_id: 'n3',
      points: [{ xp: 10, yp: 10 }, { xp: 20, yp: 10 }, { xp: 15, yp: 20 }],
      stage: 'empty',
    })
    .expect(201);
  assert.strictEqual(zoneN3.body.map_id, 'n3');

  const n3Zones = await request(app).get('/api/zones?map_id=n3').expect(200);
  const foretZones = await request(app).get('/api/zones?map_id=foret').expect(200);
  assert.ok(n3Zones.body.some(z => z.id === zoneN3.body.id));
  assert.ok(!foretZones.body.some(z => z.id === zoneN3.body.id));

  const n3Task = await request(app)
    .post('/api/tasks')
    .set('Authorization', 'Bearer ' + token)
    .send({ title: `Tâche N3 ${Date.now()}`, zone_id: zoneN3.body.id, required_students: 1 })
    .expect(201);
  assert.strictEqual(n3Task.body.map_id_resolved, 'n3');

  await request(app)
    .post('/api/tasks')
    .set('Authorization', 'Bearer ' + token)
    .send({ title: `Tâche globale ${Date.now()}`, map_id: null, required_students: 1 })
    .expect(201);

  const tasksN3 = await request(app).get('/api/tasks?map_id=n3').expect(200);
  assert.ok(tasksN3.body.some(t => t.id === n3Task.body.id));
  assert.ok(tasksN3.body.some(t => (t.map_id_resolved || t.map_id || t.zone_map_id || null) == null));

  const tasksForet = await request(app).get('/api/tasks?map_id=foret').expect(200);
  assert.ok(!tasksForet.body.some(t => t.id === n3Task.body.id));
});

test('Tâche liée à plusieurs zones et repères sur la même carte', async () => {
  const token = await getAdminAuthToken();

  const zonesForet = await request(app).get('/api/zones?map_id=foret').expect(200);
  const zList = (zonesForet.body || []).filter(z => !z.special);
  const z1 = zList[0]?.id;
  const z2 = zList[1]?.id;
  if (!z1 || !z2) return;

  const markerRes = await request(app)
    .post('/api/map/markers')
    .set('Authorization', 'Bearer ' + token)
    .send({
      map_id: 'foret',
      x_pct: 50,
      y_pct: 50,
      label: 'Repère pour tâche multi',
      emoji: '📍',
    })
    .expect(201);
  const mid = markerRes.body.id;

  const create = await request(app)
    .post('/api/tasks')
    .set('Authorization', 'Bearer ' + token)
    .send({
      title: `Tâche multi lieux ${Date.now()}`,
      zone_ids: [z1, z2],
      marker_ids: [mid],
      required_students: 1,
    })
    .expect(201);
  assert.strictEqual(create.body.zones_linked.length, 2);
  assert.strictEqual(create.body.markers_linked.length, 1);
  assert.strictEqual(create.body.map_id_resolved, 'foret');

  const otherMapZone = await request(app)
    .post('/api/zones')
    .set('Authorization', 'Bearer ' + token)
    .send({
      name: 'Zone autre carte tâche',
      map_id: 'n3',
      points: [{ xp: 10, yp: 10 }, { xp: 20, yp: 10 }, { xp: 15, yp: 20 }],
      stage: 'empty',
    })
    .expect(201);

  await request(app)
    .post('/api/tasks')
    .set('Authorization', 'Bearer ' + token)
    .send({
      title: 'Incohérent',
      zone_ids: [z1, otherMapZone.body.id],
      required_students: 1,
    })
    .expect(400);
});

test('Zones et repères acceptent plusieurs êtres vivants associés', async () => {
  const token = await getAdminAuthToken();

  const zoneRes = await request(app)
    .post('/api/zones')
    .set('Authorization', 'Bearer ' + token)
    .send({
      name: 'Zone multi-vivants',
      map_id: 'foret',
      points: [{ xp: 12, yp: 12 }, { xp: 22, yp: 12 }, { xp: 18, yp: 22 }],
      current_plant: 'Menthe',
      living_beings: ['Menthe', 'Tomate', 'Basilic'],
    })
    .expect(201);
  assert.ok(Array.isArray(zoneRes.body.living_beings_list));
  assert.ok(zoneRes.body.living_beings_list.includes('Menthe'));
  assert.ok(zoneRes.body.living_beings_list.includes('Tomate'));

  const markerRes = await request(app)
    .post('/api/map/markers')
    .set('Authorization', 'Bearer ' + token)
    .send({
      map_id: 'foret',
      x_pct: 30,
      y_pct: 30,
      label: 'Repère multi-vivants',
      plant_name: 'Laitue',
      living_beings: ['Laitue', 'Carotte'],
      emoji: '🌱',
    })
    .expect(201);
  assert.ok(Array.isArray(markerRes.body.living_beings_list));
  assert.ok(markerRes.body.living_beings_list.includes('Laitue'));
  assert.ok(markerRes.body.living_beings_list.includes('Carotte'));
});

test('PUT /api/zones/:id et /api/map/markers/:id permettent de renommer', async () => {
  const token = await getAdminAuthToken();

  const zoneRes = await request(app)
    .post('/api/zones')
    .set('Authorization', 'Bearer ' + token)
    .send({
      name: 'Zone renommage',
      map_id: 'foret',
      points: [{ xp: 14, yp: 14 }, { xp: 24, yp: 14 }, { xp: 19, yp: 24 }],
      stage: 'empty',
    })
    .expect(201);

  const zoneUpdate = await request(app)
    .put(`/api/zones/${zoneRes.body.id}`)
    .set('Authorization', 'Bearer ' + token)
    .send({ name: 'Zone renommée API' })
    .expect(200);
  assert.strictEqual(zoneUpdate.body.name, 'Zone renommée API');

  const markerRes = await request(app)
    .post('/api/map/markers')
    .set('Authorization', 'Bearer ' + token)
    .send({
      map_id: 'foret',
      x_pct: 42,
      y_pct: 42,
      label: 'Repère renommage',
      emoji: '📍',
    })
    .expect(201);

  const markerUpdate = await request(app)
    .put(`/api/map/markers/${markerRes.body.id}`)
    .set('Authorization', 'Bearer ' + token)
    .send({ label: 'Repère renommé API' })
    .expect(200);
  assert.strictEqual(markerUpdate.body.label, 'Repère renommé API');
});

// ─── Suppression élève (cascade + statuts) ──────────────────────────────────
test('DELETE /api/students/:id supprime l’élève et recalcule les statuts des tâches', async () => {
  const token = await getAdminAuthToken();

  const zones = await request(app).get('/api/zones').expect(200);
  const zoneId = zones.body[0]?.id || 'pg';
  const taskRes = await request(app)
    .post('/api/tasks')
    .set('Authorization', 'Bearer ' + token)
    .send({ title: 'Tâche pour suppression', zone_id: zoneId, required_students: 1 })
    .expect(201);
  const taskId = taskRes.body.id;

  const studentRes = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'ToDelete', lastName: 'User' + Date.now(), password: 'pwd1' })
    .expect(201);
  const { id: studentId, first_name, last_name, authToken: studentAuthToken } = studentRes.body;

  await request(app)
    .post(`/api/tasks/${taskId}/assign`)
    .set('Authorization', 'Bearer ' + studentAuthToken)
    .send({ firstName: first_name, lastName: last_name, studentId })
    .expect(200);

  await request(app)
    .delete(`/api/students/${studentId}`)
    .set('Authorization', 'Bearer ' + token)
    .expect(200);

  const assignments = await queryAll(
    'SELECT * FROM task_assignments WHERE student_first_name = ? AND student_last_name = ?',
    [first_name, last_name]
  );
  assert.strictEqual(assignments.length, 0);

  const task = await queryOne('SELECT * FROM tasks WHERE id = ?', [taskId]);
  assert.strictEqual(task.status, 'available');
});

// ─── Admin logs (tampon Pino) ─────────────────────────────────────────────
test('GET /api/admin/logs sans DEPLOY_SECRET → 403', async () => {
  const prev = process.env.DEPLOY_SECRET;
  delete process.env.DEPLOY_SECRET;
  const res = await request(app).get('/api/admin/logs').expect(403);
  assert.ok(res.body.error);
  process.env.DEPLOY_SECRET = prev;
});

test('GET /api/admin/logs avec mauvais secret → 403', async () => {
  const prev = process.env.DEPLOY_SECRET;
  process.env.DEPLOY_SECRET = 'secret-admin-logs-test';
  const res = await request(app)
    .get('/api/admin/logs')
    .set('X-Deploy-Secret', 'wrong')
    .expect(403);
  assert.ok(res.body.error);
  process.env.DEPLOY_SECRET = prev;
});

test('GET /api/admin/logs avec bon secret → 200', async () => {
  const prev = process.env.DEPLOY_SECRET;
  process.env.DEPLOY_SECRET = 'secret-admin-logs-test';
  const res = await request(app)
    .get('/api/admin/logs?lines=50')
    .set('X-Deploy-Secret', 'secret-admin-logs-test')
    .expect(200);
  assert.strictEqual(res.body.ok, true);
  assert.ok(Array.isArray(res.body.entries));
  assert.ok(typeof res.body.bufferLines === 'number');
  assert.ok(typeof res.body.bufferMax === 'number');
  process.env.DEPLOY_SECRET = prev;
});
