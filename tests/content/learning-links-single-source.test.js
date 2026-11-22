'use strict';

// Liens question ↔ ressource : une seule source, `resource_question_links` (migration 300 ;
// audit du 25/09/2026, § 1.3.3 et § 3.5). Les deux tables historiques de liens ont été
// supprimées par la migration `retrait_t3_quiz_question_links` (temps 3) : leurs contrôles
// d'alignement sont partis avec elles (`tests/retrait-t3-quiz-question-links.test.js`).

require('../helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const { initSchema, queryOne } = require('../../database');

before(async () => {
  await initSchema();
});

test('les reprises de la migration 300 sont approuvées et non bloquantes', async () => {
  const row = await queryOne(
    `SELECT COUNT(*) AS n FROM resource_question_links
      WHERE origin = 'editorial' AND note LIKE 'migration 300 :%'
        AND (status <> 'approved' OR is_gating <> 0)`,
  );
  assert.strictEqual(Number(row.n), 0);
});
