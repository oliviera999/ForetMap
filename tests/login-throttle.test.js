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
    `INSERT INTO users (id, user_type, email, pseudo, first_name, last_name, display_name, affiliation, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'student', NULL, ?, 'Thr', 'Ottle', 'Thr Ottle', 'both', ?, 'local', 1, NOW(), NOW())`,
    [`student-throttle-${stamp}`, pseudo, hash],
  );
  loginThrottle.reset();
});

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

  loginThrottle.clear('login', pseudo);
  const ok = await request(app)
    .post('/api/auth/login')
    .send({ identifier: pseudo, password })
    .expect(200);
  assert.ok(ok.body?.authToken);
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
