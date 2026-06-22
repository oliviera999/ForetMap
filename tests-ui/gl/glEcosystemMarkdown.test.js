import { describe, test, expect } from 'vitest';
import {
  collectBiomeIllustrationKeys,
  markdownImageMatchesCatalogKeys,
  stripMarkdownCatalogImages,
  stripRedundantEcosystemHeadings,
  prepareEcosystemMarkdown,
} from '../../src/gl/utils/glEcosystemMarkdown.js';

describe('collectBiomeIllustrationKeys', () => {
  test('inclut les clés catalogue et alias legacy pour le Sahara', () => {
    const keys = collectBiomeIllustrationKeys('sahara', ['biome', 'biocenose']);
    expect(keys.has('biome_sahara')).toBe(true);
    expect(keys.has('biocenose_sahara')).toBe(true);
    expect(keys.has('biome-sahara-01')).toBe(true);
    expect(keys.has('coupe-sahara-sol')).toBe(true);
  });
});

describe('stripMarkdownCatalogImages', () => {
  test('retire une image legacy déjà affichée par le registre', () => {
    const keys = collectBiomeIllustrationKeys('sahara', ['biome']);
    const raw =
      'Milieu aride.\n\n![Biome](/uploads/media-library/image/gl-biome-sahara-01.png)\n\nSuite.';
    const cleaned = stripMarkdownCatalogImages(raw, keys);
    expect(cleaned).not.toMatch(/!\[/);
    expect(cleaned).toMatch(/Milieu aride/);
    expect(cleaned).toMatch(/Suite/);
  });

  test('conserve les images non liées au catalogue', () => {
    const keys = collectBiomeIllustrationKeys('sahara', ['biome']);
    const raw = 'Texte ![autre](https://example.com/photo.jpg) fin.';
    expect(stripMarkdownCatalogImages(raw, keys)).toBe(raw);
  });
});

describe('markdownImageMatchesCatalogKeys', () => {
  test('reconnaît une clé stable directe', () => {
    const keys = new Set(['biocenose_sahara']);
    expect(markdownImageMatchesCatalogKeys('biocenose_sahara', keys)).toBe(true);
  });
});

describe('stripRedundantEcosystemHeadings', () => {
  test('retire les titres ## Biotope / ## Biocénose', () => {
    const raw = '## Biotope\n\nTexte\n\n## Biocénose\n\nEspèces';
    expect(stripRedundantEcosystemHeadings(raw)).toBe('Texte\n\nEspèces');
  });
});

describe('prepareEcosystemMarkdown', () => {
  test('combine retrait titres et images catalogue', () => {
    const raw = [
      '## Biotope',
      'Description.',
      '![coupe](/uploads/media-library/image/gl-coupe-sahara-sol.png)',
    ].join('\n\n');
    const out = prepareEcosystemMarkdown(raw, 'sahara', ['biocenose']);
    expect(out).not.toMatch(/## Biotope/);
    expect(out).not.toMatch(/!\[/);
    expect(out).toMatch(/Description/);
  });
});
