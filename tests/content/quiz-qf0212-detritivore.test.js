'use strict';

// Migration 298 : QF0212 ne demande plus « lequel est un décomposeur ? » en attendant le
// cloporte, que sa fiche classe désormais « détritivore » (migration 295).
require('../helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const { initSchema, queryOne } = require('../../database');

before(async () => {
  await initSchema();
});

test('QF0212 est cohérente avec la fiche du cloporte (détritivore)', async () => {
  const q = await queryOne(
    'SELECT question, reponse_texte, feedback_correct FROM quiz_questions WHERE question_code = ?',
    ['QF0212'],
  );
  if (!q) return; // question absente de cette base : rien à contrôler
  assert.doesNotMatch(q.question, /lequel est un décomposeur/i);
  assert.match(q.question, /fragment/i);
  assert.strictEqual(q.reponse_texte, 'Le cloporte');
  assert.match(q.feedback_correct, /détritivore/);
});
