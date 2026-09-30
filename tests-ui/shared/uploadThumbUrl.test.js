import { describe, expect, it } from 'vitest';
import { uploadThumbUrl } from '../../src/shared/utils/uploadThumbUrl.js';

describe('uploadThumbUrl (miroir de lib/imageThumb.js)', () => {
  it('plantes, tâches et médiathèque ont une vignette dérivée', () => {
    expect(uploadThumbUrl('/uploads/plants/3/photo-1790.jpg')).toBe(
      '/uploads/plants/3/photo-1790.thumb.jpg',
    );
    expect(uploadThumbUrl('/uploads/tasks/abc-1.png')).toBe('/uploads/tasks/abc-1.thumb.jpg');
    expect(uploadThumbUrl('/foretmap/uploads/media-library/image/2026/09/a.webp')).toBe(
      '/foretmap/uploads/media-thumbs/media-library/image/2026/09/a.thumb.jpg',
    );
  });

  it('URL signée de tâche : la signature (commune à l’original et à la vignette) est recopiée', () => {
    expect(uploadThumbUrl('/uploads/tasks/abc-1.png?exp=1790000000&sig=Ab_c-9')).toBe(
      '/uploads/tasks/abc-1.thumb.jpg?exp=1790000000&sig=Ab_c-9',
    );
    // Requête inconnue : pas de vignette dérivée (comportement antérieur).
    expect(uploadThumbUrl('/uploads/tasks/abc-1.png?v=2')).toBeNull();
  });

  it('autres familles, vignettes, liens externes et chemins douteux : null', () => {
    for (const url of [
      '/uploads/zones/z/1.jpg',
      '/uploads/plants/3/photo.thumb.jpg',
      '/uploads/plants/3/../../secret.jpg',
      '/uploads/media-library/audio/a.mp3',
      'https://upload.wikimedia.org/x.jpg',
      '',
      null,
    ]) {
      expect(uploadThumbUrl(url)).toBeNull();
    }
  });
});
