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
  sameVisitImageUrl,
  visitImageIdentityKey,
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

  test('sameVisitImageUrl ignore query/hash et les vides', () => {
    expect(sameVisitImageUrl('/a.png', '/a.png?v=1')).toBe(true);
    expect(sameVisitImageUrl('/a.png#x', '/a.png')).toBe(true);
    expect(sameVisitImageUrl('/a.png', '/b.png')).toBe(false);
    expect(sameVisitImageUrl('', '/a.png')).toBe(false);
    expect(sameVisitImageUrl(null, null)).toBe(false);
  });
});

describe('visitImageIdentityKey — même cliché sous plusieurs formes d’URL', () => {
  test('photo de zone : chemin public, vignette et route API historique', () => {
    expect(visitImageIdentityKey('/uploads/zones/3/10.jpg')).toBe('zone:3:10');
    expect(visitImageIdentityKey('/uploads/zones/3/10.thumb.jpg')).toBe('zone:3:10');
    expect(visitImageIdentityKey('/api/zones/3/photos/10/data')).toBe('zone:3:10');
  });

  test('photo de repère : chemin public, vignette et route API historique', () => {
    expect(visitImageIdentityKey('/uploads/markers/m7/4.webp')).toBe('marker:m7:4');
    expect(visitImageIdentityKey('/uploads/markers/m7/4.thumb.jpg')).toBe('marker:m7:4');
    expect(visitImageIdentityKey('/api/map/markers/m7/photos/4/data')).toBe('marker:m7:4');
  });

  test('média de visite téléversé : identité propre (pas confondu avec une photo carte)', () => {
    expect(visitImageIdentityKey('/api/visit/media/20/data')).toBe('visit-media:20');
    expect(sameVisitImageUrl('/api/visit/media/20/data', '/uploads/zones/3/10.jpg')).toBe(false);
  });

  test('origine absolue et préfixe de base ignorés', () => {
    expect(visitImageIdentityKey('https://foret.exemple.fr/uploads/zones/3/10.jpg')).toBe(
      'zone:3:10',
    );
    expect(visitImageIdentityKey('/foretmap/uploads/zones/3/10.jpg')).toBe('zone:3:10');
  });

  test('URL hors format connu : repli sur le chemin normalisé', () => {
    expect(visitImageIdentityKey('/uploads/divers/a.png?v=2')).toBe('url:/uploads/divers/a.png');
    expect(visitImageIdentityKey('   ')).toBe('');
  });

  test('photo carte associée à la visite avant reprise des chemins : plus de doublon', () => {
    // `visit_media.image_url` fige la route API, `map_lead_photo` sert le chemin public.
    expect(sameVisitImageUrl('/uploads/zones/3/10.jpg', '/api/zones/3/photos/10/data')).toBe(true);
    expect(sameVisitImageUrl('/uploads/zones/3/10.jpg', '/api/zones/3/photos/11/data')).toBe(false);
    expect(sameVisitImageUrl('/uploads/zones/3/10.jpg', '/uploads/zones/4/10.jpg')).toBe(false);
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
