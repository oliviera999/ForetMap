import { describe, expect, test } from 'vitest';
import { guestBoardImageUrl } from '../../src/gl/components/GLGuestDemoBoard.jsx';

describe('guestBoardImageUrl — fond du plateau de démonstration', () => {
  const zones = [{ id: 'zf-p1-01' }, { id: 'zf-p1-02', boardImage: 'watermarked_img_1.jpg' }];

  test('la médiathèque prime (clé plateau-1_*), comme pour une vraie partie', () => {
    expect(
      guestBoardImageUrl({
        zones,
        conventionBoard: '/uploads/media-library/image/2026/06/plateau-1.jpg',
        placeholderUrl: '/gl/placeholder.svg',
      }),
    ).toBe('/uploads/media-library/image/2026/06/plateau-1.jpg');
  });

  test('sans médiathèque (ou pastille de secours), repli sur l’ancien fichier statique', () => {
    expect(guestBoardImageUrl({ zones, conventionBoard: null })).toBe(
      '/gl/boards/watermarked_img_1.jpg',
    );
    expect(
      guestBoardImageUrl({
        zones,
        conventionBoard: '/gl/placeholder.svg',
        placeholderUrl: '/gl/placeholder.svg',
      }),
    ).toBe('/gl/boards/watermarked_img_1.jpg');
  });

  test('sans image de zone, la carte générique', () => {
    expect(guestBoardImageUrl({ zones: [{ id: 'zf' }], conventionBoard: null })).toBe(
      '/maps/map-foret.svg',
    );
  });
});
