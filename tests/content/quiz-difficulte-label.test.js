'use strict';

// Retrait en trois temps de `quiz_questions.difficulte_label` (audit du 25/09/2026, § 3.5) :
// le libellé se dérive désormais de `difficulte` par le référentiel
// (`quizDifficulteLabel`, src/shared/enums/pedagoEnums.js). Ce contrôle est celui qui autorise
// le troisième temps (DROP COLUMN) : aucun libellé stocké ne doit différer du libellé dérivé,
// et aucune difficulté ne doit sortir de l'échelle 1 à 3.
require('../helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { initSchema, queryAll } = require('../../database');
const { quizDifficulteLabel, QUIZ_DIFFICULTE_ENUM } = require('../../lib/shared/pedagoEnums');

before(async () => {
  await initSchema();
});

test('chaque libellé de difficulté stocké est celui que le référentiel dérive', async () => {
  const rows = await queryAll(
    `SELECT difficulte, difficulte_label, COUNT(*) AS n FROM quiz_questions
      WHERE difficulte_label IS NOT NULL GROUP BY difficulte, difficulte_label`,
  );
  for (const row of rows) {
    assert.equal(
      row.difficulte_label,
      quizDifficulteLabel(row.difficulte),
      `difficulte=${row.difficulte} : « ${row.difficulte_label} » (${row.n} question(s))`,
    );
  }
});

test('les difficultés du corpus restent dans l’échelle du référentiel (1 à 3)', async () => {
  const rows = await queryAll(
    'SELECT DISTINCT difficulte FROM quiz_questions WHERE difficulte IS NOT NULL',
  );
  for (const row of rows) {
    assert.ok(
      QUIZ_DIFFICULTE_ENUM.values.includes(Number(row.difficulte)),
      `difficulté hors échelle : ${row.difficulte}`,
    );
  }
});
