'use strict';

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { initSchema, queryOne } = require('../database');
const { app } = require('../server');

test.before(async () => {
  await initSchema();
});

test('GET /api/quiz/categories — public', async () => {
  const res = await request(app).get('/api/quiz/categories?theme=sciences').expect(200);
  assert.ok(Array.isArray(res.body.categories));
  assert.ok(res.body.categories.length > 0);
  assert.strictEqual(res.body.categories[0].theme, 'sciences');
});

test('GET /api/quiz/draw — tirage aléatoire', async () => {
  const res = await request(app)
    .get('/api/quiz/draw?categorieSlug=vivant_classification&niveau=college&difficulte=1')
    .expect(200);
  assert.ok(res.body.question_code);
  assert.match(String(res.body.question_code), /^QF/);
});

test('GET /api/quiz/questions/:code/present puis POST answer', async () => {
  const draw = await request(app)
    .get('/api/quiz/draw?categorieSlug=vivant_classification&niveau=college')
    .expect(200);
  const code = draw.body.question_code;

  const present = await request(app).get(`/api/quiz/questions/${code}/present`).expect(200);
  assert.ok(present.body.presentationToken);
  assert.ok(Array.isArray(present.body.choices));
  assert.ok(present.body.choices.length >= 2);

  const question = await queryOne(
    'SELECT reponse_correcte FROM quiz_questions WHERE question_code = ? LIMIT 1',
    [code],
  );
  assert.ok(question?.reponse_correcte);

  const wrongChoiceId = present.body.choices[0]?.id ?? 0;
  const answer = await request(app)
    .post(`/api/quiz/questions/${code}/answer`)
    .send({ presentationToken: present.body.presentationToken, choiceId: wrongChoiceId })
    .expect(200);
  assert.strictEqual(typeof answer.body.correct, 'boolean');
  assert.ok(answer.body.feedback);
});

test('GET /api/quiz/draw — illustrated=1 filtre photo', async () => {
  const res = await request(app)
    .get('/api/quiz/draw?categorieSlug=vivant_classification&illustrated=1')
    .expect(200);
  if (res.body.question_code) {
    assert.ok(
      res.body.photo_url != null && String(res.body.photo_url).trim() !== '',
      'illustrated=1 doit renvoyer une question avec photo_url',
    );
  }
});

test('GET /api/quiz/stats — auth prof requise', async () => {
  await request(app).get('/api/quiz/stats').expect(401);
});
