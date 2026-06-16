import { describe, test, expect } from 'vitest';
import {
  isVegetalCatalogEntry,
  groupPlantLocationsByMap,
} from '../../src/utils/plantCatalogHelpers.js';

describe('isVegetalCatalogEntry', () => {
  test('groupe 1 contenant « végétal » (insensible à la casse/espaces)', () => {
    expect(isVegetalCatalogEntry({ group_1: 'Végétal (Chlorobiontes)' })).toBe(true);
    expect(isVegetalCatalogEntry({ group_1: '  VÉGÉTAL  ' })).toBe(true);
  });
  test('autre groupe ou absent → false', () => {
    expect(isVegetalCatalogEntry({ group_1: 'Fungi' })).toBe(false);
    expect(isVegetalCatalogEntry({ group_1: '-' })).toBe(false);
    expect(isVegetalCatalogEntry({})).toBe(false);
  });
});

describe('groupPlantLocationsByMap', () => {
  test('groupe zones et repères par map_id', () => {
    const zones = [
      { id: 1, map_id: 'a' },
      { id: 2, map_id: 'b' },
    ];
    const markers = [{ id: 9, map_id: 'a' }];
    const out = groupPlantLocationsByMap(zones, markers);
    expect(out.get('a')).toEqual({
      zones: [{ id: 1, map_id: 'a' }],
      markers: [{ id: 9, map_id: 'a' }],
    });
    expect(out.get('b')).toEqual({ zones: [{ id: 2, map_id: 'b' }], markers: [] });
  });
  test('map_id absent/vide → repli sur « foret »', () => {
    const out = groupPlantLocationsByMap(
      [{ id: 1 }, { id: 2, map_id: '  ' }],
      [{ id: 3, map_id: null }],
    );
    expect(out.has('foret')).toBe(true);
    expect(out.get('foret').zones).toHaveLength(2);
    expect(out.get('foret').markers).toHaveLength(1);
  });
  test('listes nulles → Map vide', () => {
    const out = groupPlantLocationsByMap(null, undefined);
    expect(out.size).toBe(0);
  });
  test('préserve l’ordre de première rencontre des cartes', () => {
    const out = groupPlantLocationsByMap([{ map_id: 'z' }, { map_id: 'a' }], []);
    expect([...out.keys()]).toEqual(['z', 'a']);
  });
});
