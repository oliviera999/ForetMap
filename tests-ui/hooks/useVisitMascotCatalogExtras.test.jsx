import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import useVisitMascotCatalogExtras from '../../src/hooks/useVisitMascotCatalogExtras.js';
import { api } from '../../src/services/api';

vi.mock('../../src/services/api', () => ({ api: vi.fn() }));

function serverPackRow(id = 'srv-1') {
  return {
    catalog_id: id,
    label: 'Gnome importé',
    pack: {
      mascotPackVersion: 2,
      id,
      label: 'Gnome importé',
      renderer: 'sprite_cut',
      framesBase: `/api/visit/mascot-packs/${id}/assets/`,
      frameWidth: 150,
      frameHeight: 180,
      fallbackSilhouette: 'gnome',
      stateFrames: { idle: { files: ['cell-r1-c0.png'], fps: 2 } },
    },
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('useVisitMascotCatalogExtras', () => {
  it('récupère les packs serveur et construit les extras', async () => {
    api.mockResolvedValueOnce({ mascot_packs: [serverPackRow('srv-abc')] });
    const { result } = renderHook(() => useVisitMascotCatalogExtras({ mapId: 'foret' }));
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(api).toHaveBeenCalledWith('/api/visit/content?map_id=foret');
    expect(result.current[0].id).toBe('srv-abc');
    expect(result.current[0].renderer).toBe('sprite_cut');
  });

  it('désactivé ou sans mapId → [] sans appel réseau', async () => {
    const { result } = renderHook(() => useVisitMascotCatalogExtras({ mapId: '', enabled: true }));
    expect(result.current).toEqual([]);
    const disabled = renderHook(() =>
      useVisitMascotCatalogExtras({ mapId: 'foret', enabled: false }),
    );
    expect(disabled.result.current).toEqual([]);
    expect(api).not.toHaveBeenCalled();
  });

  it('erreur réseau → [] (pas de crash)', async () => {
    api.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useVisitMascotCatalogExtras({ mapId: 'foret' }));
    await waitFor(() => expect(api).toHaveBeenCalled());
    expect(result.current).toEqual([]);
  });
});
