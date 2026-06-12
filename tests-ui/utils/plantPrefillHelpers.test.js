import { describe, test, expect } from 'vitest';
import {
  groupPrefillPhotosByField,
  buildPrefillFieldSelection,
  buildInitialPrefillPhotoSelections,
} from '../../src/utils/plantPrefillHelpers.js';

describe('groupPrefillPhotosByField', () => {
  test('groupe par field dans l’ordre de rencontre', () => {
    const photos = [
      { field: 'photo_leaf', url: 'a' },
      { field: 'photo_flower', url: 'b' },
      { field: 'photo_leaf', url: 'c' },
    ];
    expect(groupPrefillPhotosByField(photos)).toEqual({
      photo_leaf: [{ field: 'photo_leaf', url: 'a' }, { field: 'photo_leaf', url: 'c' }],
      photo_flower: [{ field: 'photo_flower', url: 'b' }],
    });
  });
  test('ignore les photos sans field (vide/espaces/absent)', () => {
    const photos = [{ field: '' }, { field: '   ' }, {}, { field: 'photo_fruit', url: 'x' }];
    expect(groupPrefillPhotosByField(photos)).toEqual({ photo_fruit: [{ field: 'photo_fruit', url: 'x' }] });
  });
  test('field trimé pour le regroupement', () => {
    const out = groupPrefillPhotosByField([{ field: ' photo_leaf ', url: 'a' }]);
    expect(Object.keys(out)).toEqual(['photo_leaf']);
  });
  test('entrée nulle/vide → objet vide', () => {
    expect(groupPrefillPhotosByField(null)).toEqual({});
    expect(groupPrefillPhotosByField(undefined)).toEqual({});
    expect(groupPrefillPhotosByField([])).toEqual({});
  });
});

describe('buildPrefillFieldSelection', () => {
  const FIELDS = ['name', 'habitat', 'sources'];

  test('coche les champs proposés quand le formulaire est vide dessus', () => {
    const data = { fields: { name: 'Tomate', habitat: 'Potager' } };
    const out = buildPrefillFieldSelection(data, { name: '', habitat: '   ' }, { speciesPrefillFields: FIELDS });
    expect(out).toEqual({ name: true, habitat: true });
  });

  test('décoche les champs déjà remplis sans overwriteFilled', () => {
    const data = { fields: { name: 'Tomate', habitat: 'Potager' } };
    const out = buildPrefillFieldSelection(data, { name: 'Aubergine', habitat: '' }, { speciesPrefillFields: FIELDS });
    expect(out).toEqual({ name: false, habitat: true });
  });

  test('overwriteFilled → tout champ proposé est coché, même déjà rempli', () => {
    const data = { fields: { name: 'Tomate', sources: 'https://a' } };
    const out = buildPrefillFieldSelection(data, { name: 'Aubergine', sources: 'x' }, {
      overwriteFilled: true,
      speciesPrefillFields: FIELDS,
    });
    expect(out).toEqual({ name: true, sources: true });
  });

  test('les champs sans proposition (vide/espaces) sont absents du résultat', () => {
    const data = { fields: { name: '   ', habitat: '' } };
    expect(buildPrefillFieldSelection(data, {}, { speciesPrefillFields: FIELDS })).toEqual({});
  });

  test('données nulles / liste de champs vide → objet vide', () => {
    expect(buildPrefillFieldSelection(null, null, {})).toEqual({});
    expect(buildPrefillFieldSelection({ fields: { name: 'x' } }, {}, { speciesPrefillFields: [] })).toEqual({});
  });
});

describe('buildInitialPrefillPhotoSelections', () => {
  const KEYS = new Set(['photo', 'photo_species', 'photo_leaf']);

  test('un emplacement décoché par photo, champ cible = champ source si valide', () => {
    const photos = [
      { field: 'photo_leaf', url: 'a' },
      { field: 'photo_leaf', url: 'b' },
      { field: 'photo', url: 'c' },
    ];
    expect(buildInitialPrefillPhotoSelections(photos, KEYS)).toEqual({
      'photo_leaf:0': { checked: false, assignTo: 'photo_leaf' },
      'photo_leaf:1': { checked: false, assignTo: 'photo_leaf' },
      'photo:0': { checked: false, assignTo: 'photo' },
    });
  });

  test('champ source hors formulaire → repli sur photo_species', () => {
    const out = buildInitialPrefillPhotoSelections([{ field: 'illustration', url: 'a' }], KEYS);
    expect(out).toEqual({ 'illustration:0': { checked: false, assignTo: 'photo_species' } });
  });

  test('photos sans field ignorées ; entrée nulle → objet vide', () => {
    expect(buildInitialPrefillPhotoSelections([{ field: '' }, {}], KEYS)).toEqual({});
    expect(buildInitialPrefillPhotoSelections(null, KEYS)).toEqual({});
  });

  test('accepte un tableau de clés à la place d’un Set', () => {
    const out = buildInitialPrefillPhotoSelections([{ field: 'photo_leaf', url: 'a' }], ['photo_leaf']);
    expect(out['photo_leaf:0']).toEqual({ checked: false, assignTo: 'photo_leaf' });
  });
});
