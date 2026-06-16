'use strict';

// Tests no-DB de la logique pure extraite de routes/gl/lore.js (O10).
// Aucun accès base/réseau : on charge directement le module helper.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  parseId,
  resolveLoreSettings,
  normalizeLoreQuestionCode,
  normalizeChapitreSlug,
  parseCsvQuery,
  LORE_QUESTION_SELECT,
  enrichLoreQuestionWithGlossary,
} = require('../lib/gl/loreRouteHelpers');

describe('parseId', () => {
  it('coerce un entier strictement positif', () => {
    assert.equal(parseId('42'), 42);
    assert.equal(parseId(7), 7);
  });
  it('tronque les décimaux vers l\'entier ("0.5" -> 0, "2.9" -> 2)', () => {
    assert.equal(parseId('0.5'), 0);
    assert.equal(parseId('2.9'), 2);
  });
  it('renvoie null pour valeurs invalides / nulles / non strictement positives', () => {
    assert.equal(parseId(null), null);
    assert.equal(parseId(undefined), null);
    assert.equal(parseId('abc'), null);
    assert.equal(parseId(-3), null);
    assert.equal(parseId(0), null);
  });
});

describe('resolveLoreSettings', () => {
  it('résout les bascules lore avec valeurs par défaut true et spoiler "recit"', () => {
    const out = resolveLoreSettings({}, {});
    assert.equal(out.effacementEnabled, true);
    assert.equal(out.gemmeCostsEnabled, true);
    assert.equal(out.heartRewardsEnabled, true);
    assert.equal(out.spoilerMaxLevel, 'recit');
    assert.ok('retrigger' in out);
  });
  it('honore le réglage spoiler global', () => {
    const out = resolveLoreSettings({}, { loreSpoilerMaxLevel: 'secret' });
    assert.equal(out.spoilerMaxLevel, 'secret');
  });
  it('un flag de partie à 0 désactive la bascule correspondante', () => {
    const out = resolveLoreSettings({ lore_effacement_enabled: 0 }, {});
    assert.equal(out.effacementEnabled, false);
    // les autres restent à leur défaut true
    assert.equal(out.gemmeCostsEnabled, true);
  });
});

describe('normalizeLoreQuestionCode', () => {
  it('trim et met en MAJUSCULES', () => {
    assert.equal(normalizeLoreQuestionCode('  q-12 '), 'Q-12');
  });
  it('renvoie null pour vide / nul', () => {
    assert.equal(normalizeLoreQuestionCode(''), null);
    assert.equal(normalizeLoreQuestionCode('   '), null);
    assert.equal(normalizeLoreQuestionCode(null), null);
    assert.equal(normalizeLoreQuestionCode(undefined), null);
  });
});

describe('normalizeChapitreSlug', () => {
  it('trim et met en minuscules', () => {
    assert.equal(normalizeChapitreSlug('  Chapitre-1  '), 'chapitre-1');
  });
  it('renvoie null pour null/undefined', () => {
    assert.equal(normalizeChapitreSlug(null), null);
    assert.equal(normalizeChapitreSlug(undefined), null);
  });
  it('renvoie null pour chaîne vide après trim', () => {
    assert.equal(normalizeChapitreSlug('   '), null);
  });
});

describe('parseCsvQuery', () => {
  it('découpe par virgule, trim, retire les vides', () => {
    assert.deepEqual(parseCsvQuery(' a, b ,,c '), ['a', 'b', 'c']);
  });
  it('renvoie [] pour valeur absente / vide', () => {
    assert.deepEqual(parseCsvQuery(undefined), []);
    assert.deepEqual(parseCsvQuery(''), []);
    assert.deepEqual(parseCsvQuery('   '), []);
  });
});

describe('LORE_QUESTION_SELECT', () => {
  it('est une constante SQL ciblant gl_qcm_lore_questions', () => {
    assert.equal(typeof LORE_QUESTION_SELECT, 'string');
    assert.match(LORE_QUESTION_SELECT, /FROM gl_qcm_lore_questions/);
    assert.match(LORE_QUESTION_SELECT, /SELECT question_code/);
  });
});

describe('enrichLoreQuestionWithGlossary', () => {
  it('renvoie [] pour une question nulle', async () => {
    assert.deepEqual(await enrichLoreQuestionWithGlossary(null, new Map()), []);
  });
  it('renvoie un tableau sans correspondance sur un glossaire vide', async () => {
    const out = await enrichLoreQuestionWithGlossary(
      { question: 'Texte', tags: '', mots_cles: '' },
      new Map(),
    );
    assert.ok(Array.isArray(out));
    assert.equal(out.length, 0);
  });
});
