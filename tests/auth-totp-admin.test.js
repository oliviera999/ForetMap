'use strict';

/**
 * Administration du second facteur : réinitialisation par un administrateur (journalisée,
 * révoque les sessions), prise de contrôle réservée à une session validée par la double
 * authentification, et script serveur du dernier administrateur (`scripts/totp-admin.js`).
 */

require('./helpers/setup');
const crypto = require('node:crypto');
process.env.TOTP_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, queryAll, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { recomputeUserRole, setAssignedRole } = require('../lib/effectiveRole');
const { setSetting, getSettingValue } = require('../lib/settings');
const totp = require('../lib/auth/totp');
const store = require('../lib/auth/totpStore');
const totpAdmin = require('../scripts/totp-admin');
const { snapshotSetting, restoreSetting } = require('./helpers/settingsSnapshot');

const ENFORCEMENT_KEY = 'security.totp.enforcement';
const PASSWORD = 'MotDePasseSolide2026';
const created = [];
let snapshot;

async function createAccount({ userType = 'teacher', roleSlug }) {
  const id = crypto.randomUUID();
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const email = `mfaadm_${stamp}@example.com`;
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, first_name, last_name, display_name, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'Adm', ?, ?, ?, 'local', 1, NOW(), NOW())`,
    [id, userType, email, `mfaadm_${stamp}`, stamp, `Adm ${stamp}`, await bcrypt.hash(PASSWORD, 4)],
  );
  if (roleSlug) {
    const role = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [roleSlug]);
    await setAssignedRole(id, role.id);
  }
  await recomputeUserRole(id);
  created.push(id);
  return { id, email };
}

async function enrollAccount(userId) {
  const current = totp.timeStep(Date.now());
  const started = await store.startEnrollment(userId);
  const confirmNow = (current - 1) * 30000 + 1000;
  const res = await store.confirmEnrollment(userId, totp.totpAt(started.secret, confirmNow), {
    nowMs: confirmNow,
  });
  assert.equal(res.ok, true);
  return { secret: started.secret, lastStep: current - 1 };
}

/** Jeton de session tel que l'émet la connexion (époque et profil courants). */
async function sessionToken(userId, extra = {}) {
  const row = await queryOne(
    `SELECT u.user_type, u.token_epoch, r.id AS role_id, r.slug
       FROM users u JOIN user_roles ur ON ur.user_id = u.id AND ur.is_primary = 1
       JOIN roles r ON r.id = ur.role_id WHERE u.id = ? LIMIT 1`,
    [userId],
  );
  return signAuthToken({
    userType: row.user_type,
    userId,
    roleId: row.role_id,
    roleSlug: row.slug,
    tokenEpoch: Number(row.token_epoch || 0),
    ...extra,
  });
}

test.before(async () => {
  await initSchema();
  snapshot = await snapshotSetting(ENFORCEMENT_KEY);
});

test.after(async () => {
  await restoreSetting(snapshot);
  if (created.length) {
    await execute(`DELETE FROM users WHERE id IN (${created.map(() => '?').join(', ')})`, created);
  }
});

test('réinitialisation par un administrateur : second facteur effacé, sessions révoquées, journalisée', async () => {
  await setSetting(ENFORCEMENT_KEY, 'enroll', {});
  const admin = await createAccount({ roleSlug: 'admin' });
  const prof = await createAccount({ roleSlug: 'prof' });
  await enrollAccount(prof.id);
  const profSession = await sessionToken(prof.id, { mfa: true });
  await request(app).get('/api/auth/me').set('Authorization', `Bearer ${profSession}`).expect(200);

  const adminSession = await sessionToken(admin.id, { mfa: true });
  const status = await request(app)
    .get(`/api/auth/totp/users/${prof.id}`)
    .set('Authorization', `Bearer ${adminSession}`)
    .expect(200);
  assert.equal(status.body.enrolled, true);
  assert.equal(status.body.subject, true);
  assert.equal(status.body.backupCodesRemaining, 10);
  assert.ok(!JSON.stringify(status.body).includes('secret'));

  await request(app)
    .post(`/api/auth/totp/users/${prof.id}/reset`)
    .set('Authorization', `Bearer ${adminSession}`)
    .send({})
    .expect(200);
  assert.equal((await store.getTotpStatus(prof.id)).enabled, false);
  // Toutes les sessions du compte tombent (époque de jeton incrémentée).
  await request(app).get('/api/auth/me').set('Authorization', `Bearer ${profSession}`).expect(401);

  const events = await queryAll(
    `SELECT actor_user_id, actor_user_type, result FROM security_events
      WHERE action = 'auth.totp.reset' AND target_id = ? ORDER BY id`,
    [prof.id],
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].actor_user_id, admin.id);
  const audit = await queryOne(
    "SELECT COUNT(*) AS c FROM audit_log WHERE action = 'auth.totp.reset' AND target_id = ?",
    [prof.id],
  );
  assert.equal(Number(audit.c), 1);
});

test('réinitialisation refusée : session admin non validée, son propre compte, sans permission', async () => {
  await setSetting(ENFORCEMENT_KEY, 'enroll', {});
  const admin = await createAccount({ roleSlug: 'admin' });
  const prof = await createAccount({ roleSlug: 'prof' });
  await enrollAccount(prof.id);
  const notValidated = await sessionToken(admin.id);
  const r1 = await request(app)
    .post(`/api/auth/totp/users/${prof.id}/reset`)
    .set('Authorization', `Bearer ${notValidated}`)
    .send({})
    .expect(403);
  assert.equal(r1.body.code, 'MFA_SESSION_REQUIRED');

  const validated = await sessionToken(admin.id, { mfa: true });
  await request(app)
    .post(`/api/auth/totp/users/${admin.id}/reset`)
    .set('Authorization', `Bearer ${validated}`)
    .send({})
    .expect(400);

  const profToken = await sessionToken(prof.id, { mfa: true });
  const other = await createAccount({ roleSlug: 'prof' });
  await request(app)
    .post(`/api/auth/totp/users/${other.id}/reset`)
    .set('Authorization', `Bearer ${profToken}`)
    .send({})
    .expect(403);
  assert.equal((await store.getTotpStatus(prof.id)).enabled, true);
});

test('prise de contrôle : réservée à une session administrateur validée par le second facteur', async () => {
  await setSetting(ENFORCEMENT_KEY, 'enroll', {});
  const admin = await createAccount({ roleSlug: 'admin' });
  const target = await createAccount({ roleSlug: 'prof' });
  const plain = await sessionToken(admin.id);
  const refused = await request(app)
    .post('/api/auth/admin/impersonate')
    .set('Authorization', `Bearer ${plain}`)
    .send({ userType: 'teacher', userId: target.id })
    .expect(403);
  assert.equal(refused.body.code, 'MFA_REQUIRED');

  const validated = await sessionToken(admin.id, { mfa: true });
  const started = await request(app)
    .post('/api/auth/admin/impersonate')
    .set('Authorization', `Bearer ${validated}`)
    .send({ userType: 'teacher', userId: target.id })
    .expect(200);
  // La session contrôlée vit même quand la double authentification est obligatoire : c'est
  // l'administrateur, et non le compte contrôlé, qui a validé son second facteur.
  await setSetting(ENFORCEMENT_KEY, 'required', {});
  await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${started.body.authToken}`)
    .expect(200);
  const stopped = await request(app)
    .post('/api/auth/admin/impersonate/stop')
    .set('Authorization', `Bearer ${started.body.authToken}`)
    .send({})
    .expect(200);
  assert.equal(stopped.body.auth.mfa, true);
  await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${stopped.body.authToken}`)
    .expect(200);
});

test('prise de contrôle ouverte sans second facteur validé : révoquée quand le réglage l’exige', async () => {
  await setSetting(ENFORCEMENT_KEY, 'required', {});
  const admin = await createAccount({ roleSlug: 'admin' });
  const target = await createAccount({ roleSlug: 'prof' });
  const row = await queryOne('SELECT token_epoch FROM users WHERE id = ?', [admin.id]);
  const forged = await signAuthToken({
    userType: 'teacher',
    userId: target.id,
    impersonating: true,
    actorUserType: 'teacher',
    actorUserId: admin.id,
    actorTokenEpoch: Number(row.token_epoch || 0),
  });
  const res = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${forged}`)
    .expect(401);
  assert.equal(res.body.code, 'SESSION_REVOKED');
});

test('script serveur : réinitialise le second facteur du dernier administrateur, journalisé « cli »', async () => {
  const admin = await createAccount({ roleSlug: 'admin' });
  await enrollAccount(admin.id);
  const before = await queryOne('SELECT token_epoch FROM users WHERE id = ?', [admin.id]);
  const output = [];
  const log = (line) => output.push(String(line));

  // Sans confirmation explicite : rien ne change.
  const dry = await totpAdmin.main(['reset', '--user', admin.email], { log });
  assert.notEqual(dry, 0);
  assert.equal((await store.getTotpStatus(admin.id)).enabled, true);

  const code = await totpAdmin.main(['reset', '--user', admin.email, '--yes'], { log });
  assert.equal(code, 0, output.join('\n'));
  assert.equal((await store.getTotpStatus(admin.id)).enabled, false);
  const after = await queryOne('SELECT token_epoch FROM users WHERE id = ?', [admin.id]);
  assert.equal(Number(after.token_epoch), Number(before.token_epoch) + 1);
  const event = await queryOne(
    `SELECT actor_user_type, payload_json FROM security_events
      WHERE action = 'auth.totp.reset' AND target_id = ? ORDER BY id DESC LIMIT 1`,
    [admin.id],
  );
  assert.equal(event.actor_user_type, 'cli');
  const payload =
    typeof event.payload_json === 'string' ? JSON.parse(event.payload_json) : event.payload_json;
  assert.equal(payload.via, 'cli');
});

test('script serveur : réglage de secours et rotation de clé', async () => {
  const output = [];
  const log = (line) => output.push(String(line));
  assert.equal(await totpAdmin.main(['enforcement', 'off', '--yes'], { log }), 0);
  assert.equal(await getSettingValue(ENFORCEMENT_KEY), 'off');
  const changed = await queryOne(
    `SELECT actor_user_type FROM security_events
      WHERE action = 'auth.totp.enforcement_change' ORDER BY id DESC LIMIT 1`,
  );
  assert.equal(changed.actor_user_type, 'cli');
  assert.notEqual(await totpAdmin.main(['enforcement', 'n_importe_quoi', '--yes'], { log }), 0);

  // Rotation : nouvelle clé courante, ancienne en « précédente » → rechiffrement.
  const prof = await createAccount({ roleSlug: 'prof' });
  const enrolled = await enrollAccount(prof.id);
  const oldKey = process.env.TOTP_ENCRYPTION_KEY;
  const oldRow = await queryOne('SELECT secret_key_id FROM user_totp WHERE user_id = ?', [prof.id]);
  process.env.TOTP_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
  process.env.TOTP_ENCRYPTION_KEY_PREVIOUS = oldKey;
  try {
    assert.equal(await totpAdmin.main(['rotate-key', '--yes'], { log }), 0, output.join('\n'));
    const newRow = await queryOne('SELECT secret_key_id FROM user_totp WHERE user_id = ?', [
      prof.id,
    ]);
    assert.notEqual(newRow.secret_key_id, oldRow.secret_key_id);
    delete process.env.TOTP_ENCRYPTION_KEY_PREVIOUS;
    const step = Math.max(totp.timeStep(Date.now()) - 1, enrolled.lastStep + 1);
    const ok = await store.verifyTotpForUser(prof.id, totp.hotp(enrolled.secret, step));
    assert.equal(ok.ok, true);
  } finally {
    delete process.env.TOTP_ENCRYPTION_KEY_PREVIOUS;
  }
});
