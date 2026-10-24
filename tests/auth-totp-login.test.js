'use strict';

/**
 * Parcours de connexion avec double authentification (TOTP) pour les profils administrateur
 * et n3boss : jeton intermédiaire « mfa pending », vérification du code ou d'un code de
 * secours, enrôlement imposé quand le réglage l'exige, invitation en phase de transition,
 * élèves jamais concernés, révocation des sessions sans second facteur.
 */

require('./helpers/setup');
const crypto = require('node:crypto');
process.env.TOTP_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { recomputeUserRole, setAssignedRole } = require('../lib/effectiveRole');
const { bumpUserTokenEpoch } = require('../lib/auth/tokenEpoch');
const { setSetting } = require('../lib/settings');
const { listAuthRateLimitPaths } = require('../lib/products');
const totp = require('../lib/auth/totp');
const store = require('../lib/auth/totpStore');
const { snapshotSetting, restoreSetting } = require('./helpers/settingsSnapshot');

const ENFORCEMENT_KEY = 'security.totp.enforcement';
const PASSWORD = 'MotDePasseSolide2026';
const created = [];
let enforcementSnapshot;

async function setEnforcement(value) {
  await setSetting(ENFORCEMENT_KEY, value, {});
}

async function createAccount({ userType = 'teacher', roleSlug }) {
  const id = crypto.randomUUID();
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const email = `mfa_${stamp}@example.com`;
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, first_name, last_name, display_name, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'Mfa', ?, ?, ?, 'local', 1, NOW(), NOW())`,
    [id, userType, email, `mfa_${stamp}`, stamp, `Mfa ${stamp}`, await bcrypt.hash(PASSWORD, 4)],
  );
  if (roleSlug) {
    const role = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [roleSlug]);
    assert.ok(role, `profil ${roleSlug} introuvable`);
    await setAssignedRole(id, role.id);
  }
  await recomputeUserRole(id);
  created.push(id);
  return { id, email };
}

/** Enrôle directement (stockage) ; `lastStep` suit le dernier pas consommé. */
async function enrollAccount(userId) {
  const current = totp.timeStep(Date.now());
  const started = await store.startEnrollment(userId);
  const confirmNow = (current - 1) * 30000 + 1000;
  const confirmed = await store.confirmEnrollment(userId, totp.totpAt(started.secret, confirmNow), {
    nowMs: confirmNow,
  });
  assert.equal(confirmed.ok, true);
  return { secret: started.secret, backupCodes: confirmed.backupCodes, lastStep: current - 1 };
}

/** Code d'un pas jamais consommé, encore dans la fenêtre de ±1 pas. */
function freshCode(enrolled) {
  const current = totp.timeStep(Date.now());
  const step = Math.max(current - 1, enrolled.lastStep + 1);
  assert.ok(step <= current + 1, 'plus de pas disponible dans la fenêtre');
  enrolled.lastStep = step;
  return totp.hotp(enrolled.secret, step);
}

function wrongCode(enrolled) {
  const current = totp.timeStep(Date.now());
  const valid = new Set([-1, 0, 1].map((d) => totp.hotp(enrolled.secret, current + d)));
  let candidate = 0;
  while (valid.has(String(candidate).padStart(6, '0'))) candidate += 1;
  return String(candidate).padStart(6, '0');
}

function login(email) {
  return request(app).post('/api/auth/login').send({ identifier: email, password: PASSWORD });
}

async function plainTokenFor(userId, extra = {}) {
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
  enforcementSnapshot = await snapshotSetting(ENFORCEMENT_KEY);
});

test.after(async () => {
  await restoreSetting(enforcementSnapshot);
  if (created.length) {
    await execute(`DELETE FROM users WHERE id IN (${created.map(() => '?').join(', ')})`, created);
  }
});

test('réglage : trois valeurs, « enroll » par défaut (transition sans blocage)', () => {
  const { SETTINGS_REGISTRY } = require('../lib/settings');
  const meta = SETTINGS_REGISTRY[ENFORCEMENT_KEY];
  assert.ok(meta, 'réglage absent du registre');
  assert.deepEqual(meta.values, ['off', 'enroll', 'required']);
  assert.equal(meta.default, 'enroll');
  assert.equal(meta.scope, 'admin');
});

test('« required » : un prof sans second facteur n’obtient pas de session complète', async () => {
  await setEnforcement('required');
  const prof = await createAccount({ roleSlug: 'prof' });
  const res = await login(prof.email).expect(200);
  assert.equal(res.body.mfaRequired, true);
  assert.equal(res.body.stage, 'enroll');
  assert.ok(res.body.mfaToken);
  assert.equal(res.body.authToken, undefined);
  assert.equal(res.body.auth, undefined);
  // Le jeton intermédiaire n'ouvre aucune session.
  await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${res.body.mfaToken}`)
    .expect(401);
  await request(app)
    .get('/api/sync-state')
    .set('Authorization', `Bearer ${res.body.mfaToken}`)
    .expect(401);
});

test('« required » : une session ouverte sans second facteur est révoquée à la requête suivante', async () => {
  await setEnforcement('required');
  const prof = await createAccount({ roleSlug: 'prof' });
  const token = await plainTokenFor(prof.id);
  const res = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${token}`)
    .expect(401);
  assert.equal(res.body.code, 'SESSION_REVOKED');
  assert.equal(res.body.reason, 'mfa_required');
});

test('un élève n’est jamais concerné, même en « required »', async () => {
  await setEnforcement('required');
  const student = await createAccount({ userType: 'student' });
  const res = await login(student.email).expect(200);
  assert.ok(res.body.authToken);
  assert.equal(res.body.mfaRequired, undefined);
  await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${res.body.authToken}`)
    .expect(200);
  const enroll = await request(app)
    .post('/api/auth/totp/enroll/start')
    .set('Authorization', `Bearer ${res.body.authToken}`)
    .send({})
    .expect(403);
  assert.ok(enroll.body.error);
  // Un « prof de classe » (rang 350) ne l'est pas davantage.
  const classTeacher = await createAccount({ roleSlug: 'prof_classe' });
  const res2 = await login(classTeacher.email).expect(200);
  assert.ok(res2.body.authToken);
});

test('compte enrôlé : code TOTP → session complète marquée « validée » ; rejeu refusé', async () => {
  await setEnforcement('required');
  const admin = await createAccount({ roleSlug: 'admin' });
  const enrolled = await enrollAccount(admin.id);
  const step1 = await login(admin.email).expect(200);
  assert.equal(step1.body.stage, 'verify');
  await request(app)
    .post('/api/auth/totp/verify')
    .send({ mfaToken: step1.body.mfaToken, code: wrongCode(enrolled) })
    .expect(401);
  const code = freshCode(enrolled);
  const done = await request(app)
    .post('/api/auth/totp/verify')
    .send({ mfaToken: step1.body.mfaToken, code })
    .expect(200);
  assert.ok(done.body.authToken);
  assert.equal(done.body.auth.mfa, true);
  assert.equal(done.body.id, admin.id);
  const me = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${done.body.authToken}`)
    .expect(200);
  assert.equal(me.body.auth.mfa, true);

  // Même code, nouvelle tentative de connexion : rejeu.
  const step2 = await login(admin.email).expect(200);
  const replay = await request(app)
    .post('/api/auth/totp/verify')
    .send({ mfaToken: step2.body.mfaToken, code })
    .expect(401);
  assert.equal(replay.body.code, 'MFA_CODE_INVALID');
  // Le jeton intermédiaire déjà utilisé ne sert pas une seconde fois.
  await request(app)
    .post('/api/auth/totp/verify')
    .send({ mfaToken: step1.body.mfaToken, code: freshCode(enrolled) })
    .expect(401);
});

test('code de secours : accepté une fois à la connexion, refusé ensuite', async () => {
  await setEnforcement('enroll');
  const prof = await createAccount({ roleSlug: 'prof' });
  const enrolled = await enrollAccount(prof.id);
  const s1 = await login(prof.email).expect(200);
  assert.equal(s1.body.stage, 'verify');
  const ok = await request(app)
    .post('/api/auth/totp/verify')
    .send({ mfaToken: s1.body.mfaToken, backupCode: enrolled.backupCodes[0] })
    .expect(200);
  assert.ok(ok.body.authToken);
  assert.equal(ok.body.backupCodesRemaining, 9);
  assert.equal(ok.body.mfaMethod, 'backup_code');
  const s2 = await login(prof.email).expect(200);
  await request(app)
    .post('/api/auth/totp/verify')
    .send({ mfaToken: s2.body.mfaToken, backupCode: enrolled.backupCodes[0] })
    .expect(401);
});

test('enrôlement imposé : QR code, confirmation par un premier code, codes de secours et session', async () => {
  await setEnforcement('required');
  const prof = await createAccount({ roleSlug: 'prof' });
  const step1 = await login(prof.email).expect(200);
  assert.equal(step1.body.stage, 'enroll');
  const started = await request(app)
    .post('/api/auth/totp/enroll/start')
    .send({ mfaToken: step1.body.mfaToken })
    .expect(200);
  assert.match(String(started.headers['cache-control']), /no-store/);
  assert.match(started.body.qrDataUrl, /^data:image\/png;base64,/);
  assert.match(started.body.otpauthUri, /^otpauth:\/\/totp\//);
  const secret = totp.base32Decode(started.body.secret);
  assert.equal(secret.length, 20);
  await request(app)
    .post('/api/auth/totp/enroll/confirm')
    .send({ mfaToken: step1.body.mfaToken, code: wrongCode({ secret }) })
    .expect(401);
  const confirmed = await request(app)
    .post('/api/auth/totp/enroll/confirm')
    .send({ mfaToken: step1.body.mfaToken, code: totp.totpAt(secret, Date.now()) })
    .expect(200);
  assert.equal(confirmed.body.backupCodes.length, 10);
  assert.ok(confirmed.body.authToken);
  assert.equal(confirmed.body.auth.mfa, true);
  await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${confirmed.body.authToken}`)
    .expect(200);
  assert.equal((await store.getTotpStatus(prof.id)).enabled, true);
  // L'étape d'enrôlement est consommée : elle ne relance pas un second secret.
  await request(app)
    .post('/api/auth/totp/enroll/start')
    .send({ mfaToken: step1.body.mfaToken })
    .expect(401);
  // Connexion suivante : vérification, plus d'enrôlement.
  const step2 = await login(prof.email).expect(200);
  assert.equal(step2.body.stage, 'verify');
});

test('« enroll » : un prof non enrôlé reçoit sa session et l’invitation à activer', async () => {
  await setEnforcement('enroll');
  const prof = await createAccount({ roleSlug: 'prof' });
  const res = await login(prof.email).expect(200);
  assert.ok(res.body.authToken);
  assert.equal(res.body.mfaSetupSuggested, true);
  await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${res.body.authToken}`)
    .expect(200);
});

test('« off » : aucune étape, même pour un compte enrôlé', async () => {
  await setEnforcement('off');
  const prof = await createAccount({ roleSlug: 'prof' });
  await enrollAccount(prof.id);
  const res = await login(prof.email).expect(200);
  assert.ok(res.body.authToken);
  assert.equal(res.body.mfaRequired, undefined);
  assert.equal(res.body.mfaSetupSuggested, undefined);
});

test('activation depuis une session : les autres sessions tombent, la réponse porte un jeton neuf', async () => {
  await setEnforcement('enroll');
  const prof = await createAccount({ roleSlug: 'prof' });
  const tokenA = (await login(prof.email).expect(200)).body.authToken;
  const tokenB = (await login(prof.email).expect(200)).body.authToken;
  const started = await request(app)
    .post('/api/auth/totp/enroll/start')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({})
    .expect(200);
  const secret = totp.base32Decode(started.body.secret);
  const confirmed = await request(app)
    .post('/api/auth/totp/enroll/confirm')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ code: totp.totpAt(secret, Date.now()) })
    .expect(200);
  assert.equal(confirmed.body.backupCodes.length, 10);
  assert.equal(confirmed.body.auth.mfa, true);
  await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tokenB}`).expect(401);
  await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${confirmed.body.authToken}`)
    .expect(200);
  // Changer d'appareil exige un code actuel.
  await request(app)
    .post('/api/auth/totp/enroll/start')
    .set('Authorization', `Bearer ${confirmed.body.authToken}`)
    .send({})
    .expect(401);
  const status = await request(app)
    .get('/api/auth/totp/status')
    .set('Authorization', `Bearer ${confirmed.body.authToken}`)
    .expect(200);
  assert.equal(status.body.enrolled, true);
  assert.equal(status.body.subject, true);
  assert.equal(status.body.backupCodesRemaining, 10);
  assert.equal(status.body.sessionValidated, true);
});

test('régénération des codes de secours : code actuel exigé, ancien lot invalidé', async () => {
  await setEnforcement('enroll');
  const prof = await createAccount({ roleSlug: 'prof' });
  const enrolled = await enrollAccount(prof.id);
  const s1 = await login(prof.email).expect(200);
  const session = await request(app)
    .post('/api/auth/totp/verify')
    .send({ mfaToken: s1.body.mfaToken, code: freshCode(enrolled) })
    .expect(200);
  const auth = `Bearer ${session.body.authToken}`;
  await request(app)
    .post('/api/auth/totp/backup-codes')
    .set('Authorization', auth)
    .send({ code: wrongCode(enrolled) })
    .expect(401);
  const regen = await request(app)
    .post('/api/auth/totp/backup-codes')
    .set('Authorization', auth)
    .send({ code: freshCode(enrolled) })
    .expect(200);
  assert.equal(regen.body.backupCodes.length, 10);
  assert.equal((await store.consumeBackupCode(prof.id, enrolled.backupCodes[1])).ok, false);
});

test('changement de mot de passe dans une session validée : la session reste validée', async () => {
  await setEnforcement('required');
  const prof = await createAccount({ roleSlug: 'prof' });
  const enrolled = await enrollAccount(prof.id);
  const s1 = await login(prof.email).expect(200);
  const session = await request(app)
    .post('/api/auth/totp/verify')
    .send({ mfaToken: s1.body.mfaToken, code: freshCode(enrolled) })
    .expect(200);
  const changed = await request(app)
    .post('/api/auth/me/password')
    .set('Authorization', `Bearer ${session.body.authToken}`)
    .send({ currentPassword: PASSWORD, newPassword: `${PASSWORD}!` })
    .expect(200);
  const me = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${changed.body.authToken}`)
    .expect(200);
  assert.equal(me.body.auth.mfa, true);
});

test('jeton intermédiaire périmé par un changement de mot de passe (époque de jeton)', async () => {
  await setEnforcement('required');
  const prof = await createAccount({ roleSlug: 'prof' });
  const enrolled = await enrollAccount(prof.id);
  const s1 = await login(prof.email).expect(200);
  await bumpUserTokenEpoch(prof.id);
  const res = await request(app)
    .post('/api/auth/totp/verify')
    .send({ mfaToken: s1.body.mfaToken, code: freshCode(enrolled) })
    .expect(401);
  assert.equal(res.body.code, 'MFA_TOKEN_INVALID');
});

test('limiteur : au-delà de 5 codes faux, 429 avec Retry-After', async () => {
  await setEnforcement('required');
  const prof = await createAccount({ roleSlug: 'prof' });
  const enrolled = await enrollAccount(prof.id);
  const s1 = await login(prof.email).expect(200);
  for (let i = 0; i < 5; i += 1) {
    await request(app)
      .post('/api/auth/totp/verify')
      .send({ mfaToken: s1.body.mfaToken, code: wrongCode(enrolled) })
      .expect(401);
  }
  const locked = await request(app)
    .post('/api/auth/totp/verify')
    .send({ mfaToken: s1.body.mfaToken, code: freshCode(enrolled) })
    .expect(429);
  assert.ok(Number(locked.headers['retry-after']) > 0);
});

test('les routes de vérification du second facteur sont sous le limiteur strict d’IP', () => {
  const limited = new Set(listAuthRateLimitPaths());
  for (const path of [
    '/api/auth/totp/verify',
    '/api/auth/totp/enroll',
    '/api/auth/totp/backup-codes',
  ]) {
    assert.ok(limited.has(path), `${path} hors limiteur`);
  }
});

test('journal de sécurité : défi, échec et réussite tracés, jamais le code', async () => {
  await setEnforcement('required');
  const prof = await createAccount({ roleSlug: 'prof' });
  const enrolled = await enrollAccount(prof.id);
  const s1 = await login(prof.email).expect(200);
  const bad = wrongCode(enrolled);
  await request(app)
    .post('/api/auth/totp/verify')
    .send({ mfaToken: s1.body.mfaToken, code: bad })
    .expect(401);
  const good = freshCode(enrolled);
  await request(app)
    .post('/api/auth/totp/verify')
    .send({ mfaToken: s1.body.mfaToken, code: good })
    .expect(200);
  const rows = await require('../database').queryAll(
    `SELECT action, result, reason, payload_json FROM security_events
      WHERE target_id = ? AND action LIKE 'auth.totp.%' ORDER BY id`,
    [prof.id],
  );
  const actions = rows.map((r) => `${r.action}:${r.result}`);
  assert.ok(actions.includes('auth.totp.challenge:success'), actions.join(', '));
  assert.ok(actions.includes('auth.totp.verify:failure'));
  assert.ok(actions.includes('auth.totp.verify:success'));
  const dump = JSON.stringify(rows);
  assert.ok(!dump.includes(bad) && !dump.includes(good), 'code présent dans le journal');
});
