'use strict';

/**
 * Gardes des profils (audit CDG-45 / CDG-53) : rang d'un profil système figé, rang d'un
 * profil sur mesure borné par celui de l'acteur, suppression d'un profil sur mesure.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { setAssignedRole } = require('../lib/effectiveRole');

let adminToken;
const stamp = Date.now();

test.before(async () => {
  await initSchema();
  adminToken = await ensureAdminTeacherAuthToken();
  // Un n3boss doté de la gestion des profils, pour exercer la garde de rang.
  const prof = await queryOne("SELECT id FROM roles WHERE slug = 'prof' LIMIT 1");
  await execute(
    "INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, 'admin.roles.manage')",
    [prof.id],
  );
  const { resetRbacBootstrapForTests } = require('../lib/rbac');
  resetRbacBootstrapForTests();
});

test.after(async () => {
  const prof = await queryOne("SELECT id FROM roles WHERE slug = 'prof' LIMIT 1");
  await execute(
    "DELETE FROM role_permissions WHERE role_id = ? AND permission_key = 'admin.roles.manage'",
    [prof.id],
  );
  await execute("DELETE FROM roles WHERE slug LIKE 'garde_%'");
  const { resetRbacBootstrapForTests } = require('../lib/rbac');
  resetRbacBootstrapForTests();
});

async function n3bossToken() {
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, display_name, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'teacher', ?, ?, 'Boss', 'local', 1, NOW(), NOW())`,
    [
      id,
      `boss_${stamp}_${Math.random().toString(36).slice(2, 6)}@example.com`,
      `boss_${Math.random().toString(36).slice(2, 8)}`,
    ],
  );
  const prof = await queryOne('SELECT id, slug, `rank` FROM roles WHERE slug = ? LIMIT 1', [
    'prof',
  ]);
  await setAssignedRole(id, prof.id);
  return signAuthToken({
    userType: 'teacher',
    userId: id,
    roleId: prof.id,
    roleSlug: 'prof',
    roleRank: prof.rank,
  });
}

test('CDG-45 : le rang d’un profil système ne se modifie pas, même par un administrateur', async () => {
  const profClasse = await queryOne('SELECT id, `rank` FROM roles WHERE slug = ? LIMIT 1', [
    'prof_classe',
  ]);
  const res = await request(app)
    .patch(`/api/rbac/profiles/${profClasse.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ rank: 400 })
    .expect(400);
  assert.match(String(res.body.error), /profil système/i);
  // Le même rang, ou un autre champ, passe.
  await request(app)
    .patch(`/api/rbac/profiles/${profClasse.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ rank: profClasse.rank })
    .expect(200);
  const after = await queryOne('SELECT `rank` FROM roles WHERE id = ?', [profClasse.id]);
  assert.strictEqual(Number(after.rank), Number(profClasse.rank));
});

test('CDG-45 : hors administrateur, pas de rang supérieur au sien (création, modification, duplication)', async () => {
  const boss = await n3bossToken();
  await request(app)
    .post('/api/rbac/profiles')
    .set('Authorization', `Bearer ${boss}`)
    .send({
      slug: `garde_haut_${stamp}`,
      display_name: 'Trop haut',
      rank: 450,
      display_order: 9990,
    })
    .expect(403);
  const ok = await request(app)
    .post('/api/rbac/profiles')
    .set('Authorization', `Bearer ${boss}`)
    .send({ slug: `garde_ok_${stamp}`, display_name: 'Rang ok', rank: 380, display_order: 9991 })
    .expect(201);
  await request(app)
    .patch(`/api/rbac/profiles/${ok.body.id}`)
    .set('Authorization', `Bearer ${boss}`)
    .send({ rank: 500 })
    .expect(403);
  await request(app)
    .patch(`/api/rbac/profiles/${ok.body.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ rank: 500 })
    .expect(200);
  // Dupliquer un profil de rang 500 dépasse le rang du n3boss.
  await request(app)
    .post(`/api/rbac/profiles/${ok.body.id}/duplicate`)
    .set('Authorization', `Bearer ${boss}`)
    .send({ slug: `garde_dup_${stamp}`, display_name: 'Dup' })
    .expect(403);
});

test('CDG-53 : suppression d’un profil sur mesure — refus système, 409 si utilisé, puis suppression', async () => {
  const visiteur = await queryOne("SELECT id FROM roles WHERE slug = 'visiteur' LIMIT 1");
  await request(app)
    .delete(`/api/rbac/profiles/${visiteur.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(400);

  const created = await request(app)
    .post('/api/rbac/profiles')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      slug: `garde_suppr_${stamp}`,
      display_name: 'À supprimer',
      rank: 120,
      display_order: 9992,
    })
    .expect(201);
  const roleId = created.body.id;

  // Utilisé par un compte → 409 (avec le décompte).
  const studentId = crypto.randomUUID();
  await execute(
    `INSERT INTO users (id, user_type, pseudo, display_name, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'student', ?, 'Porteur', 'local', 1, NOW(), NOW())`,
    [studentId, `porteur_${stamp}`],
  );
  await setAssignedRole(studentId, roleId);
  const used = await request(app)
    .delete(`/api/rbac/profiles/${roleId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(409);
  assert.ok(used.body.accounts >= 1);

  // Réattribué, puis posé sur un groupe → toujours 409.
  await setAssignedRole(studentId, visiteur.id);
  const groupId = crypto.randomUUID();
  await execute(
    "INSERT INTO `groups` (id, slug, name, kind, default_role_id, is_active, created_at, updated_at) VALUES (?, ?, ?, 'club', ?, 1, NOW(), NOW())",
    [groupId, `garde-grp-${stamp}`, `Garde ${stamp}`, roleId],
  );
  const byGroup = await request(app)
    .delete(`/api/rbac/profiles/${roleId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(409);
  assert.strictEqual(byGroup.body.groups, 1);
  await execute('UPDATE `groups` SET default_role_id = NULL WHERE id = ?', [groupId]);

  const done = await request(app)
    .delete(`/api/rbac/profiles/${roleId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.strictEqual(done.body.deleted, roleId);
  assert.ok(!(await queryOne('SELECT id FROM roles WHERE id = ?', [roleId])));
  await execute('DELETE FROM `groups` WHERE id = ?', [groupId]);
  await execute('DELETE FROM users WHERE id = ?', [studentId]);
});
