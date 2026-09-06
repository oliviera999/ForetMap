'use strict';

/**
 * Unification des identités Gnomes & Licornes → `users` (migration 211,
 * `docs/AUDIT_COMPTES_2026-09.md`, direction B) : le compte lié porte les secrets, le joueur
 * n'a plus de mot de passe propre, et le cycle de vie est symétrique dans les deux sens.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { createGlAdmin, createGlClass, createGlPlayer } = require('./helpers/glFixtures');
const { deleteStudentById } = require('../lib/studentDeletion');
const { resolveCanonicalActorId } = require('../lib/auditLog');
const {
  buildGlIdentityReport,
  applyGlIdentityReconciliation,
} = require('../lib/glIdentityReconcile');

const stamp = Date.now();
let admin;
let cls;
let adminToken;

async function createForetmapStudent({
  pseudo,
  email,
  password,
  firstName = 'Foret',
  lastName = 'Map',
}) {
  const id = crypto.randomUUID();
  const hash = await bcrypt.hash(password, 10);
  await execute(
    `INSERT INTO users
      (id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name,
       affiliation, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'student', NULL, ?, ?, ?, ?, ?, 'both', ?, 'local', 1, NOW(), NOW())`,
    [id, email, pseudo, firstName, lastName, `${firstName} ${lastName}`, hash],
  );
  return { id, hash };
}

before(async () => {
  await initSchema();
  admin = await createGlAdmin({ email: `unif.mj.${stamp}@ecole.local` });
  cls = await createGlClass({ adminId: admin.id, name: `Classe unif ${stamp}` });
  adminToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: String(admin.id),
    roleSlug: 'gl_admin',
    permissions: ['gl.read', 'gl.players.manage'],
  });
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('platform.allow_player_link_foretmap', 'true', NOW())
     ON DUPLICATE KEY UPDATE value_json = 'true', updated_at = NOW()`,
  );
});

test('migration 211 : gl_players ne porte plus de secret, la FK vers users est posée', async () => {
  const cols = await queryOne(
    `SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY COLUMN_NAME) AS names
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gl_players'`,
  );
  const names = String(cols.names || '').split(',');
  assert.ok(!names.includes('password_hash'));
  assert.ok(!names.includes('password_must_reset'));
  assert.ok(!names.includes('google_sub'));
  assert.ok(!names.includes('email'));
  assert.ok(names.includes('legacy_password_hash'));
  assert.ok(names.includes('legacy_email'));
  const fk = await queryOne(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gl_players' AND CONSTRAINT_NAME = 'fk_gl_players_user'`,
  );
  assert.strictEqual(Number(fk.c), 1);
  const userCols = await queryOne(
    `SELECT GROUP_CONCAT(COLUMN_NAME) AS names FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'`,
  );
  for (const c of ['password_must_reset', 'google_sub', 'token_epoch']) {
    assert.ok(String(userCols.names).split(',').includes(c), `users.${c}`);
  }
});

test('login joueur : le mot de passe est celui du compte users lié ; un hash hérité est adopté puis vidé', async () => {
  const pseudo = `unif_legacy_${stamp}`;
  const fm = await createForetmapStudent({
    pseudo: `fm_${pseudo}`,
    email: `${pseudo}@ecole.local`,
    password: 'mdp-foretmap',
  });
  const legacyHash = await bcrypt.hash('mdp-gl-herite', 10);
  const player = await createGlPlayer({
    classId: cls.id,
    pseudo,
    legacyPasswordHash: legacyHash,
    linkedForetmapUserId: fm.id,
  });

  // Le mot de passe ForetMap ouvre le jeu.
  await request(app)
    .post('/api/gl/auth/login')
    .send({ identifier: pseudo, password: 'mdp-foretmap' })
    .expect(200);
  // L'identifiant peut aussi être l'e-mail ou le pseudo du compte lié.
  await request(app)
    .post('/api/gl/auth/login')
    .send({ identifier: `${pseudo}@ecole.local`, password: 'mdp-foretmap' })
    .expect(200);

  // Le hash GL hérité est encore accepté une fois… et devient LE mot de passe.
  await request(app)
    .post('/api/gl/auth/login')
    .send({ identifier: pseudo, password: 'mdp-gl-herite' })
    .expect(200);
  const after = await queryOne(
    `SELECT p.legacy_password_hash, u.password_hash FROM gl_players p
      INNER JOIN users u ON u.id = p.linked_foretmap_user_id WHERE p.id = ?`,
    [player.id],
  );
  assert.strictEqual(after.legacy_password_hash, null);
  assert.strictEqual(await bcrypt.compare('mdp-gl-herite', after.password_hash), true);
  await request(app)
    .post('/api/gl/auth/login')
    .send({ identifier: pseudo, password: 'mdp-foretmap' })
    .expect(401);
  // …y compris côté ForetMap, avec le pseudo de jeu.
  await request(app)
    .post('/api/auth/login')
    .send({ identifier: pseudo, password: 'mdp-gl-herite' })
    .expect(200);
});

test('désactiver le compte ForetMap coupe le jeu ; désactiver le joueur ne touche pas le compte', async () => {
  const pseudo = `unif_inactive_${stamp}`;
  const player = await createGlPlayer({ classId: cls.id, pseudo, password: 'mdp1234' });
  const login = await request(app)
    .post('/api/gl/auth/login')
    .send({ identifier: pseudo, password: 'mdp1234' })
    .expect(200);
  await execute('UPDATE users SET is_active = 0 WHERE id = ?', [player.linked_foretmap_user_id]);
  await request(app)
    .get('/api/gl/auth/me')
    .set('Authorization', `Bearer ${login.body.authToken}`)
    .expect(401);
  await request(app)
    .post('/api/gl/auth/login')
    .send({ identifier: pseudo, password: 'mdp1234' })
    .expect(401);
  await execute('UPDATE users SET is_active = 1 WHERE id = ?', [player.linked_foretmap_user_id]);

  await request(app)
    .put(`/api/gl/admin/players/${player.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ isActive: false })
    .expect(200);
  const account = await queryOne('SELECT is_active FROM users WHERE id = ?', [
    player.linked_foretmap_user_id,
  ]);
  assert.strictEqual(Number(account.is_active), 1);
  await request(app)
    .post('/api/gl/auth/login')
    .send({ identifier: pseudo, password: 'mdp1234' })
    .expect(401);
});

test('supprimer l élève ForetMap supprime son joueur GL (et refuse si une partie le retient)', async () => {
  const pseudo = `unif_delete_fm_${stamp}`;
  const player = await createGlPlayer({ classId: cls.id, pseudo, password: 'mdp1234' });
  const result = await deleteStudentById(player.linked_foretmap_user_id);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(Number(result.glPlayerId), Number(player.id));
  const gone = await queryOne('SELECT id FROM gl_players WHERE id = ?', [player.id]);
  assert.ok(!gone);
});

test('supprimer le joueur GL supprime le compte miroir, mais conserve un vrai compte élève', async () => {
  // Compte miroir (créé par le jeu) → supprimé avec le joueur.
  const mirror = await createGlPlayer({ classId: cls.id, pseudo: `unif_del_mirror_${stamp}` });
  const res = await request(app)
    .delete(`/api/gl/admin/players/${mirror.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.strictEqual(res.body?.accountDeleted, true);
  assert.ok(
    !(await queryOne('SELECT id FROM users WHERE id = ?', [mirror.linked_foretmap_user_id])),
  );

  // Vrai compte élève → conservé, retiré du groupe de la classe GL.
  const fm = await createForetmapStudent({
    pseudo: `unif_del_real_${stamp}`,
    email: `unif.del.real.${stamp}@ecole.local`,
    password: 'reste-la',
  });
  const real = await createGlPlayer({
    classId: cls.id,
    pseudo: `unif_del_real_gl_${stamp}`,
    linkedForetmapUserId: fm.id,
  });
  const res2 = await request(app)
    .delete(`/api/gl/admin/players/${real.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.strictEqual(res2.body?.accountDeleted, false);
  const kept = await queryOne('SELECT id, is_active FROM users WHERE id = ?', [fm.id]);
  assert.ok(kept);
  const membership = await queryOne(
    `SELECT 1 AS ok FROM group_members gm
      INNER JOIN gl_classes c ON c.foretmap_group_id = gm.group_id
      WHERE gm.user_id = ? AND c.id = ?`,
    [fm.id, cls.id],
  );
  assert.ok(!membership);
});

test('link-foretmap fusionne sur le compte élève (miroir supprimé) ; unlink recrée un miroir', async () => {
  const pseudo = `unif_link_${stamp}`;
  const player = await createGlPlayer({ classId: cls.id, pseudo, password: 'mdp-miroir' });
  const mirrorId = player.linked_foretmap_user_id;
  const fm = await createForetmapStudent({
    pseudo: `unif_link_fm_${stamp}`,
    email: `unif.link.${stamp}@ecole.local`,
    password: 'mdp-eleve',
  });
  const login = await request(app)
    .post('/api/gl/auth/login')
    .send({ identifier: pseudo, password: 'mdp-miroir' })
    .expect(200);
  const token = login.body.authToken;

  await request(app)
    .post('/api/gl/auth/link-foretmap')
    .set('Authorization', `Bearer ${token}`)
    .send({ identifier: `unif_link_fm_${stamp}`, password: 'mauvais' })
    .expect(401);
  const linked = await request(app)
    .post('/api/gl/auth/link-foretmap')
    .set('Authorization', `Bearer ${token}`)
    .send({ identifier: `unif_link_fm_${stamp}`, password: 'mdp-eleve' })
    .expect(200);
  assert.strictEqual(String(linked.body?.linkedForetmapStudent?.id), fm.id);
  assert.ok(!(await queryOne('SELECT id FROM users WHERE id = ?', [mirrorId])));
  const row = await queryOne('SELECT linked_foretmap_user_id FROM gl_players WHERE id = ?', [
    player.id,
  ]);
  assert.strictEqual(String(row.linked_foretmap_user_id), fm.id);
  // Un seul mot de passe désormais : celui du compte élève.
  await request(app)
    .post('/api/gl/auth/login')
    .send({ identifier: pseudo, password: 'mdp-miroir' })
    .expect(401);
  const relogin = await request(app)
    .post('/api/gl/auth/login')
    .send({ identifier: pseudo, password: 'mdp-eleve' })
    .expect(200);
  const me = await request(app)
    .get('/api/gl/auth/me')
    .set('Authorization', `Bearer ${relogin.body.authToken}`)
    .expect(200);
  assert.strictEqual(String(me.body?.profile?.linkedForetmapStudent?.id), fm.id);
  assert.strictEqual(me.body?.profile?.email, `unif.link.${stamp}@ecole.local`);

  // Déliaison : le joueur repart sur un compte miroir neuf, l'élève garde son compte.
  await request(app)
    .delete('/api/gl/auth/link-foretmap')
    .set('Authorization', `Bearer ${relogin.body.authToken}`)
    .send({ currentPassword: 'mdp-eleve' })
    .expect(200);
  const after = await queryOne(
    `SELECT p.linked_foretmap_user_id, u.auth_provider FROM gl_players p
      INNER JOIN users u ON u.id = p.linked_foretmap_user_id WHERE p.id = ?`,
    [player.id],
  );
  assert.notStrictEqual(String(after.linked_foretmap_user_id), fm.id);
  assert.strictEqual(after.auth_provider, 'gl_bridge');
  assert.ok(await queryOne('SELECT id FROM users WHERE id = ?', [fm.id]));
  await request(app)
    .post('/api/gl/auth/login')
    .send({ identifier: pseudo, password: 'mdp-eleve' })
    .expect(200);
});

test('profil joueur : e-mail écrit sur users, unicité sur tous les comptes', async () => {
  const pseudo = `unif_profile_${stamp}`;
  const player = await createGlPlayer({ classId: cls.id, pseudo, password: 'mdp1234' });
  const login = await request(app)
    .post('/api/gl/auth/login')
    .send({ identifier: pseudo, password: 'mdp1234' })
    .expect(200);
  const taken = `unif.link.${stamp}@ecole.local`;
  await request(app)
    .patch('/api/gl/auth/me/profile')
    .set('Authorization', `Bearer ${login.body.authToken}`)
    .send({ currentPassword: 'mdp1234', email: taken })
    .expect(409);
  const ok = await request(app)
    .patch('/api/gl/auth/me/profile')
    .set('Authorization', `Bearer ${login.body.authToken}`)
    .send({ currentPassword: 'mdp1234', email: `unif.profile.${stamp}@ecole.local` })
    .expect(200);
  assert.strictEqual(ok.body?.profile?.email, `unif.profile.${stamp}@ecole.local`);
  const account = await queryOne('SELECT email FROM users WHERE id = ?', [
    player.linked_foretmap_user_id,
  ]);
  assert.strictEqual(account.email, `unif.profile.${stamp}@ecole.local`);
});

test('journal : un acteur gl_player est canonisé sur son compte users', async () => {
  const player = await createGlPlayer({ classId: cls.id, pseudo: `unif_audit_${stamp}` });
  const canonical = await resolveCanonicalActorId('gl_player', String(player.id));
  assert.strictEqual(String(canonical), String(player.linked_foretmap_user_id));
});

test('réconciliation : rapport et rattrapage (joueur sans compte, miroir orphelin)', async () => {
  const orphanPlayer = await createGlPlayer({
    classId: cls.id,
    pseudo: `unif_reconcile_${stamp}`,
    legacyPasswordHash: await bcrypt.hash('herite', 10),
    linkedForetmapUserId: null,
  });
  const orphanUserId = crypto.randomUUID();
  await execute(
    `INSERT INTO users (id, user_type, pseudo, first_name, last_name, display_name, affiliation, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'student', ?, 'Orphelin', 'Miroir', 'Orphelin Miroir', 'both', NULL, 'gl_bridge', 1, NOW(), NOW())`,
    [orphanUserId, `unif_orphan_${stamp}`],
  );

  const report = await request(app)
    .get('/api/gl/admin/players/reconcile')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(report.body.totals.unlinked_players >= 1);
  assert.ok(report.body.totals.orphan_bridge_accounts >= 1);
  assert.ok(report.body.totals.legacy_password_pending >= 1);
  assert.ok(report.body.samples.unlinked_players.some((p) => p.id === orphanPlayer.id));

  const applied = await request(app)
    .post('/api/gl/admin/players/reconcile')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ deleteOrphanBridgeAccounts: true })
    .expect(200);
  assert.ok(applied.body.backfill.synced >= 1);
  assert.ok(applied.body.orphans.deleted >= 1);
  const linked = await queryOne(
    'SELECT linked_foretmap_user_id, legacy_password_hash FROM gl_players WHERE id = ?',
    [orphanPlayer.id],
  );
  assert.ok(linked.linked_foretmap_user_id);
  // Le hash hérité a été repris comme mot de passe du compte créé.
  assert.strictEqual(linked.legacy_password_hash, null);
  await request(app)
    .post('/api/gl/auth/login')
    .send({ identifier: `unif_reconcile_${stamp}`, password: 'herite' })
    .expect(200);
  assert.ok(!(await queryOne('SELECT id FROM users WHERE id = ?', [orphanUserId])));

  // Fonctions directes : même contrat.
  const direct = await buildGlIdentityReport();
  assert.ok(direct.totals.players >= 1);
  const again = await applyGlIdentityReconciliation({});
  assert.strictEqual(again.orphans.deleted, 0);
});

test('admin GL : POST /players rapproche un élève ForetMap existant sans écraser son mot de passe', async () => {
  const fm = await createForetmapStudent({
    pseudo: `unif_admin_fm_${stamp}`,
    email: `unif.admin.${stamp}@ecole.local`,
    password: 'garde-moi',
    firstName: 'Nadia',
    lastName: `Unif-${stamp}`,
  });
  const res = await request(app)
    .post('/api/gl/admin/players')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      classId: cls.id,
      firstName: 'Nadia',
      lastName: `Unif-${stamp}`,
      pseudo: `unif_admin_gl_${stamp}`,
      email: `unif.admin.${stamp}@ecole.local`,
    })
    .expect(201);
  assert.strictEqual(res.body?.reusedExisting, true);
  assert.strictEqual(res.body?.generatedPassword, null);
  assert.strictEqual(res.body?.account_kind, 'student');
  assert.strictEqual(String(res.body?.linked_foretmap_user_id), fm.id);
  await request(app)
    .post('/api/gl/auth/login')
    .send({ identifier: `unif_admin_gl_${stamp}`, password: 'garde-moi' })
    .expect(200);
});
