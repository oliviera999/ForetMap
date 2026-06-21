'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  normalizeEventConfig,
  resolveChapitreSlugsForPool,
  serializeEventConfig,
} = require('../lib/glMarkerEventConfig');
const {
  queryLoreQuestionPool,
  drawLoreQuestionFromMarker,
} = require('../lib/glMarkerLoreQuestionPool');
const { isLoreQuestionCode } = require('../lib/glQcmResolve');

test('resolveChapitreSlugsForPool mode chapter inclut tous et chN', () => {
  assert.deepStrictEqual(
    resolveChapitreSlugsForPool({ chapitreMode: 'chapter', chapitreSlugs: [] }, 3),
    ['tous', 'ch3'],
  );
  assert.deepStrictEqual(
    resolveChapitreSlugsForPool({ chapitreMode: 'custom', chapitreSlugs: ['ch0'] }, 3),
    ['ch0', 'tous'],
  );
});

test('isLoreQuestionCode distingue LQCM et QCM', () => {
  assert.strictEqual(isLoreQuestionCode('LQCM0001'), true);
  assert.strictEqual(isLoreQuestionCode('QCM0001'), false);
});

test('normalizeEventConfig valide une config question lore fixe', () => {
  const cfg = normalizeEventConfig({
    version: 1,
    question: {
      set: 'lore',
      mode: 'fixed',
      fixedQuestionCode: 'lqcm0042',
      pool: { chapitreMode: 'chapter' },
    },
  });
  assert.strictEqual(cfg.question.set, 'lore');
  assert.strictEqual(cfg.question.fixedQuestionCode, 'LQCM0042');
});

test('queryLoreQuestionPool filtre chapitre et tier_lore', async () => {
  const rows = [
    {
      question_code: 'LQCM0001',
      question: 'A',
      chapitre_slug: 'tous',
      tier_lore: 'cle',
      statut: 'actif',
      tags: '',
      mots_cles: '',
    },
    {
      question_code: 'LQCM0002',
      question: 'B',
      chapitre_slug: 'ch3',
      tier_lore: 'recit',
      statut: 'actif',
      tags: '',
      mots_cles: '',
    },
  ];
  const deps = {
    queryAll: async (sql, params) => {
      let result = rows;
      if (sql.includes('chapitre_slug IN')) {
        const slugParams = params.filter(
          (p) => typeof p === 'string' && (p === 'tous' || p.startsWith('ch')),
        );
        result = result.filter((row) => slugParams.includes(row.chapitre_slug));
      }
      if (sql.includes('tier_lore IN')) {
        const tiers = params.filter((p) => p === 'cle' || p === 'recit');
        result = result.filter((row) => tiers.includes(row.tier_lore));
      }
      return result;
    },
  };
  const { items } = await queryLoreQuestionPool(deps, {
    pool: {
      chapitreMode: 'custom',
      chapitreSlugs: ['tous'],
      tierLore: ['cle'],
    },
    chapterPlateauNumber: null,
  });
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].question_code, 'LQCM0001');
});

test('drawLoreQuestionFromMarker mode fixed', async () => {
  const deps = {
    queryOne: async () => ({
      question_code: 'LQCM0001',
      question: 'Test?',
      choix_a: 'a',
      choix_b: 'b',
      choix_c: '',
      choix_d: '',
      choix_e: '',
      reponse_correcte: 'A',
      statut: 'actif',
    }),
    queryAll: async () => [],
  };
  const draw = await drawLoreQuestionFromMarker(
    deps,
    {
      event_type: 'question',
      event_config_json: serializeEventConfig({
        version: 1,
        question: {
          set: 'lore',
          mode: 'fixed',
          fixedQuestionCode: 'LQCM0001',
          pool: { chapitreMode: 'chapter' },
        },
      }),
    },
    3,
  );
  assert.strictEqual(draw.questionCode, 'LQCM0001');
  assert.strictEqual(draw.error, null);
  assert.strictEqual(draw.qcmSet, 'lore');
});
