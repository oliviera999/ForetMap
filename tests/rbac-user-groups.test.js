require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const crypto = require('node:crypto');
const { app } = require('../server');
const { initSchema, execute } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { fetchGroupsByUserId } = require('../lib/rbacUserGroups');

test.before(async () => {
  await initSchema();
});

async function createStudent(label) {
  const id = crypto.randomUUID();
  const firstName = `Rug${label}`;
  const lastName = `Eleve${Date.now()}`.slice(0, 40);
  await execute(
    `INSERT INTO users
      (id, user_type, first_name, last_name, display_name, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'student', ?, ?, ?, 'local', 1, NOW(), NOW())`,
    [id, firstName, lastName, `${firstName} ${lastName}`],
  );
  return { id, displayName: `${firstName} ${lastName}` };
}

async function createGroup(token, { name, kind = 'class' }) {
  const res = await request(app)
    .post('/api/groups')
    .set('Authorization', `Bearer ${token}`)
    .send({ name, slug: `${name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'), kind })
    .expect(201);
  return res.body.id;
}

test('fetchGroupsByUserId : périmètre vide sans bypass → aucun groupe', async () => {
  const map = await fetchGroupsByUserId(['x'], { bypass: false, scopeGroupIds: new Set() });
  assert.strictEqual(map.size, 0);
});

test('RBAC admin : la fiche et la liste portent les groupes de l’utilisateur', async () => {
  const token = await ensureAdminTeacherAuthToken({ elevated: true });
  const student = await createStudent('A');
  const stamp = Date.now();
  const groupA = await createGroup(token, { name: `Zgroupe rbac ${stamp}`, kind: 'class' });
  const groupB = await createGroup(token, { name: `Agroupe rbac ${stamp}`, kind: 'club' });

  await execute(
    `INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, 'student')`,
    [groupA, student.id],
  );
  await execute(
    `INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, 'student')`,
    [groupB, student.id],
  );

  const detail = await request(app)
    .get(`/api/rbac/users/student/${student.id}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.ok(Array.isArray(detail.body.groups));
  assert.strictEqual(detail.body.groups.length, 2);
  // Tri alphabétique ; chaque groupe porte son profil par défaut (ici aucun).
  assert.strictEqual(detail.body.groups[0].id, groupB);
  assert.strictEqual(detail.body.groups[0].kind, 'club');
  assert.strictEqual(detail.body.groups[0].is_active, true);
  assert.strictEqual(detail.body.groups[0].default_role_id, null);
  assert.strictEqual(detail.body.groups[0].force_default_role, false);
  assert.strictEqual(detail.body.groups[1].id, groupA);

  const list = await request(app)
    .get('/api/rbac/users')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  const row = list.body.find((u) => String(u.id) === String(student.id));
  assert.ok(row, 'Le compte créé apparaît dans la liste RBAC');
  assert.deepStrictEqual(row.groups.map((g) => g.id).sort(), [groupA, groupB].sort());
  // Tout compte expose la clé, même sans rattachement.
  for (const u of list.body) {
    assert.ok(Array.isArray(u.groups), `groups[] manquant pour ${u.id}`);
  }

  await execute('DELETE FROM group_members WHERE user_id = ?', [student.id]);
  await execute('DELETE FROM `groups` WHERE id IN (?, ?)', [groupA, groupB]);
  await execute("DELETE FROM users WHERE id = ? AND user_type = 'student'", [student.id]);
});
