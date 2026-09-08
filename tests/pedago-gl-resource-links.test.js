'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const { initSchema, queryAll, queryOne } = require('../database');

const NEW_GQCM = ['GQCM9250', 'GQCM9251', 'GQCM9253', 'GQCM9255', 'GQCM9256', 'GQCM9258'];

const REQUIRED_SPECIES = [
  { code: 'SP0255', question: 'GQCM9250' },
  { code: 'SP0256', question: 'GQCM9251' },
  { code: 'SP0261', question: 'GQCM9255' },
  { code: 'SP0268', question: 'GQCM9253' },
  { code: 'SP0271', question: 'GQCM9258' },
];

before(async () => {
  await initSchema();
});

test('QCM GL miroir des notions jardin sont actifs', async () => {
  const rows = await queryAll(
    `SELECT question_code, statut FROM gl_qcm_questions
      WHERE question_code IN (${NEW_GQCM.map(() => '?').join(',')})`,
    NEW_GQCM,
  );
  assert.strictEqual(rows.length, NEW_GQCM.length);
  for (const row of rows) {
    assert.strictEqual(row.statut, 'actif');
  }
});

test('espèces 225 ont un lien bloquant vers leur QCM de rôle', async () => {
  for (const pair of REQUIRED_SPECIES) {
    const row = await queryOne(
      `SELECT is_gating, status FROM gl_resource_question_links
        WHERE question_dataset = 'qcm'
          AND resource_type = 'species'
          AND resource_ref = ?
          AND question_code = ?`,
      [pair.code, pair.question],
    );
    assert.ok(row, `${pair.code} doit être lié à ${pair.question}`);
    assert.strictEqual(Number(row.is_gating), 1);
    assert.strictEqual(row.status, 'approved');
  }
});

test('chaque biome qui a un QCM actif a un lien écosystème bloquant', async () => {
  const rows = await queryAll(
    `SELECT DISTINCT q.biome_slug
       FROM gl_qcm_questions q
       LEFT JOIN gl_resource_question_links rql
         ON rql.question_dataset = 'qcm'
        AND rql.resource_type = 'ecosystem'
        AND rql.resource_ref = q.biome_slug
        AND rql.status = 'approved'
        AND rql.is_gating = 1
      WHERE q.statut = 'actif'
        AND q.biome_slug IS NOT NULL
        AND q.biome_slug <> ''
        AND rql.id IS NULL`,
  );
  assert.deepStrictEqual(
    rows.map((row) => row.biome_slug),
    [],
  );
});

test('approved GL import/manual/generated sont bloquants', async () => {
  const row = await queryOne(
    `SELECT COUNT(*) AS n FROM gl_resource_question_links
      WHERE status = 'approved'
        AND origin IN ('import', 'generated', 'manual')
        AND is_gating = 0`,
  );
  assert.strictEqual(Number(row.n), 0);
});

test('suggestions auto GL restent non bloquantes', async () => {
  const row = await queryOne(
    `SELECT COUNT(*) AS n FROM gl_resource_question_links
      WHERE (status = 'suggested' OR origin = 'auto')
        AND is_gating = 1`,
  );
  assert.strictEqual(Number(row.n), 0);
});
