'use strict';

require('./helpers/setup');
require('dotenv').config();
const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const {
  parseDiscoveryTourSeen,
  normalizeDiscoveryTourSeenInput,
  mergeDiscoveryTourSeen,
} = require('../lib/discoveryTourSeen');

before(async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await initSchema();
      break;
    } catch (err) {
      if (err?.code !== 'ER_LOCK_DEADLOCK' || attempt === 4) throw err;
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
});

describe('lib/discoveryTourSeen', () => {
  it('parse les cartes vides et invalides', () => {
    assert.deepStrictEqual(parseDiscoveryTourSeen(null), {});
    assert.deepStrictEqual(parseDiscoveryTourSeen(''), {});
    assert.deepStrictEqual(parseDiscoveryTourSeen('not-json'), {});
    assert.deepStrictEqual(parseDiscoveryTourSeen([]), {});
  });

  it('ne garde que les clés valides marquées vraies', () => {
    assert.deepStrictEqual(
      parseDiscoveryTourSeen({ welcome: true, map: 1, bad: false, 'x y': true }),
      { welcome: true, map: true },
    );
  });

  it('merge en union', () => {
    assert.deepStrictEqual(
      mergeDiscoveryTourSeen({ welcome: true }, { map: true, welcome: true }),
      {
        welcome: true,
        map: true,
      },
    );
  });

  it('rejette un corps PUT invalide', () => {
    assert.strictEqual(normalizeDiscoveryTourSeenInput(null).ok, false);
    assert.strictEqual(normalizeDiscoveryTourSeenInput({ 'not valid': true }).ok, false);
  });
});

describe('API discovery-tour-seen (par compte)', () => {
  const password = 'test-pass-12';
  let studentToken;
  let studentId;

  before(async () => {
    studentId = crypto.randomUUID();
    const hash = await bcrypt.hash(password, 10);
    const pseudo = `tourseen_${studentId.slice(0, 8)}`;
    await execute(
      `INSERT INTO users
        (id, user_type, email, pseudo, first_name, last_name, display_name, password_hash, auth_provider, is_active, created_at, updated_at)
       VALUES (?, 'student', ?, ?, 'Tour', 'Seen', 'Tour Seen', ?, 'local', 1, NOW(), NOW())`,
      [studentId, `${pseudo}@example.test`, pseudo, hash],
    );
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identifier: pseudo, password })
      .expect(200);
    studentToken = login.body.authToken;
    assert.ok(studentToken);
    assert.deepStrictEqual(login.body.discoveryTourSeen || {}, {});
  });

  it('GET /api/auth/me expose discoveryTourSeen', async () => {
    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    assert.deepStrictEqual(me.body.discoveryTourSeen, {});
  });

  it('PUT merge les parcours vus et les conserve au rechargement', async () => {
    const put1 = await request(app)
      .put('/api/auth/discovery-tour-seen')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ seen: { welcome: true } })
      .expect(200);
    assert.strictEqual(put1.body.ok, true);
    assert.strictEqual(put1.body.discoveryTourSeen.welcome, true);

    const put2 = await request(app)
      .put('/api/auth/discovery-tour-seen')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ seen: { map: true } })
      .expect(200);
    assert.strictEqual(put2.body.discoveryTourSeen.welcome, true);
    assert.strictEqual(put2.body.discoveryTourSeen.map, true);

    const row = await queryOne('SELECT discovery_tour_seen_json FROM users WHERE id = ?', [
      studentId,
    ]);
    assert.deepStrictEqual(parseDiscoveryTourSeen(row.discovery_tour_seen_json), {
      welcome: true,
      map: true,
    });

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    assert.deepStrictEqual(me.body.discoveryTourSeen, { welcome: true, map: true });
  });

  it('refuse une clé invalide', async () => {
    await request(app)
      .put('/api/auth/discovery-tour-seen')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ seen: { 'bad key': true } })
      .expect(400);
  });

  it('exige une authentification', async () => {
    await request(app)
      .put('/api/auth/discovery-tour-seen')
      .send({ seen: { welcome: true } })
      .expect(401);
  });
});
