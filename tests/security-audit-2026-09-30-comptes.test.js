'use strict';

/**
 * Audit sécurité / RGPD du 30/09/2026 (`docs/AUDIT_SECURITE_RGPD_2026-09-30.md`) — lot
 * « comptes / e-mail sensible » :
 *
 *  - AC1 : session MJ G&L depuis Moodle (LTI) rapprochée par e-mail sur une ligne non liée ;
 *  - AC2 : changement d'e-mail d'un pair par `admin.users.assign_roles` ;
 *  - AC3 : son propre e-mail changé sans mot de passe, même en prise de contrôle ;
 *  - AC4 : délégué agissant sur un rang supérieur (compte ou profil) ;
 *  - AC5 : énumération de comptes au chronomètre (connexion, mot de passe oublié) ;
 *  - AC6 : ticket d'arrivée LTI rejouable ;
 *  - AC7 : élève LTI rapproché par l'e-mail avant l'identifiant Moodle ;
 *  - AC8 : secret de test de charge (longueur, comparaison, production) ;
 *  - CS6 : `JWT_SECRET` d'exemple accepté en production ;
 *  - §6  : profil de prise de contrôle, CORS Socket.IO, `target_link_uri` LTI.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const request = require('supertest');

const { initSchema, initDatabase, queryOne, execute } = require('../database');
const { app } = require('../server');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { recomputeUserRole } = require('../lib/effectiveRole');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { setSetting } = require('../lib/settings');
const { snapshotSetting, restoreSetting } = require('./helpers/settingsSnapshot');
const { createPasswordResetToken } = require('../lib/passwordReset');
const { LTI_SETTING_KEYS } = require('../lib/lti/settingsRegistry');

const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const createdUserIds = [];
const createdRoleIds = [];
const createdGlAdminIds = [];

// --- Sans base de données ------------------------------------------------------------------

function withEnv(overrides, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(overrides)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test('CS6 — JWT_SECRET d’exemple refusé au démarrage en production', () => {
  const { validateEnv, KNOWN_PUBLIC_JWT_SECRETS } = require('../lib/env');
  const base = {
    NODE_ENV: 'production',
    VISIT_COOKIE_SECRET: 'visit-cookie-secret-assez-long-pour-la-prod',
    E2E_DISABLE_RATE_LIMIT: undefined,
    LOAD_TEST_SECRET: undefined,
  };
  for (const known of [
    'changez_moi_en_production_secret_long_aleatoire',
    'session-test-secret-not-for-production',
    'dev-secret-change-in-production',
  ]) {
    assert.ok(KNOWN_PUBLIC_JWT_SECRETS.includes(known), known);
    assert.throws(
      () => withEnv({ ...base, JWT_SECRET: known }, () => validateEnv()),
      /valeur publiée/,
      known,
    );
  }
  // Une vraie valeur aléatoire passe.
  withEnv({ ...base, JWT_SECRET: crypto.randomBytes(32).toString('hex') }, () => validateEnv());
  // Le harnais e2e (production locale) reste toléré, avec avertissement.
  withEnv(
    { ...base, JWT_SECRET: 'session-test-secret-not-for-production', E2E_DISABLE_RATE_LIMIT: '1' },
    () => validateEnv(),
  );
});

test('CS6 — la liste de refus reprend les valeurs réellement publiées dans le dépôt', () => {
  const { isKnownPublicJwtSecret } = require('../lib/env');
  const root = path.join(__dirname, '..');
  const sources = ['.env.example', 'env.local.example', 'scripts/bootstrap-web-session.sh'];
  for (const rel of sources) {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    const m = text.match(/JWT_SECRET='?([^'\s]+)'?/);
    assert.ok(m, `JWT_SECRET introuvable dans ${rel}`);
    assert.ok(isKnownPublicJwtSecret(m[1]), `${rel} : ${m[1]} doit être refusé`);
  }
});

test('AC8 — secret de test de charge : 32 caractères, temps constant, ignoré en production', () => {
  const { isLoadTestBypass, LOAD_TEST_SECRET_MIN_LENGTH } = require('../lib/rateLimit');
  assert.equal(LOAD_TEST_SECRET_MIN_LENGTH, 32);
  const reqWith = (value) => ({ get: (h) => (h === 'x-foretmap-load-test' ? value : undefined) });
  const short = 'court-secret';
  const long = 'l'.repeat(40);
  withEnv({ NODE_ENV: 'development', LOAD_TEST_SECRET: short }, () => {
    assert.equal(isLoadTestBypass(reqWith(short)), false, 'secret trop court ignoré');
  });
  withEnv({ NODE_ENV: 'development', LOAD_TEST_SECRET: long }, () => {
    assert.equal(isLoadTestBypass(reqWith(long)), true);
    assert.equal(isLoadTestBypass(reqWith(`${long}x`)), false);
    assert.equal(isLoadTestBypass(reqWith('')), false);
  });
  withEnv({ NODE_ENV: 'production', LOAD_TEST_SECRET: long }, () => {
    assert.equal(isLoadTestBypass(reqWith(long)), false, 'jamais en production');
  });
  // Même comparaison que DEPLOY_SECRET (module partagé).
  const { timingSafeSecretEqual } = require('../lib/shared/secretCompare');
  assert.equal(require('../routes/admin-ops').timingSafeSecretEqual, timingSafeSecretEqual);
});

test('§6 — CORS Socket.IO : même origine en production sans FRONTEND_ORIGIN(S)', () => {
  const { socketCorsOrigin } = require('../lib/realtime');
  withEnv({ NODE_ENV: 'production', FRONTEND_ORIGIN: undefined, FRONTEND_ORIGINS: undefined }, () =>
    assert.equal(socketCorsOrigin(), false),
  );
  withEnv(
    { NODE_ENV: 'production', FRONTEND_ORIGIN: 'https://foret.test', FRONTEND_ORIGINS: undefined },
    () => assert.equal(socketCorsOrigin(), 'https://foret.test'),
  );
  withEnv({ NODE_ENV: 'development' }, () => assert.equal(socketCorsOrigin(), true));
});

test('§6 — LTI : target_link_uri doit viser l’origine publique de l’outil', () => {
  const { isTargetLinkUriOnToolOrigin } = require('../lib/lti/oidc');
  const tool = 'https://foret.test';
  assert.equal(isTargetLinkUriOnToolOrigin('https://foret.test/api/lti/launch', tool), true);
  assert.equal(isTargetLinkUriOnToolOrigin('https://evil.test/api/lti/launch', tool), false);
  assert.equal(isTargetLinkUriOnToolOrigin('https://foret.test.evil.test/x', tool), false);
  assert.equal(isTargetLinkUriOnToolOrigin('javascript:alert(1)', tool), false);
  assert.equal(isTargetLinkUriOnToolOrigin('pas une url', tool), false);
});

test('AC5 — le hachage factice ne valide aucun mot de passe', async () => {
  const { comparePasswordConstantTime, DUMMY_BCRYPT_HASH } = require('../lib/auth/timingEqualizer');
  assert.match(DUMMY_BCRYPT_HASH, /^\$2[ab]\$10\$/);
  assert.equal(await comparePasswordConstantTime('', null), false);
  assert.equal(await comparePasswordConstantTime('admin1234', undefined), false);
  const real = await bcrypt.hash('bon-mot-de-passe', 4);
  assert.equal(await comparePasswordConstantTime('bon-mot-de-passe', real), true);
});

test('AC5 — aucun envoi SMTP attendu dans « mot de passe oublié » (ForetMap et G&L)', () => {
  for (const rel of ['routes/auth.js', 'routes/gl/auth.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
    assert.doesNotMatch(src, /await\s+sendPasswordResetEmail\(/, rel);
  }
});

// --- Avec base de données ------------------------------------------------------------------

let adminToken;
const snapshots = [];

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

async function createAccount({
  userType = 'teacher',
  roleSlug = null,
  roleId = null,
  password = 'mot-de-passe-actuel-12',
  email = null,
  authProvider = 'local',
}) {
  const id = crypto.randomUUID();
  const hash = password ? await bcrypt.hash(password, 4) : null;
  const mail = email === null ? `c${id.slice(0, 8)}.${stamp}@audit.test` : email;
  await execute(
    `INSERT INTO users
       (id, user_type, email, pseudo, first_name, last_name, display_name, password_hash,
        auth_provider, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'Audit', ?, ?, ?, ?, 1, NOW(), NOW())`,
    [
      id,
      userType,
      mail,
      `p${id.slice(0, 10)}`,
      id.slice(0, 8),
      `Audit ${id.slice(0, 8)}`,
      hash,
      authProvider,
    ],
  );
  createdUserIds.push(id);
  const role = roleId
    ? { id: roleId }
    : roleSlug
      ? await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [roleSlug])
      : null;
  if (role) {
    await execute('UPDATE users SET assigned_role_id = ? WHERE id = ?', [role.id, id]);
  }
  await recomputeUserRole(id);
  const user = await queryOne('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
  const token = await signAuthToken({ userType, userId: id, canonicalUserId: id });
  return { user, token, password };
}

test.before(async () => {
  await initSchema();
  await initDatabase();
  await ensureRbacBootstrap();
  adminToken = await ensureAdminTeacherAuthToken({ elevated: true });
  for (const key of [LTI_SETTING_KEYS.enabled, LTI_SETTING_KEYS.publicOrigin]) {
    snapshots.push(await snapshotSetting(key));
  }
});

test.after(async () => {
  for (const snap of snapshots) await restoreSetting(snap);
  for (const id of createdGlAdminIds) await execute('DELETE FROM gl_admins WHERE id = ?', [id]);
  for (const id of createdUserIds) {
    await execute('DELETE FROM external_identities WHERE user_id = ?', [id]);
    await execute('DELETE FROM password_reset_tokens WHERE user_id = ?', [id]);
    await execute('DELETE FROM user_roles WHERE user_id = ?', [id]);
    await execute('DELETE FROM users WHERE id = ?', [id]);
  }
  for (const id of createdRoleIds) {
    await execute('DELETE FROM role_permissions WHERE role_id = ?', [id]);
    await execute('DELETE FROM roles WHERE id = ?', [id]);
  }
});

// AC1 ---------------------------------------------------------------------------------------

async function createGlAdminRow({ email, foretmapUserId = null, role = 'admin' }) {
  const res = await execute(
    `INSERT INTO gl_admins (email, display_name, role, foretmap_user_id, is_active, created_at, updated_at)
     VALUES (?, 'Staff audit', ?, ?, 1, NOW(), NOW())`,
    [email, role, foretmapUserId],
  );
  createdGlAdminIds.push(res.insertId);
  return res.insertId;
}

test('AC1 — LTI : une ligne gl_admins non liée ne s’ouvre plus par l’e-mail', async () => {
  const { buildGlStaffSession } = require('../lib/lti/session');
  const { user } = await createAccount({ roleSlug: 'prof' });
  await createGlAdminRow({ email: user.email });
  await assert.rejects(() => buildGlStaffSession(user), { status: 403 });
});

test('AC1 — LTI : ligne liée + enseignant avec teacher.access → session MJ', async () => {
  const { buildGlStaffSession } = require('../lib/lti/session');
  const { user } = await createAccount({ roleSlug: 'prof' });
  await createGlAdminRow({ email: `gl.${user.email}`, foretmapUserId: user.id, role: 'mj' });
  const session = await buildGlStaffSession(user);
  assert.equal(session.product, 'gl');
  assert.equal(session.type, 'gl_staff');
});

test('AC1 — LTI : enseignant sans teacher.access, ou compte élève → refus', async () => {
  const { buildGlStaffSession } = require('../lib/lti/session');
  const noAccess = await createRole({ slug: `audit-noaccess-${stamp}`, rank: 330 });
  const { user: teacher } = await createAccount({ roleId: noAccess.id });
  await createGlAdminRow({ email: `gl.${teacher.email}`, foretmapUserId: teacher.id });
  await assert.rejects(() => buildGlStaffSession(teacher), { status: 403 });

  const { user: student } = await createAccount({ userType: 'student', roleSlug: 'eleve_novice' });
  await createGlAdminRow({ email: `gl.${student.email}`, foretmapUserId: student.id });
  await assert.rejects(() => buildGlStaffSession(student), { status: 403 });
});

test('AC1 — hydratation : une session LTI sur une ligne staff non liée est rejetée', async () => {
  const { loadGlIdentity } = require('../lib/auth/glHydration');
  const adminId = await createGlAdminRow({ email: `orphelin.${stamp}@audit.test` });
  const deps = { queryOne };
  const lti = await loadGlIdentity(
    { userType: 'gl_admin', userId: adminId, authSource: 'lti' },
    deps,
  );
  assert.equal(lti, null);
  // La connexion directe historique (ligne non liée) garde sa tolérance documentée.
  const direct = await loadGlIdentity({ userType: 'gl_admin', userId: adminId }, deps);
  assert.ok(direct);
});

// AC6 ---------------------------------------------------------------------------------------

test('AC6 — le ticket d’arrivée LTI ne s’échange qu’une fois', async () => {
  const { issueTicket, readTicket } = require('../lib/lti/session');
  const { user } = await createAccount({ userType: 'student', roleSlug: 'eleve_novice' });
  const ticket = issueTicket({
    userId: user.id,
    destination: {
      instructor: false,
      destinations: [{ id: 'fm', product: 'fm', landing: 'map' }],
    },
    report: {},
  });
  assert.ok(readTicket(ticket).jti, 'le ticket porte un jti');
  const first = await request(app).post('/api/lti/session').send({ ticket, destinationId: 'fm' });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.ok(first.body.token);
  const replay = await request(app).post('/api/lti/session').send({ ticket, destinationId: 'fm' });
  assert.equal(replay.status, 401);
  assert.equal(replay.body.code, 'LTI_TICKET_USED');
});

test('AC6 — un échec métier ne brûle pas le ticket', async () => {
  const { issueTicket } = require('../lib/lti/session');
  const { user } = await createAccount({ userType: 'student', roleSlug: 'eleve_novice' });
  const ticket = issueTicket({
    userId: user.id,
    destination: {
      instructor: false,
      destinations: [
        { id: 'fm', product: 'fm', landing: 'map' },
        { id: 'gl_game', product: 'gl', landing: 'game' },
      ],
    },
    report: {},
  });
  const noJoueur = await request(app)
    .post('/api/lti/session')
    .send({ ticket, destinationId: 'gl_game' });
  assert.equal(noJoueur.status, 403);
  const ok = await request(app).post('/api/lti/session').send({ ticket, destinationId: 'fm' });
  assert.equal(ok.status, 200);
});

// AC7 ---------------------------------------------------------------------------------------

test('AC7 — premier lancement : l’identifiant Moodle synchronisé l’emporte sur l’e-mail', async () => {
  const { resolveLtiUser } = require('../lib/lti/identity');
  const moodleId = String(900000 + Math.floor(Math.random() * 90000));
  const { user: victim } = await createAccount({ userType: 'student', roleSlug: 'eleve_novice' });
  const { user: owner } = await createAccount({ userType: 'student', roleSlug: 'eleve_novice' });
  await execute(
    `INSERT INTO external_identities (provider, issuer, external_id, user_id, origin, linked_at)
     VALUES ('moodle', ?, ?, ?, 'linked', NOW())`,
    [`https://moodle.audit.test/${stamp}`, moodleId, owner.id],
  );
  // Moodle déclare l'e-mail de la victime (changé sans confirmation côté plateforme).
  const { user, via } = await resolveLtiUser({
    sub: moodleId,
    email: victim.email,
    issuer: `https://lti.audit.test/${stamp}`,
  });
  assert.equal(user.id, owner.id);
  assert.equal(via, 'moodle_id');
});

// §6 d : route /api/lti/login -----------------------------------------------------------------

test('§6 — /api/lti/login refuse un target_link_uri hors de l’outil', async () => {
  const { startFakeLtiPlatform, applyLtiEnv } = require('./helpers/fakeLtiPlatform');
  const platform = await startFakeLtiPlatform();
  const restore = applyLtiEnv(platform.env);
  try {
    await setSetting(LTI_SETTING_KEYS.enabled, true);
    await setSetting(LTI_SETTING_KEYS.publicOrigin, 'https://foret.test');
    const send = (target) =>
      request(app)
        .post('/api/lti/login')
        .type('form')
        .send({
          iss: platform.env.LTI_ISSUER,
          client_id: platform.env.LTI_CLIENT_ID,
          login_hint: 'h',
          target_link_uri: target,
        })
        .redirects(0);
    const bad = await send('https://evil.test/api/lti/launch');
    assert.equal(bad.status, 400);
    assert.equal(bad.body.code, 'LTI_TARGET');
    const good = await send('https://foret.test/api/lti/launch');
    assert.equal(good.status, 302);
  } finally {
    restore();
    await platform.close();
  }
});

// AC2 / AC4 ---------------------------------------------------------------------------------

let delegate;
let delegateRole;

async function ensureDelegate() {
  if (delegate) return delegate;
  delegateRole = await createRole({
    slug: `audit-delegue-${stamp}`,
    rank: 380,
    permissions: ['teacher.access', 'admin.users.assign_roles', 'admin.roles.manage'],
  });
  delegate = await createAccount({ roleId: delegateRole.id });
  return delegate;
}

test('AC2 — un délégué ne change pas l’e-mail d’un compte de rang supérieur', async () => {
  const { token } = await ensureDelegate();
  const { user: prof } = await createAccount({ roleSlug: 'prof' });
  const res = await request(app)
    .patch(`/api/rbac/users/teacher/${prof.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ email: `pirate.${stamp}@audit.test` });
  assert.equal(res.status, 403, JSON.stringify(res.body));
  const after = await queryOne('SELECT email FROM users WHERE id = ?', [prof.id]);
  assert.equal(after.email, prof.email);
});

test('AC2 — ni sur son propre compte', async () => {
  const { token, user } = await ensureDelegate();
  const res = await request(app)
    .patch(`/api/rbac/users/teacher/${user.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ email: `moi.${stamp}@audit.test` });
  assert.equal(res.status, 403);
});

test('AC2 — changement par l’admin : sessions révoquées, liens de réinitialisation consommés', async () => {
  const { user: target } = await createAccount({ roleSlug: 'prof_classe' });
  const resetToken = await createPasswordResetToken('teacher', target.id);
  assert.ok(resetToken);
  const before = await queryOne('SELECT token_epoch FROM users WHERE id = ?', [target.id]);
  const res = await request(app)
    .patch(`/api/rbac/users/teacher/${target.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ email: `nouvelle.${stamp}@audit.test` });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const after = await queryOne('SELECT token_epoch, email FROM users WHERE id = ?', [target.id]);
  assert.equal(after.email, `nouvelle.${stamp}@audit.test`);
  assert.equal(Number(after.token_epoch), Number(before.token_epoch || 0) + 1);
  const open = await queryOne(
    'SELECT COUNT(*) AS n FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL',
    [target.id],
  );
  assert.equal(Number(open.n), 0);
});

test('AC2 — sans changement réel d’e-mail, pas de révocation', async () => {
  const { user: target } = await createAccount({ roleSlug: 'prof_classe' });
  const res = await request(app)
    .patch(`/api/rbac/users/teacher/${target.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ email: target.email.toUpperCase(), description: 'rien de sensible' });
  assert.equal(res.status, 200);
  const after = await queryOne('SELECT token_epoch FROM users WHERE id = ?', [target.id]);
  assert.equal(Number(after.token_epoch || 0), 0);
});

test('AC4 — un délégué ne rétrograde pas un compte de rang supérieur', async () => {
  const { token } = await ensureDelegate();
  const { user: prof } = await createAccount({ roleSlug: 'prof' });
  const personnel = await queryOne("SELECT id FROM roles WHERE slug = 'personnel' LIMIT 1");
  const res = await request(app)
    .put(`/api/rbac/users/teacher/${prof.id}/role`)
    .set('Authorization', `Bearer ${token}`)
    .send({ role_id: personnel.id });
  assert.equal(res.status, 403, JSON.stringify(res.body));
  const after = await queryOne(
    'SELECT r.slug FROM users u JOIN roles r ON r.id = u.assigned_role_id WHERE u.id = ?',
    [prof.id],
  );
  assert.equal(after.slug, 'prof');
});

test('AC4 — un délégué ne vide pas les permissions d’un profil de rang supérieur', async () => {
  const { token } = await ensureDelegate();
  const superior = await createRole({
    slug: `audit-superieur-${stamp}`,
    rank: 395,
    permissions: ['teacher.access'],
  });
  const res = await request(app)
    .put(`/api/rbac/profiles/${superior.id}/permissions`)
    .set('Authorization', `Bearer ${token}`)
    .send({ permissions: [] });
  assert.equal(res.status, 403, JSON.stringify(res.body));
  const kept = await queryOne(
    'SELECT COUNT(*) AS n FROM role_permissions WHERE role_id = ? AND permission_key = ?',
    [superior.id, 'teacher.access'],
  );
  assert.equal(Number(kept.n), 1);
});

test('AC4 — un délégué agit toujours sur un profil de rang inférieur', async () => {
  const { token } = await ensureDelegate();
  const inferior = await createRole({ slug: `audit-inferieur-${stamp}`, rank: 310 });
  const res = await request(app)
    .put(`/api/rbac/profiles/${inferior.id}/permissions`)
    .set('Authorization', `Bearer ${token}`)
    .send({ permissions: [{ key: 'teacher.access' }] });
  assert.equal(res.status, 200, JSON.stringify(res.body));
});

// AC3 ---------------------------------------------------------------------------------------

test('AC3 — /me/profile : changer d’e-mail exige le mot de passe actuel', async () => {
  const { user, token, password } = await createAccount({ roleSlug: 'prof_classe' });
  const next = `perso.${stamp}@audit.test`;
  const missing = await request(app)
    .patch('/api/auth/me/profile')
    .set('Authorization', `Bearer ${token}`)
    .send({ email: next });
  assert.equal(missing.status, 400);
  assert.equal(missing.body.code, 'CURRENT_PASSWORD_REQUIRED');
  const wrong = await request(app)
    .patch('/api/auth/me/profile')
    .set('Authorization', `Bearer ${token}`)
    .send({ email: next, currentPassword: 'faux' });
  assert.equal(wrong.status, 401);
  assert.equal(
    (await queryOne('SELECT email FROM users WHERE id = ?', [user.id])).email,
    user.email,
  );

  const ok = await request(app)
    .patch('/api/auth/me/profile')
    .set('Authorization', `Bearer ${token}`)
    .send({ email: next, currentPassword: password });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.email, next);
  assert.ok(ok.body.authToken, 'jeton neuf renvoyé');
  // L'ancien jeton est révoqué, le nouveau fonctionne.
  const oldMe = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
  assert.equal(oldMe.status, 401);
  const newMe = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${ok.body.authToken}`);
  assert.equal(newMe.status, 200);
});

test('AC3 — /me/profile : les autres champs restent modifiables sans mot de passe', async () => {
  const { token } = await createAccount({ roleSlug: 'prof_classe' });
  const res = await request(app)
    .patch('/api/auth/me/profile')
    .set('Authorization', `Bearer ${token}`)
    .send({ description: 'Bonjour' });
  assert.equal(res.status, 200);
  assert.equal(res.body.authToken, undefined);
});

test('AC3 — compte sans mot de passe (Google seul) : changement d’e-mail refusé', async () => {
  const { token } = await createAccount({
    roleSlug: 'prof_classe',
    password: null,
    authProvider: 'google',
  });
  const res = await request(app)
    .patch('/api/auth/me/profile')
    .set('Authorization', `Bearer ${token}`)
    .send({ email: `google.${stamp}@audit.test`, currentPassword: 'x' });
  assert.equal(res.status, 403);
  assert.equal(res.body.code, 'EMAIL_CHANGE_NEEDS_PASSWORD');
});

test('AC3 — élève : même exigence sur PATCH /api/students/:id/profile', async () => {
  const { user, token, password } = await createAccount({
    userType: 'student',
    roleSlug: 'eleve_novice',
  });
  const next = `eleve.${stamp}@audit.test`;
  const missing = await request(app)
    .patch(`/api/students/${user.id}/profile`)
    .set('Authorization', `Bearer ${token}`)
    .send({ email: next });
  assert.equal(missing.status, 400);
  const ok = await request(app)
    .patch(`/api/students/${user.id}/profile`)
    .set('Authorization', `Bearer ${token}`)
    .send({ email: next, currentPassword: password });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.ok(ok.body.authToken);
});

test('AC3 + §6 — prise de contrôle : e-mail intouchable, profil en liste blanche', async () => {
  const { user } = await createAccount({ userType: 'student', roleSlug: 'eleve_novice' });
  const imp = await request(app)
    .post('/api/auth/admin/impersonate')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ userType: 'student', userId: user.id });
  assert.equal(imp.status, 200, JSON.stringify(imp.body));
  // §6 a : plus de `SELECT *` moins `password_hash` — aucune colonne hors liste blanche.
  // Champs calculés déclarés (avatar par défaut) admis : ce ne sont pas des colonnes.
  const { PUBLIC_USER_FIELDS, PUBLIC_USER_COMPUTED_FIELDS } = require('../lib/publicUser');
  const allowed = [...PUBLIC_USER_FIELDS, ...PUBLIC_USER_COMPUTED_FIELDS];
  for (const key of Object.keys(imp.body.profile)) {
    assert.ok(allowed.includes(key), `colonne exposée : ${key}`);
  }
  assert.equal(imp.body.profile.token_epoch, undefined);

  const res = await request(app)
    .patch(`/api/students/${user.id}/profile`)
    .set('Authorization', `Bearer ${imp.body.authToken}`)
    .send({ email: `imp.${stamp}@audit.test`, currentPassword: 'mot-de-passe-actuel-12' });
  assert.equal(res.status, 403);
  assert.equal(
    (await queryOne('SELECT email FROM users WHERE id = ?', [user.id])).email,
    user.email,
  );
});

// AC5 ---------------------------------------------------------------------------------------

test('AC5 — connexion : bcrypt s’exécute même pour un identifiant inconnu', async () => {
  const original = bcrypt.compare;
  let calls = 0;
  bcrypt.compare = async (...args) => {
    calls += 1;
    return original.apply(bcrypt, args);
  };
  try {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: `inconnu.${stamp}@audit.test`, password: 'nimporte' });
    assert.equal(res.status, 401);
    assert.ok(calls >= 1, 'bcrypt.compare doit être appelé');
  } finally {
    bcrypt.compare = original;
  }
});

test('AC5 — mot de passe oublié : la réponse n’attend pas le SMTP', async () => {
  // Serveur SMTP qui accepte la connexion et ne répond jamais : un envoi attendu bloquerait
  // la réponse jusqu'au délai de nodemailer (dizaines de secondes).
  const sockets = new Set();
  const smtp = net.createServer((s) => sockets.add(s));
  await new Promise((resolve) => smtp.listen(0, '127.0.0.1', resolve));
  const { port } = smtp.address();
  const saved = { host: process.env.SMTP_HOST, port: process.env.SMTP_PORT };
  process.env.SMTP_HOST = '127.0.0.1';
  process.env.SMTP_PORT = String(port);
  try {
    const { user } = await createAccount({ userType: 'student', roleSlug: 'eleve_novice' });
    const started = Date.now();
    const res = await request(app).post('/api/auth/forgot-password').send({ email: user.email });
    assert.equal(res.status, 200);
    assert.ok(Date.now() - started < 3000, `réponse en ${Date.now() - started} ms`);
    const open = await queryOne(
      'SELECT COUNT(*) AS n FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL',
      [user.id],
    );
    assert.equal(Number(open.n), 1, 'le jeton est bien créé');
  } finally {
    if (saved.host === undefined) delete process.env.SMTP_HOST;
    else process.env.SMTP_HOST = saved.host;
    if (saved.port === undefined) delete process.env.SMTP_PORT;
    else process.env.SMTP_PORT = saved.port;
    for (const s of sockets) s.destroy();
    smtp.close();
  }
});
