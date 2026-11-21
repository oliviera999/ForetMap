import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

import { api } from '../../src/services/api';
import {
  buildPlaceholderMascotEntry,
  resetVisitMascotLazyPacksCache,
  useVisitMascotLazyPacks,
} from '../../src/hooks/useVisitMascotLazyPacks.js';

vi.mock('../../src/services/api', () => ({ api: vi.fn() }));

/** Vignette du catalogue reportée sur les entrées de guide (lot J). */

const THUMB_A = '/api/visit/mascot-packs/00000000-0000-4000-8000-00000000000a/assets/_vignette.png';
const THUMB_B = '/api/visit/mascot-packs/00000000-0000-4000-8000-00000000000b/assets/_vignette.png';

function packRow(id) {
  return {
    catalog_id: id,
    label: `Pack ${id}`,
    pack: {
      mascotPackVersion: 2,
      id,
      label: `Pack ${id}`,
      renderer: 'sprite_cut',
      framesBase: `/api/visit/mascot-packs/${id}/assets/`,
      frameWidth: 64,
      frameHeight: 64,
      fallbackSilhouette: 'gnome',
      stateFrames: { idle: { files: ['a.png'], fps: 4 } },
    },
  };
}

beforeEach(() => {
  api.mockReset();
  resetVisitMascotLazyPacksCache();
});

describe('useVisitMascotLazyPacks — vignettes', () => {
  test('entrée provisoire : vignette du catalogue, sinon aucune', () => {
    expect(
      buildPlaceholderMascotEntry({ catalog_id: 'a', label: 'A', thumbnail_url: THUMB_A }),
    ).toMatchObject({ id: 'a', isPlaceholder: true, thumbnailUrl: THUMB_A });
    expect(buildPlaceholderMascotEntry({ catalog_id: 'b', label: 'B' }).thumbnailUrl).toBeNull();
  });

  test('une adresse hors des images de pack est ignorée', () => {
    for (const thumbnail_url of [
      'https://ailleurs.example/x.png',
      '//ailleurs.example/x.png',
      42,
    ]) {
      expect(
        buildPlaceholderMascotEntry({ catalog_id: 'a', label: 'A', thumbnail_url }).thumbnailUrl,
      ).toBeNull();
    }
  });

  test('guide par défaut (pack complet) et guides à la demande portent leur vignette', async () => {
    const catalog = [
      { catalog_id: 'srv-a', label: 'A', thumbnail_url: THUMB_A },
      { catalog_id: 'srv-b', label: 'B', thumbnail_url: THUMB_B },
      { catalog_id: 'srv-c', label: 'C', thumbnail_url: null },
    ];
    const contentPacks = [packRow('srv-a')];
    const { result } = renderHook(() => useVisitMascotLazyPacks({ catalog, contentPacks }));

    const [a, b, c] = result.current.extras;
    expect(a).toMatchObject({ id: 'srv-a', thumbnailUrl: THUMB_A });
    expect(a.isPlaceholder).toBeFalsy();
    expect(b).toMatchObject({ id: 'srv-b', isPlaceholder: true, thumbnailUrl: THUMB_B });
    expect(c.thumbnailUrl).toBeNull();
    // Afficher les vignettes ne charge aucun pack.
    expect(api).not.toHaveBeenCalled();

    api.mockResolvedValueOnce(packRow('srv-b'));
    act(() => result.current.ensurePack('srv-b'));
    await waitFor(() => expect(result.current.extras[1].isPlaceholder).toBeFalsy());
    expect(result.current.extras[1].thumbnailUrl).toBe(THUMB_B);
  });
});
