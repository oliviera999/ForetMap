'use strict';

/**
 * `DELETE /api/students/:id` — garde de rang (`lib/accountDeletionGuard.js`).
 *
 * On ne supprime qu'un compte dont le rang (le plus élevé du profil effectif et du profil
 * attribué) est **strictement inférieur** au sien — administrateur compris : un administrateur
 * ne supprime pas un autre administrateur par cette route. Jamais le dernier administrateur
 * actif.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');

const { initSchema, initDatabase, queryOne, execute } = require('../database');
const { app } = require('../server');
const { ensureRbacBootstrap, getPrimaryRoleForUser } = require('../lib/rbac');
const { recomputeUserRole } = require('../lib/effectiveRole');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { decideAccountDeletion } = require('../lib/accountDeletionGuard');

const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const createdUserIds = [];
const createdGroupIds = [];
let adminToken;

async function roleBySlug(slug) {
  const role = await queryOne('SELECT id, slug, `rank` FROM roles WHERE slug = ? LIMIT 1', [slug]);
  assert.ok(role?.id, `profil ${slug} absent`);
  return role;
}

async function createAccount({ userType = 'student', roleSlug }) {
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO users
       (id, user_type, email, pseudo, first_name, last_name, display_name, password_hash,
        auth_provider, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'Suppr', ?, ?, NULL, 'local', 1, NOW(), NOW())`,
    [
      id,
      userType,
      `s${id.slice(0, 8)}.${stamp}@suppr.test`,
      `s${id.slice(0, 10)}`,
      `Rang${id.slice(0, 8)}`,
      `Suppr ${id.slice(0, 8)}`,
    ],
  );
  createdUserIds.push(id);
  const role = await roleBySlug(roleSlug);
  await execute('UPDATE users SET assigned_role_id = ? WHERE id = ?', [role.id, id]);
  await recomputeUserRole(id);
  const token = await signAuthToken({ userType, userId: id, canonicalUserId: id });
  return { id, token };
}

async function exists(id) {
  return Boolean(await queryOne('SELECT id FROM users WHERE id = ?', [id]));
}

function del(token, id) {
  return request(app).delete(`/api/students/${id}`).set('Authorization', `Bearer ${token}`);
}

test.before(async () => {
  await initSchema();
  await initDatabase();
  await ensureRbacBootstrap();
  adminToken = await ensureAdminTeacherAuthToken({ elevated: true });
});

test.after(async () => {
  for (const id of createdGroupIds) {
    await execute('DELETE FROM group_members WHERE group_id = ?', [id]);
    await execute('DELETE FROM `groups` WHERE id = ?', [id]);
  }
  for (const id of createdUserIds) {
    await execute('DELETE FROM group_members WHERE user_id = ?', [id]);
    await execute('DELETE FROM user_roles WHERE user_id = ?', [id]);
    await execute('DELETE FROM users WHERE id = ?', [id]);
  }
});

// --- Décision pure -----------------------------------------------------------------------------

test('décision : rang strictement inférieur, admin compris ; jamais le dernier admin', () => {
  const n3boss = { userId: 'a', roleSlug: 'prof', roleRank: 400 };
  const admin = { userId: 'b', roleSlug: 'admin', roleRank: 500 };
  const eleve = { slug: 'eleve_novice', rank: 100 };
  const prof = { slug: 'prof', rank: 400 };
  const adminRole = { slug: 'admin', rank: 500 };

  assert.equal(
    decideAccountDeletion({ actor: n3boss, targetId: 't', effectiveRole: eleve }).ok,
    true,
  );
  assert.equal(
    decideAccountDeletion({ actor: n3boss, targetId: 't', effectiveRole: prof }).status,
    403,
  );
  // Profil attribué élevé masqué par un profil effectif plus bas : refus quand même.
  assert.equal(
    decideAccountDeletion({
      actor: n3boss,
      targetId: 't',
      effectiveRole: { slug: 'visiteur', rank: 50 },
      assignedRole: prof,
    }).status,
    403,
  );
  // Pas d'exception administrateur : un admin ne supprime pas un admin.
  assert.equal(
    decideAccountDeletion({
      actor: admin,
      targetId: 't',
      effectiveRole: adminRole,
      otherActiveAdmins: 3,
    }).status,
    403,
  );
  assert.equal(
    decideAccountDeletion({ actor: admin, targetId: 't', effectiveRole: prof }).ok,
    true,
  );
  // Soi-même : refusé.
  assert.equal(
    decideAccountDeletion({ actor: admin, targetId: 'b', effectiveRole: eleve }).status,
    403,
  );
  // Dernier administrateur : refusé, même pour un profil de rang supérieur.
  const above = { userId: 'c', roleSlug: 'super', roleRank: 600 };
  assert.equal(
    decideAccountDeletion({
      actor: above,
      targetId: 't',
      assignedRole: adminRole,
      effectiveRole: { slug: 'visiteur', rank: 50 },
      otherActiveAdmins: 0,
    }).status,
    409,
  );
  assert.equal(
    decideAccountDeletion({
      actor: above,
      targetId: 't',
      effectiveRole: adminRole,
      otherActiveAdmins: 1,
    }).ok,
    true,
  );
});

// --- Route ------------------------------------------------------------------------------------

test('route : un n3boss supprime un élève, pas un compte élève porteur du profil n3boss', async () => {
  const boss = await createAccount({ userType: 'teacher', roleSlug: 'prof' });
  const pupil = await createAccount({ roleSlug: 'eleve_novice' });
  await del(boss.token, pupil.id).expect(200);
  assert.equal(await exists(pupil.id), false);

  const peer = await createAccount({ roleSlug: 'prof' });
  const refused = await del(boss.token, peer.id);
  assert.equal(refused.status, 403, JSON.stringify(refused.body));
  assert.equal(await exists(peer.id), true);
});

test('route : le profil attribué compte, même masqué par un groupe qui impose plus bas', async () => {
  const boss = await createAccount({ userType: 'teacher', roleSlug: 'prof' });
  const target = await createAccount({ roleSlug: 'prof' });
  const visiteur = await roleBySlug('visiteur');
  const groupId = crypto.randomUUID();
  await execute(
    `INSERT INTO \`groups\` (id, slug, name, kind, default_role_id, force_default_role, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 'class', ?, 1, 1, NOW(), NOW())`,
    [groupId, `suppr-${groupId.slice(0, 8)}`, `Suppr ${groupId.slice(0, 8)}`, visiteur.id],
  );
  createdGroupIds.push(groupId);
  await execute(
    "INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, 'student')",
    [groupId, target.id],
  );
  await recomputeUserRole(target.id);
  assert.equal((await getPrimaryRoleForUser('student', target.id))?.slug, 'visiteur');

  const res = await del(boss.token, target.id);
  assert.equal(res.status, 403, JSON.stringify(res.body));
  assert.equal(await exists(target.id), true);
});

test('route : un administrateur ne supprime pas un administrateur par cette route', async () => {
  const otherAdmin = await createAccount({ roleSlug: 'admin' });
  const res = await del(adminToken, otherAdmin.id);
  assert.equal(res.status, 403, JSON.stringify(res.body));
  assert.equal(await exists(otherAdmin.id), true);

  // Un compte de rang inférieur reste supprimable par l'administrateur.
  const boss = await createAccount({ roleSlug: 'prof' });
  await del(adminToken, boss.id).expect(200);
  assert.equal(await exists(boss.id), false);
});
