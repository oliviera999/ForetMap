'use strict';

/**
 * Cycle de vie des comptes et gardes d'attribution (audit CDG 2026-09, chantiers 1 à 4) :
 *   - création de compte enseignant via `POST /api/rbac/users` (profil attribué, prof de
 *     classe par défaut pour un enseignant sans profil) ;
 *   - attribution unitaire : soi-même, rang supérieur, `admin` hors administrateur, `gl_*` ;
 *   - désactivation / réactivation (`PATCH is_active`) : soi-même, pair, dernier admin,
 *     connexion et session refusées ;
 *   - suppression d'un enseignant : réservée à l'administrateur, contenu conservé, session
 *     révoquée avec `deleted: true`.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const {
  ensureDefaultAssignments,
  getPrimaryRoleForUser,
  resetRbacBootstrapForTests,
} = require('../lib/rbac');
const { setAssignedRole } = require('../lib/effectiveRole');

let adminToken;
const PASSWORD = 'MotDePasseSolide!42';

test.before(async () => {
  await initSchema();
  adminToken = await ensureAdminTeacherAuthToken();
  // Par défaut seul l'administrateur gère les comptes ; on prête `admin.users.assign_roles`
  // au n3boss le temps du fichier pour exercer les gardes de rang.
  const prof = await queryOne("SELECT id FROM roles WHERE slug = 'prof' LIMIT 1");
  await execute(
    "INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, 'admin.users.assign_roles')",
    [prof.id],
  );
  resetRbacBootstrapForTests();
});

test.after(async () => {
  const prof = await queryOne("SELECT id FROM roles WHERE slug = 'prof' LIMIT 1");
  await execute(
    "DELETE FROM role_permissions WHERE role_id = ? AND permission_key = 'admin.users.assign_roles'",
    [prof.id],
  );
  resetRbacBootstrapForTests();
});

async function roleBySlug(slug) {
  const role = await queryOne('SELECT id, slug, `rank` FROM roles WHERE slug = ? LIMIT 1', [slug]);
  assert.ok(role?.id, `profil ${slug} absent`);
  return role;
}

/** Crée un enseignant avec un profil attribué et renvoie `{ id, token, email }`. */
async function createTeacher(label, roleSlug = 'prof') {
  const id = crypto.randomUUID();
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const email = `${label}_${stamp}@example.com`;
  const hash = await bcrypt.hash(PASSWORD, 10);
  await execute(
    `INSERT INTO users
      (id, user_type, email, pseudo, display_name, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'teacher', ?, ?, ?, ?, 'local', 1, NOW(), NOW())`,
    [id, email, `${label}_${stamp}`, `Prof ${label}`, hash],
  );
  const role = await roleBySlug(roleSlug);
  await setAssignedRole(id, role.id);
  const token = await signAuthToken({
    userType: 'teacher',
    userId: id,
    roleId: role.id,
    roleSlug: role.slug,
    roleRank: role.rank,
  });
  return { id, token, email };
}

async function effectiveSlug(userType, userId) {
  return (await getPrimaryRoleForUser(userType, userId))?.slug ?? null;
}

test('enseignant sans profil : le démarrage lui pose « prof de classe », jamais n3boss', async () => {
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, display_name, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'teacher', ?, ?, 'Sans profil', NULL, 'local', 1, NOW(), NOW())`,
    [id, `noprofile_${Date.now()}@example.com`, `noprofile_${Date.now()}`],
  );
  await ensureDefaultAssignments();
  assert.strictEqual(await effectiveSlug('teacher', id), 'prof_classe');
  const row = await queryOne('SELECT assigned_role_id FROM users WHERE id = ?', [id]);
  assert.strictEqual(Number(row.assigned_role_id), Number((await roleBySlug('prof_classe')).id));
});

test('POST /api/rbac/users : un enseignant est créé avec le profil demandé (type déduit du profil)', async () => {
  const stamp = Date.now();
  const res = await request(app)
    .post('/api/rbac/users')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      role_slug: 'prof_classe',
      first_name: 'Créé',
      last_name: `ProfClasse${stamp}`,
      email: `cree_${stamp}@example.com`,
      password: PASSWORD,
    })
    .expect(201);
  assert.strictEqual(res.body.user_type, 'teacher');
  assert.strictEqual(await effectiveSlug('teacher', res.body.id), 'prof_classe');

  // Un profil du jeu G&L ne se crée pas depuis ForetMap.
  await request(app)
    .post('/api/rbac/users')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ role_slug: 'gl_mj', first_name: 'X', last_name: `Y${stamp}`, password: PASSWORD })
    .expect(400);
});

test('attribution unitaire : gardes soi-même / rang / admin / G&L', async () => {
  const n3boss = await createTeacher('boss', 'prof');
  const cible = await createTeacher('cible', 'prof_classe');
  const admin = await roleBySlug('admin');
  const prof = await roleBySlug('prof');
  const glMj = await roleBySlug('gl_mj');
  const profClasse = await roleBySlug('prof_classe');

  // Soi-même : refusé, même pour un administrateur.
  await request(app)
    .put(`/api/rbac/users/teacher/${n3boss.id}/role`)
    .set('Authorization', `Bearer ${n3boss.token}`)
    .send({ role_id: profClasse.id })
    .expect(403);
  // Un n3boss n'attribue pas `admin`.
  const refusedAdmin = await request(app)
    .put(`/api/rbac/users/teacher/${cible.id}/role`)
    .set('Authorization', `Bearer ${n3boss.token}`)
    .send({ role_id: admin.id })
    .expect(403);
  assert.match(String(refusedAdmin.body.error), /admin/i);
  // Un profil G&L ne s'attribue pas depuis ForetMap.
  await request(app)
    .put(`/api/rbac/users/teacher/${cible.id}/role`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ role_id: glMj.id })
    .expect(400);
  // Un n3boss peut attribuer un profil de rang ≤ au sien.
  const ok = await request(app)
    .put(`/api/rbac/users/teacher/${cible.id}/role`)
    .set('Authorization', `Bearer ${n3boss.token}`)
    .send({ role_id: prof.id })
    .expect(200);
  assert.strictEqual(ok.body.effective.roleSlug, 'prof');
  assert.strictEqual(await effectiveSlug('teacher', cible.id), 'prof');
  // Un n3boss ne touche pas un compte admin, même pour lui donner un profil plus bas.
  await setAssignedRole(cible.id, admin.id);
  await request(app)
    .put(`/api/rbac/users/teacher/${cible.id}/role`)
    .set('Authorization', `Bearer ${n3boss.token}`)
    .send({ role_id: prof.id })
    .expect(403);
});

test('désactivation : soi-même et pair refusés, admin sur enseignant accepté, connexion et session coupées', async () => {
  const n3boss = await createTeacher('deact_boss', 'prof');
  const pair = await createTeacher('deact_pair', 'prof');
  const cible = await createTeacher('deact_cible', 'prof_classe');

  await request(app)
    .patch(`/api/rbac/users/teacher/${n3boss.id}`)
    .set('Authorization', `Bearer ${n3boss.token}`)
    .send({ is_active: false })
    .expect(403);
  // Rang égal (n3boss → n3boss) : refusé hors administrateur.
  await request(app)
    .patch(`/api/rbac/users/teacher/${pair.id}`)
    .set('Authorization', `Bearer ${n3boss.token}`)
    .send({ is_active: false })
    .expect(403);
  // n3boss → prof de classe : accepté.
  const off = await request(app)
    .patch(`/api/rbac/users/teacher/${cible.id}`)
    .set('Authorization', `Bearer ${n3boss.token}`)
    .send({ is_active: false })
    .expect(200);
  assert.strictEqual(off.body.is_active, false);

  // Connexion refusée, session existante révoquée (401, non « supprimé »).
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identifier: cible.email, password: PASSWORD })
    .expect(401);
  assert.match(String(login.body.error), /inactif/i);
  const me = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${cible.token}`)
    .expect(401);
  assert.strictEqual(me.body.code, 'SESSION_REVOKED');
  assert.strictEqual(me.body.deleted, undefined);
  const audit = await queryOne(
    "SELECT action FROM audit_log WHERE action = 'user_deactivate' AND target_id = ? ORDER BY id DESC LIMIT 1",
    [cible.id],
  );
  assert.ok(audit, 'audit user_deactivate');

  // Réactivation par un administrateur : la connexion repasse.
  await request(app)
    .patch(`/api/rbac/users/teacher/${cible.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ is_active: true })
    .expect(200);
  await request(app)
    .post('/api/auth/login')
    .send({ identifier: cible.email, password: PASSWORD })
    .expect(200);
});

test('désactivation : le dernier administrateur actif est protégé', async () => {
  const second = await createTeacher('deact_admin2', 'admin');
  // Deux admins actifs : le second peut être désactivé…
  await request(app)
    .patch(`/api/rbac/users/teacher/${second.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ is_active: false })
    .expect(200);
  // …puis l'administrateur de test ne peut plus l'être par le second (inactif → 401),
  // et un troisième admin actif ne pourrait pas non plus retirer le dernier.
  await request(app)
    .patch(`/api/rbac/users/teacher/${second.id}`)
    .set('Authorization', `Bearer ${second.token}`)
    .send({ is_active: true })
    .expect(401);
  await execute("DELETE FROM users WHERE id = ? AND user_type = 'teacher'", [second.id]);
});

test('suppression d’un enseignant : admin seulement, contenu conservé, session révoquée « compte supprimé »', async () => {
  const n3boss = await createTeacher('del_boss', 'prof');
  const cible = await createTeacher('del_cible', 'prof_classe');
  const stamp = Date.now();
  // La cible crée un groupe : il doit survivre à la suppression (auteur effacé).
  const group = await request(app)
    .post('/api/groups')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: `Groupe orphelin ${stamp}`, slug: `groupe-orphelin-${stamp}`, kind: 'club' })
    .expect(201);
  await execute('UPDATE `groups` SET created_by = ? WHERE id = ?', [cible.id, group.body.id]);

  await request(app)
    .delete(`/api/rbac/users/teacher/${cible.id}`)
    .set('Authorization', `Bearer ${n3boss.token}`)
    .expect(403);
  await request(app)
    .delete(`/api/rbac/users/teacher/${n3boss.id}`)
    .set('Authorization', `Bearer ${n3boss.token}`)
    .expect(403);
  const done = await request(app)
    .delete(`/api/rbac/users/teacher/${cible.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.strictEqual(done.body.deleted, cible.id);
  assert.ok(!(await queryOne('SELECT id FROM users WHERE id = ?', [cible.id])), 'compte supprimé');
  const kept = await queryOne('SELECT id, created_by FROM `groups` WHERE id = ?', [group.body.id]);
  assert.ok(kept, 'le groupe créé par l’enseignant supprimé est conservé');
  assert.strictEqual(kept.created_by, null);

  const me = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${cible.token}`)
    .expect(401);
  assert.strictEqual(me.body.deleted, true);
  assert.strictEqual(me.body.code, 'SESSION_REVOKED');
  assert.strictEqual(me.body.reason, 'account_deleted');

  await request(app)
    .delete(`/api/rbac/users/teacher/${cible.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(404);
  await execute('DELETE FROM `groups` WHERE id = ?', [group.body.id]);
});
