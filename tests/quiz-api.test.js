'use strict';

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { initSchema, queryOne, queryAll, execute } = require('../database');
const { app } = require('../server');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { buildFmQuizTemplateWorkbook, applyFmQuizImport } = require('../lib/fmQuizImport');

// Fixtures partagées pour les tests « liens glossaire RQL » (CHANTIER 1).
const GL_RQL_STAMP = String(Date.now()).slice(-5);
const GL_RQL_GLOSSARY_CODE = `RQ${GL_RQL_STAMP}`;
const GL_RQL_QUESTION_CODE = `QF9${GL_RQL_STAMP}`;
const GL_RQL_QUESTION_ID = Number(GL_RQL_QUESTION_CODE.slice(2));
const GL_RQL_TAG = `rqlterm${GL_RQL_STAMP}`;

test.before(async () => {
  await initSchema();
  // Terme glossaire actif dont la clé normalisée == le tag de la question importée.
  await execute(
    `INSERT INTO glossary_terms (
       glossary_code, terme, variantes, categorie, niveau, definition_courte, statut, created_at, updated_at
     ) VALUES (?, ?, '', 'flore', 'base', 'Terme de test pour liens RQL', 'actif', NOW(), NOW())
     ON DUPLICATE KEY UPDATE statut = 'actif'`,
    [GL_RQL_GLOSSARY_CODE, GL_RQL_TAG],
  );
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

// =====================================================================
// CHANTIER 1 — Source de vérité unifiée des liens glossaire (RQL).
// =====================================================================

const GL_RQL_CATEGORY_ROWS = [
  {
    categorie_slug: 'vivant_classification',
    categorie_nom: 'Le vivant et sa classification',
    theme: 'sciences',
    ordre: 1,
  },
];

function buildGlRqlQuestionRows() {
  return [
    {
      id: GL_RQL_QUESTION_ID,
      categorie_slug: 'vivant_classification',
      numero_dans_categorie: 1,
      question: `Question de test liens RQL ${GL_RQL_STAMP} ?`,
      choix_a: 'A',
      choix_b: 'B',
      choix_c: 'C',
      reponse_correcte: 'A',
      niveau: 'college',
      tags: GL_RQL_TAG,
    },
  ];
}

test('import écrit les liens glossaire dans RQL (origin=import) et pas dans quiz_question_glossary', async () => {
  await applyFmQuizImport({ queryAll, execute }, GL_RQL_CATEGORY_ROWS, buildGlRqlQuestionRows(), {
    dryRun: false,
  });

  const rqlRows = await queryAll(
    `SELECT resource_ref, status, origin FROM resource_question_links
      WHERE resource_type = 'glossary' AND question_code = ?`,
    [GL_RQL_QUESTION_CODE],
  );
  assert.ok(
    rqlRows.some((r) => r.resource_ref === GL_RQL_GLOSSARY_CODE && r.origin === 'import'),
    'le lien glossaire doit exister dans resource_question_links avec origin=import',
  );

  const legacy = await queryAll(
    'SELECT 1 AS ok FROM quiz_question_glossary WHERE question_code = ?',
    [GL_RQL_QUESTION_CODE],
  );
  assert.strictEqual(legacy.length, 0, 'aucun lien ne doit être écrit dans quiz_question_glossary');
});

test('non-régression : un lien glossaire origin=generated/approved survit à un ré-import', async () => {
  // Pré-condition : la question existe (créée par le test d'import précédent).
  // Le couple (resource_type, resource_ref, question_code) est UNIQUE : on emploie un autre
  // glossary_code pour matérialiser le lien generated à préserver.
  const generatedRef = `${GL_RQL_GLOSSARY_CODE}G`;
  await execute(
    `INSERT INTO glossary_terms (
       glossary_code, terme, variantes, categorie, niveau, definition_courte, statut, created_at, updated_at
     ) VALUES (?, ?, '', 'flore', 'base', 'Terme generated', 'actif', NOW(), NOW())
     ON DUPLICATE KEY UPDATE statut = 'actif'`,
    [generatedRef, `${GL_RQL_TAG}gen`],
  );
  await execute(
    `INSERT IGNORE INTO resource_question_links
       (resource_type, resource_ref, question_code, status, origin, is_gating)
     VALUES ('glossary', ?, ?, 'approved', 'generated', 1)`,
    [generatedRef, GL_RQL_QUESTION_CODE],
  );

  // Ré-import : le DELETE scopé origin='import' ne doit PAS toucher le lien generated.
  await applyFmQuizImport({ queryAll, execute }, GL_RQL_CATEGORY_ROWS, buildGlRqlQuestionRows(), {
    dryRun: false,
  });

  const survived = await queryAll(
    `SELECT 1 AS ok FROM resource_question_links
      WHERE resource_type = 'glossary' AND question_code = ? AND resource_ref = ?
        AND origin = 'generated' AND status = 'approved'`,
    [GL_RQL_QUESTION_CODE, generatedRef],
  );
  assert.strictEqual(
    survived.length,
    1,
    'le lien origin=generated/approved doit survivre au ré-import',
  );

  // Et le lien d'import est bien re-créé.
  const importLink = await queryAll(
    `SELECT 1 AS ok FROM resource_question_links
      WHERE resource_type = 'glossary' AND question_code = ?
        AND resource_ref = ? AND origin = 'import'`,
    [GL_RQL_QUESTION_CODE, GL_RQL_GLOSSARY_CODE],
  );
  assert.strictEqual(
    importLink.length,
    1,
    'le lien origin=import doit être présent après ré-import',
  );
});

test('present/answer renvoient les glossaryTerms recalculés (option A)', async () => {
  const present = await request(app)
    .get(`/api/quiz/questions/${GL_RQL_QUESTION_CODE}/present`)
    .expect(200);
  assert.ok(present.body.presentationToken);
  assert.ok(Array.isArray(present.body.glossaryTerms));
  assert.ok(
    present.body.glossaryTerms.some((t) => t.glossary_code === GL_RQL_GLOSSARY_CODE),
    'le terme glossaire matché doit apparaître dans la présentation',
  );

  // Réponse correcte (A) → glossaryTerms renvoyés.
  const correctChoice = present.body.choices.find((c) => c.text === 'A');
  assert.ok(correctChoice, 'le choix correct doit être présent');
  const answer = await request(app)
    .post(`/api/quiz/questions/${GL_RQL_QUESTION_CODE}/answer`)
    .send({ presentationToken: present.body.presentationToken, choiceId: correctChoice.id })
    .expect(200);
  assert.strictEqual(answer.body.correct, true);
  assert.ok(Array.isArray(answer.body.glossaryTerms));
  assert.ok(
    answer.body.glossaryTerms.some((t) => t.glossary_code === GL_RQL_GLOSSARY_CODE),
    'la bonne réponse doit renvoyer le terme glossaire recalculé',
  );
});
