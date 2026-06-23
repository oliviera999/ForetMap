'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../lib/shared/resourceQuestionGatingCore');

test('normalisations de base', () => {
  assert.equal(core.normalizeMode('ANY'), 'any');
  assert.equal(core.normalizeMode('inherit'), 'inherit');
  assert.equal(core.normalizeMode('bidon'), null);
  assert.equal(core.normalizeGranularity('Team'), 'team');
  assert.equal(core.normalizeGranularity('bidon'), null);
  assert.equal(core.normalizeResourceType('Tutorial', core.FORETMAP_RESOURCE_TYPES), 'tutorial');
  assert.equal(core.normalizeResourceType('feuillet', core.FORETMAP_RESOURCE_TYPES), null);
  assert.equal(core.normalizeResourceType('feuillet', core.GL_RESOURCE_TYPES), 'feuillet');
  assert.equal(core.normalizeResourceRef('  QF0001  '), 'QF0001');
  assert.equal(core.normalizeResourceRef('x'.repeat(65)), null);
  assert.equal(core.normalizeQuestionCode('  GQCM0001 '), 'GQCM0001');
  assert.equal(core.clampRequiredCorrect(0), 1);
  assert.equal(core.clampRequiredCorrect(999), core.MAX_REQUIRED_CORRECT);
  assert.equal(core.clampRequiredCorrect('3'), 3);
});

test('sanitizeLinkInput — ForetMap (sans dataset)', () => {
  const ok = core.sanitizeLinkInput(
    {
      resource_type: 'plant',
      resource_ref: '42',
      question_code: 'QF0001',
      is_gating: false,
      weight: 2,
    },
    { allowedResourceTypes: core.FORETMAP_RESOURCE_TYPES },
  );
  assert.equal(ok.ok, true);
  assert.equal(ok.value.resource_type, 'plant');
  assert.equal(ok.value.is_gating, 0);
  assert.equal(ok.value.weight, 2);
  assert.equal(ok.value.origin, 'manual');
  assert.equal(ok.value.status, 'approved');

  const badType = core.sanitizeLinkInput(
    { resource_type: 'feuillet', resource_ref: '42', question_code: 'QF0001' },
    { allowedResourceTypes: core.FORETMAP_RESOURCE_TYPES },
  );
  assert.equal(badType.ok, false);
});

test('sanitizeLinkInput — GL (dataset obligatoire + confiance)', () => {
  const missing = core.sanitizeLinkInput(
    { resource_type: 'species', resource_ref: 'SL01', question_code: 'GQCM0001' },
    { allowedResourceTypes: core.GL_RESOURCE_TYPES, requireDataset: true },
  );
  assert.equal(missing.ok, false);

  const ok = core.sanitizeLinkInput(
    {
      question_dataset: 'qcm',
      resource_type: 'species',
      resource_ref: 'SL01',
      question_code: 'GQCM0001',
      confidence: 0.8,
    },
    { allowedResourceTypes: core.GL_RESOURCE_TYPES, requireDataset: true },
  );
  assert.equal(ok.ok, true);
  assert.equal(ok.value.question_dataset, 'qcm');
  assert.equal(ok.value.confidence, 0.8);

  const badConf = core.sanitizeLinkInput(
    {
      question_dataset: 'qcm',
      resource_type: 'species',
      resource_ref: 'SL01',
      question_code: 'GQCM0001',
      confidence: 2,
    },
    { allowedResourceTypes: core.GL_RESOURCE_TYPES, requireDataset: true },
  );
  assert.equal(badConf.ok, false);
});

test('resolveEffectivePolicy — defauts site, surcharge ressource, granularite chapitre', () => {
  const site = {
    enabled: false,
    granularity: 'player',
    defaultMode: 'any',
    defaultRequiredCorrect: 1,
  };

  // Aucune politique ressource + site OFF => off.
  const a = core.resolveEffectivePolicy({ site });
  assert.equal(a.enabled, false);
  assert.equal(a.mode, 'off');
  assert.equal(a.granularity, 'player');

  // Surcharge ressource activee en mode threshold.
  const b = core.resolveEffectivePolicy({
    perResource: { enabled: 1, mode: 'threshold', required_correct: 3 },
    site,
  });
  assert.equal(b.enabled, true);
  assert.equal(b.mode, 'threshold');
  assert.equal(b.requiredCorrect, 3);

  // mode 'inherit' sur la ressource => reprend le mode du site.
  const c = core.resolveEffectivePolicy({
    perResource: { enabled: 1, mode: 'inherit' },
    site: { ...site, defaultMode: 'all' },
  });
  assert.equal(c.mode, 'all');

  // Granularite surchargee par le chapitre/scope.
  const d = core.resolveEffectivePolicy({ chapterGranularity: 'team', site });
  assert.equal(d.granularity, 'team');
});

test('evaluateUnlock — modes any / all / threshold / off / sans lien bloquant', () => {
  const links = [
    { question_code: 'QF0001', is_gating: 1 },
    { question_code: 'QF0002', is_gating: 1 },
    { question_code: 'QF0003', is_gating: 0 }, // non bloquant : ignore
  ];

  // any : une bonne reponse suffit.
  assert.equal(core.evaluateUnlock({ links, correctRefs: ['QF0001'], mode: 'any' }), true);
  assert.equal(core.evaluateUnlock({ links, correctRefs: ['QF0003'], mode: 'any' }), false);

  // all : il faut les deux questions bloquantes.
  assert.equal(core.evaluateUnlock({ links, correctRefs: ['QF0001'], mode: 'all' }), false);
  assert.equal(
    core.evaluateUnlock({ links, correctRefs: ['QF0001', 'QF0002'], mode: 'all' }),
    true,
  );

  // threshold : seuil de 2.
  assert.equal(
    core.evaluateUnlock({ links, correctRefs: ['QF0001'], mode: 'threshold', requiredCorrect: 2 }),
    false,
  );
  assert.equal(
    core.evaluateUnlock({
      links,
      correctRefs: ['QF0001', 'QF0002'],
      mode: 'threshold',
      requiredCorrect: 2,
    }),
    true,
  );

  // off => toujours debloque (non bloquant).
  assert.equal(core.evaluateUnlock({ links, correctRefs: [], mode: 'off' }), true);

  // Aucun lien bloquant => non bloquant.
  assert.equal(
    core.evaluateUnlock({
      links: [{ question_code: 'QF0009', is_gating: 0 }],
      correctRefs: [],
      mode: 'all',
    }),
    true,
  );
});
