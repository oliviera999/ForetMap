require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const { initDatabase, initSchema, queryAll, queryOne, execute } = require('../database');
const { setSetting } = require('../lib/settings');
const { app } = require('../server');
const request = require('supertest');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ensureRbacBootstrap } = require('../lib/rbac');

test.before(async () => {
  await initSchema();
  await initDatabase();
  await ensureRbacBootstrap();
});

test('GET /api/ready après init BDD → 200', async () => {
  const res = await request(app).get('/api/ready').expect(200);
  assert.strictEqual(res.body.ok, true);
  assert.strictEqual(res.body.ready, true);
  assert.strictEqual(res.body.database, true);
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
    'tasks.manage', 'tasks.read.logs', 'tasks.validate',
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
  return await signAuthToken(
    {
      userType: 'teacher',
      userId: teacher?.id || null,
      canonicalUserId: teacher?.id || null,
      roleId: adminRole?.id || null,
      roleSlug: 'admin',
      roleDisplayName: 'Administrateur',
      elevated: false,
    },
    false
  );
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

test('POST /api/auth/admin/impersonate puis stop restaure l’admin', async () => {
  const adminToken = await getAdminAuthToken();
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Imp', lastName: 'Ctrl' + Date.now(), password: 'pass1234' })
    .expect(201);
  const studentId = reg.body.id;
  const imp = await request(app)
    .post('/api/auth/admin/impersonate')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ userType: 'student', userId: studentId })
    .expect(200);
  assert.ok(imp.body.authToken);
  assert.strictEqual(imp.body.auth.userType, 'student');
  assert.strictEqual(imp.body.auth.impersonating, true);
  assert.ok(imp.body.auth.impersonatedBy);
  assert.strictEqual(imp.body.profile.id, studentId);

  const meStudent = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${imp.body.authToken}`)
    .expect(200);
  assert.strictEqual(meStudent.body.auth.userType, 'student');
  assert.strictEqual(meStudent.body.auth.impersonating, true);

  const stop = await request(app)
    .post('/api/auth/admin/impersonate/stop')
    .set('Authorization', `Bearer ${imp.body.authToken}`)
    .expect(200);
  assert.ok(stop.body.authToken);
  const meAdmin = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${stop.body.authToken}`)
    .expect(200);
  assert.strictEqual(meAdmin.body.auth.userType, 'teacher');
  assert.ok(!meAdmin.body.auth.impersonating);
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

test('GET /api/stats/me/:studentId inclut biodiversité et tutoriels lus', async () => {
  const studentRes = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Stats', lastName: `Engage${Date.now()}`, password: 'pass1234' })
    .expect(201);
  const studentId = studentRes.body.id;
  const plants = await queryAll('SELECT id FROM plants ORDER BY id ASC LIMIT 2');
  assert.ok(plants.length >= 1, 'au moins une fiche plants en base de test');
  const p1 = Number(plants[0].id);
  const p2 = plants[1] != null ? Number(plants[1].id) : p1;
  const tut = await queryOne('SELECT id FROM tutorials ORDER BY id ASC LIMIT 1');
  assert.ok(tut?.id, 'au moins un tutoriel en base de test');
  const ts = new Date().toISOString();
  await execute(
    'INSERT INTO user_plant_observation_events (user_id, plant_id, observed_at) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)',
    [studentId, p1, ts, studentId, p1, ts, studentId, p2, ts]
  );
  await execute(
    `INSERT INTO user_tutorial_reads (user_id, tutorial_id, acknowledged_at) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE acknowledged_at = VALUES(acknowledged_at)`,
    [studentId, tut.id, ts]
  );
  const res = await request(app)
    .get(`/api/stats/me/${studentId}`)
    .set('Authorization', `Bearer ${studentRes.body.authToken}`)
    .expect(200);
  const distinctSpecies = p1 === p2 ? 1 : 2;
  assert.strictEqual(res.body.stats.plant_species_observed, distinctSpecies);
  assert.strictEqual(res.body.stats.plant_observation_events, 3);
  assert.strictEqual(res.body.stats.tutorials_read, 1);
});

test('GET /api/stats/all renvoie students et agrégats site', async () => {
  const token = await getAdminAuthToken();
  const res = await request(app)
    .get('/api/stats/all')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.ok(Array.isArray(res.body.students));
  assert.ok(res.body.site);
  assert.strictEqual(typeof res.body.site.plant_species_observed, 'number');
  assert.strictEqual(typeof res.body.site.plant_observation_events, 'number');
  assert.strictEqual(typeof res.body.site.tutorials_read, 'number');
  const st = res.body.students[0];
  assert.ok(st?.stats);
  assert.strictEqual(typeof st.stats.plant_species_observed, 'number');
  assert.strictEqual(typeof st.stats.plant_observation_events, 'number');
  assert.strictEqual(typeof st.stats.tutorials_read, 'number');
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
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ firstName, lastName, studentId })
      .expect(200);
    await request(app)
      .post(`/api/tasks/${task.body.id}/done`)
      .set('Authorization', `Bearer ${teacherToken}`)
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

test('GET /api/rbac/profiles renvoie roles et progressionByValidatedTasksEnabled', async () => {
  const token = await getAdminAuthToken();
  const res = await request(app)
    .get('/api/rbac/profiles')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.ok(Array.isArray(res.body.roles));
  assert.strictEqual(typeof res.body.progressionByValidatedTasksEnabled, 'boolean');
});

test('GET /api/stats/me/:studentId ne promeut pas le profil si la progression auto est désactivée', async () => {
  const teacherToken = await getAdminAuthToken();
  await setSetting('rbac.progression_by_validated_tasks', false, {});
  try {
    await execute('UPDATE roles SET min_done_tasks = ?, emoji = ?, display_order = ? WHERE slug = ?', [0, '🪨', 50, 'eleve_novice']);
    await execute('UPDATE roles SET min_done_tasks = ?, emoji = ?, display_order = ? WHERE slug = ?', [1, '🌿', 40, 'eleve_avance']);
    await execute('UPDATE roles SET min_done_tasks = ?, emoji = ?, display_order = ? WHERE slug = ?', [2, '🏆', 30, 'eleve_chevronne']);

    const studentRes = await request(app)
      .post('/api/auth/register')
      .send({ firstName: 'NoAuto', lastName: `Prog${Date.now()}`, password: 'pass1234' })
      .expect(201);
    const { id: studentId, first_name: firstName, last_name: lastName, authToken: studentAuthToken } = studentRes.body;
    await setStudentPrimaryRole(studentId, 'eleve_novice');

    const zones = await request(app).get('/api/zones').expect(200);
    const zoneId = zones.body[0]?.id || 'pg';
    for (let i = 0; i < 2; i += 1) {
      const task = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ title: `No auto prog ${Date.now()}-${i}`, zone_id: zoneId, required_students: 1 })
        .expect(201);
      await request(app)
        .post(`/api/tasks/${task.body.id}/assign`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ firstName, lastName, studentId })
        .expect(200);
      await request(app)
        .post(`/api/tasks/${task.body.id}/done`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ firstName, lastName, studentId })
        .expect(200);
      await request(app)
        .post(`/api/tasks/${task.body.id}/validate`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .expect(200);
    }

    const stats = await request(app)
      .get(`/api/stats/me/${studentId}`)
      .set('Authorization', `Bearer ${studentAuthToken}`)
      .expect(200);
    assert.strictEqual(stats.body?.progression?.autoProgressionEnabled, false);
    assert.strictEqual(stats.body?.progression?.roleSlug, 'eleve_novice');

    const role = await queryOne(
      `SELECT r.slug
         FROM user_roles ur
         INNER JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_type = 'student' AND ur.user_id = ? AND ur.is_primary = 1
        LIMIT 1`,
      [studentId]
    );
    assert.strictEqual(role?.slug, 'eleve_novice');
  } finally {
    await setSetting('rbac.progression_by_validated_tasks', true, {});
    await execute('UPDATE roles SET min_done_tasks = ?, emoji = ?, display_order = ? WHERE slug = ?', [0, '🪨', 50, 'eleve_novice']);
    await execute('UPDATE roles SET min_done_tasks = ?, emoji = ?, display_order = ? WHERE slug = ?', [5, '🌿', 40, 'eleve_avance']);
    await execute('UPDATE roles SET min_done_tasks = ?, emoji = ?, display_order = ? WHERE slug = ?', [10, '🏆', 30, 'eleve_chevronne']);
  }
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
  await setSetting('ui.modules.forum_enabled', true, {});
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
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ firstName: studentRes.body.first_name, lastName: studentRes.body.last_name, studentId: studentRes.body.id })
    .expect(200);
  await request(app)
    .post(`/api/tasks/${taskId}/done`)
    .set('Authorization', `Bearer ${teacherToken}`)
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
  const { first_name, last_name, id: studentId } = studentRes.body;
  await setStudentPrimaryRole(studentId, 'eleve_novice');

  await request(app)
    .post(`/api/tasks/${taskId}/assign`)
    .set('Authorization', 'Bearer ' + token)
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
    .set('Authorization', 'Bearer ' + token)
    .send({ firstName: first_name, lastName: last_name, studentId })
    .expect(200);
  const afterUnassign = await request(app).get(`/api/tasks/${taskId}`).expect(200);
  assert.strictEqual(afterUnassign.body.status, 'available');
});

test('Plafond auto-inscription n3beur : TASK_ENROLLMENT_LIMIT et GET /api/auth/me', async () => {
  try {
    await setSetting('tasks.student_max_active_assignments', 1, {});

    const teacherToken = await getAdminAuthToken();
    const zones = await request(app).get('/api/zones').expect(200);
    const zoneId = zones.body[0]?.id || 'pg';

    const t1 = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ title: `Limite A ${Date.now()}`, zone_id: zoneId, required_students: 1 })
      .expect(201);
    const t2 = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ title: `Limite B ${Date.now()}`, zone_id: zoneId, required_students: 1 })
      .expect(201);

    const enrollEmail = `enroll_${Date.now()}@foretmap.test`;
    const studentRes = await request(app)
      .post('/api/auth/register')
      .send({ firstName: 'Limite', lastName: `N3b${Date.now()}`, password: 'pwd1', email: enrollEmail })
      .expect(201);
    const { first_name, last_name, id: studentId } = studentRes.body;
    await setStudentPrimaryRole(studentId, 'eleve_novice');
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ identifier: enrollEmail, password: 'pwd1' })
      .expect(200);
    const authToken = loginRes.body.authToken;

    await request(app)
      .post(`/api/tasks/${t1.body.id}/assign`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ firstName: first_name, lastName: last_name, studentId })
      .expect(200);

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    assert.strictEqual(meRes.body.taskEnrollment?.maxActiveAssignments, 1);
    assert.strictEqual(meRes.body.taskEnrollment?.currentActiveAssignments, 1);
    assert.strictEqual(meRes.body.taskEnrollment?.atLimit, true);

    const over = await request(app)
      .post(`/api/tasks/${t2.body.id}/assign`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ firstName: first_name, lastName: last_name, studentId })
      .expect(400);
    assert.strictEqual(over.body.code, 'TASK_ENROLLMENT_LIMIT');
    assert.strictEqual(over.body.maxActiveAssignments, 1);
    assert.strictEqual(over.body.currentActiveAssignments, 1);
  } finally {
    await setSetting('tasks.student_max_active_assignments', 0, {});
  }
});

test('Plafond auto-inscription : tâche all_assignees_done avec partie individuelle terminée ne compte plus', async () => {
  try {
    await setSetting('tasks.student_max_active_assignments', 1, {});
    const teacherToken = await getAdminAuthToken();
    const zones = await request(app).get('/api/zones').expect(200);
    const zoneId = zones.body[0]?.id || 'pg';

    const collective = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        title: `Coll limite ${Date.now()}`,
        zone_id: zoneId,
        required_students: 3,
        completion_mode: 'all_assignees_done',
      })
      .expect(201);
    const tOther = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ title: `Autre limite coll ${Date.now()}`, zone_id: zoneId, required_students: 1 })
      .expect(201);

    const enrollEmail = `enroll_coll_${Date.now()}@foretmap.test`;
    const studentRes = await request(app)
      .post('/api/auth/register')
      .send({ firstName: 'Coll', lastName: `N3b${Date.now()}`, password: 'pwd1', email: enrollEmail })
      .expect(201);
    const { first_name, last_name, id: studentId } = studentRes.body;
    await setStudentPrimaryRole(studentId, 'eleve_novice');
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ identifier: enrollEmail, password: 'pwd1' })
      .expect(200);
    const authToken = loginRes.body.authToken;

    await request(app)
      .post(`/api/tasks/${collective.body.id}/assign`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ firstName: first_name, lastName: last_name, studentId })
      .expect(200);

    const meBeforeDone = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    assert.strictEqual(meBeforeDone.body.taskEnrollment?.currentActiveAssignments, 1);
    assert.strictEqual(meBeforeDone.body.taskEnrollment?.atLimit, true);

    await request(app)
      .post(`/api/tasks/${collective.body.id}/done`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ firstName: first_name, lastName: last_name, studentId })
      .expect(200);

    const meAfterDone = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    assert.strictEqual(meAfterDone.body.taskEnrollment?.currentActiveAssignments, 0);
    assert.strictEqual(meAfterDone.body.taskEnrollment?.atLimit, false);

    await request(app)
      .post(`/api/tasks/${tOther.body.id}/assign`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ firstName: first_name, lastName: last_name, studentId })
      .expect(200);
  } finally {
    await setSetting('tasks.student_max_active_assignments', 0, {});
  }
});

test('Plafond auto-inscription : le profil RBAC (max_concurrent_tasks) prime sur le réglage global', async () => {
  const noviceRole = await queryOne("SELECT id FROM roles WHERE slug = 'eleve_novice' LIMIT 1");
  assert.ok(noviceRole?.id);
  try {
    await setSetting('tasks.student_max_active_assignments', 5, {});
    await execute('UPDATE roles SET max_concurrent_tasks = 1 WHERE id = ?', [noviceRole.id]);

    const teacherToken = await getAdminAuthToken();
    const zones = await request(app).get('/api/zones').expect(200);
    const zoneId = zones.body[0]?.id || 'pg';

    const t1 = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ title: `Limite profil A ${Date.now()}`, zone_id: zoneId, required_students: 1 })
      .expect(201);
    const t2 = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ title: `Limite profil B ${Date.now()}`, zone_id: zoneId, required_students: 1 })
      .expect(201);

    const enrollEmail = `enroll_role_${Date.now()}@foretmap.test`;
    const studentRes = await request(app)
      .post('/api/auth/register')
      .send({ firstName: 'Limite', lastName: `Profil${Date.now()}`, password: 'pwd1', email: enrollEmail })
      .expect(201);
    const { first_name, last_name, id: studentId } = studentRes.body;
    await setStudentPrimaryRole(studentId, 'eleve_novice');
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ identifier: enrollEmail, password: 'pwd1' })
      .expect(200);
    const authToken = loginRes.body.authToken;

    await request(app)
      .post(`/api/tasks/${t1.body.id}/assign`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ firstName: first_name, lastName: last_name, studentId })
      .expect(200);

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    assert.strictEqual(meRes.body.taskEnrollment?.maxActiveAssignments, 1);
    assert.strictEqual(meRes.body.taskEnrollment?.atLimit, true);

    const over = await request(app)
      .post(`/api/tasks/${t2.body.id}/assign`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ firstName: first_name, lastName: last_name, studentId })
      .expect(400);
    assert.strictEqual(over.body.code, 'TASK_ENROLLMENT_LIMIT');
    assert.strictEqual(over.body.maxActiveAssignments, 1);
  } finally {
    await execute('UPDATE roles SET max_concurrent_tasks = NULL WHERE id = ?', [noviceRole.id]);
    await setSetting('tasks.student_max_active_assignments', 0, {});
  }
});

test('max_concurrent_tasks = 0 sur le profil : pas de limite même si le réglage global est actif', async () => {
  const noviceRole = await queryOne("SELECT id FROM roles WHERE slug = 'eleve_novice' LIMIT 1");
  assert.ok(noviceRole?.id);
  try {
    await setSetting('tasks.student_max_active_assignments', 2, {});
    await execute('UPDATE roles SET max_concurrent_tasks = 0 WHERE id = ?', [noviceRole.id]);

    const teacherToken = await getAdminAuthToken();
    const zones = await request(app).get('/api/zones').expect(200);
    const zoneId = zones.body[0]?.id || 'pg';
    const titles = [`S1 ${Date.now()}`, `S2 ${Date.now()}`, `S3 ${Date.now()}`];
    const tasks = [];
    for (const title of titles) {
      const tr = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ title, zone_id: zoneId, required_students: 1 })
        .expect(201);
      tasks.push(tr.body);
    }

    const enrollEmail = `enroll_unlim_${Date.now()}@foretmap.test`;
    const studentRes = await request(app)
      .post('/api/auth/register')
      .send({ firstName: 'Sans', lastName: `Limite${Date.now()}`, password: 'pwd1', email: enrollEmail })
      .expect(201);
    const { first_name, last_name, id: studentId } = studentRes.body;
    await setStudentPrimaryRole(studentId, 'eleve_novice');
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ identifier: enrollEmail, password: 'pwd1' })
      .expect(200);
    const authToken = loginRes.body.authToken;

    for (const t of tasks) {
      await request(app)
        .post(`/api/tasks/${t.id}/assign`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ firstName: first_name, lastName: last_name, studentId })
        .expect(200);
    }

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    assert.strictEqual(meRes.body.taskEnrollment?.maxActiveAssignments, 0);
    assert.strictEqual(meRes.body.taskEnrollment?.atLimit, false);
    assert.strictEqual(meRes.body.taskEnrollment?.currentActiveAssignments, 3);
  } finally {
    await execute('UPDATE roles SET max_concurrent_tasks = NULL WHERE id = ?', [noviceRole.id]);
    await setSetting('tasks.student_max_active_assignments', 0, {});
  }
});

test('POST /api/tasks/:id/validate accepte une validation directe sans passage par done', async () => {
  const token = await getAdminAuthToken();

  const createRes = await request(app)
    .post('/api/tasks')
    .set('Authorization', 'Bearer ' + token)
    .send({ title: `Validation directe ${Date.now()}`, required_students: 1 })
    .expect(201);
  const taskId = createRes.body.id;

  const validated = await request(app)
    .post(`/api/tasks/${taskId}/validate`)
    .set('Authorization', 'Bearer ' + token)
    .expect(200);
  assert.strictEqual(validated.body.status, 'validated');

  await request(app)
    .post(`/api/tasks/${taskId}/validate`)
    .set('Authorization', 'Bearer ' + token)
    .expect(400);
});

test('POST et PUT /api/tasks — danger_level persistant', async () => {
  const token = await getAdminAuthToken();

  const createRes = await request(app)
    .post('/api/tasks')
    .set('Authorization', 'Bearer ' + token)
    .send({ title: `Danger ${Date.now()}`, required_students: 1, danger_level: 'dangerous' })
    .expect(201);
  assert.strictEqual(createRes.body.danger_level, 'dangerous');
  const taskId = createRes.body.id;

  const getOne = await request(app).get(`/api/tasks/${taskId}`).expect(200);
  assert.strictEqual(getOne.body.danger_level, 'dangerous');

  const putRes = await request(app)
    .put(`/api/tasks/${taskId}`)
    .set('Authorization', 'Bearer ' + token)
    .send({ danger_level: 'very_dangerous' })
    .expect(200);
  assert.strictEqual(putRes.body.danger_level, 'very_dangerous');

  const putPotential = await request(app)
    .put(`/api/tasks/${taskId}`)
    .set('Authorization', 'Bearer ' + token)
    .send({ danger_level: 'potential_danger' })
    .expect(200);
  assert.strictEqual(putPotential.body.danger_level, 'potential_danger');

  await request(app)
    .post('/api/tasks')
    .set('Authorization', 'Bearer ' + token)
    .send({ title: `Bad danger ${Date.now()}`, danger_level: 'nope' })
    .expect(400);
});

test('POST et PUT /api/tasks — difficulty_level persistant', async () => {
  const token = await getAdminAuthToken();

  const createRes = await request(app)
    .post('/api/tasks')
    .set('Authorization', 'Bearer ' + token)
    .send({ title: `Difficulté ${Date.now()}`, required_students: 1, difficulty_level: 'hard' })
    .expect(201);
  assert.strictEqual(createRes.body.difficulty_level, 'hard');
  const taskId = createRes.body.id;

  const getOne = await request(app).get(`/api/tasks/${taskId}`).expect(200);
  assert.strictEqual(getOne.body.difficulty_level, 'hard');

  const putRes = await request(app)
    .put(`/api/tasks/${taskId}`)
    .set('Authorization', 'Bearer ' + token)
    .send({ difficulty_level: 'very_hard' })
    .expect(200);
  assert.strictEqual(putRes.body.difficulty_level, 'very_hard');

  await request(app)
    .post('/api/tasks')
    .set('Authorization', 'Bearer ' + token)
    .send({ title: `Bad difficulty ${Date.now()}`, difficulty_level: 'nope' })
    .expect(400);
});

test('POST /api/tasks — danger_level et difficulty_level optionnels (null si non renseignés)', async () => {
  const token = await getAdminAuthToken();

  const createRes = await request(app)
    .post('/api/tasks')
    .set('Authorization', 'Bearer ' + token)
    .send({ title: `Sans niveaux ${Date.now()}`, required_students: 1 })
    .expect(201);
  assert.strictEqual(createRes.body.danger_level, null);
  assert.strictEqual(createRes.body.difficulty_level, null);

  const taskId = createRes.body.id;
  const withLevels = await request(app)
    .put(`/api/tasks/${taskId}`)
    .set('Authorization', 'Bearer ' + token)
    .send({ danger_level: 'dangerous', difficulty_level: 'hard' })
    .expect(200);
  assert.strictEqual(withLevels.body.danger_level, 'dangerous');
  assert.strictEqual(withLevels.body.difficulty_level, 'hard');

  const cleared = await request(app)
    .put(`/api/tasks/${taskId}`)
    .set('Authorization', 'Bearer ' + token)
    .send({ danger_level: null, difficulty_level: null })
    .expect(200);
  assert.strictEqual(cleared.body.danger_level, null);
  assert.strictEqual(cleared.body.difficulty_level, null);
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

  await setStudentPrimaryRole(studentARes.body.id, 'eleve_novice');
  await setStudentPrimaryRole(studentBRes.body.id, 'eleve_novice');

  await request(app)
    .post(`/api/tasks/${taskId}/assign`)
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ firstName: studentARes.body.first_name, lastName: studentARes.body.last_name, studentId: studentARes.body.id })
    .expect(200);
  await request(app)
    .post(`/api/tasks/${taskId}/assign`)
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ firstName: studentBRes.body.first_name, lastName: studentBRes.body.last_name, studentId: studentBRes.body.id })
    .expect(200);

  const listRes = await request(app)
    .get('/api/tasks?map_id=foret')
    .set('Authorization', `Bearer ${studentARes.body.authToken}`)
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
  assert.ok(String(res.body.description || '').includes('Proposition n3beur:'));
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

test('POST /api/zones : description optionnelle à la création', async () => {
  const token = await getAdminAuthToken();
  const res = await request(app)
    .post('/api/zones')
    .set('Authorization', 'Bearer ' + token)
    .send({
      name: `Zone desc ${Date.now()}`,
      map_id: 'foret',
      points: [{ xp: 10, yp: 10 }, { xp: 20, yp: 10 }, { xp: 15, yp: 20 }],
      stage: 'empty',
      description: 'Copie / note initiale',
    })
    .expect(201);
  assert.strictEqual(res.body.description, 'Copie / note initiale');
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

test('Les tâches acceptent des êtres vivants (biodiversité) associés', async () => {
  const token = await getAdminAuthToken();
  const created = await request(app)
    .post('/api/tasks')
    .set('Authorization', 'Bearer ' + token)
    .send({
      title: `Tâche biodiv ${Date.now()}`,
      map_id: 'foret',
      required_students: 1,
      living_beings: ['Menthe', 'Tomate'],
    })
    .expect(201);
  assert.ok(Array.isArray(created.body.living_beings_list));
  assert.ok(created.body.living_beings_list.includes('Menthe'));
  assert.ok(created.body.living_beings_list.includes('Tomate'));
  assert.strictEqual(created.body.living_beings, undefined);

  const updated = await request(app)
    .put(`/api/tasks/${created.body.id}`)
    .set('Authorization', 'Bearer ' + token)
    .send({ living_beings: ['Basilic'] })
    .expect(200);
  assert.deepStrictEqual(updated.body.living_beings_list, ['Basilic']);
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
  assert.strictEqual(String(zoneRes.body.current_plant || '').trim(), '');

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
  assert.strictEqual(String(markerRes.body.plant_name || '').trim(), '');
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

const TINY_JPEG_MARKER_PHOTO =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCABAAEADASIAAhEBAxEB/8QAFwABAQEBAAAAAAAAAAAAAAAAAAIDBP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhADEAAAf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//Z';

test('Photos repère : POST liste GET data DELETE', async () => {
  const token = await getAdminAuthToken();
  const markerRes = await request(app)
    .post('/api/map/markers')
    .set('Authorization', 'Bearer ' + token)
    .send({
      map_id: 'foret',
      x_pct: 51,
      y_pct: 52,
      label: `Repère photos ${Date.now()}`,
      emoji: '📍',
    })
    .expect(201);
  const mid = markerRes.body.id;

  const postRes = await request(app)
    .post(`/api/map/markers/${mid}/photos`)
    .set('Authorization', 'Bearer ' + token)
    .send({ image_data: `data:image/jpeg;base64,${TINY_JPEG_MARKER_PHOTO}`, caption: 'test' })
    .expect(201);
  const pid = postRes.body.id;
  assert.ok(pid);

  const list = await request(app).get(`/api/map/markers/${mid}/photos`).expect(200);
  assert.ok(Array.isArray(list.body));
  assert.ok(list.body.some((p) => p.id === pid));

  await request(app).get(`/api/map/markers/${mid}/photos/${pid}/data`).expect(200);

  await request(app)
    .delete(`/api/map/markers/${mid}/photos/${pid}`)
    .set('Authorization', 'Bearer ' + token)
    .expect(200);

  await request(app).delete(`/api/map/markers/${mid}`).set('Authorization', 'Bearer ' + token).expect(200);
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
  const { id: studentId, first_name, last_name } = studentRes.body;
  await setStudentPrimaryRole(studentId, 'eleve_novice');

  await request(app)
    .post(`/api/tasks/${taskId}/assign`)
    .set('Authorization', 'Bearer ' + token)
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

test('GET /api/admin/diagnostics sans DEPLOY_SECRET → 403', async () => {
  const prev = process.env.DEPLOY_SECRET;
  delete process.env.DEPLOY_SECRET;
  const res = await request(app).get('/api/admin/diagnostics').expect(403);
  assert.ok(res.body.error);
  process.env.DEPLOY_SECRET = prev;
});

test('GET /api/admin/diagnostics avec bon secret → 200', async () => {
  const prev = process.env.DEPLOY_SECRET;
  process.env.DEPLOY_SECRET = 'secret-diag-test';
  const res = await request(app)
    .get('/api/admin/diagnostics')
    .set('X-Deploy-Secret', 'secret-diag-test')
    .expect(200);
  assert.strictEqual(res.body.ok, true);
  assert.ok(typeof res.body.version === 'string');
  assert.ok(typeof res.body.uptimeSeconds === 'number');
  assert.ok(res.body.database && typeof res.body.database.ok === 'boolean');
  assert.ok(res.body.logBuffer && typeof res.body.logBuffer.linesCount === 'number');
  assert.ok(res.body.metrics && typeof res.body.metrics.httpRequests === 'number');
  assert.ok(typeof res.body.metrics.http5xx === 'number');
  assert.ok(typeof res.body.metrics.http429 === 'number');
  assert.ok(Array.isArray(res.body.metrics.recentHttp5xx));
  assert.ok(Array.isArray(res.body.metrics.recentHttp429));
  assert.ok(res.body.runtimeProcess && typeof res.body.runtimeProcess.pid === 'number');
  assert.ok(res.body.runtimeProcess.cluster && typeof res.body.runtimeProcess.cluster.isWorker === 'boolean');
  assert.ok(
    res.body.runtimeProcess.cluster.workerId === null || typeof res.body.runtimeProcess.cluster.workerId === 'number'
  );
  assert.ok(res.body.runtimeProcess.envHints && typeof res.body.runtimeProcess.envHints === 'object');
  assert.ok(res.body.visitMascotHint && Array.isArray(res.body.visitMascotHint.maps));
  assert.ok(
    res.body.visitMascotHint.maps.every(
      (row) =>
        typeof row.map_id === 'string'
        && typeof row.visitZonesInPublicApi === 'number'
        && typeof row.visitMarkersInPublicApi === 'number'
        && typeof row.visitTutorialsForContentApi === 'number'
        && typeof row.mascotWouldRenderHint === 'boolean'
    )
  );
  process.env.DEPLOY_SECRET = prev;
});

test('Réponses API exposent X-Request-Id', async () => {
  const res = await request(app).get('/api/maps').expect(200);
  const rid = res.headers['x-request-id'];
  assert.ok(rid && String(rid).length >= 8);
});

test('X-Request-Id client accepté si format sûr', async () => {
  const res = await request(app)
    .get('/api/maps')
    .set('X-Request-Id', 'client-req-id-abc123')
    .expect(200);
  assert.strictEqual(res.headers['x-request-id'], 'client-req-id-abc123');
});

test('GET /api/plants/autofill refuse sans authentification', async () => {
  await request(app).get('/api/plants/autofill?q=tomate').expect(401);
});

test('GET /api/plants/autofill renvoie une pré-saisie normalisée multi-sources', { concurrency: false }, async () => {
  const token = await getAdminAuthToken();
  const previousFetch = global.fetch;
  global.fetch = async (url) => {
    const raw = String(url || '');
    if (raw.includes('fr.wikipedia.org/api/rest_v1/page/summary')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            title: 'Tomate',
            extract: 'Plante potagère cultivée.',
            thumbnail: { source: 'https://upload.wikimedia.org/tomato.jpg' },
            content_urls: { desktop: { page: 'https://fr.wikipedia.org/wiki/Tomate' } },
          };
        },
      };
    }
    if (raw.includes('wikidata.org/w/api.php')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return { search: [{ id: 'Q111' }, { id: 'Q23501' }] };
        },
      };
    }
    if (raw.includes('wikidata.org/wiki/Special:EntityData')) {
      if (raw.includes('Q111')) {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              entities: {
                Q111: {
                  labels: { fr: { value: 'Tomate' } },
                  descriptions: { fr: { value: 'chanteur brésilien' } },
                  claims: {},
                },
              },
            };
          },
        };
      }
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            entities: {
              Q23501: {
                labels: { fr: { value: 'Tomate' } },
                descriptions: { fr: { value: 'Espèce végétale' } },
                sitelinks: { frwiki: { title: 'Tomate' } },
                claims: {
                  P31: [{ mainsnak: { datavalue: { value: { id: 'Q16521' } } } }],
                  P105: [{ mainsnak: { datavalue: { value: { id: 'Q7432' } } } }],
                  P225: [{ mainsnak: { datavalue: { value: 'Solanum lycopersicum' } } }],
                  P18: [{ mainsnak: { datavalue: { value: 'Tomato_on_white_background.jpg' } } }],
                },
              },
            },
          };
        },
      };
    }
    if (raw.includes('api.gbif.org/v1/species/match')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            confidence: 96,
            canonicalName: 'Tomate',
            scientificName: 'Solanum lycopersicum',
            family: 'Solanaceae',
            order: 'Solanales',
            kingdom: 'Plantae',
            usageKey: 2930132,
          };
        },
      };
    }
    if (raw.includes('/species/2930132/descriptions')) {
      return { ok: true, status: 200, async json() { return { results: [] }; } };
    }
    if (raw.includes('api.gbif.org/v1/species/2930132') && !raw.includes('vernacularNames')) {
      return { ok: true, status: 200, async json() { return { taxonomicStatus: 'ACCEPTED' }; } };
    }
    if (raw.includes('api.checklistbank.org/dataset/3LR/nameusage/search')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            result: [{
              id: 'COL-2930132',
              name: 'Solanum lycopersicum',
              classification: [
                { rank: 'kingdom', name: 'Plantae' },
                { rank: 'order', name: 'Solanales' },
                { rank: 'family', name: 'Solanaceae' },
              ],
            }],
          };
        },
      };
    }
    if (raw.includes('api.inaturalist.org/v1/taxa')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            results: [{
              id: 58698,
              rank: 'species',
              name: 'Solanum lycopersicum',
              observations_count: 1000,
              matched_term: 'tomate',
            }],
          };
        },
      };
    }
    if (raw.includes('api.gbif.org/v1/species/2930132/vernacularNames')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return { results: [{ vernacularName: 'Tomate-cerise', language: 'fra' }] };
        },
      };
    }
    if (raw.includes('en.wikipedia.org/api/rest_v1/page/summary')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            title: 'Tomato',
            extract: 'The tomato is the edible berry of the plant Solanum lycopersicum, commonly known as a tomato plant.',
            content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Tomato' } },
          };
        },
      };
    }
    throw new Error(`URL inattendue: ${raw}`);
  };
  try {
    const res = await request(app)
      .get('/api/plants/autofill?q=tomate')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    assert.strictEqual(res.body.query, 'tomate');
    assert.strictEqual(typeof res.body.confidence, 'number');
    assert.ok(res.body.confidence > 0);
    assert.strictEqual(res.body.fields.scientific_name, 'Solanum lycopersicum');
    assert.ok(Array.isArray(res.body.photos));
    assert.ok(res.body.photos.length >= 1);
    assert.ok(Array.isArray(res.body.sources));
    assert.ok(res.body.sources.some((s) => s.source === 'wikipedia'));
    assert.ok(res.body.sources.some((s) => s.source === 'wikidata'));
    assert.ok(res.body.sources.some((s) => s.source === 'gbif'));
  } finally {
    global.fetch = previousFetch;
  }
});

test('GET /api/plants/autofill sources=gbif évite Wikipedia et Wikidata', { concurrency: false }, async () => {
  const token = await getAdminAuthToken();
  const previousFetch = global.fetch;
  const urls = [];
  global.fetch = async (url) => {
    urls.push(String(url));
    if (String(url).includes('api.gbif.org/v1/species/match')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            confidence: 95,
            scientificName: 'Solanum lycopersicum',
            canonicalName: 'Tomate',
            usageKey: 2930132,
          };
        },
      };
    }
    throw new Error(`URL inattendue: ${url}`);
  };
  try {
    const res = await request(app)
      .get('/api/plants/autofill?q=tomate&sources=gbif')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    assert.strictEqual(res.body.query, 'tomate');
    assert.ok(!urls.some((u) => u.includes('wikidata.org')));
    assert.ok(!urls.some((u) => u.includes('wikipedia.org')));
    assert.ok(urls.some((u) => u.includes('api.gbif.org/v1/species/match')));
    assert.ok((res.body.sources || []).some((s) => s.source === 'gbif'));
  } finally {
    global.fetch = previousFetch;
  }
});

test('GET /api/plants/autofill accepte hint_scientific et hint_name (cache distinct)', { concurrency: false }, async () => {
  const token = await getAdminAuthToken();
  const previousFetch = global.fetch;
  let hitCount = 0;
  global.fetch = async (url) => {
    hitCount += 1;
    const raw = String(url || '');
    if (raw.includes('fr.wikipedia.org/api/rest_v1/page/summary')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            title: 'Tomate',
            extract: 'Plante potagère cultivée.',
            thumbnail: { source: 'https://upload.wikimedia.org/tomato.jpg' },
            content_urls: { desktop: { page: 'https://fr.wikipedia.org/wiki/Tomate' } },
          };
        },
      };
    }
    if (raw.includes('wikidata.org/w/api.php')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return { search: [{ id: 'Q111' }, { id: 'Q23501' }] };
        },
      };
    }
    if (raw.includes('wikidata.org/wiki/Special:EntityData')) {
      if (raw.includes('Q111')) {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              entities: {
                Q111: {
                  labels: { fr: { value: 'Tomate' } },
                  descriptions: { fr: { value: 'chanteur brésilien' } },
                  claims: {},
                },
              },
            };
          },
        };
      }
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            entities: {
              Q23501: {
                labels: { fr: { value: 'Tomate' } },
                descriptions: { fr: { value: 'Espèce végétale' } },
                sitelinks: { frwiki: { title: 'Tomate' } },
                claims: {
                  P31: [{ mainsnak: { datavalue: { value: { id: 'Q16521' } } } }],
                  P105: [{ mainsnak: { datavalue: { value: { id: 'Q7432' } } } }],
                  P225: [{ mainsnak: { datavalue: { value: 'Solanum lycopersicum' } } }],
                  P18: [{ mainsnak: { datavalue: { value: 'Tomato_on_white_background.jpg' } } }],
                },
              },
            },
          };
        },
      };
    }
    if (raw.includes('api.gbif.org/v1/species/match')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            confidence: 96,
            canonicalName: 'Tomate',
            scientificName: 'Solanum lycopersicum',
            family: 'Solanaceae',
            order: 'Solanales',
            kingdom: 'Plantae',
            usageKey: 2930132,
          };
        },
      };
    }
    if (raw.includes('/species/2930132/descriptions')) {
      return { ok: true, status: 200, async json() { return { results: [] }; } };
    }
    if (raw.includes('api.gbif.org/v1/species/2930132') && !raw.includes('vernacularNames')) {
      return { ok: true, status: 200, async json() { return { taxonomicStatus: 'ACCEPTED' }; } };
    }
    if (raw.includes('api.checklistbank.org/dataset/3LR/nameusage/search')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            result: [{
              id: 'COL-2930132',
              name: 'Solanum lycopersicum',
              classification: [
                { rank: 'kingdom', name: 'Plantae' },
                { rank: 'order', name: 'Solanales' },
                { rank: 'family', name: 'Solanaceae' },
              ],
            }],
          };
        },
      };
    }
    if (raw.includes('api.inaturalist.org/v1/taxa')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            results: [{
              id: 58698,
              rank: 'species',
              name: 'Solanum lycopersicum',
              observations_count: 1000,
              matched_term: 'tomate',
            }],
          };
        },
      };
    }
    if (raw.includes('api.gbif.org/v1/species/2930132/vernacularNames')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return { results: [{ vernacularName: 'Tomate-cerise', language: 'fra' }] };
        },
      };
    }
    if (raw.includes('en.wikipedia.org/api/rest_v1/page/summary')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            title: 'Tomato',
            extract: 'The tomato is the edible berry of the plant Solanum lycopersicum, commonly known as a tomato plant.',
            content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Tomato' } },
          };
        },
      };
    }
    if (raw.includes('api.openai.com')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return { choices: [{ message: { content: '{}' } }] };
        },
      };
    }
    throw new Error(`URL inattendue: ${raw}`);
  };
  try {
    const res = await request(app)
      .get('/api/plants/autofill?q=tomate&hint_name=Tomate%20cerise&hint_scientific=Solanum%20lycopersicum')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    assert.strictEqual(res.body.query, 'tomate');
    assert.ok(hitCount > 0);
  } finally {
    global.fetch = previousFetch;
  }
});

test('GET /api/plants/autofill garde un fallback partiel si une source échoue', { concurrency: false }, async () => {
  const token = await getAdminAuthToken();
  const previousFetch = global.fetch;
  global.fetch = async (url) => {
    const raw = String(url || '');
    if (raw.includes('fr.wikipedia.org')) {
      throw new Error('timeout');
    }
    if (raw.includes('wikidata.org/w/api.php')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return { search: [] };
        },
      };
    }
    if (raw.includes('api.gbif.org/v1/species/match')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return { confidence: 88, canonicalName: 'Basilic', scientificName: 'Ocimum basilicum', usageKey: 3214412 };
        },
      };
    }
    if (raw.includes('/species/3214412/descriptions')) {
      return { ok: true, status: 200, async json() { return { results: [] }; } };
    }
    if (raw.includes('api.gbif.org/v1/species/3214412') && !raw.includes('vernacularNames')) {
      return { ok: true, status: 200, async json() { return { taxonomicStatus: 'ACCEPTED' }; } };
    }
    if (raw.includes('api.checklistbank.org/dataset/3LR/nameusage/search')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return { result: [{ id: 'COL-3214412', name: 'Ocimum basilicum' }] };
        },
      };
    }
    if (raw.includes('api.inaturalist.org/v1/taxa')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            results: [{
              id: 51734,
              rank: 'species',
              name: 'Ocimum basilicum',
              observations_count: 500,
              matched_term: 'basilic',
            }],
          };
        },
      };
    }
    if (raw.includes('api.gbif.org/v1/species/3214412/vernacularNames')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return { results: [] };
        },
      };
    }
    if (raw.includes('en.wikipedia.org/api/rest_v1/page/summary')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            title: 'Basil',
            extract: 'Basil is a culinary herb of the family Lamiaceae (mints). It is a tender plant, and is used in cuisines worldwide.',
            content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Basil' } },
          };
        },
      };
    }
    throw new Error(`URL inattendue: ${raw}`);
  };
  try {
    const res = await request(app)
      .get('/api/plants/autofill?q=basilic')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    assert.strictEqual(res.body.query, 'basilic');
    assert.strictEqual(res.body.fields.scientific_name, 'Ocimum basilicum');
    assert.ok(Array.isArray(res.body.warnings));
    assert.ok(res.body.warnings.some((w) => String(w).includes('wikipedia')));
  } finally {
    global.fetch = previousFetch;
  }
});

test('GET /api/visit/content expose mascot_packs (tableau)', async () => {
  const res = await request(app).get('/api/visit/content?map_id=foret').expect(200);
  assert.ok(Array.isArray(res.body.mascot_packs));
});

test('visit mascot packs : CRUD prof + présence dans content si publié', async () => {
  const token = await getAdminAuthToken();
  const created = await request(app)
    .post('/api/visit/mascot-packs')
    .set('Authorization', `Bearer ${token}`)
    .send({ map_id: 'foret', is_published: 0 })
    .expect(201);
  const packId = created.body.id;
  const catalogId = created.body.catalog_id;
  assert.ok(packId && /^[0-9a-f-]{36}$/i.test(String(packId)));
  assert.ok(String(catalogId || '').startsWith('srv-'));

  const beforePub = await request(app).get('/api/visit/content?map_id=foret').expect(200);
  assert.ok(!beforePub.body.mascot_packs.some((p) => p.catalog_id === catalogId));

  const list = await request(app)
    .get('/api/visit/mascot-packs?map_id=foret')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.ok(Array.isArray(list.body.packs));
  assert.ok(list.body.packs.some((p) => p.id === packId));

  const packObj = created.body.pack;
  await request(app)
    .put(`/api/visit/mascot-packs/${packId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      map_id: 'foret',
      label: 'Pack e2e test',
      pack: packObj,
      is_published: 1,
    })
    .expect(200);

  const afterPub = await request(app).get('/api/visit/content?map_id=foret').expect(200);
  assert.ok(afterPub.body.mascot_packs.some((p) => p.catalog_id === catalogId));

  await request(app)
    .delete(`/api/visit/mascot-packs/${packId}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  const afterDel = await request(app).get('/api/visit/content?map_id=foret').expect(200);
  assert.ok(!afterDel.body.mascot_packs.some((p) => p.catalog_id === catalogId));
});
