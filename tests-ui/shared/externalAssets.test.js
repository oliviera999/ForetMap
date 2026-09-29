import { afterEach, describe, expect, test } from 'vitest';

import {
  getExternalAssetsMode,
  normalizeExternalAssetsMode,
  remoteBrandFontFamilies,
  resolveExternalImageUrl,
  setExternalAssetsMode,
  wikimediaThumbUrl,
} from '../../src/shared/privacy/externalAssets.js';

const COMMONS = 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Malus.jpg';

afterEach(() => setExternalAssetsMode('local'));

describe('mode des ressources tierces', () => {
  test('toute valeur inconnue retombe sur « local »', () => {
    expect(normalizeExternalAssetsMode('external')).toBe('external');
    expect(normalizeExternalAssetsMode('EXTERNAL')).toBe('local');
    expect(normalizeExternalAssetsMode(undefined)).toBe('local');
    expect(getExternalAssetsMode()).toBe('local');
    setExternalAssetsMode('external');
    expect(getExternalAssetsMode()).toBe('external');
  });
});

describe('resolveExternalImageUrl', () => {
  test('en mode local, une image Wikimedia passe par le relais du serveur', () => {
    const out = resolveExternalImageUrl(COMMONS);
    expect(out).toMatch(/\/api\/media\/remote\?url=/);
    expect(decodeURIComponent(out.split('url=')[1])).toBe(COMMONS);
  });

  test('en mode external, l’URL d’origine est conservée', () => {
    expect(resolveExternalImageUrl(COMMONS, { mode: 'external' })).toBe(COMMONS);
    setExternalAssetsMode('external');
    expect(resolveExternalImageUrl(COMMONS)).toBe(COMMONS);
  });

  test('les autres URL ne sont jamais réécrites', () => {
    for (const url of [
      '/uploads/plants/1.jpg',
      'data:image/png;base64,AAAA',
      'http://upload.wikimedia.org/x.jpg',
      'https://example.org/x.jpg',
      'https://upload.wikimedia.org.evil.test/x.jpg',
      '',
      null,
    ]) {
      expect(resolveExternalImageUrl(url)).toBe(url);
    }
  });
});

// Audit photos PH-M1 : les tuiles chargeaient l'original Wikimedia (souvent plusieurs Mo).
describe('wikimediaThumbUrl', () => {
  test('original → vignette à la largeur standard immédiatement supérieure', () => {
    expect(wikimediaThumbUrl(COMMONS, 200)).toBe(
      'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Malus.jpg/250px-Malus.jpg',
    );
  });

  test('vignette existante : seule la largeur change ; SVG rendu en PNG', () => {
    expect(
      wikimediaThumbUrl(
        'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Malus.jpg/1024px-Malus.jpg',
        300,
      ),
    ).toBe('https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Malus.jpg/330px-Malus.jpg');
    expect(
      wikimediaThumbUrl('https://upload.wikimedia.org/wikipedia/commons/1/1f/Leaf.svg', 100),
    ).toBe('https://upload.wikimedia.org/wikipedia/commons/thumb/1/1f/Leaf.svg/120px-Leaf.svg.png');
  });

  test('autres URL et largeur absente : inchangées', () => {
    expect(wikimediaThumbUrl('/uploads/plants/1.jpg', 200)).toBe('/uploads/plants/1.jpg');
    expect(wikimediaThumbUrl('https://commons.wikimedia.org/wiki/File:X.jpg', 200)).toBe(
      'https://commons.wikimedia.org/wiki/File:X.jpg',
    );
    expect(wikimediaThumbUrl(COMMONS, 0)).toBe(COMMONS);
  });

  test('resolveExternalImageUrl({ width }) relaie la vignette, pas l’original', () => {
    const out = resolveExternalImageUrl(COMMONS, { width: 400 });
    expect(decodeURIComponent(out.split('url=')[1])).toMatch(
      /\/thumb\/a\/ab\/Malus\.jpg\/500px-Malus\.jpg$/,
    );
  });
});

describe('remoteBrandFontFamilies', () => {
  test('aucune police distante en mode local', () => {
    expect(remoteBrandFontFamilies(['Lora', 'Caudex'], 'local')).toEqual([]);
  });

  test('en mode external, seules les familles non embarquées sont demandées', () => {
    expect(remoteBrandFontFamilies(['Caudex', 'Cinzel', 'Lora', ' '], 'external')).toEqual([
      'Lora',
    ]);
  });
});
