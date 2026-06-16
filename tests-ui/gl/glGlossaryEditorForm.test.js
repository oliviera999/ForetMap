import { describe, test, expect } from 'vitest';
import {
  EMPTY_FORM,
  termToForm,
  formToPayload,
  buildBiomeOptions,
  filterGlossaryItems,
} from '../../src/gl/utils/glGlossaryEditorForm.js';

describe('glGlossaryEditorForm - termToForm', () => {
  test('renvoie une copie du formulaire vierge pour un terme absent', () => {
    const form = termToForm(null);
    expect(form).toEqual(EMPTY_FORM);
    expect(form).not.toBe(EMPTY_FORM);
  });

  test('mappe les champs et joint les related_codes en termes_lies', () => {
    const form = termToForm({
      glossary_code: 'GL0007',
      terme: 'Mycorhize',
      categorie: 'biologie',
      niveau: 'avance',
      all_biomes: 1,
      biome_slugs: ['foret', 'prairie'],
      related_codes: ['GL0001', 'GL0002'],
      statut: 'inactif',
    });
    expect(form.glossary_code).toBe('GL0007');
    expect(form.terme).toBe('Mycorhize');
    expect(form.categorie).toBe('biologie');
    expect(form.niveau).toBe('avance');
    expect(form.all_biomes).toBe(true);
    expect(form.biome_slugs).toEqual(['foret', 'prairie']);
    expect(form.termes_lies).toBe('GL0001, GL0002');
    expect(form.statut).toBe('inactif');
  });

  test('applique les valeurs par défaut sur champs manquants', () => {
    const form = termToForm({ terme: 'X' });
    expect(form.categorie).toBe('ecologie');
    expect(form.niveau).toBe('base');
    expect(form.statut).toBe('actif');
    expect(form.all_biomes).toBe(false);
    expect(form.biome_slugs).toEqual([]);
    expect(form.termes_lies).toBe('');
  });

  test('copie les biome_slugs sans partager la référence', () => {
    const src = ['a'];
    const form = termToForm({ biome_slugs: src });
    expect(form.biome_slugs).toEqual(['a']);
    expect(form.biome_slugs).not.toBe(src);
  });
});

describe('glGlossaryEditorForm - formToPayload', () => {
  test('élide un code vide après trim', () => {
    const payload = formToPayload({ ...EMPTY_FORM, glossary_code: '   ' });
    expect(payload.glossary_code).toBeUndefined();
  });

  test('conserve un code non vide en le trimant', () => {
    const payload = formToPayload({ ...EMPTY_FORM, glossary_code: ' GL0001 ' });
    expect(payload.glossary_code).toBe('GL0001');
  });

  test('vide les biomes quand all_biomes est vrai', () => {
    const payload = formToPayload({
      ...EMPTY_FORM,
      all_biomes: true,
      biome_slugs: ['foret'],
    });
    expect(payload.biome_slugs).toEqual([]);
  });

  test('conserve les biomes quand all_biomes est faux', () => {
    const payload = formToPayload({
      ...EMPTY_FORM,
      all_biomes: false,
      biome_slugs: ['foret', 'prairie'],
    });
    expect(payload.biome_slugs).toEqual(['foret', 'prairie']);
  });
});

describe('glGlossaryEditorForm - buildBiomeOptions', () => {
  test('mappe slug/nom et retombe sur le slug', () => {
    expect(buildBiomeOptions([{ slug: 'foret', nom: 'Forêt' }, { slug: 'x' }])).toEqual([
      { value: 'foret', label: 'Forêt' },
      { value: 'x', label: 'x' },
    ]);
  });

  test('tolère une entrée nulle', () => {
    expect(buildBiomeOptions(null)).toEqual([]);
    expect(buildBiomeOptions(undefined)).toEqual([]);
  });
});

describe('glGlossaryEditorForm - filterGlossaryItems', () => {
  const items = [
    {
      glossary_code: 'GL0001',
      terme: 'Symbiose',
      categorie: 'biologie',
      definition_courte: 'Vivre ensemble',
    },
    {
      glossary_code: 'GL0002',
      terme: 'Canopée',
      categorie: 'ecologie',
      definition_courte: 'Sommet des arbres',
    },
    { glossary_code: 'GL0003', terme: 'Humus', categorie: 'ecologie' },
  ];

  test('renvoie tout sans filtre', () => {
    expect(filterGlossaryItems(items)).toHaveLength(3);
    expect(filterGlossaryItems(items, {})).toHaveLength(3);
  });

  test('filtre par catégorie', () => {
    const out = filterGlossaryItems(items, { filterCategorie: 'ecologie' });
    expect(out.map((r) => r.glossary_code)).toEqual(['GL0002', 'GL0003']);
  });

  test('filtre par recherche sur terme, code et définition (insensible à la casse)', () => {
    expect(filterGlossaryItems(items, { filterQ: 'canop' })).toHaveLength(1);
    expect(filterGlossaryItems(items, { filterQ: 'GL0001' })[0].terme).toBe('Symbiose');
    expect(filterGlossaryItems(items, { filterQ: 'ENSEMBLE' })[0].terme).toBe('Symbiose');
  });

  test('combine catégorie et recherche', () => {
    const out = filterGlossaryItems(items, { filterCategorie: 'ecologie', filterQ: 'humus' });
    expect(out.map((r) => r.glossary_code)).toEqual(['GL0003']);
  });

  test('tolère une définition courte absente et une liste nulle', () => {
    expect(filterGlossaryItems(null, { filterQ: 'x' })).toEqual([]);
    expect(filterGlossaryItems(items, { filterQ: '   ' })).toHaveLength(3);
  });
});
