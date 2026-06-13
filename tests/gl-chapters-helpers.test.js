'use strict';

// Tests no-DB de la logique pure extraite de routes/gl/chapters.js (O10).
// Aucun accès base/réseau : on charge directement le module helper.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeSlug,
  clampPercent,
  toPositiveInt,
  parsePlateauNumber,
  normalizeMapImageFrame,
  parseMapImageFrameJson,
  attachChapterTheme,
  attachChapterBiomes,
  attachChapterSpells,
} = require('../lib/gl/chaptersRouteHelpers');

describe('normalizeSlug', () => {
  it('met en minuscules et coupe les espaces', () => {
    assert.equal(normalizeSlug('  Foret-Noire  '), 'foret-noire');
    assert.equal(normalizeSlug('ABC'), 'abc');
  });
  it('renvoie une chaîne vide pour null/undefined/vide', () => {
    assert.equal(normalizeSlug(null), '');
    assert.equal(normalizeSlug(undefined), '');
    assert.equal(normalizeSlug('   '), '');
  });
});

describe('clampPercent', () => {
  it('borne entre 0 et 100', () => {
    assert.equal(clampPercent(-5), 0);
    assert.equal(clampPercent(150), 100);
    assert.equal(clampPercent('42'), 42);
    assert.equal(clampPercent(0), 0);
    assert.equal(clampPercent(100), 100);
  });
  it('renvoie null pour valeurs non finies', () => {
    assert.equal(clampPercent('abc'), null);
    assert.equal(clampPercent(NaN), null);
    assert.equal(clampPercent(undefined), null);
  });
});

describe('toPositiveInt', () => {
  it('plancher à 0 et tronque', () => {
    assert.equal(toPositiveInt(3.9), 3);
    assert.equal(toPositiveInt(-2), 0);
    assert.equal(toPositiveInt('7'), 7);
  });
  it('utilise le fallback pour valeurs non finies', () => {
    assert.equal(toPositiveInt('x'), 0);
    assert.equal(toPositiveInt('x', 5), 5);
    assert.equal(toPositiveInt(undefined, 9), 9);
  });
});

describe('parsePlateauNumber', () => {
  it('accepte les entiers 1..5', () => {
    assert.equal(parsePlateauNumber(1), 1);
    assert.equal(parsePlateauNumber('5'), 5);
    assert.equal(parsePlateauNumber(3.7), 3);
  });
  it('renvoie null hors plage / vide / invalide', () => {
    assert.equal(parsePlateauNumber(0), null);
    assert.equal(parsePlateauNumber(6), null);
    assert.equal(parsePlateauNumber(null), null);
    assert.equal(parsePlateauNumber(''), null);
    assert.equal(parsePlateauNumber('abc'), null);
  });
});

describe('normalizeMapImageFrame', () => {
  it('renvoie le cadre par défaut pour null', () => {
    const frame = normalizeMapImageFrame(null);
    assert.ok(frame && typeof frame === 'object');
  });
  it('renvoie null pour les non-objets / tableaux', () => {
    assert.equal(normalizeMapImageFrame('foo'), null);
    assert.equal(normalizeMapImageFrame(42), null);
    assert.equal(normalizeMapImageFrame([]), null);
  });
  it('normalise un objet fourni', () => {
    const frame = normalizeMapImageFrame({ focalX: 10 });
    assert.ok(frame && typeof frame === 'object');
  });
});

describe('parseMapImageFrameJson', () => {
  it('renvoie le cadre par défaut pour valeur falsy', () => {
    const frame = parseMapImageFrameJson('');
    assert.ok(frame && typeof frame === 'object');
  });
  it('parse un JSON valide', () => {
    const frame = parseMapImageFrameJson(JSON.stringify({ focalX: 20 }));
    assert.ok(frame && typeof frame === 'object');
  });
  it('retombe sur le cadre par défaut pour un JSON invalide', () => {
    const fallback = parseMapImageFrameJson('{not-json');
    const def = parseMapImageFrameJson('');
    assert.deepEqual(fallback, def);
  });
});

describe('attachChapterTheme', () => {
  it('attache theme et supprime theme_json', () => {
    const chapter = { id: 1, theme_json: null };
    const out = attachChapterTheme(chapter);
    assert.equal(out, chapter);
    assert.ok('theme' in chapter);
    assert.equal('theme_json' in chapter, false);
  });
  it('passe-plat pour valeur falsy', () => {
    assert.equal(attachChapterTheme(null), null);
  });
});

describe('attachChapterBiomes', () => {
  it('affecte les biomes depuis la map (clé numérique)', () => {
    const map = new Map([[1, [{ slug: 'a' }]]]);
    const chapter = { id: 1 };
    attachChapterBiomes(chapter, map);
    assert.deepEqual(chapter.biomes, [{ slug: 'a' }]);
  });
  it('tableau vide si absent de la map', () => {
    const chapter = { id: 99 };
    attachChapterBiomes(chapter, new Map());
    assert.deepEqual(chapter.biomes, []);
  });
  it('passe-plat pour chapitre falsy', () => {
    assert.equal(attachChapterBiomes(null, new Map()), null);
  });
});

describe('attachChapterSpells', () => {
  it('affecte les sorts depuis la map (clé numérique)', () => {
    const map = new Map([[2, [{ code: 'FEU' }]]]);
    const chapter = { id: 2 };
    attachChapterSpells(chapter, map);
    assert.deepEqual(chapter.spells, [{ code: 'FEU' }]);
  });
  it('tableau vide si absent de la map', () => {
    const chapter = { id: 5 };
    attachChapterSpells(chapter, new Map());
    assert.deepEqual(chapter.spells, []);
  });
  it('passe-plat pour chapitre falsy', () => {
    assert.equal(attachChapterSpells(undefined, new Map()), undefined);
  });
});
