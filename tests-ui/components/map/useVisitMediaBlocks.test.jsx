import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

vi.mock('../../../src/services/api', () => ({ api: vi.fn() }));

import { api } from '../../../src/services/api';
import {
  sortVisitMedia,
  useVisitMediaBlocks,
} from '../../../src/components/map/useVisitMediaBlocks.js';

const MEDIA = [
  { id: 3, sort_order: 2, image_url: '/c.jpg', caption: '' },
  { id: 2, sort_order: 1, image_url: '/b.jpg', caption: '' },
  { id: 1, sort_order: 1, image_url: '/a.jpg', caption: '' },
];

describe('sortVisitMedia', () => {
  test('trie par sort_order croissant puis id croissant, sans muter la liste', () => {
    const input = [...MEDIA];
    const sorted = sortVisitMedia(input);
    expect(sorted.map((m) => m.id)).toEqual([1, 2, 3]);
    expect(input.map((m) => m.id)).toEqual([3, 2, 1]);
  });

  test('liste absente → tableau vide', () => {
    expect(sortVisitMedia(undefined)).toEqual([]);
  });
});

describe('useVisitMediaBlocks', () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
  });

  function mockContentApi({ photos = [], media = [] } = {}) {
    vi.mocked(api).mockImplementation(async (url) => {
      if (String(url).includes('/photos')) return photos;
      if (String(url).startsWith('/api/visit/content')) {
        return { zones: [{ id: 'z1', visit_media: media }], markers: [] };
      }
      return {};
    });
  }

  test('désactivé (repère en création) : aucun appel API, listes vides', () => {
    renderHook(() =>
      useVisitMediaBlocks({
        targetType: 'marker',
        targetId: null,
        mapId: 'map1',
        visitBodyJson: '',
        enabled: false,
      }),
    );
    expect(api).not.toHaveBeenCalled();
  });

  test('zone : charge photos + médias visite triés et dérive les blocs image', async () => {
    mockContentApi({ photos: [{ id: 9, image_url: '/p.jpg' }], media: MEDIA });
    const { result } = renderHook(() =>
      useVisitMediaBlocks({ targetType: 'zone', targetId: 'z1', mapId: 'map1', visitBodyJson: '' }),
    );
    await waitFor(() => expect(result.current.visitMediaOptions.length).toBe(3));
    expect(api).toHaveBeenCalledWith('/api/zones/z1/photos');
    expect(api).toHaveBeenCalledWith('/api/visit/content?map_id=map1');
    expect(result.current.visitMediaOptions.map((m) => m.id)).toEqual([1, 2, 3]);
    expect(result.current.photoOptions).toEqual([{ id: 9, image_url: '/p.jpg' }]);
    // Corps de visite vide → blocs image par défaut dérivés des médias (1 bloc / média).
    expect(result.current.imageBlocks.map((b) => b.media_ids)).toEqual([[1], [2], [3]]);
  });

  test('marker : utilise l’endpoint photos des repères', async () => {
    vi.mocked(api).mockImplementation(async (url) => {
      if (String(url).includes('/photos')) return [];
      return { markers: [{ id: 'm1', visit_media: [] }], zones: [] };
    });
    renderHook(() =>
      useVisitMediaBlocks({
        targetType: 'marker',
        targetId: 'm1',
        mapId: 'map1',
        visitBodyJson: '',
      }),
    );
    await waitFor(() => expect(api).toHaveBeenCalledWith('/api/map/markers/m1/photos'));
  });

  test('attachPhotoToVisit : POST /api/visit/media puis rechargement trié + toast', async () => {
    mockContentApi({ media: [] });
    const onToast = vi.fn();
    const { result } = renderHook(() =>
      useVisitMediaBlocks({
        targetType: 'zone',
        targetId: 'z1',
        mapId: 'map1',
        visitBodyJson: '',
        onToast,
      }),
    );
    await waitFor(() => expect(api).toHaveBeenCalled());
    mockContentApi({ media: MEDIA });
    await act(async () => {
      await result.current.attachPhotoToVisit({ image_url: ' /new.jpg ', caption: ' légende ' });
    });
    expect(api).toHaveBeenCalledWith('/api/visit/media', 'POST', {
      target_type: 'zone',
      target_id: 'z1',
      image_url: '/new.jpg',
      caption: 'légende',
    });
    expect(result.current.visitMediaOptions.map((m) => m.id)).toEqual([1, 2, 3]);
    expect(onToast).toHaveBeenCalledWith('Photo associée à la visite ✓');
  });

  test('attachPhotoToVisit : erreur API → toast d’erreur', async () => {
    mockContentApi({ media: [] });
    const onToast = vi.fn();
    const { result } = renderHook(() =>
      useVisitMediaBlocks({
        targetType: 'zone',
        targetId: 'z1',
        mapId: 'map1',
        visitBodyJson: '',
        onToast,
      }),
    );
    await waitFor(() => expect(api).toHaveBeenCalled());
    vi.mocked(api).mockRejectedValue(new Error('boom'));
    await act(async () => {
      await result.current.attachPhotoToVisit({ image_url: '/new.jpg' });
    });
    expect(onToast).toHaveBeenCalledWith('boom');
  });

  test('photo sans image_url : aucun POST', async () => {
    mockContentApi({ media: [] });
    const { result } = renderHook(() =>
      useVisitMediaBlocks({ targetType: 'zone', targetId: 'z1', mapId: 'map1', visitBodyJson: '' }),
    );
    await waitFor(() => expect(api).toHaveBeenCalled());
    vi.mocked(api).mockClear();
    await act(async () => {
      await result.current.attachPhotoToVisit({ caption: 'sans image' });
    });
    expect(api).not.toHaveBeenCalled();
  });
});
