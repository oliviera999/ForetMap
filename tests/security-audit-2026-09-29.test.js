'use strict';

/**
 * Audit sécurité du 29/09/2026 (`docs/AUDIT_SECURITE_2026-09-29.md`) — filet des correctifs :
 *
 *  - C1 : le cookie du plan public, recopié sous le nom `staff_plan_access`, ouvrait le plan
 *    des personnels (même secret, même valeur `'ok'`, nom absent de la signature) ;
 *  - I1 : un code d'accès au plan pouvait faire 1 caractère ;
 *  - I2 : changer le code ne révoquait aucun laissez-passer déjà délivré ;
 *  - I3 : un prof de classe pouvait s'annexer des élèves d'autres classes ;
 *  - M7 : changement de mot de passe hors du limiteur strict ;
 *  - exposition : sondes post-déploiement sur les fichiers internes.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');

const { createSignedCookieGate, codePassValue } = require('../lib/accessGate');
const { listAuthRateLimitPaths } = require('../lib/products');
const { EXPOSURE_PROBE_PATHS } = require('../scripts/post-deploy-check');
const { initSchema, initDatabase, queryOne, queryAll, execute } = require('../database');
const { app } = require('../server');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { setSetting, invalidateSettingsCache } = require('../lib/settings');
const { snapshotSetting, restoreSetting } = require('./helpers/settingsSnapshot');
const fx = require('./helpers/fmFixtures');
const { planContentCache } = require('../routes/plan');

function cookieFrom(res, name) {
  const raw = [].concat(res.headers['set-cookie'] || []);
  const hit = raw.find((c) => c.startsWith(`${name}=`));
  return hit ? hit.split(';')[0] : '';
}

// --- Sans base de données ------------------------------------------------------------------

test('garde de cookie : avec bindName, un cookie ne passe pas d’une garde à l’autre', () => {
  const secret = () => 'secret-partage';
  const a = createSignedCookieGate({ name: 'a_access', ttlSeconds: 60, secret, bindName: true });
  const b = createSignedCookieGate({ name: 'b_access', ttlSeconds: 60, secret, bindName: true });
  const valueFromA = a.build('ok');
  assert.equal(a.verify(valueFromA), 'ok');
  assert.equal(b.verify(valueFromA), null, 'la signature de A ne vaut rien sous le nom B');
});

test('garde de cookie : sans bindName, la signature historique est inchangée', () => {
  const secret = () => 's';
  const gate = createSignedCookieGate({ name: 'anon', ttlSeconds: 60, secret });
  const legacy = crypto.createHmac('sha256', 's').update('uuid-1').digest('base64url');
  assert.equal(gate.sign('uuid-1'), legacy, 'la progression Visite déjà émise reste valide');
});

test('codePassValue : dépend du code en vigueur', () => {
  assert.equal(codePassValue('hash-1'), codePassValue('hash-1'));
  assert.notEqual(codePassValue('hash-1'), codePassValue('hash-2'));
  assert.doesNotMatch(codePassValue('hash-1'), /hash-1/, 'le hachage ne sort pas en clair');
});

test('changement de mot de passe sous le limiteur strict (ForetMap et G&L)', () => {
  const limited = new Set(listAuthRateLimitPaths());
  assert.ok(limited.has('/api/auth/me/password'));
  assert.ok(limited.has('/api/gl/auth/change-password'));
});

test('sondes post-déploiement : configuration git, journal de démarrage et sources front', () => {
  for (const p of ['/.git/config', '/startup.log', '/src/main.jsx']) {
    assert.ok(EXPOSURE_PROBE_PATHS.includes(p), p);
  }
});

// --- Avec base de données ------------------------------------------------------------------

let adminToken;
let mapId;
const snapshots = [];

test.before(async () => {
  await initSchema();
  await initDatabase();
  await ensureRbacBootstrap();
  adminToken = await ensureAdminTeacherAuthToken({ elevated: true });
  mapId = (await fx.createMap({ label: 'Plan audit sécurité' })).id;
  for (const key of [
    'ui.plan.map_id',
    'ui.plan.access_mode',
    'security.plan_access_code_hash',
    'ui.staff_plan.access_mode',
    'security.staff_plan_access_code_hash',
  ]) {
    snapshots.push(await snapshotSetting(key));
  }
  await setSetting('ui.plan.map_id', mapId, { userType: 'teacher', userId: 'test' });
  invalidateSettingsCache();
});

test.beforeEach(async () => {
  adminToken = await ensureAdminTeacherAuthToken({ elevated: true });
  planContentCache.clear();
  invalidateSettingsCache();
});

test.after(async () => {
  for (const snap of snapshots) await restoreSetting(snap);
  await execute('DELETE FROM maps WHERE id = ?', [mapId]);
  invalidateSettingsCache();
});

async function setAccessCode(target, code) {
  return request(app)
    .post(`/api/settings/admin/${target}-access-code`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ code });
}

test('I1 — un code d’accès trop court est refusé (12 caractères minimum)', async () => {
  const res = await setAccessCode('plan', '1234');
  assert.equal(res.status, 400);
  assert.match(res.body.error, /12 caractères minimum/);
  const staff = await setAccessCode('staff-plan', 'court');
  assert.equal(staff.status, 400);
});

test('C1 — le laissez-passer du plan public n’ouvre pas le plan des personnels', async () => {
  await setSetting('ui.plan.access_mode', 'code', { userType: 'teacher', userId: 'test' });
  await setSetting('ui.staff_plan.access_mode', 'code', { userType: 'teacher', userId: 'test' });
  assert.equal((await setAccessCode('plan', 'code-plan-public-1')).status, 200);
  assert.equal((await setAccessCode('staff-plan', 'code-personnels-1')).status, 200);
  invalidateSettingsCache();

  const granted = await request(app)
    .post('/api/plan/access')
    .send({ code: 'code-plan-public-1' })
    .expect(200);
  const planCookie = cookieFrom(granted, 'plan_access');
  assert.ok(planCookie);
  await request(app).get('/api/plan/content').set('Cookie', planCookie).expect(200);

  const swapped = planCookie.replace(/^plan_access=/, 'staff_plan_access=');
  const res = await request(app).get('/api/staff-plan/content').set('Cookie', swapped).expect(401);
  assert.equal(res.body.auth_required, true);
});

test('I2 — changer le code révoque les laissez-passer déjà délivrés', async () => {
  await setSetting('ui.plan.access_mode', 'code', { userType: 'teacher', userId: 'test' });
  assert.equal((await setAccessCode('plan', 'premier-code-1')).status, 200);
  invalidateSettingsCache();

  const granted = await request(app)
    .post('/api/plan/access')
    .send({ code: 'premier-code-1' })
    .expect(200);
  const oldPass = cookieFrom(granted, 'plan_access');
  await request(app).get('/api/plan/content').set('Cookie', oldPass).expect(200);

  assert.equal((await setAccessCode('plan', 'second-code-2')).status, 200);
  invalidateSettingsCache();
  planContentCache.clear();
  const refused = await request(app).get('/api/plan/content').set('Cookie', oldPass).expect(401);
  assert.equal(refused.body.access_required, true);
});

test('C1/I2 — un laissez-passer « ok » de l’ancien format est refusé', async () => {
  await setSetting('ui.staff_plan.access_mode', 'code', { userType: 'teacher', userId: 'test' });
  assert.equal((await setAccessCode('staff-plan', 'code-personnels-2')).status, 200);
  invalidateSettingsCache();
  const { staffPlanAccessGate } = require('../lib/staffPlanAccess');
  const forged = `staff_plan_access=${encodeURIComponent(staffPlanAccessGate.build('ok'))}`;
  await request(app).get('/api/staff-plan/content').set('Cookie', forged).expect(401);
});

// --- I3 : périmètre des membres de groupe ---------------------------------------------------

async function roleId(slug) {
  const row = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [slug]);
  assert.ok(row?.id, `profil introuvable : ${slug}`);
  return row.id;
}

async function createStudent(label) {
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO users (id, user_type, first_name, last_name, display_name, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'student', ?, 'Audit', ?, 'local', 1, NOW(), NOW())`,
    [id, `Sec${label}`, `Sec${label} Audit`],
  );
  return id;
}

async function createClassTeacher() {
  const teacherId = `teacher-audit-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  const rid = await roleId('prof_classe');
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, display_name, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'teacher', ?, ?, 'Prof audit', 'x', 'local', 1, NOW(), NOW())`,
    [teacherId, `${teacherId}@foretmap.local`, teacherId],
  );
  await execute(
    `INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES ('teacher', ?, ?, 1)
     ON DUPLICATE KEY UPDATE role_id = VALUES(role_id), is_primary = 1`,
    [teacherId, rid],
  );
  await execute('UPDATE users SET assigned_role_id = ? WHERE id = ?', [rid, teacherId]);
  const token = await signAuthToken(
    {
      userType: 'teacher',
      userId: teacherId,
      canonicalUserId: teacherId,
      roleId: rid,
      roleSlug: 'prof_classe',
      roleDisplayName: 'prof_classe',
      elevated: false,
    },
    false,
  );
  return { teacherId, token };
}

async function createGroup(label) {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  const res = await request(app)
    .post('/api/groups')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: `${label} ${stamp}`, slug: `${label}-${stamp}`.toLowerCase(), kind: 'class' })
    .expect(201);
  return res.body.id;
}

async function addAsAdmin(groupId, userId) {
  await request(app)
    .post(`/api/groups/${groupId}/members/${userId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(201);
}

test('I3 — un prof de classe ne peut pas s’annexer l’élève d’une autre classe', async () => {
  const { teacherId, token } = await createClassTeacher();
  const ownGroup = await createGroup('Classe-a');
  const otherGroup = await createGroup('Classe-b');
  const ownStudent = await createStudent('Own');
  const foreignStudent = await createStudent('Foreign');
  const newcomer = await createStudent('New');
  await addAsAdmin(ownGroup, teacherId);
  await addAsAdmin(ownGroup, ownStudent);
  await addAsAdmin(otherGroup, foreignStudent);

  try {
    const put = await request(app)
      .put(`/api/groups/${ownGroup}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ member_user_ids: [teacherId, ownStudent, foreignStudent] });
    assert.equal(put.status, 403);
    assert.deepEqual(put.body.user_ids, [foreignStudent]);

    await request(app)
      .post(`/api/groups/${ownGroup}/members/${foreignStudent}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    const bulk = await request(app)
      .post(`/api/groups/${ownGroup}/members/bulk`)
      .set('Authorization', `Bearer ${token}`)
      .send({ user_ids: [foreignStudent, newcomer] })
      .expect(200);
    assert.equal(bulk.body.added, 1, 'seul l’élève sans classe est accueilli');
    const refused = bulk.body.results.find((r) => r.user_id === foreignStudent);
    assert.equal(refused.ok, false);

    const members = await queryAll('SELECT user_id FROM group_members WHERE group_id = ?', [
      ownGroup,
    ]);
    const ids = members.map((r) => String(r.user_id));
    assert.ok(!ids.includes(foreignStudent), 'l’élève de l’autre classe n’a pas été annexé');
    assert.ok(ids.includes(newcomer));

    // Rejouer la liste existante (membres déjà présents) reste permis.
    await request(app)
      .put(`/api/groups/${ownGroup}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ member_user_ids: [teacherId, ownStudent, newcomer] })
      .expect(200);
  } finally {
    await execute('DELETE FROM group_members WHERE group_id IN (?, ?)', [ownGroup, otherGroup]);
    await execute('DELETE FROM `groups` WHERE id IN (?, ?)', [ownGroup, otherGroup]);
    await execute('DELETE FROM user_roles WHERE user_id IN (?, ?, ?, ?)', [
      teacherId,
      ownStudent,
      foreignStudent,
      newcomer,
    ]);
    await execute('DELETE FROM users WHERE id IN (?, ?, ?, ?)', [
      teacherId,
      ownStudent,
      foreignStudent,
      newcomer,
    ]);
  }
});

test('I3 — un administrateur (vue globale) garde la main sur tous les comptes', async () => {
  const groupA = await createGroup('Admin-a');
  const groupB = await createGroup('Admin-b');
  const student = await createStudent('AdminScope');
  await addAsAdmin(groupB, student);
  try {
    await request(app)
      .put(`/api/groups/${groupA}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ member_user_ids: [student] })
      .expect(200);
  } finally {
    await execute('DELETE FROM group_members WHERE group_id IN (?, ?)', [groupA, groupB]);
    await execute('DELETE FROM `groups` WHERE id IN (?, ?)', [groupA, groupB]);
    await execute('DELETE FROM user_roles WHERE user_id = ?', [student]);
    await execute('DELETE FROM users WHERE id = ?', [student]);
  }
});
