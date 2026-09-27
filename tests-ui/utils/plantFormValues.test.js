import { describe, test, expect } from 'vitest';
import {
  normalizedPlantValue,
  isGenericPotagerLabel,
  parseLinkCandidates,
  mergePlantPhotoFieldValue,
  EMPTY_PLANT_FORM,
  extractPlantForm,
} from '../../src/utils/plantFormValues.js';

describe('normalizedPlantValue', () => {
  test('null/undefined/"-"/vide → ""', () => {
    expect(normalizedPlantValue(null)).toBe('');
    expect(normalizedPlantValue(undefined)).toBe('');
    expect(normalizedPlantValue('-')).toBe('');
    expect(normalizedPlantValue('   ')).toBe('');
  });
  test('sinon, chaîne trimée', () => {
    expect(normalizedPlantValue('  Rosa  ')).toBe('Rosa');
    expect(normalizedPlantValue(42)).toBe('42');
  });
});

describe('isGenericPotagerLabel', () => {
  test('vrai uniquement pour « potager » (insensible à la casse/espaces)', () => {
    expect(isGenericPotagerLabel('Potager')).toBe(true);
    expect(isGenericPotagerLabel('  POTAGER ')).toBe(true);
    expect(isGenericPotagerLabel('Verger')).toBe(false);
    expect(isGenericPotagerLabel('')).toBe(false);
  });
});

describe('parseLinkCandidates', () => {
  test('découpe sur retours ligne et virgules, sans vides', () => {
    expect(parseLinkCandidates('a\nb, c')).toEqual(['a', 'b', 'c']);
    expect(parseLinkCandidates('a,,b')).toEqual(['a', 'b']);
    expect(parseLinkCandidates('-')).toEqual([]);
    expect(parseLinkCandidates(null)).toEqual([]);
  });
});

describe('mergePlantPhotoFieldValue', () => {
  test('URL vide → valeur précédente normalisée (sans découpe)', () => {
    expect(mergePlantPhotoFieldValue('  x\ny  ', '   ')).toBe('x\ny');
    expect(mergePlantPhotoFieldValue('-', '')).toBe('');
  });
  test('liste vide → URL seule', () => {
    expect(mergePlantPhotoFieldValue('', 'http://a')).toBe('http://a');
    expect(mergePlantPhotoFieldValue('-', 'http://a')).toBe('http://a');
  });
  test('doublon → liste inchangée (jointe)', () => {
    expect(mergePlantPhotoFieldValue('http://a\nhttp://b', 'http://b')).toBe('http://a\nhttp://b');
  });
  test('append par défaut, prepend si demandé', () => {
    expect(mergePlantPhotoFieldValue('http://a', 'http://b')).toBe('http://a\nhttp://b');
    expect(mergePlantPhotoFieldValue('http://a', 'http://b', 'prepend')).toBe('http://b\nhttp://a');
  });
});

describe('EMPTY_PLANT_FORM', () => {
  test('toutes les valeurs vides sauf emoji (🌱)', () => {
    expect(EMPTY_PLANT_FORM.emoji).toBe('🌱');
    // `map_ids` (rattachement direct fiche → carte, migration 239) est une liste, pas une
    // chaîne : le formulaire vide en part avec un tableau vide. `map_site_notes` (note de
    // site par carte) suit la même exception : un objet, vide au départ. `extractPlantForm`
    // les traite d'ailleurs tous deux hors de la normalisation en chaîne.
    expect(EMPTY_PLANT_FORM.map_ids).toEqual([]);
    expect(EMPTY_PLANT_FORM.map_site_notes).toEqual({});
    const others = Object.entries(EMPTY_PLANT_FORM).filter(
      ([k]) => !['emoji', 'map_ids', 'map_site_notes', 'photos', 'lookalikes'].includes(k),
    );
    expect(others.every(([, v]) => v === '')).toBe(true);
  });
  test('couvre les colonnes attendues du modèle', () => {
    expect(EMPTY_PLANT_FORM).toHaveProperty('name');
    expect(EMPTY_PLANT_FORM).toHaveProperty('scientific_name');
    // Photos : une liste (migration 303), plus les 6 anciens champs de liens.
    expect(EMPTY_PLANT_FORM.photos).toEqual([]);
    expect(EMPTY_PLANT_FORM).not.toHaveProperty('photo_harvest_part');
    expect(EMPTY_PLANT_FORM).not.toHaveProperty('photo_credit');
  });
});

describe('extractPlantForm', () => {
  test('plante vide → formulaire vierge (emoji par défaut)', () => {
    expect(extractPlantForm()).toEqual(EMPTY_PLANT_FORM);
    expect(extractPlantForm({})).toEqual(EMPTY_PLANT_FORM);
  });
  test('normalise chaque champ (`-`/espaces → "")', () => {
    const out = extractPlantForm({ name: '  Pommier  ', habitat: '-', scientific_name: 'Malus' });
    expect(out.name).toBe('Pommier');
    expect(out.habitat).toBe('');
    expect(out.scientific_name).toBe('Malus');
  });
  test('emoji vide/absent → 🌱 ; emoji fourni conservé', () => {
    expect(extractPlantForm({ emoji: '' }).emoji).toBe('🌱');
    expect(extractPlantForm({ emoji: '-' }).emoji).toBe('🌱');
    expect(extractPlantForm({ emoji: '🍎' }).emoji).toBe('🍎');
  });
  test('photos : liste de la fiche (texte vide plutôt que null), repli sur les anciens champs', () => {
    const fromList = extractPlantForm({
      photos: [
        { id: 3, kind: 'photo_leaf', url: 'https://x.fr/l.jpg', credit: 'Anne', licence: null },
      ],
    });
    expect(fromList.photos).toEqual([
      {
        kind: 'photo_leaf',
        url: 'https://x.fr/l.jpg',
        credit: 'Anne',
        licence: '',
        source: '',
        source_url: '',
      },
    ]);
    const fromColumns = extractPlantForm({
      photo: 'https://x.fr/a.jpg',
      photo_species: 'https://x.fr/a.jpg\nhttps://x.fr/b.jpg',
      photo_credit: 'Bob',
      photo_licence: 'CC0',
    });
    expect(fromColumns.photos.map((p) => [p.kind, p.url, p.credit])).toEqual([
      ['photo', 'https://x.fr/a.jpg', 'Bob'],
      ['photo_species', 'https://x.fr/a.jpg', 'Bob'],
      ['photo_species', 'https://x.fr/b.jpg', ''],
    ]);
  });
  test('autres noms : liste du serveur jointe par « , », repli sur second_name', () => {
    expect(
      extractPlantForm({ secondary_names: ['Dent-de-lion', ' Salade de taupe '] }),
    ).toMatchObject({ secondary_names: 'Dent-de-lion, Salade de taupe' });
    expect(extractPlantForm({ second_name: 'Nopal' }).secondary_names).toBe('Nopal');
    expect(EMPTY_PLANT_FORM).not.toHaveProperty('second_name');
  });
  test('remarques (champ unique, repli) et sosies (migration 305)', () => {
    expect(extractPlantForm({ remarks: 'A\n\nB', remark_1: 'x' }).remarks).toBe('A\n\nB');
    expect(extractPlantForm({ remark_1: 'A', remark_3: 'C' }).remarks).toBe('A\n\nC');
    expect(EMPTY_PLANT_FORM).not.toHaveProperty('remark_1');
    expect(
      extractPlantForm({
        lookalikes: [{ plant_id: 4, name: 'Laitue vireuse', emoji: '⚠️', note: null }],
      }).lookalikes,
    ).toEqual([{ plant_id: 4, name: 'Laitue vireuse', note: '' }]);
  });
  test('ignore les champs hors modèle', () => {
    const out = extractPlantForm({ name: 'X', inexistant: 'zzz' });
    expect(out).not.toHaveProperty('inexistant');
    expect(Object.keys(out)).toEqual(Object.keys(EMPTY_PLANT_FORM));
  });
});
