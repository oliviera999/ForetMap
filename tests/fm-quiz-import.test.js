'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  buildCategoryPayload,
  buildQuestionPayload,
  validateCategoryPayload,
  validateQuestionPayload,
  buildFmQuizTemplateWorkbook,
  parseFmQuizWorkbook,
  applyFmQuizImport,
} = require('../lib/fmQuizImport');

test('buildCategoryPayload exige theme sciences ou jardinage', () => {
  const ok = buildCategoryPayload({
    categorie_slug: 'vivant_classification',
    categorie_nom: 'Le vivant',
    theme: 'sciences',
    ordre: 1,
  });
  assert.strictEqual(ok.theme, 'sciences');
  const errors = validateCategoryPayload(
    buildCategoryPayload({ categorie_slug: 'x', categorie_nom: 'X', theme: 'foo' }),
    2,
  );
  assert.ok(errors.some((e) => e.field === 'theme'));
});

test('buildQuestionPayload génère code QF#### depuis id', () => {
  const payload = buildQuestionPayload({
    id: 42,
    categorie_slug: 'vivant_classification',
    numero_dans_categorie: 1,
    question: 'Test ?',
    choix_a: 'A',
    choix_b: 'B',
    choix_c: 'C',
    choix_d: 'D',
    reponse_correcte: 'A',
    niveau: 'college',
  });
  assert.strictEqual(payload.question_code, 'QF0042');
  assert.strictEqual(payload.niveau, 'college');
});

test('validateQuestionPayload signale categorie inconnue', () => {
  const payload = buildQuestionPayload({
    id: 1,
    categorie_slug: 'inconnue',
    numero_dans_categorie: 1,
    question: 'Test ?',
    choix_a: 'A',
    choix_b: 'B',
    choix_c: 'C',
    reponse_correcte: 'A',
  });
  const errors = validateQuestionPayload(payload, 2, new Set(['vivant_classification']));
  assert.ok(errors.some((e) => e.field === 'categorie_slug'));
});

test('buildFmQuizTemplateWorkbook parse en dry-run', async () => {
  const buffer = await buildFmQuizTemplateWorkbook();
  const { categoryRows, questionRows } = await parseFmQuizWorkbook(buffer);
  assert.ok(categoryRows.length >= 1);
  assert.ok(questionRows.length >= 1);
  const report = await applyFmQuizImport(
    {
      queryAll: async () => [],
      execute: async () => {
        throw new Error('execute ne doit pas être appelé en dry-run sans lignes valides');
      },
    },
    categoryRows,
    questionRows,
    { dryRun: true },
  );
  assert.strictEqual(report.dryRun, true);
  assert.ok(report.totals.valid >= 1);
});
