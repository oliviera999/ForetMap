'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  normalizeEventConfig,
  migrateLegacyMarkerQcmConfig,
  resolveMarkerEventConfig,
  resolveBiomeSlugsForPool,
  serializeEventConfig,
} = require('../lib/glMarkerEventConfig');
const { queryQuestionPool, drawQuestionFromMarker } = require('../lib/glMarkerQuestionPool');
const { buildCanonicalChoices, presentQuestion } = require('../lib/glQcmChoices');

test('normalizeEventConfig valide une config question fixe', () => {
  const cfg = normalizeEventConfig({
    version: 1,
    question: {
      mode: 'fixed',
      fixedQuestionCode: 'qcm0001',
      pool: { biomeMode: 'chapter' },
    },
  });
  assert.strictEqual(cfg.question.mode, 'fixed');
  assert.strictEqual(cfg.question.fixedQuestionCode, 'QCM0001');
});

test('migrateLegacyMarkerQcmConfig depuis champs legacy', () => {
  const cfg = migrateLegacyMarkerQcmConfig({
    event_type: 'quiz',
    qcm_question_code: 'QCM0042',
    qcm_categorie_slug: 'faune',
  });
  assert.strictEqual(cfg.question.mode, 'fixed');
  assert.strictEqual(cfg.question.fixedQuestionCode, 'QCM0042');
  assert.deepStrictEqual(cfg.question.pool.categorieSlugs, ['faune']);
});

test('resolveMarkerEventConfig préfère event_config_json', () => {
  const json = serializeEventConfig({
    version: 1,
    question: {
      mode: 'random',
      pool: { biomeMode: 'chapter', selectedQuestionCodes: ['QCM0001'] },
    },
  });
  const cfg = resolveMarkerEventConfig({
    event_type: 'question',
    event_config_json: json,
    qcm_question_code: 'QCM9999',
  });
  assert.strictEqual(cfg.question.mode, 'random');
  assert.deepStrictEqual(cfg.question.pool.selectedQuestionCodes, ['QCM0001']);
});

test('resolveBiomeSlugsForPool mode chapter vs custom', () => {
  const chapter = ['foret-temperee'];
  assert.deepStrictEqual(
    resolveBiomeSlugsForPool({ biomeMode: 'chapter', biomeSlugs: ['desert'] }, chapter),
    chapter,
  );
  assert.deepStrictEqual(
    resolveBiomeSlugsForPool({ biomeMode: 'custom', biomeSlugs: ['desert'] }, chapter),
    ['foret-temperee', 'desert'],
  );
});

test('queryQuestionPool intersecte selectedQuestionCodes', async () => {
  const rows = [
    {
      question_code: 'QCM0001',
      question: 'A',
      biome_slug: 'b1',
      statut: 'actif',
      tags: '',
      mots_cles: '',
    },
    {
      question_code: 'QCM0002',
      question: 'B',
      biome_slug: 'b1',
      statut: 'actif',
      tags: '',
      mots_cles: '',
    },
  ];
  const deps = {
    queryAll: async () => rows,
  };
  const { items } = await queryQuestionPool(deps, {
    pool: {
      biomeMode: 'chapter',
      biomeSlugs: [],
      selectedQuestionCodes: ['QCM0002'],
    },
    chapterBiomeSlugs: ['b1'],
  });
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].question_code, 'QCM0002');
});

test('drawQuestionFromMarker mode fixed', async () => {
  const deps = {
    queryOne: async () => ({
      question_code: 'QCM0001',
      question: 'Test?',
      choix_a: 'a',
      choix_b: 'b',
      choix_c: 'c',
      choix_d: 'd',
      choix_e: 'e',
      reponse_correcte: 'A',
      statut: 'actif',
    }),
    queryAll: async () => [],
  };
  const draw = await drawQuestionFromMarker(
    deps,
    {
      event_type: 'question',
      event_config_json: serializeEventConfig({
        version: 1,
        question: { mode: 'fixed', fixedQuestionCode: 'QCM0001', pool: { biomeMode: 'chapter' } },
      }),
    },
    ['b1'],
  );
  assert.strictEqual(draw.questionCode, 'QCM0001');
  assert.strictEqual(draw.error, null);
  assert.strictEqual(draw.questionRow, undefined);
});

test('ligne pool sans choix_* exige rechargement complet avant presentQuestion', () => {
  const poolRow = { question_code: 'QCM0001', question: 'Test?' };
  assert.strictEqual(buildCanonicalChoices(poolRow).length, 0);
  assert.throws(() => presentQuestion(poolRow), /Choix insuffisants/);

  const fullRow = {
    question_code: 'QCM0001',
    question: 'Test?',
    choix_a: 'Un',
    choix_b: 'Deux',
    reponse_correcte: 'A',
  };
  const presentation = presentQuestion(fullRow);
  assert.strictEqual(presentation.choices.length, 2);
});
