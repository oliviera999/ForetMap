'use strict';

// Liens question ↔ ressource : une seule source, `resource_question_links` (migration 300 ;
// audit du 25/09/2026, § 1.3.3 et § 3.5). Ces contrôles sont ceux du passage au temps 3
// (`DROP` de `quiz_question_species` et de `quiz_question_tutorials`) : tant qu'ils valent 0,
// les tables historiques n'apportent plus rien que RQL ne sache déjà.

require('../helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const { initSchema, queryOne } = require('../../database');

before(async () => {
  await initSchema();
});

test('aucun lien espèce des tables historiques absent de la source unique', async () => {
  const row = await queryOne(
    `SELECT COUNT(*) AS n FROM quiz_question_species q WHERE NOT EXISTS (
       SELECT 1 FROM resource_question_links r WHERE r.resource_type = 'plant'
          AND r.question_code = q.question_code
          AND CAST(r.resource_ref AS UNSIGNED) = q.plant_id)`,
  );
  assert.strictEqual(Number(row.n), 0);
});

test('aucun lien tutoriel des tables historiques absent de la source unique', async () => {
  const row = await queryOne(
    `SELECT COUNT(*) AS n FROM quiz_question_tutorials q WHERE NOT EXISTS (
       SELECT 1 FROM resource_question_links r WHERE r.resource_type = 'tutorial'
          AND r.question_code = q.question_code
          AND CAST(r.resource_ref AS UNSIGNED) = q.tutorial_id)`,
  );
  assert.strictEqual(Number(row.n), 0);
});

test('les reprises de la migration 300 sont approuvées et non bloquantes', async () => {
  const row = await queryOne(
    `SELECT COUNT(*) AS n FROM resource_question_links
      WHERE origin = 'editorial' AND note LIKE 'migration 300 :%'
        AND (status <> 'approved' OR is_gating <> 0)`,
  );
  assert.strictEqual(Number(row.n), 0);
});
