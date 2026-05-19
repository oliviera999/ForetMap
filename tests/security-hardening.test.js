'use strict';

require('./helpers/setup');
require('dotenv').config();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute } = require('../database');
const { respondInternalError } = require('../lib/routeLog');
const { parseSocketToken } = require('../lib/realtime');
const { JWT_SECRET } = require('../middleware/requireTeacher');

describe('Durcissement sécurité / robustesse', () => {
  before(async () => {
    await initSchema();
  });

  it('POST /api/auth/login renvoie le même message pour compte absent et mot de passe faux', async () => {
    const missing = await request(app)
      .post('/api/auth/login')
      .send({ identifier: `missing_${Date.now()}@example.com`, password: 'wrong' })
      .expect(401);
    const pseudo = `sec_${Date.now()}`;
    await request(app)
      .post('/api/auth/register')
      .send({
        firstName: 'Sec',
        lastName: `User${Date.now()}`,
        password: 'good-password-1',
        pseudo,
        email: `${pseudo}@example.com`,
        description: 'test',
      })
      .expect(201);
    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ identifier: pseudo, password: 'wrong-password-xyz' })
      .expect(401);
    assert.strictEqual(missing.body.error, wrong.body.error);
    assert.strictEqual(missing.body.error, 'Identifiant ou mot de passe incorrect');
  });

  it('respondInternalError masque le détail serveur au client', () => {
    const req = { path: '/test', method: 'GET', requestId: 't1' };
    const res = {
      statusCode: null,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };
    respondInternalError(res, req, new Error('détail interne mysql'));
    assert.strictEqual(res.statusCode, 500);
    assert.strictEqual(res.body.error, 'Erreur serveur');
    assert.strictEqual(res.body.debugDetail, undefined);
  });

  it('parseSocketToken ignore query.token hors mode test/e2e', () => {
    const prevNode = process.env.NODE_ENV;
    const prevE2e = process.env.E2E_DISABLE_RATE_LIMIT;
    process.env.NODE_ENV = 'production';
    delete process.env.E2E_DISABLE_RATE_LIMIT;
    delete process.env.FORETMAP_SOCKET_QUERY_TOKEN;
    try {
      const socket = { handshake: { auth: {}, headers: {}, query: { token: 'secret-from-query' } } };
      assert.strictEqual(parseSocketToken(socket), null);
    } finally {
      process.env.NODE_ENV = prevNode;
      if (prevE2e != null) process.env.E2E_DISABLE_RATE_LIMIT = prevE2e;
    }
  });

  it('POST /api/students/register refuse un simple studentId sans jeton propriétaire', async () => {
    const owner = await request(app)
      .post('/api/auth/register')
      .send({
        firstName: 'Secure',
        lastName: `Heartbeat${Date.now()}`,
        password: 'good-password-1',
        pseudo: `secure_hb_${Date.now()}`,
      })
      .expect(201);
    const other = await request(app)
      .post('/api/auth/register')
      .send({
        firstName: 'Other',
        lastName: `Heartbeat${Date.now()}`,
        password: 'good-password-1',
        pseudo: `other_hb_${Date.now()}`,
      })
      .expect(201);

    await request(app)
      .post('/api/students/register')
      .send({ studentId: owner.body.id })
      .expect(401);
    await request(app)
      .post('/api/students/register')
      .set('Authorization', `Bearer ${other.body.authToken}`)
      .send({ studentId: owner.body.id })
      .expect(403);
    const ok = await request(app)
      .post('/api/students/register')
      .set('Authorization', `Bearer ${owner.body.authToken}`)
      .send({ studentId: owner.body.id })
      .expect(200);
    assert.strictEqual(ok.body.id, owner.body.id);
    assert.strictEqual(ok.body.password_hash, undefined);
  });

  it('GET /api/observations/student/:id ignore les permissions obsolètes portées par le JWT', async () => {
    const victim = await request(app)
      .post('/api/auth/register')
      .send({
        firstName: 'Obs',
        lastName: `Victim${Date.now()}`,
        password: 'good-password-1',
        pseudo: `obs_victim_${Date.now()}`,
      })
      .expect(201);
    await execute(
      'INSERT INTO observation_logs (student_id, zone_id, content, image_path, created_at) VALUES (?, ?, ?, ?, ?)',
      [victim.body.id, null, 'Observation privée', null, new Date().toISOString()]
    );

    const roleSlug = `obs_no_read_${Date.now()}`;
    const role = await execute(
      'INSERT INTO roles (slug, display_name, `rank`, display_order, is_system) VALUES (?, ?, 450, 9999, 0)',
      [roleSlug, 'Profil test sans observations']
    );
    await execute(
      'INSERT IGNORE INTO permissions (`key`, label, description) VALUES (?, ?, ?)',
      ['teacher.access', 'Accès interface n3boss', 'Permission test']
    );
    await execute(
      'INSERT INTO role_permissions (role_id, permission_key, requires_elevation) VALUES (?, ?, 0)',
      [role.insertId, 'teacher.access']
    );

    const teacherId = uuidv4();
    const teacherEmail = `obs-no-read-${Date.now()}@example.com`;
    const hash = await bcrypt.hash('teacherPwd123', 10);
    await execute(
      `INSERT INTO users
        (id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name, description, avatar_path, affiliation, password_hash, auth_provider, is_active, last_seen, created_at, updated_at)
       VALUES (?, 'teacher', NULL, ?, ?, NULL, NULL, ?, NULL, NULL, 'both', ?, 'local', 1, ?, NOW(), NOW())`,
      [teacherId, teacherEmail, teacherEmail.split('@')[0], 'Prof sans observations', hash, new Date().toISOString()]
    );
    await execute(
      'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1)',
      ['teacher', teacherId, role.insertId]
    );

    const staleToken = jwt.sign(
      {
        userType: 'teacher',
        userId: teacherId,
        permissions: ['observations.read.all'],
        elevated: true,
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    await request(app)
      .get(`/api/observations/student/${victim.body.id}`)
      .set('Authorization', `Bearer ${staleToken}`)
      .expect(403);
  });
});
