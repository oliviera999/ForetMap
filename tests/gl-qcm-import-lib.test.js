'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert');
const {
  buildCategoryPayload,
  buildQuestionPayload,
  validateQuestionPayload,
  parseQcmWorkbook,
  buildQuestionUpsertParams,
  formatQuestionCode,
} = require('../lib/glQcmImport');

const XLSX_PATH = path.join(__dirname, '..', 'data', 'gl', 'qcm-biomes-gnomes-et-licornes-consolide.xlsx');

test('parseQcmWorkbook lit le fichier de référence', () => {
  const buffer = fs.readFileSync(XLSX_PATH);
  const { categoryRows, questionRows } = parseQcmWorkbook(buffer);
  assert.ok(categoryRows.length >= 6);
  assert.ok(questionRows.length >= 650);
  const first = buildQuestionPayload(questionRows[0]);
  assert.strictEqual(first.question_code, 'QCM0001');
  assert.strictEqual(first.biome_slug, 'sahara');
  assert.ok(first.choix_a);
});

test('formatQuestionCode zero-pad', () => {
  assert.strictEqual(formatQuestionCode(1), 'QCM0001');
  assert.strictEqual(formatQuestionCode(660), 'QCM0660');
});

test('validateQuestionPayload signale biome inconnu', () => {
  const payload = buildQuestionPayload({
    id: 1,
    biome_slug: 'inconnu',
    categorie_slug: 'faune',
    numero_dans_categorie: 1,
    question: 'Test ?',
    choix_a: 'A',
    choix_b: 'B',
    choix_c: 'C',
    choix_d: 'D',
    choix_e: 'E',
    reponse_correcte: 'A',
  });
  const errors = validateQuestionPayload(
    payload,
    2,
    new Set(['sahara']),
    new Set(['faune'])
  );
  assert.ok(errors.some((e) => e.field === 'biome_slug'));
});

test('buildQuestionUpsertParams aligne 31 paramètres', () => {
  const payload = buildQuestionPayload({
    id: 1,
    biome_slug: 'sahara',
    categorie_slug: 'faune',
    numero_dans_categorie: 1,
    question: 'Test ?',
    choix_a: 'A',
    choix_b: 'B',
    choix_c: 'C',
    choix_d: 'D',
    choix_e: 'E',
    reponse_correcte: 'A',
  });
  const params = buildQuestionUpsertParams(payload);
  assert.strictEqual(params.length, 31);
  assert.strictEqual(params[0], 'QCM0001');
});

test('buildCategoryPayload lit slug et nom', () => {
  const payload = buildCategoryPayload({
    categorie_slug: 'faune',
    categorie_nom: 'Faune',
    ordre: 1,
  });
  assert.strictEqual(payload.slug, 'faune');
  assert.strictEqual(payload.nom, 'Faune');
});
