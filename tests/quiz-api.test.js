'use strict';

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { initSchema, queryOne } = require('../database');
const { app } = require('../server');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { buildFmQuizTemplateWorkbook } = require('../lib/fmQuizImport');

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
  const slug = 'identification_especes';
  const hasIllustrated = await queryOne(
    `SELECT 1 AS ok FROM quiz_questions
      WHERE statut = 'actif' AND categorie_slug = ?
        AND photo_url IS NOT NULL AND TRIM(photo_url) <> ''
      LIMIT 1`,
    [slug],
  );
  if (!hasIllustrated) return;
  const res = await request(app)
    .get(`/api/quiz/draw?categorieSlug=${encodeURIComponent(slug)}&illustrated=1`)
    .expect(200);
  assert.ok(res.body.question_code);
  const row = await queryOne(
    'SELECT photo_url FROM quiz_questions WHERE question_code = ? LIMIT 1',
    [res.body.question_code],
  );
  assert.ok(row?.photo_url && String(row.photo_url).trim() !== '');
});

test('GET /api/quiz/stats — auth prof requise', async () => {
  await request(app).get('/api/quiz/stats').expect(401);
});

test('GET /api/quiz/questions — liste publique filtrée', async () => {
  const res = await request(app)
    .get('/api/quiz/questions?theme=sciences&categorieSlug=vivant_classification')
    .expect(200);
  assert.ok(Array.isArray(res.body.items));
  assert.ok(res.body.items.length > 0);
  assert.strictEqual(res.body.items[0].categorie_slug, 'vivant_classification');
  assert.strictEqual(res.body.items[0].theme, 'sciences');
});

test('GET /api/quiz/admin/stats — auth requise', async () => {
  await request(app).get('/api/quiz/admin/stats').expect(401);
  const token = await ensureAdminTeacherAuthToken();
  const res = await request(app)
    .get('/api/quiz/admin/stats')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.ok(Number(res.body.total) > 0);
});

async function getQuizXlsxBuffer(url, token) {
  const chunks = [];
  const res = await request(app)
    .get(url)
    .set('Authorization', `Bearer ${token}`)
    .buffer(true)
    .parse((res, callback) => {
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    })
    .expect(200);
  assert.ok((res.headers['content-type'] || '').includes('openxmlformats'));
  const buf = Buffer.isBuffer(res.body) ? res.body : Buffer.from(res.body);
  assert.strictEqual(buf.slice(0, 2).toString('latin1'), 'PK');
  return buf;
}

test('GET /api/quiz/admin/import/template — modèle XLSX', async () => {
  const token = await ensureAdminTeacherAuthToken();
  const buf = await getQuizXlsxBuffer('/api/quiz/admin/import/template', token);
  assert.ok(buf.length > 100);
});

test('POST /api/quiz/admin/import dryRun avec modèle', async () => {
  const token = await ensureAdminTeacherAuthToken();
  const buffer = await buildFmQuizTemplateWorkbook();
  const beforeCount = await queryOne('SELECT COUNT(*) AS n FROM quiz_questions');
  const res = await request(app)
    .post('/api/quiz/admin/import')
    .set('Authorization', `Bearer ${token}`)
    .send({ fileDataBase64: buffer.toString('base64'), dryRun: true })
    .expect(200);
  assert.strictEqual(res.body?.report?.dryRun, true);
  assert.ok(res.body?.report?.totals?.valid >= 1);
  const afterCount = await queryOne('SELECT COUNT(*) AS n FROM quiz_questions');
  assert.strictEqual(Number(afterCount.n), Number(beforeCount.n));
});

test('GET /api/quiz/admin/questions — liste admin complète', async () => {
  const token = await ensureAdminTeacherAuthToken();
  const res = await request(app)
    .get('/api/quiz/admin/questions?theme=sciences&statut=actif&sort=code')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.ok(Array.isArray(res.body.items));
  assert.ok(res.body.items.length > 0);
  assert.ok(res.body.total >= res.body.items.length);
  assert.match(String(res.body.items[0].question_code), /^QF/);
});

test('GET /api/quiz/admin/questions/:code puis PUT mise à jour', async () => {
  const token = await ensureAdminTeacherAuthToken();
  const list = await request(app)
    .get('/api/quiz/admin/questions?categorieSlug=vivant_classification&statut=actif')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  const code = list.body.items[0]?.question_code;
  assert.ok(code);

  const detail = await request(app)
    .get(`/api/quiz/admin/questions/${encodeURIComponent(code)}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.strictEqual(detail.body.question.question_code, code);

  const suffix = ` [test ${Date.now()}]`;
  const updatedQuestion = `${detail.body.question.question}${suffix}`;
  const put = await request(app)
    .put(`/api/quiz/admin/questions/${encodeURIComponent(code)}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ ...detail.body.question, question: updatedQuestion })
    .expect(200);
  assert.strictEqual(put.body.question.question, updatedQuestion);

  const restored = await request(app)
    .put(`/api/quiz/admin/questions/${encodeURIComponent(code)}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ ...detail.body.question, question: detail.body.question.question })
    .expect(200);
  assert.strictEqual(restored.body.question.question, detail.body.question.question);
});

test('GET /api/quiz/admin/questions/next-code — auth requise', async () => {
  await request(app).get('/api/quiz/admin/questions/next-code').expect(401);
  const token = await ensureAdminTeacherAuthToken();
  const res = await request(app)
    .get('/api/quiz/admin/questions/next-code')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.match(String(res.body.question_code), /^QF\d{4,}$/);
});

test('GET /api/quiz/admin/questions — admin sans élévation PIN', async () => {
  const token = await ensureAdminTeacherAuthToken({ elevated: false });
  const res = await request(app)
    .get('/api/quiz/admin/questions?statut=actif&sort=code')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.ok(Array.isArray(res.body.items));
  assert.ok(res.body.items.length > 0);
});
