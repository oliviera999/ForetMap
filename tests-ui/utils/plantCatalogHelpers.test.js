import { describe, test, expect } from 'vitest';
import {
  EMPTY_PLANT_FORM,
  isVegetalCatalogEntry,
  extractPlantForm,
  groupPlantLocationsByMap,
  prefillPhotoSlotKey,
} from '../../src/utils/plantCatalogHelpers.js';

describe('EMPTY_PLANT_FORM', () => {
  test('contient les champs fondamentaux avec des chaînes vides par défaut', () => {
    expect(EMPTY_PLANT_FORM).toHaveProperty('name', '');
    expect(EMPTY_PLANT_FORM).toHaveProperty('emoji', '🌱');
    expect(EMPTY_PLANT_FORM).toHaveProperty('scientific_name', '');
    expect(EMPTY_PLANT_FORM).toHaveProperty('photo', '');
    expect(EMPTY_PLANT_FORM).toHaveProperty('photo_species', '');
  });

  test('contient tous les champs photo', () => {
    const photoKeys = ['photo', 'photo_species', 'photo_leaf', 'photo_flower', 'photo_fruit', 'photo_harvest_part'];
    for (const k of photoKeys) {
      expect(EMPTY_PLANT_FORM).toHaveProperty(k, '');
    }
  });
});

describe('isVegetalCatalogEntry', () => {
  test('vrai si group_1 contient "végétal" (insensible à la casse)', () => {
    expect(isVegetalCatalogEntry({ group_1: 'Végétal (Chlorobiontes)' })).toBe(true);
    expect(isVegetalCatalogEntry({ group_1: 'VÉGÉTAL' })).toBe(true);
    expect(isVegetalCatalogEntry({ group_1: 'végétal' })).toBe(true);
  });

  test('faux pour les autres groupes', () => {
    expect(isVegetalCatalogEntry({ group_1: 'Animal' })).toBe(false);
    expect(isVegetalCatalogEntry({ group_1: 'Champignon' })).toBe(false);
    expect(isVegetalCatalogEntry({ group_1: '' })).toBe(false);
  });

  test('faux si group_1 est absent/null', () => {
    expect(isVegetalCatalogEntry({})).toBe(false);
    expect(isVegetalCatalogEntry({ group_1: null })).toBe(false);
    expect(isVegetalCatalogEntry({ group_1: '-' })).toBe(false);
  });
});

describe('extractPlantForm', () => {
  test('retourne tous les champs de EMPTY_PLANT_FORM', () => {
    const form = extractPlantForm({});
    expect(Object.keys(form)).toEqual(Object.keys(EMPTY_PLANT_FORM));
  });

  test('copie les valeurs de la fiche et normalise', () => {
    const plant = { name: '  Tomate  ', scientific_name: '-', emoji: '🍅' };
    const form = extractPlantForm(plant);
    expect(form.name).toBe('Tomate');
    expect(form.scientific_name).toBe('');
    expect(form.emoji).toBe('🍅');
  });

  test('remplace emoji vide par 🌱', () => {
    const form = extractPlantForm({ name: 'Test', emoji: '' });
    expect(form.emoji).toBe('🌱');
  });

  test('remplace emoji "-" par 🌱 (valeur normalisée vide)', () => {
    const form = extractPlantForm({ name: 'Test', emoji: '-' });
    expect(form.emoji).toBe('🌱');
  });

  test('fonctionne sans argument (plante vide)', () => {
    const form = extractPlantForm();
    expect(form.name).toBe('');
    expect(form.emoji).toBe('🌱');
  });

  test('ne modifie pas EMPTY_PLANT_FORM (pas de mutation)', () => {
    const form = extractPlantForm({ name: 'Test' });
    form.name = 'Modifié';
    expect(EMPTY_PLANT_FORM.name).toBe('');
  });
});

describe('groupPlantLocationsByMap', () => {
  test('regroupe zones et repères par map_id', () => {
    const zones = [{ id: 1, map_id: 'map1' }, { id: 2, map_id: 'map2' }];
    const markers = [{ id: 10, map_id: 'map1' }];
    const groups = groupPlantLocationsByMap(zones, markers);
    expect(groups.get('map1').zones).toHaveLength(1);
    expect(groups.get('map1').markers).toHaveLength(1);
    expect(groups.get('map2').zones).toHaveLength(1);
    expect(groups.get('map2').markers).toHaveLength(0);
  });

  test('map_id absent/null/vide → clé "foret"', () => {
    const zones = [{ id: 1 }, { id: 2, map_id: '' }, { id: 3, map_id: null }];
    const groups = groupPlantLocationsByMap(zones, []);
    expect(groups.get('foret').zones).toHaveLength(3);
  });

  test('listes nulles/undefined → Map vide', () => {
    expect(groupPlantLocationsByMap(null, null).size).toBe(0);
    expect(groupPlantLocationsByMap(undefined, undefined).size).toBe(0);
    expect(groupPlantLocationsByMap([], []).size).toBe(0);
  });

  test('trimme les map_id avec espaces', () => {
    const zones = [{ id: 1, map_id: '  map1  ' }];
    const groups = groupPlantLocationsByMap(zones, []);
    expect(groups.has('map1')).toBe(true);
  });

  test('une même carte peut avoir plusieurs zones', () => {
    const zones = [
      { id: 1, map_id: 'foret' },
      { id: 2, map_id: 'foret' },
      { id: 3, map_id: 'foret' },
    ];
    const groups = groupPlantLocationsByMap(zones, []);
    expect(groups.get('foret').zones).toHaveLength(3);
  });
});

describe('prefillPhotoSlotKey', () => {
  test('format attendu field:idx', () => {
    expect(prefillPhotoSlotKey('photo_leaf', 0)).toBe('photo_leaf:0');
    expect(prefillPhotoSlotKey('photo_flower', 2)).toBe('photo_flower:2');
  });

  test('convertit idx en Number', () => {
    expect(prefillPhotoSlotKey('photo', '3')).toBe('photo:3');
    expect(prefillPhotoSlotKey('photo', NaN)).toBe('photo:NaN');
  });

  test('trimme le nom du champ', () => {
    expect(prefillPhotoSlotKey('  photo  ', 0)).toBe('photo:0');
  });
});
