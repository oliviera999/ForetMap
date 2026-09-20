'use strict';

/**
 * Anti-force-brute par compte (audit comptes 2026-09, S3) : verrou progressif dès le 5ᵉ échec
 * sur un identifiant, indépendant de l'adresse IP ; remise à zéro à la connexion réussie.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { app } = require('../server');
const { initSchema, execute } = require('../database');
const {
  createLoginThrottle,
  loginThrottle,
  FAILURES_BEFORE_LOCK,
  BASE_LOCK_MS,
  MAX_LOCK_MS,
} = require('../lib/loginThrottle');

test('createLoginThrottle : verrou au 5ᵉ échec, doublé ensuite, plafonné, levé au succès', () => {
  let now = 1_000_000;
  const throttle = createLoginThrottle({ now: () => now });
  for (let i = 1; i < FAILURES_BEFORE_LOCK; i += 1) {
    const state = throttle.recordFailure('login', 'Alice');
    assert.strictEqual(state.blocked, false, `échec ${i} ne verrouille pas`);
  }
  const fifth = throttle.recordFailure('login', 'alice ');
  assert.strictEqual(fifth.blocked, true);
  assert.strictEqual(fifth.retryAfterSeconds, BASE_LOCK_MS / 1000);
  assert.strictEqual(throttle.check('login', 'ALICE').blocked, true);

  now += BASE_LOCK_MS + 1;
  assert.strictEqual(throttle.check('login', 'alice').blocked, false);
  const sixth = throttle.recordFailure('login', 'alice');
  assert.strictEqual(sixth.retryAfterSeconds, (BASE_LOCK_MS * 2) / 1000);

  // Plafond : après beaucoup d'échecs, jamais au-delà de MAX_LOCK_MS.
  for (let i = 0; i < 20; i += 1) {
    now += MAX_LOCK_MS + 1;
    throttle.recordFailure('login', 'alice');
  }
  assert.ok(throttle.check('login', 'alice').retryAfterSeconds <= MAX_LOCK_MS / 1000);

  throttle.clear('login', 'alice');
  assert.strictEqual(throttle.check('login', 'alice').blocked, false);
  // Les portées sont indépendantes (login ForetMap / GL / rattachement).
  assert.strictEqual(throttle.check('gl_login', 'alice').blocked, false);
});

const stamp = Date.now();
const pseudo = `throttle_${stamp}`;
const password = 'bon-mot-de-passe';

before(async () => {
  await initSchema();
  const hash = await bcrypt.hash(password, 10);
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, first_name, last_name, display_name, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'student', ?, ?, 'Thr', 'Ottle', 'Thr Ottle', ?, 'local', 1, NOW(), NOW())`,
    [`student-throttle-${stamp}`, `${pseudo}@example.com`, pseudo, hash],
  );
  loginThrottle.reset();
});

/** Clé de throttle d'un compte existant : le compte résolu, pas l'identifiant saisi (CDG-13). */
const accountKey = `user:student-throttle-${stamp}`;

test('POST /api/auth/login : 429 avec Retry-After après cinq mots de passe faux, puis reprise', async () => {
  for (let i = 0; i < FAILURES_BEFORE_LOCK; i += 1) {
    await request(app)
      .post('/api/auth/login')
      .send({ identifier: pseudo, password: 'faux' })
      .expect(401);
  }
  const blocked = await request(app)
    .post('/api/auth/login')
    .send({ identifier: pseudo, password })
    .expect(429);
  assert.ok(Number(blocked.headers['retry-after']) >= 1);
  assert.ok(Number(blocked.body?.retryAfterSeconds) >= 1);
  // Le verrou est PAR COMPTE : un autre identifiant n'est pas concerné.
  await request(app)
    .post('/api/auth/login')
    .send({ identifier: `${pseudo}-autre`, password: 'faux' })
    .expect(401);

  loginThrottle.clear('login', accountKey);
  const ok = await request(app)
    .post('/api/auth/login')
    .send({ identifier: pseudo, password })
    .expect(200);
  assert.ok(ok.body?.authToken);
});

test('POST /api/auth/login : un seul budget d’échecs par compte, quel que soit l’identifiant saisi', async () => {
  loginThrottle.clear('login', accountKey);
  const identifiers = [pseudo, `${pseudo}@example.com`, pseudo.toUpperCase()];
  for (let i = 0; i < FAILURES_BEFORE_LOCK; i += 1) {
    await request(app)
      .post('/api/auth/login')
      .send({ identifier: identifiers[i % identifiers.length], password: 'faux' })
      .expect(401);
  }
  // Verrouillé aussi par l'e-mail : les identifiants partagent le compteur du compte.
  await request(app)
    .post('/api/auth/login')
    .send({ identifier: `${pseudo}@example.com`, password })
    .expect(429);
  loginThrottle.clear('login', accountKey);
});

test('POST /api/auth/login : compte sans mot de passe → même message, et l’échec compte', async () => {
  const id = `student-nopwd-${stamp}`;
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, first_name, last_name, display_name, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'student', NULL, ?, 'No', 'Pwd', 'No Pwd', NULL, 'google', 1, NOW(), NOW())`,
    [id, `nopwd_${stamp}`],
  );
  const res = await request(app)
    .post('/api/auth/login')
    .send({ identifier: `nopwd_${stamp}`, password: 'x' })
    .expect(401);
  assert.strictEqual(res.body.error, 'Identifiant ou mot de passe incorrect');
  const unknown = await request(app)
    .post('/api/auth/login')
    .send({ identifier: `inconnu_${stamp}`, password: 'x' })
    .expect(401);
  assert.strictEqual(unknown.body.error, res.body.error);
  assert.strictEqual(loginThrottle.check('login', `user:${id}`).blocked, false);
  for (let i = 1; i < FAILURES_BEFORE_LOCK; i += 1) {
    await request(app)
      .post('/api/auth/login')
      .send({ identifier: `nopwd_${stamp}`, password: 'x' })
      .expect(401);
  }
  await request(app)
    .post('/api/auth/login')
    .send({ identifier: `nopwd_${stamp}`, password: 'x' })
    .expect(429);
  loginThrottle.clear('login', `user:${id}`);
  await execute('DELETE FROM users WHERE id = ?', [id]);
});

test('POST /api/gl/auth/staff/login est aussi protégé par compte', async () => {
  const identifier = `staff_${stamp}@ecole.local`;
  for (let i = 0; i < FAILURES_BEFORE_LOCK; i += 1) {
    await request(app)
      .post('/api/gl/auth/staff/login')
      .send({ identifier, password: 'faux' })
      .expect(401);
  }
  await request(app)
    .post('/api/gl/auth/staff/login')
    .send({ identifier, password: 'faux' })
    .expect(429);
  loginThrottle.clear('gl_login', identifier);
});
