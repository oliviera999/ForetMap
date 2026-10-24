'use strict';

/**
 * Gardes de rang sur l'attribution d'un profil — toutes voies confondues.
 *
 * Règle (`lib/rankGuard.js`) : l'administrateur attribue tout profil ; hors administrateur,
 * seulement un profil de rang **strictement inférieur** au sien. Elle vaut pour l'attribution
 * directe et en lot, la création et la duplication d'un compte, le profil par défaut d'un
 * groupe, le rattachement à un groupe (unitaire, en lot, liste des membres) et la génération
 * d'un code de classe.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const request = require('supertest');

const { initSchema, initDatabase, queryOne, execute } = require('../database');
const { app } = require('../server');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { recomputeUserRole } = require('../lib/effectiveRole');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { canGrantRank } = require('../lib/rankGuard');

const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const createdUserIds = [];
const createdRoleIds = [];
const createdGroupIds = [];
let adminToken;

// --- Aides -----------------------------------------------------------------------------------

async function roleBySlug(slug) {
  const role = await queryOne('SELECT id, slug, `rank` FROM roles WHERE slug = ? LIMIT 1', [slug]);
  assert.ok(role?.id, `profil ${slug} absent`);
  return role;
}

async function createRole({ slug, rank, permissions = [] }) {
  await execute(
    'INSERT INTO roles (slug, display_name, `rank`, is_system, display_order) VALUES (?, ?, ?, 0, 900)',
    [slug, slug, rank],
  );
  const role = await queryOne('SELECT * FROM roles WHERE slug = ? LIMIT 1', [slug]);
  createdRoleIds.push(role.id);
  for (const key of permissions) {
    await execute('INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)', [
      role.id,
      key,
    ]);
  }
  return role;
}

async function createAccount({ userType = 'teacher', roleSlug = null, roleId = null } = {}) {
  const id = crypto.randomUUID();
  const hash = await bcrypt.hash('mot-de-passe-garde-12', 4);
  await execute(
    `INSERT INTO users
       (id, user_type, email, pseudo, first_name, last_name, display_name, password_hash,
        auth_provider, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'Garde', ?, ?, ?, 'local', 1, NOW(), NOW())`,
    [
      id,
      userType,
      `g${id.slice(0, 8)}.${stamp}@garde.test`,
      `g${id.slice(0, 10)}`,
      `Rang${id.slice(0, 8)}`,
      `Garde ${id.slice(0, 8)}`,
      hash,
    ],
  );
  createdUserIds.push(id);
  const role = roleId ? { id: roleId } : roleSlug ? await roleBySlug(roleSlug) : null;
  if (role) await execute('UPDATE users SET assigned_role_id = ? WHERE id = ?', [role.id, id]);
  await recomputeUserRole(id);
  const token = await signAuthToken({ userType, userId: id, canonicalUserId: id });
  return { id, token };
}

async function createGroup({ defaultRoleId = null } = {}) {
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO \`groups\` (id, slug, name, kind, default_role_id, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 'class', ?, 1, NOW(), NOW())`,
    [id, `garde-${id.slice(0, 8)}`, `Garde ${id.slice(0, 8)}`, defaultRoleId],
  );
  createdGroupIds.push(id);
  return id;
}

async function addMember(groupId, userId, userType) {
  await execute('INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, ?)', [
    groupId,
    userId,
    userType,
  ]);
}

async function assignedSlug(userId) {
  const row = await queryOne(
    'SELECT r.slug FROM users u JOIN roles r ON r.id = u.assigned_role_id WHERE u.id = ?',
    [userId],
  );
  return row?.slug ?? null;
}

async function isMember(groupId, userId) {
  return Boolean(
    await queryOne('SELECT 1 AS x FROM group_members WHERE group_id = ? AND user_id = ?', [
      groupId,
      userId,
    ]),
  );
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
  for (const id of createdRoleIds) {
    await execute('UPDATE users SET assigned_role_id = NULL WHERE assigned_role_id = ?', [id]);
    await execute('DELETE FROM user_roles WHERE role_id = ?', [id]);
    await execute('DELETE FROM role_permissions WHERE role_id = ?', [id]);
    await execute('DELETE FROM roles WHERE id = ?', [id]);
  }
});

// --- Règle pure ------------------------------------------------------------------------------

test('canGrantRank : rang strictement inférieur hors administrateur, tout pour l’admin', () => {
  const n3boss = { roleSlug: 'prof', roleRank: 400 };
  assert.equal(canGrantRank(n3boss, 350), true);
  assert.equal(canGrantRank(n3boss, 400), false, 'rang égal refusé');
  assert.equal(canGrantRank(n3boss, 500), false);
  assert.equal(canGrantRank({ roleSlug: 'admin', roleRank: 500 }, 500), true);
  assert.equal(canGrantRank(null, 500), true, 'le système n’a pas de garde d’acteur');
  assert.equal(canGrantRank(n3boss, 'pas un rang'), false);
});

// --- Attribution directe, création, duplication ----------------------------------------------

test('création de compte : un n3boss ne crée pas de n3boss, l’administrateur oui', async () => {
  const boss = await createAccount({ roleSlug: 'prof' });
  const body = (suffix) => ({
    role_slug: 'prof',
    first_name: 'Rang',
    last_name: `Egal${suffix}${stamp}`,
    password: 'mot-de-passe-rang-12',
  });
  const refused = await request(app)
    .post('/api/rbac/users')
    .set('Authorization', `Bearer ${boss.token}`)
    .send(body('A'));
  assert.equal(refused.status, 403, JSON.stringify(refused.body));
  assert.ok(!(await queryOne('SELECT id FROM users WHERE last_name = ?', [`EgalA${stamp}`])));

  // Un profil de rang inférieur reste attribuable.
  const lower = await request(app)
    .post('/api/rbac/users')
    .set('Authorization', `Bearer ${boss.token}`)
    .send({ ...body('B'), role_slug: 'prof_classe' });
  assert.equal(lower.status, 201, JSON.stringify(lower.body));
  createdUserIds.push(lower.body.id);

  const byAdmin = await request(app)
    .post('/api/rbac/users')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(body('C'));
  assert.equal(byAdmin.status, 201, JSON.stringify(byAdmin.body));
  createdUserIds.push(byAdmin.body.id);
});

test('attribution unitaire et en lot : un délégué n’attribue pas un profil de son rang', async () => {
  const delegateRole = await createRole({
    slug: `garde-delegue-${stamp}`,
    rank: 380,
    permissions: ['teacher.access', 'admin.users.assign_roles'],
  });
  const peerRole = await createRole({ slug: `garde-pair-${stamp}`, rank: 380 });
  const lowerRole = await createRole({ slug: `garde-bas-${stamp}`, rank: 150 });
  const delegate = await createAccount({ roleId: delegateRole.id });
  const target = await createAccount({ userType: 'student', roleSlug: 'visiteur' });

  for (const roleId of [delegateRole.id, peerRole.id]) {
    const res = await request(app)
      .put(`/api/rbac/users/student/${target.id}/role`)
      .set('Authorization', `Bearer ${delegate.token}`)
      .send({ role_id: roleId });
    assert.equal(res.status, 403, JSON.stringify(res.body));
  }
  assert.equal(await assignedSlug(target.id), 'visiteur');

  const bulk = await request(app)
    .post('/api/rbac/users/bulk-role')
    .set('Authorization', `Bearer ${delegate.token}`)
    .send({ role_id: peerRole.id, users: [{ user_type: 'student', id: target.id }] });
  assert.equal(bulk.status, 200, JSON.stringify(bulk.body));
  assert.equal(bulk.body.updated, 0);
  assert.equal(bulk.body.results[0].ok, false);
  assert.equal(await assignedSlug(target.id), 'visiteur');

  const ok = await request(app)
    .put(`/api/rbac/users/student/${target.id}/role`)
    .set('Authorization', `Bearer ${delegate.token}`)
    .send({ role_id: lowerRole.id });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
});

test('duplication : la copie d’un compte de même rang que l’acteur est refusée', async () => {
  const boss = await createAccount({ roleSlug: 'prof' });
  // Compte de type élève portant le profil n3boss (création RBAC à type choisi).
  const source = await createAccount({ userType: 'student', roleSlug: 'prof' });
  const res = await request(app)
    .post(`/api/students/${source.id}/duplicate`)
    .set('Authorization', `Bearer ${boss.token}`)
    .send({ first_name: 'Copie', last_name: `Pair${stamp}`, password: 'mot-de-passe-copie' });
  assert.equal(res.status, 403, JSON.stringify(res.body));
  assert.ok(!(await queryOne('SELECT id FROM users WHERE last_name = ?', [`Pair${stamp}`])));
});

// --- Groupes -----------------------------------------------------------------------------------

test('profil par défaut d’un groupe : un n3boss ne pose pas un profil de son rang', async () => {
  const boss = await createAccount({ roleSlug: 'prof' });
  const groupId = await createGroup();
  const prof = await roleBySlug('prof');
  const res = await request(app)
    .patch(`/api/groups/${groupId}`)
    .set('Authorization', `Bearer ${boss.token}`)
    .send({ default_role_id: prof.id });
  // Refusé d'abord parce que « n3boss » n'est pas un profil élève (400) ; la garde de rang
  // (403) le refusait déjà.
  assert.ok([400, 403].includes(res.status), JSON.stringify(res.body));
  const row = await queryOne('SELECT default_role_id FROM `groups` WHERE id = ?', [groupId]);
  assert.equal(row.default_role_id, null);

  const profiles = await request(app)
    .get('/api/rbac/profiles')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(profiles.body.roles.find((r) => r.slug === 'eleve_novice').group_default_allowed);
});

test('rattachement : un prof de classe n’ajoute pas à un groupe qui confère son rang', async () => {
  // Profil sur mesure de même rang que « Prof de classe » (350), posé par l'administrateur.
  const sameRank = await createRole({ slug: `garde-classe-${stamp}`, rank: 350 });
  const groupId = await createGroup({ defaultRoleId: sameRank.id });
  const tutor = await createAccount({ roleSlug: 'prof_classe' });
  await addMember(groupId, tutor.id, 'teacher');
  const pupil = await createAccount({ userType: 'student', roleSlug: 'visiteur' });

  const unit = await request(app)
    .post(`/api/groups/${groupId}/members/${pupil.id}`)
    .set('Authorization', `Bearer ${tutor.token}`);
  assert.equal(unit.status, 403, JSON.stringify(unit.body));

  const bulk = await request(app)
    .post(`/api/groups/${groupId}/members/bulk`)
    .set('Authorization', `Bearer ${tutor.token}`)
    .send({ user_ids: [pupil.id] });
  assert.equal(bulk.status, 403, JSON.stringify(bulk.body));

  const list = await request(app)
    .put(`/api/groups/${groupId}/members`)
    .set('Authorization', `Bearer ${tutor.token}`)
    .send({ member_user_ids: [tutor.id, pupil.id] });
  assert.equal(list.status, 403, JSON.stringify(list.body));
  assert.equal(await isMember(groupId, pupil.id), false);

  // Réécrire la liste sans nouveau membre reste permis.
  await request(app)
    .put(`/api/groups/${groupId}/members`)
    .set('Authorization', `Bearer ${tutor.token}`)
    .send({ member_user_ids: [tutor.id] })
    .expect(200);

  // Le code de classe délègue le rattachement : même garde.
  const code = await request(app)
    .post(`/api/groups/${groupId}/class-code`)
    .set('Authorization', `Bearer ${tutor.token}`)
    .send({ action: 'generate' });
  assert.equal(code.status, 403, JSON.stringify(code.body));
  const row = await queryOne('SELECT class_code FROM `groups` WHERE id = ?', [groupId]);
  assert.equal(row.class_code, null);

  // L'administrateur, lui, rattache.
  await request(app)
    .post(`/api/groups/${groupId}/members/${pupil.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(201);
  assert.equal(await isMember(groupId, pupil.id), true);
});

test('rattachement : un groupe de profil inférieur reste ouvert au prof de classe', async () => {
  const novice = await roleBySlug('eleve_novice');
  const groupId = await createGroup({ defaultRoleId: novice.id });
  const tutor = await createAccount({ roleSlug: 'prof_classe' });
  await addMember(groupId, tutor.id, 'teacher');
  const pupil = await createAccount({ userType: 'student', roleSlug: 'visiteur' });
  await request(app)
    .post(`/api/groups/${groupId}/members/${pupil.id}`)
    .set('Authorization', `Bearer ${tutor.token}`)
    .expect(201);
  await request(app)
    .post(`/api/groups/${groupId}/class-code`)
    .set('Authorization', `Bearer ${tutor.token}`)
    .send({ action: 'generate' })
    .expect(200);
});

test('création avec groupe : refusée avant toute écriture si le groupe confère un rang égal', async () => {
  const boss = await createAccount({ roleSlug: 'prof' });
  const sameRank = await createRole({ slug: `garde-n3boss-${stamp}`, rank: 400 });
  const groupId = await createGroup({ defaultRoleId: sameRank.id });
  const res = await request(app)
    .post('/api/rbac/users')
    .set('Authorization', `Bearer ${boss.token}`)
    .send({
      role_slug: 'visiteur',
      first_name: 'Rang',
      last_name: `Groupe${stamp}`,
      password: 'mot-de-passe-rang-12',
      group_id: groupId,
    });
  assert.equal(res.status, 403, JSON.stringify(res.body));
  assert.ok(!(await queryOne('SELECT id FROM users WHERE last_name = ?', [`Groupe${stamp}`])));
});
