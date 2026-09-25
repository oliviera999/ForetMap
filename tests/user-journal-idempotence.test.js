'use strict';

// Carnet sans réseau (audit du 25/09/2026, § 1.4.6 et § 2.4 ; migration 299).
//
// Un article écrit sans réseau part au retour du réseau, en un seul `POST /me/articles`
// portant son contenu et sa clé `client_uuid`. Une réponse perdue fait renvoyer la même clé :
// l'article ne doit apparaître qu'une fois, y compris pour deux envois simultanés.
require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryAll } = require('../database');

const stamp = Date.now();
let tokenA = '';
let userA = null;
let tokenB = '';

async function register(suffix) {
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Carnet', lastName: `Idem${suffix}${stamp}`, password: 'pwd12345' })
    .expect(201);
  return { id: reg.body.id, token: reg.body.authToken };
}

before(async () => {
  await initSchema();
  const a = await register('A');
  userA = a.id;
  tokenA = a.token;
  tokenB = (await register('B')).token;
});

const create = (token, body) =>
  request(app)
    .post('/api/user-journal/me/articles')
    .set('Authorization', `Bearer ${token}`)
    .send(body);

const articlesWithKey = (userId, uuid) =>
  queryAll('SELECT id FROM user_journal_articles WHERE user_id = ? AND client_uuid = ?', [
    userId,
    uuid,
  ]);

test('un article renvoyé avec la même clé n’est créé qu’une fois', async () => {
  const uuid = `draft-${stamp}-a1b2c3`;
  const body = { client_uuid: uuid, title: 'Sortie mare', bodyMarkdown: 'Trois tritons vus.' };
  const first = await create(tokenA, body).expect(201);
  assert.strictEqual(first.body.article.title, 'Sortie mare');
  assert.strictEqual(first.body.article.bodyMarkdown, 'Trois tritons vus.');
  assert.strictEqual(first.body.replayed, undefined);

  const again = await create(tokenA, body).expect(200);
  assert.strictEqual(again.body.replayed, true);
  assert.strictEqual(again.body.article.id, first.body.article.id);
  assert.strictEqual((await articlesWithKey(userA, uuid)).length, 1);
});

test('deux envois simultanés de la même clé ne font qu’un article', async () => {
  const uuid = `race-${stamp}-d4e5f6`;
  const body = { client_uuid: uuid, title: 'Compost', bodyMarkdown: 'Retourné ce matin.' };
  const [r1, r2] = await Promise.all([create(tokenA, body), create(tokenA, body)]);
  assert.deepStrictEqual([r1.status, r2.status].sort(), [200, 201]);
  assert.strictEqual(r1.body.article.id, r2.body.article.id);
  assert.strictEqual([r1.body.replayed, r2.body.replayed].filter((v) => v === true).length, 1);
  assert.strictEqual((await articlesWithKey(userA, uuid)).length, 1);
});

test('la clé est propre au compte ; sans clé, le comportement d’avant', async () => {
  const uuid = `shared-${stamp}-0000`;
  await create(tokenA, { client_uuid: uuid, bodyMarkdown: 'A' }).expect(201);
  const other = await create(tokenB, { client_uuid: uuid, bodyMarkdown: 'B' }).expect(201);
  assert.strictEqual(other.body.replayed, undefined);
  assert.strictEqual(other.body.article.bodyMarkdown, 'B');

  const plain1 = await create(tokenA, { bodyMarkdown: '' }).expect(201);
  const plain2 = await create(tokenA, { bodyMarkdown: '' }).expect(201);
  assert.notStrictEqual(plain1.body.article.id, plain2.body.article.id);
});

test('clé mal formée : 400, aucun article', async () => {
  for (const client_uuid of ['x', 'pas une clé !', 42]) {
    await create(tokenA, { client_uuid, bodyMarkdown: 'Test' }).expect(400);
  }
  const rows = await queryAll(
    "SELECT id FROM user_journal_articles WHERE user_id = ? AND body_markdown = 'Test'",
    [userA],
  );
  assert.strictEqual(rows.length, 0);
});
