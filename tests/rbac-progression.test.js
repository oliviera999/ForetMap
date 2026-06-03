require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { initSchema, queryOne, execute } = require('../database');
const { app } = require('../server');
const { signAuthToken } = require('../middleware/requireTeacher');
const {
  ensureRbacBootstrap,
  getStudentProgressionConfig,
  resolveStudentRoleSlugFromValidatedCount,
} = require('../lib/rbac');

test.before(async () => {
  await initSchema();
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
  const requiredPermissions = ['admin.roles.manage', 'admin.users.assign_roles', 'tasks.manage', 'tasks.validate'];
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
  await execute('UPDATE user_roles SET is_primary = 0 WHERE user_type = ? AND user_id = ?', ['teacher', teacher.id]);
  await execute(
    'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
    ['teacher', teacher.id, adminRole.id]
  );
  return signAuthToken(
    {
      userType: 'teacher',
      userId: teacher.id,
      canonicalUserId: teacher.id,
      roleId: adminRole.id,
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

async function validateTasksForStudent({ teacherToken, studentId, firstName, lastName, zoneId, count, titlePrefix, ts }) {
  for (let i = 0; i < count; i += 1) {
    const task = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ title: `${titlePrefix} ${ts}-${i}`, zone_id: zoneId, required_students: 1 })
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
}

async function getStudentPrimaryRoleSlug(studentId) {
  const role = await queryOne(
    `SELECT r.slug
       FROM user_roles ur
       INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_type = 'student' AND ur.user_id = ? AND ur.is_primary = 1
      LIMIT 1`,
    [studentId]
  );
  return role?.slug || null;
}

test('getStudentProgressionConfig agrège tous les seuils min_done_tasks des profils n3beur', async () => {
  const teacherToken = await getAdminAuthToken();
  const ts = Date.now();
  const slugs = [`palier_a_${ts}`, `palier_b_${ts}`, `palier_c_${ts}`];
  const thresholds = [0, 12, 37];

  for (let i = 0; i < slugs.length; i += 1) {
    await request(app)
      .post('/api/rbac/profiles')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        slug: slugs[i],
        display_name: `Palier ${thresholds[i]}`,
        rank: 120 + i * 10,
        emoji: '🌱',
        min_done_tasks: thresholds[i],
        display_order: 9800 + i,
      })
      .expect(201);
  }

  const config = await getStudentProgressionConfig();
  for (const slug of slugs) {
    const step = (config.steps || []).find((s) => s.roleSlug === slug);
    assert.ok(step, `palier ${slug} absent de l’échelle`);
    const expectedMin = thresholds[slugs.indexOf(slug)];
    assert.strictEqual(step.min, expectedMin);
    assert.strictEqual(config.thresholds[slug], expectedMin);
  }

  const isolatedSteps = slugs.map((slug, i) => ({
    roleSlug: slug,
    min: thresholds[i],
    displayOrder: 9800 + i,
    label: slug,
  }));
  assert.strictEqual(resolveStudentRoleSlugFromValidatedCount(11, isolatedSteps), slugs[0]);
  assert.strictEqual(resolveStudentRoleSlugFromValidatedCount(12, isolatedSteps), slugs[1]);
  assert.strictEqual(resolveStudentRoleSlugFromValidatedCount(99, isolatedSteps), slugs[2]);

  for (const slug of slugs) {
    await execute('DELETE FROM roles WHERE slug = ?', [slug]);
  }
});

test('progression auto : palier perso. après profil manuel hors eleve_* (validation tâche)', async () => {
  const teacherToken = await getAdminAuthToken();
  const ts = Date.now();
  const targetSlug = `palier_prog_${ts}`;
  const manualSlug = `palier_manual_${ts}`;

  const targetRole = await request(app)
    .post('/api/rbac/profiles')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({
      slug: targetSlug,
      display_name: 'Palier intermédiaire',
      rank: 250,
      emoji: '🎯',
      min_done_tasks: 2,
      display_order: 9901,
    })
    .expect(201);

  await request(app)
    .post('/api/rbac/profiles')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({
      slug: manualSlug,
      display_name: 'Palier manuel départ',
      rank: 150,
      emoji: '🧭',
      min_done_tasks: 0,
      display_order: 9902,
    })
    .expect(201);

  const studentRes = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Prog', lastName: `Custom${ts}`, password: 'pass1234' })
    .expect(201);
  const { id: studentId, first_name: firstName, last_name: lastName } = studentRes.body;
  await setStudentPrimaryRole(studentId, manualSlug);

  const zones = await request(app).get('/api/zones').expect(200);
  const zoneId = zones.body[0]?.id || 'pg';

  for (let i = 0; i < 2; i += 1) {
    const task = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ title: `Prog custom ${ts}-${i}`, zone_id: zoneId, required_students: 1 })
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

  const role = await queryOne(
    `SELECT r.slug
       FROM user_roles ur
       INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_type = 'student' AND ur.user_id = ? AND ur.is_primary = 1
      LIMIT 1`,
    [studentId]
  );
  assert.strictEqual(role?.slug, targetSlug);

  const stats = await request(app)
    .get(`/api/stats/me/${studentId}`)
    .set('Authorization', `Bearer ${studentRes.body.authToken}`)
    .expect(200);
  assert.strictEqual(stats.body?.progression?.roleSlug, targetSlug);

  await execute('DELETE FROM roles WHERE id = ?', [targetRole.body.id]);
  await execute('DELETE FROM roles WHERE slug = ?', [manualSlug]);
});

test('progression auto : palier perso. rank < eleve_chevronne (seuil supérieur)', async () => {
  const teacherToken = await getAdminAuthToken();
  const ts = Date.now();
  const expertSlug = `palier_expert_${ts}`;

  const expertRole = await request(app)
    .post('/api/rbac/profiles')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({
      slug: expertSlug,
      display_name: 'Palier expert test',
      rank: 100,
      emoji: '⭐',
      min_done_tasks: 3,
      display_order: 9910,
    })
    .expect(201);

  const studentRes = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Expert', lastName: `Rank${ts}`, password: 'pass1234' })
    .expect(201);
  const { id: studentId, first_name: firstName, last_name: lastName } = studentRes.body;
  await setStudentPrimaryRole(studentId, 'eleve_chevronne');

  const zones = await request(app).get('/api/zones').expect(200);
  const zoneId = zones.body[0]?.id || 'pg';

  await validateTasksForStudent({
    teacherToken,
    studentId,
    firstName,
    lastName,
    zoneId,
    count: 3,
    titlePrefix: `Expert rank ${ts}`,
    ts,
  });

  assert.strictEqual(await getStudentPrimaryRoleSlug(studentId), expertSlug);

  const stats = await request(app)
    .get(`/api/stats/me/${studentId}`)
    .set('Authorization', `Bearer ${studentRes.body.authToken}`)
    .expect(200);
  assert.strictEqual(stats.body?.progression?.roleSlug, expertSlug);

  await execute('DELETE FROM roles WHERE id = ?', [expertRole.body.id]);
});

test('progression auto : pas de rétrogradation si placement manuel au-dessus du compteur', async () => {
  const teacherToken = await getAdminAuthToken();
  const ts = Date.now();
  const highSlug = `palier_haut_${ts}`;

  await request(app)
    .post('/api/rbac/profiles')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({
      slug: highSlug,
      display_name: 'Palier haut manuel',
      rank: 280,
      emoji: '🛡️',
      min_done_tasks: 50,
      display_order: 9911,
    })
    .expect(201);

  const studentRes = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Haut', lastName: `Manuel${ts}`, password: 'pass1234' })
    .expect(201);
  const { id: studentId, first_name: firstName, last_name: lastName } = studentRes.body;
  await setStudentPrimaryRole(studentId, highSlug);

  const zones = await request(app).get('/api/zones').expect(200);
  const zoneId = zones.body[0]?.id || 'pg';

  await validateTasksForStudent({
    teacherToken,
    studentId,
    firstName,
    lastName,
    zoneId,
    count: 2,
    titlePrefix: `Anti demote ${ts}`,
    ts,
  });

  assert.strictEqual(await getStudentPrimaryRoleSlug(studentId), highSlug);

  const stats = await request(app)
    .get(`/api/stats/me/${studentId}`)
    .set('Authorization', `Bearer ${studentRes.body.authToken}`)
    .expect(200);
  assert.strictEqual(stats.body?.progression?.roleSlug, highSlug);
  assert.strictEqual(stats.body?.stats?.done, 2);

  await execute('DELETE FROM roles WHERE slug = ?', [highSlug]);
});
