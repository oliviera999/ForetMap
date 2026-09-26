import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../../src/services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

import { api } from '../../src/services/api';
import { useMapSpeciesPresence } from '../../src/hooks/useMapSpeciesPresence';
import { fetchMapSpeciesPresence, resetBiodivApiCacheForTests } from '../../src/services/biodivApi';

const FORET = {
  map_id: 'foret',
  summary: { total: 2 },
  species: [
    { plant_id: 7, sources: ['registre'], zones: [], markers: [] },
    { plant_id: 8, sources: ['zone'], zones: [{ id: 'z1', name: 'Haie' }], markers: [] },
  ],
};

beforeEach(() => {
  resetBiodivApiCacheForTests();
  api.mockReset();
});

describe('fetchMapSpeciesPresence', () => {
  it('appelle la route de présence et partage une requête identique en cours', async () => {
    api.mockResolvedValue(FORET);
    const [a, b] = await Promise.all([
      fetchMapSpeciesPresence('foret', { revision: '1' }),
      fetchMapSpeciesPresence('foret', { revision: '1' }),
    ]);
    expect(a).toBe(b);
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith('/api/maps/foret/species');
    await fetchMapSpeciesPresence('foret', { revision: '2' });
    expect(api).toHaveBeenCalledTimes(2);
  });

  it('un échec n’est pas gardé : la demande suivante réessaie', async () => {
    api.mockRejectedValueOnce(new Error('réseau')).mockResolvedValueOnce(FORET);
    await expect(fetchMapSpeciesPresence('foret')).rejects.toThrow('réseau');
    await expect(fetchMapSpeciesPresence('foret')).resolves.toBe(FORET);
  });
});

describe('useMapSpeciesPresence', () => {
  it('charge la présence de la carte et l’indexe par fiche', async () => {
    api.mockResolvedValue(FORET);
    const { result } = renderHook(() => useMapSpeciesPresence('foret'));
    expect(result.current.byPlantId).toBeNull();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect([...result.current.byPlantId.keys()]).toEqual([7, 8]);
    expect(result.current.summary).toEqual({ total: 2 });
  });

  it('redemande quand une donnée surveillée change de référence, pas sinon', async () => {
    api.mockResolvedValue(FORET);
    const zonesA = [{ id: 'z1' }];
    const { result, rerender } = renderHook(
      ({ zones }) => useMapSpeciesPresence('foret', { watch: [zones] }),
      { initialProps: { zones: zonesA } },
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    rerender({ zones: zonesA });
    // Tableau vide neuf à chaque rendu (`zones = []` hors DataProvider) : même jeton.
    rerender({ zones: [] });
    rerender({ zones: [] });
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    rerender({ zones: [] });
    expect(api).toHaveBeenCalledTimes(2);
    rerender({ zones: [{ id: 'z1' }] });
    await waitFor(() => expect(api).toHaveBeenCalledTimes(3));
    // Même carte : la liste précédente reste utilisable pendant le rechargement.
    expect(result.current.byPlantId).not.toBeNull();
  });

  it('changement de carte : la liste de l’ancienne carte n’est plus utilisée', async () => {
    api.mockResolvedValueOnce(FORET);
    let resolveN3;
    api.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveN3 = resolve;
      }),
    );
    const { result, rerender } = renderHook(({ mapId }) => useMapSpeciesPresence(mapId), {
      initialProps: { mapId: 'foret' },
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    rerender({ mapId: 'n3' });
    expect(result.current.byPlantId).toBeNull();
    expect(result.current.status).toBe('loading');
    resolveN3({ map_id: 'n3', species: [{ plant_id: 9, sources: ['repere'] }] });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect([...result.current.byPlantId.keys()]).toEqual([9]);
  });

  it('erreur réseau → statut error, présence inconnue', async () => {
    api.mockRejectedValue(new Error('hors ligne'));
    const { result } = renderHook(() => useMapSpeciesPresence('foret'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.byPlantId).toBeNull();
  });

  it('présence fournie par l’écran (visite) ou carte absente → aucune requête', () => {
    const { result } = renderHook(() =>
      useMapSpeciesPresence('foret', { species: [{ plant_id: 3, sources: ['zone'] }] }),
    );
    expect(result.current.status).toBe('ready');
    expect(result.current.byPlantId.has(3)).toBe(true);
    const idle = renderHook(() => useMapSpeciesPresence(null));
    expect(idle.result.current.status).toBe('idle');
    const disabled = renderHook(() => useMapSpeciesPresence('foret', { enabled: false }));
    expect(disabled.result.current.byPlantId).toBeNull();
    expect(api).not.toHaveBeenCalled();
  });
});
