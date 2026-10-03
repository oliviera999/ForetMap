'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  normalizeEventConfig,
  migrateLegacyMarkerQcmConfig,
  resolveMarkerEventConfig,
  resolveBiomeSlugsForPool,
  resolveSousBiomePoolSlug,
  normalizeQuestionPool,
  serializeEventConfig,
} = require('../lib/glMarkerEventConfig');
const { queryQuestionPool, drawQuestionFromMarker } = require('../lib/glMarkerQuestionPool');
const { buildCanonicalChoices, presentQuestion } = require('../lib/qcmChoices');

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

test('mode sous_biome : le pool prend le biome de la case (alias de saison normalisés)', () => {
  const chapter = ['taiga', 'toundra'];
  const pool = { biomeMode: 'sous_biome', biomeSlugs: ['sahara'] };
  assert.deepStrictEqual(resolveBiomeSlugsForPool(pool, chapter, 'taiga'), ['taiga']);
  assert.deepStrictEqual(resolveBiomeSlugsForPool(pool, chapter, 'toundra_ete'), ['toundra']);
  assert.deepStrictEqual(resolveBiomeSlugsForPool(pool, chapter, 'toundra-hiver'), ['toundra']);
  assert.deepStrictEqual(resolveBiomeSlugsForPool(pool, chapter, 'Toundra_Hiver'), ['toundra']);
  // Un biome hors chapitre reste le biome de la case : le mode restreint à la case, il ne
  // fusionne pas avec le chapitre (contrairement à `custom`).
  assert.deepStrictEqual(resolveBiomeSlugsForPool(pool, chapter, 'jungle'), ['jungle_afc']);
});

test('mode sous_biome : repli sur les biomes du chapitre (vide, transition, inconnu)', () => {
  const chapter = ['taiga', 'toundra'];
  const pool = { biomeMode: 'sous_biome' };
  assert.deepStrictEqual(resolveBiomeSlugsForPool(pool, chapter, null), chapter);
  assert.deepStrictEqual(resolveBiomeSlugsForPool(pool, chapter, ''), chapter);
  assert.deepStrictEqual(resolveBiomeSlugsForPool(pool, chapter, 'transition'), chapter);
  assert.deepStrictEqual(resolveBiomeSlugsForPool(pool, chapter, 'banquise-imaginaire'), chapter);
  assert.strictEqual(resolveSousBiomePoolSlug('transition'), null);
  assert.strictEqual(resolveSousBiomePoolSlug('toundra_hiver'), 'toundra');
});

test('mode sous_biome : survit à la normalisation (autres valeurs → chapter)', () => {
  assert.strictEqual(normalizeQuestionPool({ biomeMode: 'sous_biome' }).biomeMode, 'sous_biome');
  assert.strictEqual(normalizeQuestionPool({ biomeMode: 'Sous-Biome' }).biomeMode, 'sous_biome');
  assert.strictEqual(normalizeQuestionPool({ biomeMode: 'custom' }).biomeMode, 'custom');
  assert.strictEqual(normalizeQuestionPool({ biomeMode: 'inconnu' }).biomeMode, 'chapter');
  const cfg = normalizeEventConfig(
    serializeEventConfig({ question: { mode: 'random', pool: { biomeMode: 'sous_biome' } } }),
  );
  assert.strictEqual(cfg.question.pool.biomeMode, 'sous_biome');
  // Sans sous-biome transmis, un appel historique (2 arguments) garde le chapitre.
  assert.deepStrictEqual(resolveBiomeSlugsForPool({ biomeMode: 'sous_biome' }, ['landes']), [
    'landes',
  ]);
});

test('drawQuestionFromMarker : mode sous_biome tire dans le biome de la case', async () => {
  const seen = [];
  const deps = {
    queryAll: async (sql, params) => {
      seen.push(params);
      return [{ question_code: 'QCM0101', question: 'Toundra ?', biome_slug: 'toundra' }];
    },
    queryOne: async () => ({
      question_code: 'QCM0101',
      question: 'Toundra ?',
      choix_a: 'a',
      choix_b: 'b',
      choix_c: 'c',
      choix_d: 'd',
      reponse_correcte: 'A',
      statut: 'actif',
    }),
  };
  const marker = (sousBiome) => ({
    event_type: 'quiz',
    sous_biome_slug: sousBiome,
    event_config_json: serializeEventConfig({
      question: { mode: 'random', pool: { biomeMode: 'sous_biome' } },
    }),
  });
  const draw = await drawQuestionFromMarker(deps, marker('toundra_hiver'), ['taiga', 'toundra']);
  assert.strictEqual(draw.questionCode, 'QCM0101');
  assert.deepStrictEqual(seen[0].slice(0, 1), ['toundra']);
  assert.ok(!seen[0].includes('taiga'), 'une case de toundra ne pioche pas dans la taïga');

  seen.length = 0;
  await drawQuestionFromMarker(deps, marker('transition'), ['taiga', 'toundra']);
  assert.deepStrictEqual(seen[0].slice(0, 2), ['taiga', 'toundra']);
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
