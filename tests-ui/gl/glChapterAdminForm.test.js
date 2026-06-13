import { describe, test, expect } from 'vitest';
import {
  EMPTY_CHAPTER_FORM,
  allSpellCodesFrom,
  chapterDetailToForm,
  chapterFormToPayload,
  groupSpellsByCategory,
  moveBiomeSlug,
} from '../../src/gl/utils/glChapterAdminForm.js';

describe('moveBiomeSlug', () => {
  test('déplace un slug vers le haut', () => {
    expect(moveBiomeSlug(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
  });

  test('déplace un slug vers le bas', () => {
    expect(moveBiomeSlug(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
  });

  test('renvoie la liste inchangée si le slug est absent', () => {
    expect(moveBiomeSlug(['a', 'b'], 'z', 1)).toEqual(['a', 'b']);
  });

  test('renvoie la liste inchangée hors bornes (haut)', () => {
    expect(moveBiomeSlug(['a', 'b'], 'a', -1)).toEqual(['a', 'b']);
  });

  test('renvoie la liste inchangée hors bornes (bas)', () => {
    expect(moveBiomeSlug(['a', 'b'], 'b', 1)).toEqual(['a', 'b']);
  });

  test('ne mute pas la liste source', () => {
    const src = ['a', 'b', 'c'];
    moveBiomeSlug(src, 'a', 1);
    expect(src).toEqual(['a', 'b', 'c']);
  });
});

describe('chapterDetailToForm', () => {
  test('mappe les champs et normalise les valeurs nulles', () => {
    const form = chapterDetailToForm({
      chapter: {
        slug: 'foret',
        title: 'Forêt',
        biome: null,
        biomes: [{ slug: 'temperate' }, { slug: 'boreal' }],
        spells: [{ spell_code: 'AGUA' }, { spell_code: 'IGNI' }],
        map_image_url: '/img.png',
        story_markdown: 'Récit',
        biotope_markdown: null,
        biocenose_markdown: null,
        sortileges_markdown: null,
        order_index: '3',
        plateau_number: 2,
        theme: null,
      },
    });
    expect(form.slug).toBe('foret');
    expect(form.title).toBe('Forêt');
    expect(form.biome).toBe('');
    expect(form.biomeSlugs).toEqual(['temperate', 'boreal']);
    expect(form.spellCodes).toEqual(['AGUA', 'IGNI']);
    expect(form.mapImageUrl).toBe('/img.png');
    expect(form.storyMarkdown).toBe('Récit');
    expect(form.biotopeMarkdown).toBe('');
    expect(form.orderIndex).toBe(3);
    expect(form.plateauNumber).toBe('2');
  });

  test('plateau absent → chaîne vide', () => {
    const form = chapterDetailToForm({ chapter: { slug: 's', plateau_number: null } });
    expect(form.plateauNumber).toBe('');
    expect(form.biomeSlugs).toEqual([]);
    expect(form.spellCodes).toEqual([]);
  });
});

describe('chapterFormToPayload', () => {
  test('coerce ordre et plateau, conserve les autres champs', () => {
    const payload = chapterFormToPayload({
      ...EMPTY_CHAPTER_FORM,
      slug: 'foret',
      orderIndex: '4',
      plateauNumber: '3',
    });
    expect(payload.slug).toBe('foret');
    expect(payload.orderIndex).toBe(4);
    expect(payload.plateauNumber).toBe(3);
  });

  test('plateau vide → null, ordre invalide → 0', () => {
    const payload = chapterFormToPayload({
      ...EMPTY_CHAPTER_FORM,
      orderIndex: 'abc',
      plateauNumber: '',
    });
    expect(payload.plateauNumber).toBeNull();
    expect(payload.orderIndex).toBe(0);
  });
});

describe('groupSpellsByCategory', () => {
  test('regroupe par catégorie et trie par nom (fr)', () => {
    const groups = groupSpellsByCategory([
      { spell_code: 'A', category_slug: 'zeta', category_nom: 'Zêta' },
      { spell_code: 'B', category_slug: 'alpha', category_nom: 'Alpha' },
      { spell_code: 'C', category_slug: 'alpha', category_nom: 'Alpha' },
    ]);
    expect(groups.map((g) => g.slug)).toEqual(['alpha', 'zeta']);
    expect(groups[0].spells).toHaveLength(2);
  });

  test('catégorie manquante → slug "autre"', () => {
    const groups = groupSpellsByCategory([{ spell_code: 'A' }]);
    expect(groups[0].slug).toBe('autre');
  });

  test('catalogue vide → tableau vide', () => {
    expect(groupSpellsByCategory([])).toEqual([]);
  });
});

describe('allSpellCodesFrom', () => {
  test('liste les codes trimmés non vides', () => {
    expect(allSpellCodesFrom([
      { spell_code: ' AGUA ' },
      { spell_code: '' },
      { spell_code: null },
      { spell_code: 'IGNI' },
    ])).toEqual(['AGUA', 'IGNI']);
  });
});
