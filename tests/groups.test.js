require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const crypto = require('node:crypto');
const { app } = require('../server');
const { initSchema, queryOne, queryAll, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ensureAdminTeacherAuthToken, getAdminTeacherUserId } = require('./helpers/adminAuth');

test.before(async () => {
  await initSchema();
});

async function getAdminToken() {
  return ensureAdminTeacherAuthToken({ elevated: true });
}

async function createStudentForGroups(label) {
  const id = crypto.randomUUID();
  const firstName = `Grp${label}`;
  const lastName = `Eleve${Date.now()}`;
  await execute(
    `INSERT INTO users
      (id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name, affiliation, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'student', NULL, NULL, NULL, ?, ?, ?, 'both', NULL, 'local', 1, NOW(), NOW())`,
    [id, firstName, lastName, `${firstName} ${lastName}`],
  );
  const noviceRole = await queryOne("SELECT id FROM roles WHERE slug = 'eleve_novice' LIMIT 1");
  assert.ok(noviceRole?.id);
  await execute(
    `INSERT INTO user_roles (user_type, user_id, role_id, is_primary)
     VALUES ('student', ?, ?, 1)
     ON DUPLICATE KEY UPDATE is_primary = 1`,
    [id, noviceRole.id],
  );
  return { id, firstName, lastName };
}

test('Groupes: CRUD basique + membres + scopes', async () => {
  const token = await getAdminToken();
  const studentA = await createStudentForGroups('A');
  const studentB = await createStudentForGroups('B');

  const created = await request(app)
    .post('/api/groups')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: `Classe test ${Date.now()}`,
      slug: `classe-test-${Date.now()}`,
      kind: 'class',
    })
    .expect(201);
  assert.ok(created.body?.id);

  const mapRow = await queryOne('SELECT id FROM maps ORDER BY sort_order ASC LIMIT 1');
  assert.ok(mapRow?.id);

  const membership = await request(app)
    .put(`/api/groups/${created.body.id}/members`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      member_user_ids: [studentA.id],
      manager_user_ids: [studentB.id],
      scope_map_ids: [mapRow.id],
      scope_project_ids: [],
    })
    .expect(200);
  assert.strictEqual(membership.body.group_id, created.body.id);
  assert.ok(Array.isArray(membership.body.members));
  assert.ok(membership.body.members.some((m) => m.user_id === studentA.id));
  assert.ok(
    membership.body.members.some((m) => m.user_id === studentB.id && m.role_in_group === 'manager'),
  );
  assert.ok(Array.isArray(membership.body.scopes));
  assert.ok(membership.body.scopes.some((s) => s.map_id === mapRow.id));

  const list = await request(app)
    .get('/api/groups')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.ok(Array.isArray(list.body?.groups));
  const fromList = list.body.groups.find((g) => g.id === created.body.id);
  assert.ok(fromList);
  assert.ok(Array.isArray(fromList.members));
});

test('Groupes: POST conserve grants_n3beur_access et promeut un membre visiteur', async () => {
  const token = await getAdminToken();
  const student = await createStudentForGroups('N3');
  const visitorRole = await queryOne("SELECT id FROM roles WHERE slug = 'visiteur' LIMIT 1");
  assert.ok(visitorRole?.id);
  await execute(
    `UPDATE user_roles SET role_id = ?, is_primary = 1
      WHERE user_type = 'student' AND user_id = ?`,
    [visitorRole.id, student.id],
  );

  const created = await request(app)
    .post('/api/groups')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: `Classe n3beur ${Date.now()}`,
      slug: `classe-n3beur-${Date.now()}`,
      kind: 'class',
      grants_n3beur_access: true,
    })
    .expect(201);
  assert.strictEqual(created.body?.grants_n3beur_access, true);

  const row = await queryOne('SELECT grants_n3beur_access FROM `groups` WHERE id = ? LIMIT 1', [
    created.body.id,
  ]);
  assert.strictEqual(Number(row?.grants_n3beur_access), 1);

  await request(app)
    .put(`/api/groups/${created.body.id}/members`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      member_user_ids: [student.id],
      manager_user_ids: [],
      scope_map_ids: [],
      scope_project_ids: [],
    })
    .expect(200);

  const roleRow = await queryOne(
    `SELECT r.slug FROM user_roles ur
       INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_type = 'student' AND ur.user_id = ? AND ur.is_primary = 1
      LIMIT 1`,
    [student.id],
  );
  assert.strictEqual(roleRow?.slug, 'eleve_novice');
});

test('Groupes: refuse un profil par défaut admin/prof pour les élèves', async () => {
  const token = await getAdminToken();
  const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  assert.ok(adminRole?.id);

  await request(app)
    .post('/api/groups')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: `Classe unsafe role ${Date.now()}`,
      slug: `classe-unsafe-role-${Date.now()}`,
      kind: 'class',
      default_role_id: adminRole.id,
      grants_n3beur_access: true,
    })
    .expect(400)
    .expect((res) => {
      assert.strictEqual(res.body?.error, 'default_role_id invalide');
    });
});

async function createProfTeacherToken(label) {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const teacherId = `teacher-prof-${label}-${stamp}`.slice(0, 64);
  const teacherEmail = `${teacherId}@foretmap.local`;
  const profRole = await queryOne("SELECT id FROM roles WHERE slug = 'prof' LIMIT 1");
  assert.ok(profRole?.id, 'Rôle prof introuvable');
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, display_name, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'teacher', ?, ?, ?, 'x', 'local', 1, NOW(), NOW())`,
    [teacherId, teacherEmail, teacherId, `Prof ${label}`],
  );
  await execute(
    `INSERT INTO user_roles (user_type, user_id, role_id, is_primary)
     VALUES ('teacher', ?, ?, 1)
     ON DUPLICATE KEY UPDATE role_id = VALUES(role_id), is_primary = 1`,
    [teacherId, profRole.id],
  );
  const token = await signAuthToken(
    {
      userType: 'teacher',
      userId: teacherId,
      canonicalUserId: teacherId,
      roleId: profRole.id,
      roleSlug: 'prof',
      roleDisplayName: 'n3boss',
      elevated: false,
    },
    false,
  );
  return { token, teacherId };
}

test('Stats: prof avec stats.read.all et membre d’un groupe voit tous les n3beurs sans filtre', async () => {
  const { token, teacherId } = await createProfTeacherToken('scope-all');

  const studentInGroup = await createStudentForGroups('ProfIn');
  const studentOutGroup = await createStudentForGroups('ProfOut');
  const groupId = crypto.randomUUID();
  await execute(
    `INSERT INTO \`groups\` (id, slug, name, kind, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 'class', 1, NOW(), NOW())`,
    [groupId, `stats-prof-group-${Date.now()}`, `Stats Prof Group ${Date.now()}`],
  );
  await execute(
    `INSERT INTO group_members (group_id, user_id, user_type, role_in_group)
     VALUES (?, ?, 'student', 'member'), (?, ?, 'teacher', 'manager')`,
    [groupId, studentInGroup.id, groupId, teacherId],
  );

  const allStats = await request(app)
    .get('/api/stats/all')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  const allIds = new Set((allStats.body.students || []).map((s) => String(s.id)));
  assert.ok(allIds.has(studentInGroup.id), 'élève du groupe visible');
  assert.ok(allIds.has(studentOutGroup.id), 'élève hors groupe visible avec stats.read.all');

  const scoped = await request(app)
    .get(`/api/stats/all?group_id=${encodeURIComponent(groupId)}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  const scopedIds = new Set((scoped.body.students || []).map((s) => String(s.id)));
  assert.ok(scopedIds.has(studentInGroup.id));
  assert.ok(!scopedIds.has(studentOutGroup.id));
});

test('Stats: filtre group_id limite la liste des n3beurs', async () => {
  const token = await getAdminToken();
  const studentInGroup = await createStudentForGroups('In');
  const studentOutGroup = await createStudentForGroups('Out');
  const groupId = crypto.randomUUID();
  await execute(
    `INSERT INTO \`groups\` (id, slug, name, kind, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 'class', 1, NOW(), NOW())`,
    [groupId, `stats-group-${Date.now()}`, `Stats Group ${Date.now()}`],
  );
  await execute(
    `INSERT INTO group_members (group_id, user_id, user_type, role_in_group)
     VALUES (?, ?, 'student', 'member')`,
    [groupId, studentInGroup.id],
  );
  await execute(
    `INSERT INTO group_members (group_id, user_id, user_type, role_in_group)
     VALUES (?, ?, 'teacher', 'manager')`,
    [groupId, (await queryOne("SELECT id FROM users WHERE user_type='teacher' LIMIT 1")).id],
  );

  const allStats = await request(app)
    .get('/api/stats/all')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  const allIds = new Set((allStats.body.students || []).map((s) => String(s.id)));
  assert.ok(allIds.has(studentInGroup.id));
  assert.ok(allIds.has(studentOutGroup.id));

  const scoped = await request(app)
    .get(`/api/stats/all?group_id=${encodeURIComponent(groupId)}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  const scopedIds = new Set((scoped.body.students || []).map((s) => String(s.id)));
  assert.ok(scopedIds.has(studentInGroup.id));
  assert.ok(!scopedIds.has(studentOutGroup.id));
});

test('Forum: création de sujet dans un groupe et filtrage /threads', async () => {
  const token = await getAdminToken();
  const teacherId = await getAdminTeacherUserId();
  const groupId = crypto.randomUUID();
  await execute(
    `INSERT INTO \`groups\` (id, slug, name, kind, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 'class', 1, NOW(), NOW())`,
    [groupId, `forum-group-${Date.now()}`, `Forum Group ${Date.now()}`],
  );
  await execute(
    `INSERT INTO group_members (group_id, user_id, user_type, role_in_group)
     VALUES (?, ?, 'teacher', 'manager')`,
    [groupId, teacherId],
  );

  const created = await request(app)
    .post('/api/forum/threads')
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: `Sujet groupe ${Date.now()}`,
      body: 'Message forum scoped',
      group_id: groupId,
    })
    .expect(201);
  assert.strictEqual(created.body?.thread?.group_id, groupId);

  const listed = await request(app)
    .get(`/api/forum/threads?group_id=${encodeURIComponent(groupId)}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.ok(Array.isArray(listed.body.items));
  assert.ok(listed.body.items.some((t) => t.id === created.body.thread.id));

  const dbRow = await queryOne('SELECT group_id FROM forum_threads WHERE id = ? LIMIT 1', [
    created.body.thread.id,
  ]);
  assert.strictEqual(String(dbRow?.group_id || ''), groupId);
});

test('Tasks: affectation rapide par groupe', async () => {
  const token = await getAdminToken();
  const teacherId = await getAdminTeacherUserId();
  const student = await createStudentForGroups('Task');
  const groupId = crypto.randomUUID();
  const taskId = crypto.randomUUID();
  await execute(
    `INSERT INTO \`groups\` (id, slug, name, kind, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 'class', 1, NOW(), NOW())`,
    [groupId, `task-group-${Date.now()}`, `Task Group ${Date.now()}`],
  );
  await execute(
    `INSERT INTO group_members (group_id, user_id, user_type, role_in_group)
     VALUES (?, ?, 'teacher', 'manager')`,
    [groupId, teacherId],
  );
  await execute(
    `INSERT INTO group_members (group_id, user_id, user_type, role_in_group)
     VALUES (?, ?, 'student', 'member')`,
    [groupId, student.id],
  );
  await execute(
    `INSERT INTO tasks (id, title, description, map_id, group_id, required_students, completion_mode, status, created_at)
     VALUES (?, ?, '', 'foret', ?, 5, 'single_done', 'available', ?)`,
    [taskId, `Task group ${Date.now()}`, groupId, new Date().toISOString()],
  );

  const res = await request(app)
    .post(`/api/tasks/${taskId}/assign-group`)
    .set('Authorization', `Bearer ${token}`)
    .send({ group_id: groupId })
    .expect(200);
  assert.ok(Number(res.body.assigned) >= 1);
  const assignments = await queryAll('SELECT student_id FROM task_assignments WHERE task_id = ?', [
    taskId,
  ]);
  assert.ok(assignments.some((a) => String(a.student_id) === student.id));
});
