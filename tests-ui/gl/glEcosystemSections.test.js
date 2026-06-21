import { describe, test, expect } from 'vitest';
import {
  splitMarkdownByBiomes,
  buildEcosystemSections,
} from '../../src/gl/utils/glEcosystemSections.js';

describe('splitMarkdownByBiomes', () => {
  test('retourne le texte entier pour un seul biome', () => {
    const biomes = [{ slug: 'sahara', nom: 'Désert chaud (Sahara)' }];
    const map = splitMarkdownByBiomes('## Biotope\n\nChaleur extrême', biomes);
    expect(map.get('sahara')).toBe('## Biotope\n\nChaleur extrême');
  });

  test('répartit les sections ## par nom de biome', () => {
    const biomes = [
      { slug: 'sahara', nom: 'Désert chaud (Sahara)' },
      { slug: 'jungle_afc', nom: "Jungle d'Afrique centrale" },
    ];
    const markdown = [
      'Intro commune',
      '## Désert chaud (Sahara)',
      'Milieu aride.',
      "## Jungle d'Afrique centrale",
      'Milieu humide.',
    ].join('\n\n');
    const map = splitMarkdownByBiomes(markdown, biomes);
    expect(map.get('sahara')).toMatch(/Intro commune/);
    expect(map.get('sahara')).toMatch(/Milieu aride/);
    expect(map.get('jungle_afc')).toMatch(/Milieu humide/);
  });
});

describe('buildEcosystemSections', () => {
  test('sans biome catalogue : une section générique', () => {
    const sections = buildEcosystemSections([], 'Biotope A', 'Biocénose B');
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({
      slug: null,
      nom: 'Écosystème',
      biotopeMarkdown: 'Biotope A',
      biocenoseMarkdown: 'Biocénose B',
    });
  });

  test('plusieurs biomes : une section par écosystème', () => {
    const sections = buildEcosystemSections(
      [
        { slug: 'sahara', nom: 'Désert chaud (Sahara)' },
        { slug: 'jungle_afc', nom: "Jungle d'Afrique centrale" },
      ],
      '## Désert chaud (Sahara)\n\nSec',
      "## Jungle d'Afrique centrale\n\nHumide",
    );
    expect(sections).toHaveLength(2);
    expect(sections[0].biotopeMarkdown).toMatch(/Sec/);
    expect(sections[1].biocenoseMarkdown).toMatch(/Humide/);
  });
});
