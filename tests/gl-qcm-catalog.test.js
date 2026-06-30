'use strict';

require('./helpers/setup');
const fs = require('node:fs');
const path = require('node:path');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');

const XLSX_PATH = path.join(
  __dirname,
  '..',
  'data',
  'gl',
  'qcm-biomes-gnomes-et-licornes-consolide.xlsx',
);
const GLOSSARY_XLSX = path.join(__dirname, '..', 'data', 'gl', 'glossaire-gnomes-et-licornes.xlsx');

let adminToken = '';
let playerToken = '';
const stamp = Date.now();

before(async () => {
  await initSchema();
  await execute(
    `INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at)
     VALUES (?, 'MJ QCM', 'admin', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE is_active = 1, updated_at = NOW()`,
    [`qcm.admin.${stamp}@ecole.local`],
  );
  const admin = await queryOne('SELECT id FROM gl_admins WHERE email = ? LIMIT 1', [
    `qcm.admin.${stamp}@ecole.local`,
  ]);
  adminToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: String(admin.id),
    roleSlug: 'gl_admin',
    permissions: ['gl.read', 'gl.content.manage'],
  });
  await execute(
    `INSERT INTO gl_classes (name, school, created_by, is_active, created_at, updated_at)
     VALUES (?, 'Ecole', ?, 1, NOW(), NOW())`,
    [`Classe QCM ${stamp}`, admin.id],
  );
  const cls = await queryOne('SELECT id FROM gl_classes WHERE name = ? LIMIT 1', [
    `Classe QCM ${stamp}`,
  ]);
  await execute(
    `INSERT INTO gl_players (class_id, pseudo, password_hash, is_active, created_at, updated_at)
     VALUES (?, ?, 'x', 1, NOW(), NOW())`,
    [cls.id, `qcm-player-${stamp}`],
  );
  const player = await queryOne('SELECT id FROM gl_players WHERE pseudo = ? LIMIT 1', [
    `qcm-player-${stamp}`,
  ]);
  playerToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_player',
    userId: String(player.id),
    roleSlug: 'gl_player',
    permissions: ['gl.read'],
  });
});

test('POST /api/gl/admin/qcm/import dryRun sans écriture', async () => {
  const fileDataBase64 = fs.readFileSync(XLSX_PATH).toString('base64');
  const beforeCount = await queryOne('SELECT COUNT(*) AS n FROM gl_qcm_questions');
  const res = await request(app)
    .post('/api/gl/admin/qcm/import')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ fileDataBase64, dryRun: true })
    .expect(200);
  assert.strictEqual(res.body?.report?.dryRun, true);
  assert.ok(res.body?.report?.totals?.valid >= 650);
  const afterCount = await queryOne('SELECT COUNT(*) AS n FROM gl_qcm_questions');
  assert.strictEqual(Number(afterCount.n), Number(beforeCount.n));
});

test('POST /api/gl/admin/qcm/import apply upsert le catalogue', async () => {
  const glossaryBase64 = fs.readFileSync(GLOSSARY_XLSX).toString('base64');
  await request(app)
    .post('/api/gl/admin/glossary/import')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ fileDataBase64: glossaryBase64, dryRun: false })
    .expect(200);

  const fileDataBase64 = fs.readFileSync(XLSX_PATH).toString('base64');
  const res = await request(app)
    .post('/api/gl/admin/qcm/import')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ fileDataBase64, dryRun: false })
    .expect(200);
  assert.ok(res.body?.report?.totals?.created + res.body?.report?.totals?.updated >= 650);
  const row = await queryOne(
    "SELECT question FROM gl_qcm_questions WHERE question_code = 'QCM0001' LIMIT 1",
  );
  assert.ok(String(row?.question || '').includes('fennec'));
});

test('GET /api/gl/qcm/questions/:code/present mélange à chaque appel', async () => {
  const orders = new Set();
  for (let i = 0; i < 12; i += 1) {
    const res = await request(app)
      .get('/api/gl/qcm/questions/QCM0001/present')
      .set('Authorization', `Bearer ${playerToken}`)
      .expect(200);
    assert.ok(res.body?.presentationToken);
    assert.strictEqual(res.body.choices.length, 5);
    orders.add(res.body.choices.map((c) => c.text).join('|'));
  }
  assert.ok(orders.size > 1, 'plusieurs ordres attendus sur 12 présentations');
});

test('POST /api/gl/qcm/questions/:code/answer valide une réponse', async () => {
  const present = await request(app)
    .get('/api/gl/qcm/questions/QCM0001/present')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  const row = await queryOne(
    `SELECT reponse_correcte, choix_a, choix_b, choix_c, choix_d, choix_e, feedback_correct
       FROM gl_qcm_questions WHERE question_code = 'QCM0001'`,
  );
  const letter = String(row.reponse_correcte).toLowerCase();
  const correctText = row[`choix_${letter}`];
  const correctId = present.body.choices.find((c) => c.text === correctText)?.id;
  assert.ok(correctId != null);

  const ok = await request(app)
    .post('/api/gl/qcm/questions/QCM0001/answer')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ presentationToken: present.body.presentationToken, choiceId: correctId })
    .expect(200);
  assert.strictEqual(ok.body.correct, true);
  assert.ok(String(ok.body.feedback || '').trim().length > 0);
  if (row.feedback_correct) {
    assert.strictEqual(ok.body.feedback, String(row.feedback_correct).trim());
  }
});

test('GET /api/gl/qcm/draw retourne une question du biome', async () => {
  const res = await request(app)
    .get('/api/gl/qcm/draw?biomeSlug=sahara&categorieSlug=faune')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.ok(res.body?.question_code);
});

test('GET /api/gl/admin/qcm/stats retourne des agrégats', async () => {
  const res = await request(app)
    .get('/api/gl/admin/qcm/stats')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(Number(res.body?.total) >= 650);
  assert.ok(Array.isArray(res.body?.byBiome));
});

test('POST /api/gl/admin/qcm/import refuse sans gl.content.manage', async () => {
  await request(app)
    .post('/api/gl/admin/qcm/import')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ fileDataBase64: 'e30=', dryRun: true })
    .expect(403);
});

test('GET /api/gl/admin/qcm/questions — liste admin complète', async () => {
  const res = await request(app)
    .get('/api/gl/admin/qcm/questions?biomeSlug=sahara&statut=actif&sort=code')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(Array.isArray(res.body.items));
  assert.ok(res.body.items.length > 0);
  const standardQcm = res.body.items.filter((item) =>
    /^QCM\d/i.test(String(item.question_code || '')),
  );
  assert.ok(standardQcm.length > 0, 'au moins une question QCM standard attendue');
  assert.match(String(standardQcm[0].question_code), /^QCM/i);
});

test('GET /api/gl/admin/qcm/questions/:code puis PUT mise à jour', async () => {
  const list = await request(app)
    .get('/api/gl/admin/qcm/questions?biomeSlug=sahara&statut=actif')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const code = list.body.items[0]?.question_code;
  assert.ok(code);

  const detail = await request(app)
    .get(`/api/gl/admin/qcm/questions/${encodeURIComponent(code)}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.strictEqual(detail.body.question.question_code, code);

  const suffix = ` [test ${Date.now()}]`;
  const updatedQuestion = `${detail.body.question.question}${suffix}`;
  const put = await request(app)
    .put(`/api/gl/admin/qcm/questions/${encodeURIComponent(code)}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ ...detail.body.question, question: updatedQuestion })
    .expect(200);
  assert.strictEqual(put.body.question.question, updatedQuestion);

  await request(app)
    .put(`/api/gl/admin/qcm/questions/${encodeURIComponent(code)}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ ...detail.body.question, question: detail.body.question.question })
    .expect(200);
});
