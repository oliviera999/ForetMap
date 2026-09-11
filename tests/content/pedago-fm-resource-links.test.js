'use strict';

require('../helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const { initSchema, queryAll, queryOne } = require('../../database');

const SPECIES_QUESTIONS = [
  'QF9250',
  'QF9251',
  'QF9253',
  'QF9254',
  'QF9256',
  'QF9257',
  'QF9261',
  'QF9268',
  'QF9271',
];

const REQUIRED_PLANT_LINKS = [
  { question_code: 'QF9250', name: 'Rhizobium' },
  { question_code: 'QF9251', name: 'Coccinelle à sept points' },
  { question_code: 'QF9253', name: 'Figuier de Barbarie' },
  { question_code: 'QF9256', name: 'Mycorhizes à Glomus' },
  { question_code: 'QF9268', name: 'Litière de feuilles' },
  { question_code: 'QF9271', name: 'Compost et épluchures' },
];

before(async () => {
  await initSchema();
});

test('les QCM de rôle des espèces 223–225 sont actifs', async () => {
  const rows = await queryAll(
    `SELECT question_code, statut FROM quiz_questions
      WHERE question_code IN (${SPECIES_QUESTIONS.map(() => '?').join(',')})`,
    SPECIES_QUESTIONS,
  );
  assert.strictEqual(rows.length, SPECIES_QUESTIONS.length);
});

test('liens plante bloquants pour les fiches clés', async () => {
  for (const pair of REQUIRED_PLANT_LINKS) {
    const row = await queryOne(
      `SELECT rql.is_gating, rql.status
         FROM resource_question_links rql
         JOIN plants p ON CAST(p.id AS CHAR) COLLATE utf8mb4_unicode_ci = rql.resource_ref
        WHERE rql.resource_type = 'plant'
          AND rql.question_code = ?
          AND p.name = ?`,
      [pair.question_code, pair.name],
    );
    assert.ok(row, `${pair.question_code} doit lier ${pair.name}`);
    assert.strictEqual(Number(row.is_gating), 1);
    assert.strictEqual(row.status, 'approved');
  }
});

test('photosynthèse n’est plus accrochée au tutoriel sol vivant', async () => {
  const row = await queryOne(
    `SELECT rql.id
       FROM resource_question_links rql
       JOIN tutorials t ON CAST(t.id AS CHAR) COLLATE utf8mb4_unicode_ci = rql.resource_ref
      WHERE rql.resource_type = 'tutorial'
        AND t.slug = 'sol-vivant'
        AND rql.question_code = 'QF0040'`,
  );
  assert.ok(!row, 'QF0040 ne doit plus être sur sol-vivant');
});

test('les liens approved import/manual/generated du catalogue relu sont bloquants', async () => {
  const rows = await queryAll(
    `SELECT COUNT(*) AS n FROM resource_question_links
      WHERE status = 'approved'
        AND origin IN ('import', 'generated', 'manual')
        AND is_gating = 0
        AND question_code REGEXP '^QF9[12][0-9]{2}$'`,
  );
  assert.strictEqual(Number(rows[0].n), 0);
});

test('les suggestions auto restent non bloquantes', async () => {
  const rows = await queryAll(
    `SELECT COUNT(*) AS n FROM resource_question_links
      WHERE (status = 'suggested' OR origin = 'auto')
        AND is_gating = 1`,
  );
  assert.strictEqual(Number(rows[0].n), 0);
});

test('pas de lien plante orphelin', async () => {
  const rows = await queryAll(
    `SELECT rql.resource_ref
       FROM resource_question_links rql
       LEFT JOIN plants p ON CAST(p.id AS CHAR) COLLATE utf8mb4_unicode_ci = rql.resource_ref
      WHERE rql.resource_type = 'plant' AND p.id IS NULL`,
  );
  assert.deepStrictEqual(rows, []);
});
