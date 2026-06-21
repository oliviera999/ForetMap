import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/gl/assets/index.js', () => ({
  img: vi.fn((key) => `/uploads/media-library/image/${key}.png`),
  feuilletIllustration: vi.fn(),
  GL_ASSET_PLACEHOLDER_URL: '/placeholder.svg',
}));

import { img, feuilletIllustration } from '../../src/gl/assets/index.js';
import {
  resolveFeuilletExplicitMediaUrl,
  resolveFeuilletImageUrl,
} from '../../src/gl/utils/glFeuilletMediaUrl.js';

describe('resolveFeuilletExplicitMediaUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(img).mockImplementation((key) => `/uploads/media-library/image/${key}.png`);
  });

  test('conserve un chemin /uploads avant chargement des manifestes', () => {
    const url = '/uploads/media-library/image/scene.png';
    expect(resolveFeuilletExplicitMediaUrl(url, false)).toBe(url);
  });

  test('résout une clé stable via img() une fois les assets prêts', () => {
    const key = 'recit_feuillet-action_ep-v-03_scene';
    expect(resolveFeuilletExplicitMediaUrl(key, true)).toBe(
      `/uploads/media-library/image/${key}.png`,
    );
    expect(img).toHaveBeenCalledWith(key);
  });

  test('retourne null pour une clé non résolue (placeholder)', () => {
    vi.mocked(img).mockReturnValue('/placeholder.svg');
    expect(
      resolveFeuilletExplicitMediaUrl('recit_feuillet-action_inconnue_scene', true),
    ).toBeNull();
  });
});

describe('resolveFeuilletImageUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(img).mockImplementation((key) => `/uploads/media-library/image/${key}.png`);
    vi.mocked(feuilletIllustration).mockReturnValue(null);
  });

  test('privilégie la convention médiathèque sur imageUrl explicite', () => {
    vi.mocked(feuilletIllustration).mockReturnValue('/uploads/media-library/image/convention.png');
    expect(
      resolveFeuilletImageUrl('ep-V-03', '/uploads/media-library/image/explicite.png', true),
    ).toBe('/uploads/media-library/image/convention.png');
  });

  test('retombe sur imageUrl explicite si la convention échoue', () => {
    const fallback = '/uploads/media-library/image/explicite.png';
    expect(resolveFeuilletImageUrl('ep-V-03', fallback, true)).toBe(fallback);
  });

  test('retombe sur imageUrl avant chargement des manifestes', () => {
    const fallback = '/uploads/media-library/image/explicite.png';
    expect(resolveFeuilletImageUrl('ep-V-03', fallback, false)).toBe(fallback);
    expect(feuilletIllustration).not.toHaveBeenCalled();
  });
});
