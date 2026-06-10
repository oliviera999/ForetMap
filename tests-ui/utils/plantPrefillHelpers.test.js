import { describe, test, expect } from 'vitest';
import { groupPrefillPhotosByField } from '../../src/utils/plantPrefillHelpers.js';

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
