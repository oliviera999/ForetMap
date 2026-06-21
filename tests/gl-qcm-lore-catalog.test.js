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
const {
  parseLoreGlossaryWorkbook,
  applyLoreGlossaryImport,
} = require('../lib/glLoreGlossaryImport');

const XLSX_PATH = path.join(__dirname, '..', 'data', 'gl', 'qcm-lore-gnomes-et-licornes.xlsx');
const LORE_GLOSSARY_XLSX = path.join(
  __dirname,
  '..',
  'data',
  'gl',
  'glossaire-lore-gnomes-et-licornes.xlsx',
);

let adminToken = '';
let playerToken = '';
const stamp = Date.now();

before(async () => {
  await initSchema();
  await execute(
    `INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at)
     VALUES (?, 'MJ QCM Lore', 'admin', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE is_active = 1, updated_at = NOW()`,
    [`qcm-lore.admin.${stamp}@ecole.local`],
  );
  const admin = await queryOne('SELECT id FROM gl_admins WHERE email = ? LIMIT 1', [
    `qcm-lore.admin.${stamp}@ecole.local`,
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
    [`Classe QCM Lore ${stamp}`, admin.id],
  );
  const cls = await queryOne('SELECT id FROM gl_classes WHERE name = ? LIMIT 1', [
    `Classe QCM Lore ${stamp}`,
  ]);
  await execute(
    `INSERT INTO gl_players (class_id, pseudo, password_hash, is_active, created_at, updated_at)
     VALUES (?, ?, 'x', 1, NOW(), NOW())`,
    [cls.id, `qcm-lore-player-${stamp}`],
  );
  const player = await queryOne('SELECT id FROM gl_players WHERE pseudo = ? LIMIT 1', [
    `qcm-lore-player-${stamp}`,
  ]);
  playerToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_player',
    userId: String(player.id),
    roleSlug: 'gl_player',
    permissions: ['gl.read'],
  });
});

test('POST /api/gl/lore/admin/qcm/import dryRun sans écriture', async () => {
  const fileDataBase64 = fs.readFileSync(XLSX_PATH).toString('base64');
  const beforeCount = await queryOne('SELECT COUNT(*) AS n FROM gl_qcm_lore_questions');
  const res = await request(app)
    .post('/api/gl/lore/admin/qcm/import')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ fileDataBase64, dryRun: true })
    .expect(200);
  assert.strictEqual(res.body?.report?.dryRun, true);
  assert.ok(res.body?.report?.totals?.valid >= 150);
  const afterCount = await queryOne('SELECT COUNT(*) AS n FROM gl_qcm_lore_questions');
  assert.strictEqual(Number(afterCount.n), Number(beforeCount.n));
});

test('POST /api/gl/lore/admin/qcm/import apply upsert le catalogue', async () => {
  if (fs.existsSync(LORE_GLOSSARY_XLSX)) {
    const { glossaryRows } = await parseLoreGlossaryWorkbook(fs.readFileSync(LORE_GLOSSARY_XLSX));
    await applyLoreGlossaryImport(
      { queryAll: require('../database').queryAll, execute },
      glossaryRows,
      { dryRun: false },
    );
  }

  const fileDataBase64 = fs.readFileSync(XLSX_PATH).toString('base64');
  const res = await request(app)
    .post('/api/gl/lore/admin/qcm/import')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ fileDataBase64, dryRun: false })
    .expect(200);
  assert.ok(res.body?.report?.totals?.created + res.body?.report?.totals?.updated >= 150);
  const row = await queryOne(
    "SELECT question FROM gl_qcm_lore_questions WHERE question_code = 'LQCM0001' LIMIT 1",
  );
  assert.ok(String(row?.question || '').length > 5);
});

test('GET /api/gl/lore/qcm/scopes et categories', async () => {
  const scopes = await request(app)
    .get('/api/gl/lore/qcm/scopes')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(Array.isArray(scopes.body));
  assert.ok(scopes.body.some((s) => s.slug === 'tous'));

  const categories = await request(app)
    .get('/api/gl/lore/qcm/categories')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(Array.isArray(categories.body));
  assert.ok(categories.body.length >= 8);
});

test('GET /api/gl/lore/qcm/questions/:code/present mélange à chaque appel', async () => {
  const orders = new Set();
  for (let i = 0; i < 12; i += 1) {
    const res = await request(app)
      .get('/api/gl/lore/qcm/questions/LQCM0001/present')
      .set('Authorization', `Bearer ${playerToken}`)
      .expect(200);
    assert.ok(res.body?.presentationToken);
    assert.ok(res.body.choices.length >= 2);
    orders.add(res.body.choices.map((c) => c.text).join('|'));
  }
  assert.ok(orders.size > 1, 'plusieurs ordres attendus sur 12 présentations');
});

test('POST /api/gl/lore/qcm/questions/:code/answer valide une réponse', async () => {
  const present = await request(app)
    .get('/api/gl/lore/qcm/questions/LQCM0001/present')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  const row = await queryOne(
    `SELECT reponse_correcte, choix_a, choix_b, choix_c, choix_d, choix_e, feedback_correct
       FROM gl_qcm_lore_questions WHERE question_code = 'LQCM0001'`,
  );
  const letter = String(row.reponse_correcte).toLowerCase();
  const correctText = row[`choix_${letter}`];
  const correctId = present.body.choices.find((c) => c.text === correctText)?.id;
  assert.ok(correctId != null);

  const answer = await request(app)
    .post('/api/gl/lore/qcm/questions/LQCM0001/answer')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({
      presentationToken: present.body.presentationToken,
      choiceId: correctId,
    })
    .expect(200);
  assert.strictEqual(answer.body.correct, true);
  assert.ok(String(answer.body.feedback || '').trim().length > 0);
});

test('GET /api/gl/lore/qcm/pool-preview admin', async () => {
  const res = await request(app)
    .get('/api/gl/lore/qcm/pool-preview?chapitreSlugs=tous')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(Array.isArray(res.body.items));
  assert.ok(res.body.items.some((item) => item.question_code?.startsWith('LQCM')));
});

test('GET /api/gl/lore/admin/qcm/questions — liste admin complète', async () => {
  const res = await request(app)
    .get('/api/gl/lore/admin/qcm/questions?chapitreSlug=tous&statut=actif&sort=code')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(Array.isArray(res.body.items));
  assert.ok(res.body.items.length > 0);
  assert.match(String(res.body.items[0].question_code), /^LQCM/);
});

test('GET /api/gl/lore/admin/qcm/questions/:code puis PUT mise à jour', async () => {
  const list = await request(app)
    .get('/api/gl/lore/admin/qcm/questions?chapitreSlug=tous&statut=actif')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const code = list.body.items[0]?.question_code;
  assert.ok(code);

  const detail = await request(app)
    .get(`/api/gl/lore/admin/qcm/questions/${encodeURIComponent(code)}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.strictEqual(detail.body.question.question_code, code);

  const suffix = ` [test ${Date.now()}]`;
  const updatedQuestion = `${detail.body.question.question}${suffix}`;
  const put = await request(app)
    .put(`/api/gl/lore/admin/qcm/questions/${encodeURIComponent(code)}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ ...detail.body.question, question: updatedQuestion })
    .expect(200);
  assert.strictEqual(put.body.question.question, updatedQuestion);

  await request(app)
    .put(`/api/gl/lore/admin/qcm/questions/${encodeURIComponent(code)}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ ...detail.body.question, question: detail.body.question.question })
    .expect(200);
});
