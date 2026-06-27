'use strict';

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { initSchema, execute, queryOne } = require('../database');
const { app } = require('../server');

const stamp = Date.now();
const glossaryCode = `FM${String(stamp).slice(-4)}`;

test.before(async () => {
  await initSchema();
  await execute(
    `INSERT INTO glossary_terms (
      glossary_code, terme, variantes, categorie, niveau, definition_courte, statut, created_at, updated_at
    ) VALUES (?, 'Photosynthèse', 'photo-synthèse', 'plantes', 'base', 'Production de matière par la lumière', 'actif', NOW(), NOW())`,
    [glossaryCode],
  );
});

test('GET /api/glossary/categories — public', async () => {
  const res = await request(app).get('/api/glossary/categories').expect(200);
  assert.ok(Array.isArray(res.body.categories));
  assert.ok(res.body.categories.includes('plantes'));
});

test('GET /api/glossary/terms — recherche LIKE et variantes', async () => {
  const res = await request(app).get('/api/glossary/terms?q=photo').expect(200);
  assert.ok(Array.isArray(res.body.items));
  assert.ok(res.body.items.some((item) => item.glossary_code === glossaryCode));
  const variant = await request(app).get('/api/glossary/terms?q=synthèse').expect(200);
  assert.ok(variant.body.items.some((item) => item.glossary_code === glossaryCode));
});

test('GET /api/glossary/terms/:code — détail avec liens', async () => {
  const res = await request(app).get(`/api/glossary/terms/${glossaryCode}`).expect(200);
  assert.strictEqual(res.body.glossary_code, glossaryCode);
  assert.ok(Array.isArray(res.body.relatedTerms));
  assert.ok(Array.isArray(res.body.linkedPlants));
  assert.ok(Array.isArray(res.body.linkedTutorials));
  assert.ok(Array.isArray(res.body.linkedQuizQuestions));
  assert.ok(Array.isArray(res.body.incomingRelations));
  assert.strictEqual(typeof res.body.tutorialsCount, 'number');
});

test('GET /api/glossary/terms/inconnu — 404', async () => {
  await request(app).get('/api/glossary/terms/FM9999').expect(404);
});

test('GET /api/glossary/terms/:code — linkedQuizQuestions lus depuis resource_question_links', async () => {
  // Question active existante (catégorie seedée) à lier.
  const q = await queryOne(
    `SELECT question_code FROM quiz_questions
      WHERE statut = 'actif' AND categorie_slug = 'vivant_classification' LIMIT 1`,
  );
  assert.ok(q?.question_code, 'une question active doit exister pour le test');

  await execute(
    `INSERT IGNORE INTO resource_question_links
       (resource_type, resource_ref, question_code, status, origin, is_gating)
     VALUES ('glossary', ?, ?, 'approved', 'import', 1)`,
    [glossaryCode, q.question_code],
  );

  const res = await request(app).get(`/api/glossary/terms/${glossaryCode}`).expect(200);
  assert.ok(Array.isArray(res.body.linkedQuizQuestions));
  assert.ok(
    res.body.linkedQuizQuestions.some((item) => item.question_code === q.question_code),
    'la fiche glossaire doit lister la question liée via RQL',
  );
});
