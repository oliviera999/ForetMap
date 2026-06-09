'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert');
const {
  buildScopePayload,
  buildCategoryPayload,
  buildQuestionPayload,
  validateQuestionPayload,
  parseQcmLoreWorkbook,
  buildQuestionUpsertParams,
  formatLoreQuestionCode,
} = require('../lib/glQcmLoreImport');

const XLSX_PATH = path.join(__dirname, '..', 'data', 'gl', 'qcm-lore-gnomes-et-licornes.xlsx');

test('parseQcmLoreWorkbook lit le fichier de référence', async () => {
  const buffer = fs.readFileSync(XLSX_PATH);
  const { scopeRows, categoryRows, questionRows } = await parseQcmLoreWorkbook(buffer);
  assert.ok(scopeRows.length >= 7);
  assert.ok(categoryRows.length >= 8);
  assert.ok(questionRows.length >= 150);
  const first = buildQuestionPayload(questionRows[0]);
  assert.strictEqual(first.question_code, 'LQCM0001');
  assert.ok(first.chapitre_slug);
  assert.ok(['cle', 'recit'].includes(first.tier_lore));
});

test('formatLoreQuestionCode zero-pad', () => {
  assert.strictEqual(formatLoreQuestionCode(1), 'LQCM0001');
  assert.strictEqual(formatLoreQuestionCode(150), 'LQCM0150');
});

test('validateQuestionPayload signale chapitre inconnu', () => {
  const payload = buildQuestionPayload({
    id: 1,
    chapitre_slug: 'inconnu',
    categorie_slug: 'cosmologie',
    numero_dans_categorie: 1,
    tier_lore: 'cle',
    question: 'Test ?',
    choix_a: 'A',
    choix_b: 'B',
    reponse_correcte: 'A',
  });
  const errors = validateQuestionPayload(
    payload,
    2,
    new Set(['tous']),
    new Set(['cosmologie'])
  );
  assert.ok(errors.some((e) => e.field === 'chapitre_slug'));
});

test('validateQuestionPayload accepte deux choix minimum', () => {
  const payload = buildQuestionPayload({
    id: 1,
    chapitre_slug: 'tous',
    categorie_slug: 'cosmologie',
    numero_dans_categorie: 1,
    tier_lore: 'recit',
    question: 'Test ?',
    choix_a: 'A',
    choix_b: 'B',
    choix_c: '',
    choix_d: '',
    choix_e: '',
    reponse_correcte: 'B',
  });
  const errors = validateQuestionPayload(
    payload,
    2,
    new Set(['tous']),
    new Set(['cosmologie'])
  );
  assert.strictEqual(errors.length, 0);
});

test('buildQuestionPayload lit les colonnes feedback', () => {
  const payload = buildQuestionPayload({
    id: 1,
    chapitre_slug: 'ch0',
    categorie_slug: 'cosmologie',
    numero_dans_categorie: 1,
    tier_lore: 'cle',
    question: 'Test ?',
    choix_a: 'A',
    choix_b: 'B',
    reponse_correcte: 'A',
    feedback_correct: 'Bravo !',
    feedback_b: 'Non.',
  });
  assert.strictEqual(payload.feedback_correct, 'Bravo !');
  assert.strictEqual(payload.feedback_b, 'Non.');
});

test('buildQuestionUpsertParams aligne le nombre de paramètres', () => {
  const payload = buildQuestionPayload({
    id: 1,
    chapitre_slug: 'tous',
    categorie_slug: 'cosmologie',
    numero_dans_categorie: 1,
    tier_lore: 'cle',
    question: 'Test ?',
    choix_a: 'A',
    choix_b: 'B',
    reponse_correcte: 'A',
  });
  const params = buildQuestionUpsertParams(payload);
  assert.strictEqual(params.length, 27);
  assert.strictEqual(params[0], 'LQCM0001');
});

test('buildScopePayload et buildCategoryPayload', () => {
  const scope = buildScopePayload({
    chapitre_slug: 'ch3',
    chapitre_nom: 'Chapitre 3',
    plateau: '3',
    description: 'Test',
    ordre: 4,
  });
  assert.strictEqual(scope.slug, 'ch3');
  const cat = buildCategoryPayload({
    categorie_slug: 'cosmologie',
    categorie_nom: 'Cosmologie',
    ordre: 1,
  });
  assert.strictEqual(cat.slug, 'cosmologie');
});
