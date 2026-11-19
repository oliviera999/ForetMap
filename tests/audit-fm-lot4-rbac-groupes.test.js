'use strict';

/**
 * Audit ForetMap du 19/11/2026, lot 4 — profils RBAC, groupes, import et fusion de comptes.
 *
 * Un test par constat, écrit à partir du scénario de rejeu de l'audit
 * (`docs/AUDIT_BUGS_FORETMAP_2026-11-19.md`, § 3) et des décisions du § 11 :
 *   A1  import : garde de rang sur toute mise à jour d'un compte existant, e-mail via AC2 ;
 *   A2  PATCH d'un profil de rang égal ou supérieur à l'acteur refusé ;
 *   A4  un simple membre ne voit que les prénoms de son propre groupe ;
 *   retrait d'un membre de groupe : rang strictement inférieur (hors administrateur) ;
 *   A6  un administrateur désactivé se rétrograde et se supprime ;
 *   A8  bulk-role : une entrée sans id = une ligne en erreur, pas un 500 ;
 *   A11 suppression d'un sous-groupe : ses enfants remontent sous son parent ;
 *   A12 fusion de comptes : un seul profil principal, profil effectif recalculé ;
 *   A13 PATCH d'un compte : rang attribué compté, périmètre de groupe contrôlé.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, queryAll, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ensureAdminTeacherAuthToken, getAdminTeacherUserId } = require('./helpers/adminAuth');
const { TEMPLATE_COLUMNS, csvEscape } = require('../lib/studentRouteHelpers');

const IMPORT_CSV_HEADER = TEMPLATE_COLUMNS.map(csvEscape).join(';');

test.before(async () => {
  await initSchema();
  const { setSetting } = require('../lib/settings');
  await setSetting('students.import.existing_strategy', 'update', {
    userType: 'teacher',
    userId: 'test',
  });
});

function stamp() {
  return `${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
}

async function roleId(slug) {
  const row = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [slug]);
  assert.ok(row?.id, `Profil introuvable : ${slug}`);
  return row.id;
}

/** Profil sur mesure, avec les permissions données (rang sous 400 = sans vue globale). */
async function createCustomRole({ rank, permissions = [] }) {
  const slug = `lot4_${stamp()}`;
  const r = await execute(
    'INSERT INTO roles (slug, display_name, `rank`, is_system) VALUES (?, ?, ?, 0)',
    [slug, `Profil ${slug}`, rank],
  );
  const id = Number(r.insertId);
  for (const key of permissions) {
    await execute('INSERT IGNORE INTO permissions (`key`, label) VALUES (?, ?)', [key, key]);
    await execute('INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)', [
      id,
      key,
    ]);
  }
  return { id, slug, rank };
}

/**
 * Compte avec profil attribué **et** profil effectif posés directement (sans recalcul) :
 * `effectiveRoleId` différent de `assignedRoleId` reproduit un profil attribué masqué.
 */
async function createAccount({
  userType = 'student',
  assignedRoleId,
  effectiveRoleId = assignedRoleId,
  isActive = 1,
  firstName = `Prenom${stamp()}`,
  lastName = `Nom${stamp()}`,
  email = null,
  password = null,
}) {
  const id = crypto.randomUUID();
  const hash = password ? await bcrypt.hash(password, 4) : null;
  await execute(
    `INSERT INTO users
      (id, user_type, assigned_role_id, email, pseudo, first_name, last_name, display_name,
       password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, 'local', ?, NOW(), NOW())`,
    [
      id,
      userType,
      assignedRoleId,
      email,
      firstName,
      lastName,
      `${firstName} ${lastName}`,
      hash,
      isActive,
    ],
  );
  await execute(
    'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1)',
    [userType, id, effectiveRoleId],
  );
  return { id, firstName, lastName, email };
}

async function tokenFor(account, userType = 'student') {
  return signAuthToken({
    userType,
    userId: account.id,
    canonicalUserId: account.id,
    mfa: true,
    mfaMethod: 'totp',
  });
}

async function createGroup({ parentId = null, name = `Groupe ${stamp()}` } = {}) {
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO \`groups\` (id, slug, name, kind, parent_group_id, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 'class', ?, 1, NOW(), NOW())`,
    [id, `lot4-${stamp()}`, name, parentId],
  );
  return { id };
}

async function addMember(groupId, account, userType = 'student') {
  await execute('INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, ?)', [
    groupId,
    account.id,
    userType,
  ]);
}

async function runImport(token, rows) {
  const csv = [IMPORT_CSV_HEADER, ...rows].join('\n');
  const res = await request(app)
    .post('/api/students/import')
    .set('Authorization', `Bearer ${token}`)
    .send({ fileName: 'lot4.csv', fileDataBase64: Buffer.from(csv, 'utf8').toString('base64') });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  return res.body.report;
}

// ---------------------------------------------------------------- A1

test('A1 — l’import ne réécrit pas un compte élève porteur du profil admin', async () => {
  const adminRole = await roleId('admin');
  const victim = await createAccount({
    assignedRoleId: adminRole,
    password: 'Ancien-Mot-2026',
    email: `victime.${stamp()}@exemple.org`,
  });
  const prof = await createAccount({ userType: 'teacher', assignedRoleId: await roleId('prof') });
  const profToken = await tokenFor(prof, 'teacher');

  const report = await runImport(profToken, [
    `;${victim.firstName};${victim.lastName};PrisDeForce-2026;;;pirate.${stamp()}@exemple.org;`,
  ]);
  assert.strictEqual(report.totals.updated, 0, JSON.stringify(report));
  assert.strictEqual(report.totals.skipped_invalid, 1, JSON.stringify(report));
  assert.ok(
    report.errors.some((e) => /rang/.test(e.error)),
    JSON.stringify(report.errors),
  );

  const after = await queryOne('SELECT email, password_hash FROM users WHERE id = ?', [victim.id]);
  assert.strictEqual(after.email, victim.email);
  assert.ok(await bcrypt.compare('Ancien-Mot-2026', after.password_hash));
});

test('A1 — un changement d’e-mail par import révoque les sessions (AC2)', async () => {
  const adminToken = await ensureAdminTeacherAuthToken();
  const student = await createAccount({
    assignedRoleId: await roleId('eleve_novice'),
    email: `avant.${stamp()}@exemple.org`,
  });
  const before = await queryOne('SELECT token_epoch FROM users WHERE id = ?', [student.id]);
  const nextEmail = `apres.${stamp()}@exemple.org`;
  const report = await runImport(adminToken, [
    `;${student.firstName};${student.lastName};;;;${nextEmail};`,
  ]);
  assert.strictEqual(report.totals.updated, 1, JSON.stringify(report));
  const after = await queryOne('SELECT email, token_epoch FROM users WHERE id = ?', [student.id]);
  assert.strictEqual(after.email, nextEmail);
  assert.ok(Number(after.token_epoch) > Number(before.token_epoch || 0));
});

// ---------------------------------------------------------------- A2

test('A2 — un délégué ne baisse pas le rang d’un profil supérieur au sien', async () => {
  const delegateRole = await createCustomRole({
    rank: 450,
    permissions: ['admin.roles.manage', 'admin.users.assign_roles'],
  });
  const superior = await createCustomRole({ rank: 480 });
  const inferior = await createCustomRole({ rank: 200 });
  const delegate = await createAccount({ userType: 'teacher', assignedRoleId: delegateRole.id });
  const token = await tokenFor(delegate, 'teacher');

  const down = await request(app)
    .patch(`/api/rbac/profiles/${superior.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ rank: 300 });
  assert.strictEqual(down.status, 403, JSON.stringify(down.body));
  const kept = await queryOne('SELECT `rank` FROM roles WHERE id = ?', [superior.id]);
  assert.strictEqual(Number(kept.rank), 480);

  const ok = await request(app)
    .patch(`/api/rbac/profiles/${inferior.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ rank: 250 });
  assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
});

// ---------------------------------------------------------------- A8

test('A8 — bulk-role : une entrée sans id est une ligne en erreur, pas un 500', async () => {
  const adminToken = await ensureAdminTeacherAuthToken();
  const student = await createAccount({ assignedRoleId: await roleId('eleve_novice') });
  const res = await request(app)
    .post('/api/rbac/users/bulk-role')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      role_id: await roleId('eleve_avance'),
      users: [{ user_type: 'student' }, { user_type: 'student', id: student.id }],
    });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  assert.strictEqual(res.body.results[0].ok, false);
  assert.strictEqual(res.body.results[0].error, 'id requis');
  assert.strictEqual(res.body.results[1].ok, true, JSON.stringify(res.body.results[1]));
});

// ---------------------------------------------------------------- A6

/**
 * La garde « dernier administrateur actif » compte les administrateurs enseignants actifs de
 * toute la base partagée : on ne laisse actif, le temps du test, que l'administrateur de test.
 */
async function withOnlyTestAdminActive(fn) {
  const testAdminId = await getAdminTeacherUserId();
  const others = await queryAll(
    `SELECT u.id FROM users u
       JOIN user_roles ur ON ur.user_id = u.id AND ur.is_primary = 1
       JOIN roles r ON r.id = ur.role_id AND r.slug = 'admin'
      WHERE u.user_type = 'teacher' AND u.is_active = 1 AND u.id <> ?`,
    [testAdminId],
  );
  const ids = others.map((r) => r.id);
  for (const id of ids) await execute('UPDATE users SET is_active = 0 WHERE id = ?', [id]);
  try {
    await fn();
  } finally {
    for (const id of ids) await execute('UPDATE users SET is_active = 1 WHERE id = ?', [id]);
  }
}

test('A6 — un administrateur désactivé se rétrograde et se supprime', async () => {
  const adminToken = await ensureAdminTeacherAuthToken();
  const adminRole = await roleId('admin');
  const demoted = await createAccount({
    userType: 'teacher',
    assignedRoleId: adminRole,
    isActive: 0,
  });
  const deleted = await createAccount({
    userType: 'teacher',
    assignedRoleId: adminRole,
    isActive: 0,
  });
  await withOnlyTestAdminActive(async () => {
    const res = await request(app)
      .put(`/api/rbac/users/teacher/${demoted.id}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role_id: await roleId('prof') });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const del = await request(app)
      .delete(`/api/rbac/users/teacher/${deleted.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.strictEqual(del.status, 200, JSON.stringify(del.body));
    const gone = await queryOne('SELECT id FROM users WHERE id = ?', [deleted.id]);
    assert.ok(!gone, 'le compte doit être supprimé');
  });
});

// ---------------------------------------------------------------- A13

test('A13 — PATCH d’un compte : profil attribué compté et périmètre de groupe', async () => {
  const delegateRole = await createCustomRole({
    rank: 380,
    permissions: ['admin.users.assign_roles'],
  });
  const delegate = await createAccount({ userType: 'teacher', assignedRoleId: delegateRole.id });
  const token = await tokenFor(delegate, 'teacher');
  const group = await createGroup();
  await addMember(group.id, delegate, 'teacher');

  // Profil attribué « prof » (400) masqué par un profil effectif novice : rang 400 ≥ 380.
  const masked = await createAccount({
    assignedRoleId: await roleId('prof'),
    effectiveRoleId: await roleId('eleve_novice'),
    password: 'Ancien-Mot-2026',
  });
  await addMember(group.id, masked);
  const refused = await request(app)
    .patch(`/api/rbac/users/student/${masked.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ password: 'Nouveau-Mot-2026' });
  assert.strictEqual(refused.status, 403, JSON.stringify(refused.body));

  // Élève hors des groupes du délégué : hors périmètre, même pour un simple renommage.
  const outsider = await createAccount({ assignedRoleId: await roleId('eleve_novice') });
  const outside = await request(app)
    .patch(`/api/rbac/users/student/${outsider.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ description: 'modifiée' });
  assert.strictEqual(outside.status, 403, JSON.stringify(outside.body));

  // Élève du groupe, de rang inférieur : permis.
  const pupil = await createAccount({ assignedRoleId: await roleId('eleve_novice') });
  await addMember(group.id, pupil);
  const ok = await request(app)
    .patch(`/api/rbac/users/student/${pupil.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ description: 'modifiée' });
  assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
});

// ---------------------------------------------------------------- A4

test('A4 — un simple membre ne voit que les prénoms de son propre groupe', async () => {
  const novice = await roleId('eleve_novice');
  const parent = await createGroup();
  const child = await createGroup({ parentId: parent.id });
  const me = await createAccount({ assignedRoleId: novice, firstName: 'Moi' });
  const mate = await createAccount({ assignedRoleId: novice, firstName: 'Camarade' });
  const childMember = await createAccount({ assignedRoleId: novice, firstName: 'Cadet' });
  await addMember(parent.id, me);
  await addMember(parent.id, mate);
  await addMember(child.id, childMember);
  const token = await tokenFor(me);

  const list = await request(app).get('/api/groups').set('Authorization', `Bearer ${token}`);
  assert.strictEqual(list.status, 200, JSON.stringify(list.body));
  const ids = list.body.groups.map((g) => String(g.id));
  assert.ok(ids.includes(parent.id));
  assert.ok(!ids.includes(child.id), 'les sous-groupes ne sont pas visibles');
  const mine = list.body.groups.find((g) => String(g.id) === parent.id);
  assert.deepStrictEqual(
    mine.members.map((m) => m.first_name).sort(),
    ['Camarade', 'Moi'],
    JSON.stringify(mine.members),
  );
  for (const m of mine.members) assert.deepStrictEqual(Object.keys(m), ['first_name']);

  const members = await request(app)
    .get(`/api/groups/${parent.id}/members`)
    .set('Authorization', `Bearer ${token}`);
  assert.strictEqual(members.status, 200, JSON.stringify(members.body));
  for (const m of members.body.members) assert.deepStrictEqual(Object.keys(m), ['first_name']);

  const sub = await request(app)
    .get(`/api/groups/${child.id}/members`)
    .set('Authorization', `Bearer ${token}`);
  assert.strictEqual(sub.status, 403, JSON.stringify(sub.body));
});

// ---------------------------------------------------------------- Retrait

test('Retrait d’un membre : seulement un compte de rang strictement inférieur', async () => {
  const managerRole = await createCustomRole({
    rank: 380,
    permissions: ['groups.manage', 'groups.read'],
  });
  const manager = await createAccount({ userType: 'teacher', assignedRoleId: managerRole.id });
  const peer = await createAccount({ userType: 'teacher', assignedRoleId: managerRole.id });
  const pupil = await createAccount({ assignedRoleId: await roleId('eleve_novice') });
  const group = await createGroup();
  await addMember(group.id, manager, 'teacher');
  await addMember(group.id, peer, 'teacher');
  await addMember(group.id, pupil);
  const token = await tokenFor(manager, 'teacher');

  const del = await request(app)
    .delete(`/api/groups/${group.id}/members/${peer.id}`)
    .set('Authorization', `Bearer ${token}`);
  assert.strictEqual(del.status, 403, JSON.stringify(del.body));

  const put = await request(app)
    .put(`/api/groups/${group.id}/members`)
    .set('Authorization', `Bearer ${token}`)
    .send({ member_user_ids: [manager.id, pupil.id] });
  assert.strictEqual(put.status, 403, JSON.stringify(put.body));
  assert.deepStrictEqual(put.body.user_ids, [peer.id]);

  const okDel = await request(app)
    .delete(`/api/groups/${group.id}/members/${pupil.id}`)
    .set('Authorization', `Bearer ${token}`);
  assert.strictEqual(okDel.status, 200, JSON.stringify(okDel.body));

  const adminToken = await ensureAdminTeacherAuthToken();
  const adminDel = await request(app)
    .delete(`/api/groups/${group.id}/members/${peer.id}`)
    .set('Authorization', `Bearer ${adminToken}`);
  assert.strictEqual(adminDel.status, 200, JSON.stringify(adminDel.body));
});

// ---------------------------------------------------------------- A11

test('A11 — supprimer un sous-groupe rattache ses enfants à son parent', async () => {
  const managerRole = await createCustomRole({
    rank: 380,
    permissions: ['groups.manage', 'groups.read'],
  });
  const manager = await createAccount({ userType: 'teacher', assignedRoleId: managerRole.id });
  const root = await createGroup();
  const middle = await createGroup({ parentId: root.id });
  const leaf = await createGroup({ parentId: middle.id });
  await addMember(root.id, manager, 'teacher');
  const token = await tokenFor(manager, 'teacher');

  const res = await request(app)
    .delete(`/api/groups/${middle.id}`)
    .set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  const row = await queryOne('SELECT parent_group_id FROM `groups` WHERE id = ?', [leaf.id]);
  assert.strictEqual(String(row.parent_group_id), root.id);
});

// ---------------------------------------------------------------- A12

test('A12 — fusion de comptes : un seul profil principal pour le compte gardé', async () => {
  const { applyMerge } = require('../lib/accountMerge');
  const into = await createAccount({ assignedRoleId: await roleId('eleve_novice') });
  const from = await createAccount({ assignedRoleId: await roleId('eleve_avance') });
  const result = await applyMerge({ fromUserId: from.id, intoUserId: into.id });
  assert.strictEqual(result.ok, true, JSON.stringify(result));
  const primaries = await queryAll(
    'SELECT role_id FROM user_roles WHERE user_id = ? AND is_primary = 1',
    [into.id],
  );
  assert.strictEqual(primaries.length, 1, JSON.stringify(primaries));
  assert.strictEqual(Number(primaries[0].role_id), Number(await roleId('eleve_novice')));
});
