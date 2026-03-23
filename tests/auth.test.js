'use strict';

require('dotenv').config();
const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');

before(async () => {
  await initSchema();
});

describe('Auth', () => {
  const unique = `Test${Date.now()}`;
  const firstName = unique;
  const lastName = 'User';
  const password = 'password123';
  const pseudo = `test_${Date.now()}`;
  const email = `test_${Date.now()}@example.com`;
  const description = 'Profil de test';

  it('POST /api/auth/register crée un compte et renvoie l’élève sans mot de passe', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ firstName, lastName, password, pseudo, email, description })
      .expect(201);
    assert.strictEqual(res.body.first_name, firstName);
    assert.strictEqual(res.body.last_name, lastName);
    assert.strictEqual(res.body.pseudo, pseudo);
    assert.strictEqual(res.body.email, email);
    assert.strictEqual(res.body.description, description);
    assert.strictEqual(res.body.password, undefined);
    assert.ok(res.body.id);
  });

  it('POST /api/auth/register avec même nom renvoie 409', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ firstName, lastName, password: 'other' })
      .expect(409);
    assert.ok(res.body.error);
  });

  it('POST /api/auth/login avec bon mot de passe renvoie l’élève', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ firstName, lastName, password })
      .expect(200);
    assert.strictEqual(res.body.first_name, firstName);
    assert.strictEqual(res.body.password, undefined);
  });

  it('POST /api/auth/login avec mauvais mot de passe renvoie 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ firstName, lastName, password: 'wrong' })
      .expect(401);
    assert.ok(res.body.error);
  });

  it('POST /api/auth/login compte inexistant renvoie 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ firstName: 'Nobody', lastName: 'Here', password: 'x' })
      .expect(401);
    assert.ok(res.body.error);
  });
});
