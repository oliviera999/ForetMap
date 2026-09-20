require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const crypto = require('node:crypto');
const { app } = require('../server');
const { initSchema, queryOne, queryAll, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { setAssignedRole } = require('../lib/effectiveRole');
const { ensureAdminTeacherAuthToken, getAdminTeacherUserId } = require('./helpers/adminAuth');
const { restoreDefaultProgressionThresholds } = require('./helpers/progressionThresholds');

test.before(async () => {
  await initSchema();
  // Seuils de paliers remis à l'état de référence : d'autres fichiers de la suite les
  // déplacent sur la base partagée (cf. helpers/progressionThresholds.js).
  await restoreDefaultProgressionThresholds();
});

async function getAdminToken() {
  return ensureAdminTeacherAuthToken({ elevated: true });
}

async function getRoleId(slug) {
  const role = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [slug]);
  assert.ok(role?.id, `Profil introuvable: ${slug}`);
  return role.id;
}

async function getPrimaryRoleSlug(studentId) {
  const row = await queryOne(
    `SELECT r.slug FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_type = 'student' AND ur.user_id = ? AND ur.is_primary = 1 LIMIT 1`,
    [studentId],
  );
  return row?.slug ?? null;
}

async function createStudentForGroups(label) {
  const id = crypto.randomUUID();
  const firstName = `Grp${label}`;
  const lastName = `Eleve${Date.now()}`;
  await execute(
    `INSERT INTO users
      (id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'student', NULL, NULL, NULL, ?, ?, ?, NULL, 'local', 1, NOW(), NOW())`,
    [id, firstName, lastName, `${firstName} ${lastName}`],
  );
  const noviceRoleId = await getRoleId('eleve_novice');
  await execute(
    `INSERT INTO user_roles (user_type, user_id, role_id, is_primary)
     VALUES ('student', ?, ?, 1)
     ON DUPLICATE KEY UPDATE is_primary = 1`,
    [id, noviceRoleId],
  );
  await execute('UPDATE users SET assigned_role_id = ? WHERE id = ?', [noviceRoleId, id]);
  return { id, firstName, lastName };
}

/**
 * Compte enseignant portant le profil `roleSlug` (ligne `roles` existante). Le rang et les
 * permissions sont relus en base à chaque requête : le jeton ne porte que l'identité.
 */
async function createTeacherToken(label, roleSlug) {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const teacherId = `teacher-${label}-${stamp}`.slice(0, 64);
  const teacherEmail = `${teacherId}@foretmap.local`;
  const roleId = await getRoleId(roleSlug);
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, display_name, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'teacher', ?, ?, ?, 'x', 'local', 1, NOW(), NOW())`,
    [teacherId, teacherEmail, teacherId, `Prof ${label}`],
  );
  await execute(
    `INSERT INTO user_roles (user_type, user_id, role_id, is_primary)
     VALUES ('teacher', ?, ?, 1)
     ON DUPLICATE KEY UPDATE role_id = VALUES(role_id), is_primary = 1`,
    [teacherId, roleId],
  );
  await execute('UPDATE users SET assigned_role_id = ? WHERE id = ?', [roleId, teacherId]);
  const token = await signAuthToken(
    {
      userType: 'teacher',
      userId: teacherId,
      canonicalUserId: teacherId,
      roleId,
      roleSlug,
      roleDisplayName: roleSlug,
      elevated: false,
    },
    false,
  );
  return { token, teacherId };
}

async function createGroupViaApi(token, body) {
  const res = await request(app)
    .post('/api/groups')
    .set('Authorization', `Bearer ${token}`)
    .send(body)
    .expect(201);
  assert.ok(res.body?.id);
  return res.body;
}

test('Groupes: CRUD basique + membres + scopes', async () => {
  const token = await getAdminToken();
  const studentA = await createStudentForGroups('A');
  const studentB = await createStudentForGroups('B');

  const created = await createGroupViaApi(token, {
    name: `Classe test ${Date.now()}`,
    slug: `classe-test-${Date.now()}`,
    kind: 'class',
  });

  const mapRow = await queryOne('SELECT id FROM maps ORDER BY sort_order ASC LIMIT 1');
  assert.ok(mapRow?.id);

  // `manager_user_ids` (ancien « responsable ») est encore accepté mais fusionné : il n'y a
  // plus de rôle de membre, seulement l'appartenance.
  const membership = await request(app)
    .put(`/api/groups/${created.id}/members`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      member_user_ids: [studentA.id],
      manager_user_ids: [studentB.id],
      scope_map_ids: [mapRow.id],
      scope_project_ids: [],
    })
    .expect(200);
  assert.strictEqual(membership.body.group_id, created.id);
  assert.ok(Array.isArray(membership.body.members));
  const memberA = membership.body.members.find((m) => m.user_id === studentA.id);
  const memberB = membership.body.members.find((m) => m.user_id === studentB.id);
  assert.ok(memberA && memberB, 'les deux comptes sont membres');
  for (const member of [memberA, memberB]) {
    assert.strictEqual(member.user_type, 'student');
    assert.strictEqual(member.is_active, true);
    assert.strictEqual(member.role_slug, 'eleve_novice', 'profil effectif exposé par membre');
    assert.ok(!('role_in_group' in member), 'plus de rôle de membre (manager)');
  }
  assert.ok(Array.isArray(membership.body.scopes));
  assert.ok(membership.body.scopes.some((s) => s.map_id === mapRow.id));

  const list = await request(app)
    .get('/api/groups')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.ok(Array.isArray(list.body?.groups));
  assert.strictEqual(list.body.can_manage, true);
  assert.strictEqual(list.body.can_manage_default_role, true, 'admin règle le profil par défaut');
  const fromList = list.body.groups.find((g) => g.id === created.id);
  assert.ok(fromList);
  assert.ok(Array.isArray(fromList.members));
  assert.strictEqual(fromList.members.length, 2);

  const membersRes = await request(app)
    .get(`/api/groups/${created.id}/members`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.deepStrictEqual(
    membersRes.body.members.map((m) => m.user_id).sort(),
    [studentA.id, studentB.id].sort(),
  );

  // La route « appliquer le profil à tous les membres » n'existe plus : le réglage suffit.
  await request(app)
    .post(`/api/groups/${created.id}/apply-default-role`)
    .set('Authorization', `Bearer ${token}`)
    .expect(404);
});

test('Groupes: POST avec default_role_id conserve le profil par défaut et promeut un membre visiteur', async () => {
  const token = await getAdminToken();
  const student = await createStudentForGroups('N3');
  const visitorRoleId = await getRoleId('visiteur');
  const noviceRoleId = await getRoleId('eleve_novice');
  await setAssignedRole(student.id, visitorRoleId);
  assert.strictEqual(await getPrimaryRoleSlug(student.id), 'visiteur');

  const created = await createGroupViaApi(token, {
    name: `Classe n3beur ${Date.now()}`,
    slug: `classe-n3beur-${Date.now()}`,
    kind: 'class',
    default_role_id: noviceRoleId,
  });
  assert.strictEqual(Number(created.default_role_id), Number(noviceRoleId));
  assert.strictEqual(created.default_role_slug, 'eleve_novice');
  assert.strictEqual(created.force_default_role, false);

  const row = await queryOne('SELECT default_role_id FROM `groups` WHERE id = ? LIMIT 1', [
    created.id,
  ]);
  assert.strictEqual(Number(row?.default_role_id), Number(noviceRoleId));

  await request(app)
    .put(`/api/groups/${created.id}/members`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      member_user_ids: [student.id],
      manager_user_ids: [],
      scope_map_ids: [],
      scope_project_ids: [],
    })
    .expect(200);

  // « Le plus élevé l'emporte » : visiteur (attribué) < n3beur novice (conféré par le groupe).
  assert.strictEqual(await getPrimaryRoleSlug(student.id), 'eleve_novice');
});

test('Groupes: un groupe sans profil par défaut ne confère rien (le membre reste visiteur)', async () => {
  const token = await getAdminToken();
  const student = await createStudentForGroups('Rien');
  await setAssignedRole(student.id, await getRoleId('visiteur'));

  const created = await createGroupViaApi(token, {
    name: `Classe sans profil ${Date.now()}`,
    kind: 'class',
  });
  assert.strictEqual(created.default_role_id ?? null, null);

  await request(app)
    .post(`/api/groups/${created.id}/members/${student.id}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(201);
  assert.strictEqual(await getPrimaryRoleSlug(student.id), 'visiteur');
});

test('Groupes: un administrateur pose tout profil non GL ; un profil Gnomes & Licornes est refusé', async () => {
  const token = await getAdminToken();
  const stamp = Date.now();

  // Plus de refus « profil admin/prof interdit pour les élèves » : l'administrateur choisit.
  const created = await createGroupViaApi(token, {
    name: `Unité n3boss ${stamp}`,
    slug: `unite-n3boss-${stamp}`,
    kind: 'unit',
    default_role_id: await getRoleId('prof'),
  });
  assert.strictEqual(created.default_role_slug, 'prof');

  await request(app)
    .post('/api/groups')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: `Classe GL ${stamp}`,
      slug: `classe-gl-${stamp}`,
      kind: 'class',
      default_role_id: await getRoleId('gl_mj'),
    })
    .expect(400)
    .expect((res) => {
      assert.match(String(res.body?.error || ''), /Gnomes & Licornes/);
    });

  await request(app)
    .post('/api/groups')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: `Classe rôle inconnu ${stamp}`,
      slug: `classe-role-inconnu-${stamp}`,
      kind: 'class',
      default_role_id: 999999,
    })
    .expect(400)
    .expect((res) => {
      assert.strictEqual(res.body?.error, 'default_role_id invalide');
    });
});

test('Groupes: un prof de classe (rang 350) gère les membres mais pas le profil par défaut (403)', async () => {
  const adminToken = await getAdminToken();
  const { token, teacherId } = await createTeacherToken('classe', 'prof_classe');
  const noviceRoleId = await getRoleId('eleve_novice');
  const stamp = Date.now();

  const group = await createGroupViaApi(adminToken, {
    name: `Classe tutorat ${stamp}`,
    slug: `classe-tutorat-${stamp}`,
    kind: 'class',
  });
  await request(app)
    .post(`/api/groups/${group.id}/members/${teacherId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(201);

  const list = await request(app)
    .get('/api/groups')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.strictEqual(list.body.can_manage, true);
  assert.strictEqual(list.body.can_manage_default_role, false);

  // Renommer son groupe : oui.
  const renamed = await request(app)
    .patch(`/api/groups/${group.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ name: `Classe tutorat ${stamp} bis` })
    .expect(200);
  assert.strictEqual(renamed.body.name, `Classe tutorat ${stamp} bis`);

  // Régler ou imposer le profil par défaut : non.
  const refusedRole = await request(app)
    .patch(`/api/groups/${group.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ default_role_id: noviceRoleId })
    .expect(403);
  assert.match(refusedRole.body.error, /administrateur ou un n3boss/);

  await request(app)
    .patch(`/api/groups/${group.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ force_default_role: true })
    .expect(403);

  await request(app)
    .post('/api/groups')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: `Atelier ${stamp}`,
      kind: 'team',
      parent_group_id: group.id,
      default_role_id: noviceRoleId,
    })
    .expect(403);

  const row = await queryOne('SELECT default_role_id FROM `groups` WHERE id = ? LIMIT 1', [
    group.id,
  ]);
  assert.strictEqual(row?.default_role_id ?? null, null, 'le profil par défaut est resté vide');
});

test('Stats: un n3boss (prof, rang 400) membre d’un groupe voit tous les n3beurs sans filtre', async () => {
  const { token, teacherId } = await createTeacherToken('scope-all', 'prof');

  const studentInGroup = await createStudentForGroups('ProfIn');
  const studentOutGroup = await createStudentForGroups('ProfOut');
  const groupId = crypto.randomUUID();
  await execute(
    `INSERT INTO \`groups\` (id, slug, name, kind, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 'class', 1, NOW(), NOW())`,
    [groupId, `stats-prof-group-${Date.now()}`, `Stats Prof Group ${Date.now()}`],
  );
  await execute(
    `INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, 'student'), (?, ?, 'teacher')`,
    [groupId, studentInGroup.id, groupId, teacherId],
  );

  const allStats = await request(app)
    .get('/api/stats/all')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  const allIds = new Set((allStats.body.students || []).map((s) => String(s.id)));
  assert.ok(allIds.has(studentInGroup.id), 'élève du groupe visible');
  assert.ok(allIds.has(studentOutGroup.id), 'élève hors groupe visible : vue globale du n3boss');

  const scoped = await request(app)
    .get(`/api/stats/all?group_id=${encodeURIComponent(groupId)}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  const scopedIds = new Set((scoped.body.students || []).map((s) => String(s.id)));
  assert.ok(scopedIds.has(studentInGroup.id));
  assert.ok(!scopedIds.has(studentOutGroup.id));
});

test('Stats: un prof de classe (rang 350) reste borné à ses groupes même avec stats.read.all', async () => {
  // Profil éphémère de rang prof de classe portant `stats.read.all` : la vue globale dépend
  // du rang (≥ 400) ou du profil admin, pas d'une permission de statistiques (CDG-10).
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  const roleSlug = `prof_classe_stats_${stamp}`.replace(/[^a-z0-9_]/g, '_').slice(0, 64);
  await execute('INSERT INTO roles (slug, display_name, `rank`, is_system) VALUES (?, ?, 350, 0)', [
    roleSlug,
    `Prof de classe stats ${stamp}`,
  ]);
  const roleId = await getRoleId(roleSlug);
  const groupId = crypto.randomUUID();
  let teacherId = null;
  try {
    for (const key of ['teacher.access', 'groups.read', 'stats.read.all', 'stats.read.group']) {
      await execute('INSERT IGNORE INTO permissions (`key`, label) VALUES (?, ?)', [key, key]);
      await execute('INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)', [
        roleId,
        key,
      ]);
    }
    const created = await createTeacherToken('scope-bounded', roleSlug);
    teacherId = created.teacherId;
    const { token } = created;

    const studentInGroup = await createStudentForGroups('BoundIn');
    const studentOutGroup = await createStudentForGroups('BoundOut');
    await execute(
      `INSERT INTO \`groups\` (id, slug, name, kind, is_active, created_at, updated_at)
       VALUES (?, ?, ?, 'class', 1, NOW(), NOW())`,
      [groupId, `stats-bounded-group-${stamp}`, `Stats Bounded Group ${stamp}`],
    );
    await execute(
      `INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, 'student'), (?, ?, 'teacher')`,
      [groupId, studentInGroup.id, groupId, teacherId],
    );

    const allStats = await request(app)
      .get('/api/stats/all')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const allIds = new Set((allStats.body.students || []).map((s) => String(s.id)));
    assert.ok(allIds.has(studentInGroup.id), 'élève du groupe visible');
    assert.ok(!allIds.has(studentOutGroup.id), 'élève hors groupe invisible : périmètre borné');
  } finally {
    await execute('DELETE FROM group_members WHERE group_id = ?', [groupId]);
    await execute('DELETE FROM `groups` WHERE id = ?', [groupId]);
    if (teacherId) {
      await execute("DELETE FROM user_roles WHERE user_type = 'teacher' AND user_id = ?", [
        teacherId,
      ]);
      await execute('DELETE FROM users WHERE id = ?', [teacherId]);
    }
    await execute('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
    await execute('DELETE FROM roles WHERE id = ?', [roleId]);
  }
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
    `INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, 'student')`,
    [groupId, studentInGroup.id],
  );
  await execute(
    `INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, 'teacher')`,
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
    `INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, 'teacher')`,
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
    `INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, 'teacher')`,
    [groupId, teacherId],
  );
  await execute(
    `INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, 'student')`,
    [groupId, student.id],
  );
  await execute(
    `INSERT INTO tasks (id, title, description, map_id, group_id, required_students, completion_mode, status, created_at)
     VALUES (?, ?, '', 'foret', ?, 5, 'single_done', 'available', ?)`,
    [taskId, `Task group ${Date.now()}`, groupId, new Date()],
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

test('Groupes: la suppression détache (NULL) les group_id sans FK', async () => {
  const token = await getAdminToken();
  const groupId = crypto.randomUUID();
  const taskId = crypto.randomUUID();
  await execute(
    `INSERT INTO \`groups\` (id, slug, name, kind, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 'class', 1, NOW(), NOW())`,
    [groupId, `del-group-${Date.now()}`, `Del Group ${Date.now()}`],
  );
  await execute(
    `INSERT INTO tasks (id, title, description, map_id, group_id, required_students, completion_mode, status, created_at)
     VALUES (?, ?, '', 'foret', ?, 1, 'single_done', 'available', ?)`,
    [taskId, `Task del ${Date.now()}`, groupId, new Date()],
  );

  await request(app)
    .delete(`/api/groups/${groupId}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  const row = await queryOne('SELECT group_id FROM tasks WHERE id = ? LIMIT 1', [taskId]);
  assert.strictEqual(row?.group_id ?? null, null, 'la tâche ne doit plus référencer le groupe');
  const gone = await queryOne('SELECT id FROM `groups` WHERE id = ? LIMIT 1', [groupId]);
  assert.ok(!gone, 'le groupe est supprimé');
});

test('PATCH /api/groups/:id : rattachement à un parent, détachement, cycles refusés', async () => {
  const token = await getAdminToken();
  const stamp = Date.now();
  const parent = await createGroupViaApi(token, { name: `Parent ${stamp}`, kind: 'class' });
  const child = await createGroupViaApi(token, { name: `Enfant ${stamp}`, kind: 'team' });

  const attached = await request(app)
    .patch(`/api/groups/${child.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ parent_group_id: parent.id })
    .expect(200);
  assert.strictEqual(attached.body.parent_group_id, parent.id);
  assert.ok(!('roles_recomputed' in attached.body), 'le parent ne touche pas aux profils');

  // Le parent ne peut pas devenir l'enfant de son enfant (cycle), ni son propre parent.
  await request(app)
    .patch(`/api/groups/${parent.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ parent_group_id: child.id })
    .expect(400);
  await request(app)
    .patch(`/api/groups/${child.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ parent_group_id: child.id })
    .expect(400);
  await request(app)
    .patch(`/api/groups/${child.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ parent_group_id: 'inexistant' })
    .expect(400);

  const detached = await request(app)
    .patch(`/api/groups/${child.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ parent_group_id: null })
    .expect(200);
  assert.strictEqual(detached.body.parent_group_id, null);
  const row = await queryOne('SELECT parent_group_id FROM `groups` WHERE id = ? LIMIT 1', [
    child.id,
  ]);
  assert.strictEqual(row?.parent_group_id ?? null, null);
});

// ---------------------------------------------------------------------------
// F2-B — comptes en attente de rattachement + rattachement unitaire
// ---------------------------------------------------------------------------

async function createVisitorStudent(label) {
  const id = crypto.randomUUID();
  const firstName = `Visit${label}`;
  const lastName = `Attente${Date.now()}`;
  await execute(
    `INSERT INTO users
      (id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'student', NULL, NULL, NULL, ?, ?, ?, NULL, 'local', 1, NOW(), NOW())`,
    [id, firstName, lastName, `${firstName} ${lastName}`],
  );
  const visitorRoleId = await getRoleId('visiteur');
  await execute(
    `INSERT INTO user_roles (user_type, user_id, role_id, is_primary)
     VALUES ('student', ?, ?, 1)
     ON DUPLICATE KEY UPDATE role_id = VALUES(role_id), is_primary = 1`,
    [id, visitorRoleId],
  );
  await execute('UPDATE users SET assigned_role_id = ? WHERE id = ?', [visitorRoleId, id]);
  return { id, firstName, lastName };
}

test('F2-B : GET /api/groups/pending-visitors liste les comptes visiteurs', async () => {
  const token = await getAdminToken();
  const visitor = await createVisitorStudent('List');

  const res = await request(app)
    .get('/api/groups/pending-visitors')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.ok(Array.isArray(res.body));
  assert.ok(
    res.body.some((row) => String(row.id) === String(visitor.id)),
    'le visiteur créé doit apparaître dans la liste',
  );
});

test('F2-B : POST /api/groups/:id/members/:userId rattache et promeut le visiteur si le groupe confère eleve_novice', async () => {
  const token = await getAdminToken();
  const visitor = await createVisitorStudent('Attach');

  const group = await createGroupViaApi(token, {
    name: `Classe F2B ${Date.now()}`,
    kind: 'class',
    default_role_id: await getRoleId('eleve_novice'),
  });

  const attached = await request(app)
    .post(`/api/groups/${encodeURIComponent(group.id)}/members/${encodeURIComponent(visitor.id)}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(201);
  assert.strictEqual(attached.body?.role?.roleSlug, 'eleve_novice');
  assert.strictEqual(attached.body?.role?.source, 'group');

  const member = await queryOne(
    'SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1',
    [group.id, visitor.id],
  );
  assert.ok(member, 'membre inséré');
  assert.strictEqual(
    await getPrimaryRoleSlug(visitor.id),
    'eleve_novice',
    'promotion visiteur → n3beur novice par le profil par défaut du groupe',
  );

  // Le compte rattaché disparaît de la liste d'attente.
  const pending = await request(app)
    .get('/api/groups/pending-visitors')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.ok(!pending.body.some((row) => String(row.id) === String(visitor.id)));
});

test('F2-B : rattachement unitaire refusé sans permission groups.manage', async () => {
  const visitor = await createVisitorStudent('Deny');
  const other = await createVisitorStudent('DenyGrp');
  // `await` : sans lui l'en-tête vaut « Bearer [object Promise] » et le refus vient du jeton
  // invalide, pas de l'absence de `groups.manage` — le test passait pour la mauvaise raison.
  const studentToken = await signAuthToken({
    userType: 'student',
    userId: other.id,
    canonicalUserId: other.id,
    roleSlug: 'visiteur',
    permissions: [],
  });
  const res = await request(app)
    .post(`/api/groups/whatever/members/${encodeURIComponent(visitor.id)}`)
    .set('Authorization', `Bearer ${studentToken}`);
  assert.ok([401, 403].includes(res.status), `refus attendu, reçu ${res.status}`);
});

// ---------------------------------------------------------------------------
// F2-A — code de classe à l'inscription
// ---------------------------------------------------------------------------

test('F2-A : génération/suppression du code de classe et inscription avec code', async () => {
  const token = await getAdminToken();
  const group = await createGroupViaApi(token, {
    name: `Classe Code ${Date.now()}`,
    kind: 'class',
    default_role_id: await getRoleId('eleve_novice'),
  });
  const groupId = group.id;

  // Génération du code
  const gen = await request(app)
    .post(`/api/groups/${encodeURIComponent(groupId)}/class-code`)
    .set('Authorization', `Bearer ${token}`)
    .send({ action: 'generate' })
    .expect(200);
  const code = gen.body?.class_code;
  assert.ok(code && code.length >= 6, 'code généré');

  // Inscription avec le bon code → membre du groupe + profil conféré par le groupe
  const reg = await request(app)
    .post('/api/auth/register')
    .send({
      firstName: 'Code',
      lastName: `Classe${Date.now()}`,
      password: 'pwd1',
      classCode: code.toLowerCase(), // insensible à la casse
    })
    .expect(201);
  const studentId = reg.body?.id;
  assert.ok(studentId);

  const member = await queryOne(
    'SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1',
    [groupId, studentId],
  );
  assert.ok(member, 'inscrit rattaché au groupe du code');
  assert.strictEqual(
    await getPrimaryRoleSlug(studentId),
    'eleve_novice',
    'promotion directe via le code : le groupe confère eleve_novice',
  );

  // Suppression du code : l'inscription avec l'ancien code échoue proprement
  await request(app)
    .post(`/api/groups/${encodeURIComponent(groupId)}/class-code`)
    .set('Authorization', `Bearer ${token}`)
    .send({ action: 'clear' })
    .expect(200);

  const lastName = `Refus${Date.now()}`;
  const bad = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Code', lastName, password: 'pwd1', classCode: code })
    .expect(400);
  assert.match(String(bad.body?.error || ''), /Code de classe invalide/);

  // Aucun compte créé sur code invalide (correction possible sans compte orphelin)
  const orphan = await queryOne(
    "SELECT id FROM users WHERE user_type = 'student' AND last_name = ? LIMIT 1",
    [lastName],
  );
  assert.ok(orphan == null, 'pas de compte orphelin sur code invalide');
});

test('F2-A : le code d’un groupe sans profil par défaut rattache sans promouvoir', async () => {
  const token = await getAdminToken();
  const group = await createGroupViaApi(token, {
    name: `Club Code ${Date.now()}`,
    kind: 'club',
  });
  const gen = await request(app)
    .post(`/api/groups/${encodeURIComponent(group.id)}/class-code`)
    .set('Authorization', `Bearer ${token}`)
    .send({ action: 'generate' })
    .expect(200);

  const reg = await request(app)
    .post('/api/auth/register')
    .send({
      firstName: 'Code',
      lastName: `Club${Date.now()}`,
      password: 'pwd1',
      classCode: gen.body.class_code,
    })
    .expect(201);
  const member = await queryOne(
    'SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1',
    [group.id, reg.body.id],
  );
  assert.ok(member, 'inscrit rattaché au groupe du code');
  assert.strictEqual(await getPrimaryRoleSlug(reg.body.id), 'visiteur');
});

test("F2-A : l'inscription sans code reste possible (compte visiteur)", async () => {
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Sans', lastName: `Code${Date.now()}`, password: 'pwd1' })
    .expect(201);
  assert.strictEqual(await getPrimaryRoleSlug(reg.body?.id), 'visiteur');
});

test('Groupes: profil imposé — refus sans profil par défaut, recalcul immédiat des membres sinon', async () => {
  const token = await getAdminToken();
  const student = await createStudentForGroups('Forced');
  const stamp = Date.now();
  const avanceId = await getRoleId('eleve_avance');
  const noviceId = await getRoleId('eleve_novice');

  const created = await createGroupViaApi(token, {
    name: `Classe imposée ${stamp}`,
    slug: `classe-imposee-${stamp}`,
    kind: 'class',
  });
  const groupId = created.id;
  assert.strictEqual(created.force_default_role, false);

  // Imposer « la règle automatique » n'a pas de sens : refusé plutôt que sans effet.
  const refused = await request(app)
    .patch(`/api/groups/${groupId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ name: created.name, slug: created.slug, force_default_role: true })
    .expect(400);
  assert.match(refused.body.error, /default_role_id/);
  await request(app)
    .post('/api/groups')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: `Imposée sans profil ${stamp}`, kind: 'class', force_default_role: true })
    .expect(400);

  await request(app)
    .put(`/api/groups/${groupId}/members`)
    .set('Authorization', `Bearer ${token}`)
    .send({ member_user_ids: [student.id], manager_user_ids: [] })
    .expect(200);

  // L'élève monte au palier avancé (profil attribué), puis le groupe impose « novice ».
  await setAssignedRole(student.id, avanceId);
  assert.strictEqual(await getPrimaryRoleSlug(student.id), 'eleve_avance');

  const patched = await request(app)
    .patch(`/api/groups/${groupId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: created.name,
      slug: created.slug,
      default_role_id: noviceId,
      force_default_role: true,
    })
    .expect(200);
  assert.strictEqual(patched.body.force_default_role, true);
  assert.strictEqual(patched.body.default_role_slug, 'eleve_novice');
  assert.strictEqual(patched.body.roles_recomputed, 1, 'un membre a changé de profil effectif');
  assert.strictEqual(await getPrimaryRoleSlug(student.id), 'eleve_novice');

  const list = await request(app)
    .get('/api/groups')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  const row = (list.body.groups || []).find((g) => g.id === groupId);
  assert.strictEqual(row?.force_default_role, true);

  // Imposition levée : « le plus élevé l'emporte » rend le palier avancé attribué.
  const released = await request(app)
    .patch(`/api/groups/${groupId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ force_default_role: false })
    .expect(200);
  assert.strictEqual(released.body.force_default_role, false);
  assert.strictEqual(released.body.roles_recomputed, 1);
  assert.strictEqual(await getPrimaryRoleSlug(student.id), 'eleve_avance');

  // Groupe désactivé : il ne confère plus rien, mais le profil attribué reste (rien à recalculer).
  const deactivated = await request(app)
    .patch(`/api/groups/${groupId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ is_active: false })
    .expect(200);
  assert.strictEqual(deactivated.body.roles_recomputed, 0);
  assert.strictEqual(await getPrimaryRoleSlug(student.id), 'eleve_avance');
});

test('F2-B : un visiteur déjà membre d’un groupe n’est plus « en attente de rattachement »', async () => {
  const token = await getAdminToken();
  const visitor = await createVisitorStudent('AlreadyGrouped');

  // Groupe sans profil par défaut : le compte reste visiteur — c'est le profil voulu, pas une
  // attente. Il gonflait pourtant la pastille d'alerte.
  const group = await createGroupViaApi(token, { name: `Club visite ${Date.now()}`, kind: 'club' });
  const groupId = group.id;

  await request(app)
    .post(`/api/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(visitor.id)}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(201);
  assert.strictEqual(await getPrimaryRoleSlug(visitor.id), 'visiteur', 'bien resté visiteur');

  const pending = await request(app)
    .get('/api/groups/pending-visitors')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.ok(
    !pending.body.some((row) => String(row.id) === String(visitor.id)),
    'un visiteur rattaché à un groupe ne doit plus être compté en attente',
  );

  // Retiré du groupe, il revient dans la liste : c'est alors une vraie attente.
  await request(app)
    .delete(`/api/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(visitor.id)}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  const pendingAfter = await request(app)
    .get('/api/groups/pending-visitors')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.ok(pendingAfter.body.some((row) => String(row.id) === String(visitor.id)));
});

test('GET /api/rbac/profiles : `group_default_allowed` cadre le sélecteur de profil de groupe (admin : tout sauf GL)', async () => {
  const token = await getAdminToken();
  const res = await request(app)
    .get('/api/rbac/profiles')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  // La réponse est un objet `{ roles }` — le sélecteur des groupes la lisait comme un tableau
  // et n'affichait donc jamais aucun profil.
  assert.ok(!Array.isArray(res.body));
  assert.ok(Array.isArray(res.body.roles));

  const bySlug = new Map(res.body.roles.map((r) => [r.slug, r]));
  for (const slug of [
    'visiteur',
    'personnel',
    'eleve_novice',
    'eleve_avance',
    'eleve_chevronne',
    'prof_classe',
    'prof',
    'admin',
  ]) {
    assert.strictEqual(bySlug.get(slug)?.group_default_allowed, true, `${slug} doit être proposé`);
  }
  for (const role of res.body.roles.filter((r) => String(r.slug).startsWith('gl_'))) {
    assert.strictEqual(role.group_default_allowed, false, `${role.slug} doit être exclu`);
  }
});

test('PATCH /api/groups/:id accepte « personnel » comme profil par défaut', async () => {
  const token = await getAdminToken();
  const group = await createGroupViaApi(token, { name: `Personnel ${Date.now()}`, kind: 'unit' });
  const personnelId = await getRoleId('personnel');

  await request(app)
    .patch(`/api/groups/${encodeURIComponent(group.id)}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ default_role_id: personnelId })
    .expect(200);

  const row = await queryOne('SELECT default_role_id FROM `groups` WHERE id = ? LIMIT 1', [
    group.id,
  ]);
  assert.strictEqual(Number(row?.default_role_id), Number(personnelId));
});
