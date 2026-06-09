import { describe, test, expect } from 'vitest';
import { reorderZoneMarkerPhotosByDrop } from '../../src/components/map/PhotoGallery.jsx';

const list = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];

describe('reorderZoneMarkerPhotosByDrop', () => {
  test('déplace l’élément glissé avant la cible', () => {
    expect(reorderZoneMarkerPhotosByDrop(list, 4, 2).map((p) => p.id)).toEqual([1, 4, 2, 3]);
  });
  test('déplace vers l’arrière', () => {
    expect(reorderZoneMarkerPhotosByDrop(list, 1, 3).map((p) => p.id)).toEqual([2, 3, 1, 4]);
  });
  test('no-op si même position, ou id introuvable', () => {
    expect(reorderZoneMarkerPhotosByDrop(list, 2, 2)).toBe(list);
    expect(reorderZoneMarkerPhotosByDrop(list, 99, 2)).toBe(list);
    expect(reorderZoneMarkerPhotosByDrop(list, 2, 99)).toBe(list);
  });
  test('ne mute pas la liste source', () => {
    const copy = list.map((p) => ({ ...p }));
    reorderZoneMarkerPhotosByDrop(copy, 4, 1);
    expect(copy.map((p) => p.id)).toEqual([1, 2, 3, 4]);
  });
});
