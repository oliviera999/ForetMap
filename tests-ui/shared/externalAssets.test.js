import { afterEach, describe, expect, test } from 'vitest';

import {
  getExternalAssetsMode,
  normalizeExternalAssetsMode,
  remoteBrandFontFamilies,
  resolveExternalImageUrl,
  setExternalAssetsMode,
  unwrapRelayedImageUrl,
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

  test('relatives, data et blob restent ; http: vidé ; https: tiers relayé', () => {
    expect(resolveExternalImageUrl('/uploads/plants/1.jpg')).toBe('/uploads/plants/1.jpg');
    expect(resolveExternalImageUrl('data:image/png;base64,AAAA')).toBe(
      'data:image/png;base64,AAAA',
    );
    expect(resolveExternalImageUrl('http://upload.wikimedia.org/x.jpg')).toBe('');
    expect(resolveExternalImageUrl('')).toBe('');
    expect(resolveExternalImageUrl(null)).toBe('');
    const relayed = resolveExternalImageUrl('https://example.org/x.jpg');
    expect(relayed).toMatch(/\/api\/media\/remote\?url=/);
    expect(decodeURIComponent(relayed.split('url=')[1])).toBe('https://example.org/x.jpg');
  });
});

describe('resolveExternalImageUrl — même origine', () => {
  test('une image du site, même en http:, n’est ni vidée ni relayée', () => {
    const own = `${window.location.origin}/uploads/plants/1.jpg`;
    expect(resolveExternalImageUrl(own)).toBe(own);
    expect(resolveExternalImageUrl(own, { mode: 'external' })).toBe(own);
    // Un tiers en http: reste refusé.
    expect(resolveExternalImageUrl('http://upload.wikimedia.org/x.jpg')).toBe('');
  });
});

describe('unwrapRelayedImageUrl', () => {
  test('ramène une adresse relayée à l’image d’origine, laisse le reste tel quel', () => {
    const relayed = resolveExternalImageUrl(COMMONS, { mode: 'local' });
    expect(unwrapRelayedImageUrl(relayed)).toBe(COMMONS);
    expect(unwrapRelayedImageUrl(`/foretmap${relayed}`)).toBe(COMMONS);
    expect(unwrapRelayedImageUrl(COMMONS)).toBe(COMMONS);
    expect(unwrapRelayedImageUrl('/uploads/plants/1.jpg')).toBe('/uploads/plants/1.jpg');
    // Paramètre absent ou non https : rien n'est déballé.
    expect(unwrapRelayedImageUrl('/api/media/remote?url=http%3A%2F%2Fex.org%2Fx.png')).toBe(
      '/api/media/remote?url=http%3A%2F%2Fex.org%2Fx.png',
    );
    expect(unwrapRelayedImageUrl('')).toBe('');
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
