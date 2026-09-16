require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const crypto = require('node:crypto');
const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { countPrimaryAdmins, checkRoleAssignmentAllowed } = require('../lib/rbacRoleAssignment');

test.before(async () => {
  await initSchema();
});

async function createStudent(label) {
  const id = crypto.randomUUID();
  const firstName = `Bulk${label}`;
  const lastName = `Eleve${Date.now()}`.slice(0, 40);
  await execute(
    `INSERT INTO users
      (id, user_type, first_name, last_name, display_name, affiliation, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'student', ?, ?, ?, 'both', 'local', 1, NOW(), NOW())`,
    [id, firstName, lastName, `${firstName} ${lastName}`],
  );
  return id;
}

async function primaryRoleSlug(userId) {
  const row = await queryOne(
    `SELECT r.slug FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_type = 'student' AND ur.user_id = ? AND ur.is_primary = 1 LIMIT 1`,
    [userId],
  );
  return row?.slug ?? null;
}

test('POST /api/rbac/users/bulk-role : attribue en une fois et détaille chaque ligne', async () => {
  const token = await ensureAdminTeacherAuthToken({ elevated: true });
  const role = await queryOne("SELECT id FROM roles WHERE slug = 'eleve_avance' LIMIT 1");
  assert.ok(role?.id);
  const a = await createStudent('A');
  const b = await createStudent('B');

  const res = await request(app)
    .post('/api/rbac/users/bulk-role')
    .set('Authorization', `Bearer ${token}`)
    .send({
      role_id: role.id,
      users: [
        { user_type: 'student', id: a },
        { user_type: 'student', id: b },
        { user_type: 'student', id: 'inexistant-xyz' },
      ],
    })
    .expect(200);

  assert.strictEqual(res.body.updated, 2);
  assert.strictEqual(res.body.failed, 1);
  assert.strictEqual(res.body.results.length, 3);
  // Un échec n'annule pas les autres : les deux comptes valides sont bien passés.
  assert.strictEqual(await primaryRoleSlug(a), 'eleve_avance');
  assert.strictEqual(await primaryRoleSlug(b), 'eleve_avance');
  const failure = res.body.results.find((r) => !r.ok);
  assert.ok(failure.error, 'La ligne refusée porte son motif');

  await execute('DELETE FROM user_roles WHERE user_type = ? AND user_id IN (?, ?)', [
    'student',
    a,
    b,
  ]);
  await execute("DELETE FROM users WHERE id IN (?, ?) AND user_type = 'student'", [a, b]);
});

test('POST /api/rbac/users/bulk-role : corps invalide refusé avant toute écriture', async () => {
  const token = await ensureAdminTeacherAuthToken({ elevated: true });
  const role = await queryOne("SELECT id FROM roles WHERE slug = 'eleve_novice' LIMIT 1");

  await request(app)
    .post('/api/rbac/users/bulk-role')
    .set('Authorization', `Bearer ${token}`)
    .send({ role_id: role.id, users: [] })
    .expect(400);

  await request(app)
    .post('/api/rbac/users/bulk-role')
    .set('Authorization', `Bearer ${token}`)
    .send({ users: [{ user_type: 'student', id: 'x' }] })
    .expect(400);

  // Au-delà de la borne, l'appel est refusé plutôt que tronqué en silence.
  await request(app)
    .post('/api/rbac/users/bulk-role')
    .set('Authorization', `Bearer ${token}`)
    .send({
      role_id: role.id,
      users: Array.from({ length: 201 }, (_, i) => ({ user_type: 'student', id: `x${i}` })),
    })
    .expect(400);

  await request(app)
    .post('/api/rbac/users/bulk-role')
    .set('Authorization', `Bearer ${token}`)
    .send({ role_id: 99999999, users: [{ user_type: 'student', id: 'x' }] })
    .expect(404);
});

test('La garde d’attribution refuse de retirer le dernier administrateur', async () => {
  const adminRole = await queryOne("SELECT id, slug FROM roles WHERE slug = 'admin' LIMIT 1");
  const noviceRole = await queryOne(
    "SELECT id, slug FROM roles WHERE slug = 'eleve_novice' LIMIT 1",
  );
  const admin = await queryOne(
    `SELECT ur.user_id FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
      WHERE r.slug = 'admin' AND ur.is_primary = 1 AND ur.user_type = 'teacher' LIMIT 1`,
  );
  assert.ok(admin?.user_id, 'Un administrateur enseignant existe');

  const check = await checkRoleAssignmentAllowed({
    auth: { roleSlug: 'admin' },
    userType: 'teacher',
    userId: admin.user_id,
    roleId: noviceRole.id,
    nextRole: noviceRole,
  });
  if ((await countPrimaryAdmins()) <= 1) {
    assert.strictEqual(check.ok, false);
    assert.strictEqual(check.status, 409);
  } else {
    assert.strictEqual(check.ok, true);
  }

  // Un acteur non-admin ne peut pas toucher un compte admin, quel que soit le profil visé.
  const asProf = await checkRoleAssignmentAllowed({
    auth: { roleSlug: 'prof' },
    userType: 'teacher',
    userId: admin.user_id,
    roleId: noviceRole.id,
    nextRole: noviceRole,
  });
  assert.strictEqual(asProf.ok, false);
  assert.strictEqual(asProf.status, 403);

  // …ni accorder le rôle admin à qui que ce soit.
  const grant = await checkRoleAssignmentAllowed({
    auth: { roleSlug: 'prof' },
    userType: 'student',
    userId: 'peu-importe',
    roleId: adminRole.id,
    nextRole: adminRole,
  });
  assert.strictEqual(grant.ok, false);
  assert.strictEqual(grant.status, 403);
});
