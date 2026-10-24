'use strict';

/**
 * Réglage `security.totp.enforcement` : passer à `required` est refusé tant que la clé de
 * chiffrement manque ou que l'administrateur qui le demande n'a pas lui-même activé et validé
 * sa double authentification (pas d'auto-verrouillage au déploiement). Avertissement au
 * démarrage en production si la clé manque ou reprend JWT_SECRET.
 */

require('./helpers/setup');
const crypto = require('node:crypto');
process.env.TOTP_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { recomputeUserRole, setAssignedRole } = require('../lib/effectiveRole');
const { getSettingValue, setSetting } = require('../lib/settings');
const totp = require('../lib/auth/totp');
const store = require('../lib/auth/totpStore');
const logger = require('../lib/logger');
const { snapshotSetting, restoreSetting } = require('./helpers/settingsSnapshot');

const KEY = 'security.totp.enforcement';
const created = [];
let snapshot;

async function createAdmin() {
  const id = crypto.randomUUID();
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await execute(
    `INSERT INTO users (id, user_type, email, first_name, last_name, display_name, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'teacher', ?, 'Reg', ?, ?, 'local', 1, NOW(), NOW())`,
    [id, `mfaset_${stamp}@example.com`, stamp, `Reg ${stamp}`],
  );
  const role = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  await setAssignedRole(id, role.id);
  await recomputeUserRole(id);
  created.push(id);
  return id;
}

async function tokenFor(userId, extra = {}) {
  const row = await queryOne(
    `SELECT u.token_epoch, r.id AS role_id FROM users u
       JOIN user_roles ur ON ur.user_id = u.id AND ur.is_primary = 1
       JOIN roles r ON r.id = ur.role_id WHERE u.id = ? LIMIT 1`,
    [userId],
  );
  return signAuthToken({
    userType: 'teacher',
    userId,
    roleId: row.role_id,
    roleSlug: 'admin',
    tokenEpoch: Number(row.token_epoch || 0),
    ...extra,
  });
}

async function enroll(userId) {
  const current = totp.timeStep(Date.now());
  const started = await store.startEnrollment(userId);
  const at = (current - 1) * 30000 + 1000;
  const res = await store.confirmEnrollment(userId, totp.totpAt(started.secret, at), {
    nowMs: at,
  });
  assert.equal(res.ok, true);
}

function put(token, value) {
  return request(app)
    .put(`/api/settings/admin/${KEY}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ value });
}

test.before(async () => {
  await initSchema();
  snapshot = await snapshotSetting(KEY);
  await setSetting(KEY, 'enroll', {});
});

test.after(async () => {
  await restoreSetting(snapshot);
  if (created.length) {
    await execute(`DELETE FROM users WHERE id IN (${created.map(() => '?').join(', ')})`, created);
  }
});

test('« required » : refusé à un administrateur non enrôlé, accepté une fois enrôlé et validé', async () => {
  const adminId = await createAdmin();
  const res = await put(await tokenFor(adminId), 'required').expect(403);
  assert.equal(res.body.code, 'MFA_SESSION_REQUIRED');
  assert.equal(await getSettingValue(KEY), 'enroll');

  await enroll(adminId);
  const validated = await tokenFor(adminId, { mfa: true });
  await put(validated, 'required').expect(200);
  assert.equal(await getSettingValue(KEY), 'required');
  // Revenir en arrière n'exige rien de plus.
  await put(validated, 'enroll').expect(200);
  assert.equal(await getSettingValue(KEY), 'enroll');
});

test('« required » refusé tant que la clé de chiffrement manque', async () => {
  const adminId = await createAdmin();
  await enroll(adminId);
  const token = await tokenFor(adminId, { mfa: true });
  const saved = process.env.TOTP_ENCRYPTION_KEY;
  delete process.env.TOTP_ENCRYPTION_KEY;
  try {
    const res = await put(token, 'required').expect(400);
    assert.equal(res.body.code, 'TOTP_KEY_MISSING');
  } finally {
    process.env.TOTP_ENCRYPTION_KEY = saved;
  }
  assert.equal(await getSettingValue(KEY), 'enroll');
});

test('démarrage en production : avertissement si la clé manque ou reprend JWT_SECRET', () => {
  const { validateEnv } = require('../lib/env');
  const saved = { ...process.env };
  const warnings = [];
  const originalWarn = logger.warn;
  logger.warn = (...args) => {
    warnings.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  };
  try {
    const jwt = crypto.randomBytes(32).toString('hex');
    Object.assign(process.env, {
      NODE_ENV: 'production',
      JWT_SECRET: jwt,
      VISIT_COOKIE_SECRET: crypto.randomBytes(32).toString('hex'),
    });
    delete process.env.TOTP_ENCRYPTION_KEY;
    validateEnv();
    assert.ok(
      warnings.some((w) => w.includes('TOTP_ENCRYPTION_KEY')),
      `aucun avertissement : ${warnings.join(' | ')}`,
    );
    warnings.length = 0;
    process.env.TOTP_ENCRYPTION_KEY = jwt;
    validateEnv();
    assert.ok(warnings.some((w) => w.includes('TOTP_ENCRYPTION_KEY') && w.includes('JWT_SECRET')));
  } finally {
    logger.warn = originalWarn;
    for (const key of Object.keys(process.env)) {
      if (!(key in saved)) delete process.env[key];
    }
    Object.assign(process.env, saved);
  }
});
