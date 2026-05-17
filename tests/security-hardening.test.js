'use strict';

require('./helpers/setup');
require('dotenv').config();
const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema } = require('../database');
const { respondInternalError } = require('../lib/routeLog');
const { parseSocketToken } = require('../lib/realtime');

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
});
