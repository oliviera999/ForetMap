import { describe, test, expect, vi } from 'vitest';

// `withAppBase` est mocké : on teste la logique de selection de source, pas la base de l'app.
vi.mock('../../src/services/api', () => ({
  withAppBase: (u) => `BASE/${u}`,
}));

const {
  itemSeenKey,
  visitMediaImgSrc,
  visitMediaGalleryThumbDisplaySrc,
  visitMediaGalleryLightboxSrc,
  reorderVisitMediaRows,
} = await import('../../src/utils/visitMediaGallery.js');

describe('itemSeenKey', () => {
  test('compose type:id', () => {
    expect(itemSeenKey('zone', 7)).toBe('zone:7');
    expect(itemSeenKey('marker', 'abc')).toBe('marker:abc');
  });
});

describe('sources média de visite', () => {
  test('visitMediaImgSrc : image principale préfixée, ou "" si absente', () => {
    expect(visitMediaImgSrc({ image_url: '/a.png' })).toBe('BASE//a.png');
    expect(visitMediaImgSrc({ thumb_url: '/t.png' })).toBe('');
    expect(visitMediaImgSrc(null)).toBe('');
  });

  test('thumb : préfère thumb_url, repli sur image_url', () => {
    expect(visitMediaGalleryThumbDisplaySrc({ thumb_url: '/t.png', image_url: '/a.png' })).toBe(
      'BASE//t.png',
    );
    expect(visitMediaGalleryThumbDisplaySrc({ image_url: '/a.png' })).toBe('BASE//a.png');
    expect(visitMediaGalleryThumbDisplaySrc({})).toBe('');
  });

  test('lightbox : préfère image_url, repli sur thumb_url', () => {
    expect(visitMediaGalleryLightboxSrc({ thumb_url: '/t.png', image_url: '/a.png' })).toBe(
      'BASE//a.png',
    );
    expect(visitMediaGalleryLightboxSrc({ thumb_url: '/t.png' })).toBe('BASE//t.png');
    expect(visitMediaGalleryLightboxSrc({})).toBe('');
  });
});

describe('reorderVisitMediaRows', () => {
  const list = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];

  test('déplace l’élément glissé à la position de la cible (vers l’avant)', () => {
    expect(reorderVisitMediaRows(list, 4, 2).map((m) => m.id)).toEqual([1, 4, 2, 3]);
  });

  test('déplace vers l’arrière', () => {
    expect(reorderVisitMediaRows(list, 1, 3).map((m) => m.id)).toEqual([2, 3, 1, 4]);
  });

  test('no-op (même référence) si même position ou id introuvable', () => {
    expect(reorderVisitMediaRows(list, 2, 2)).toBe(list);
    expect(reorderVisitMediaRows(list, 99, 2)).toBe(list);
    expect(reorderVisitMediaRows(list, 2, 99)).toBe(list);
  });

  test('ne mute pas la liste source', () => {
    const copy = list.map((m) => ({ ...m }));
    reorderVisitMediaRows(copy, 4, 1);
    expect(copy.map((m) => m.id)).toEqual([1, 2, 3, 4]);
  });
});
