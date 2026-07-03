import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../../src/components/PlantSpeciesDiscoveryAcknowledge', () => ({
  fetchPlantObservationCounts: vi.fn(),
}));

import { fetchPlantObservationCounts } from '../../src/components/PlantSpeciesDiscoveryAcknowledge';
import { usePlantObservationCounts } from '../../src/hooks/usePlantObservationCounts.js';

const COUNTS = {
  1: { my_observation_count: 2, site_observation_count: 5 },
};

describe('usePlantObservationCounts', () => {
  beforeEach(() => {
    fetchPlantObservationCounts.mockReset();
    fetchPlantObservationCounts.mockResolvedValue(COUNTS);
  });

  it('charge les compteurs pour les ids fournis', async () => {
    const { result } = renderHook(() => usePlantObservationCounts([1, 2]));
    await waitFor(() => expect(result.current.counts['1']?.my_observation_count).toBe(2));
    expect(fetchPlantObservationCounts).toHaveBeenCalledWith([1, 2]);
  });

  it('liste vide → compteurs remis à {} sans appel réseau', async () => {
    const { result } = renderHook(() => usePlantObservationCounts([]));
    await waitFor(() => expect(result.current.counts).toEqual({}));
    expect(fetchPlantObservationCounts).not.toHaveBeenCalled();
  });

  it('ne refetch pas quand la référence du tableau change à ids constants', async () => {
    const { rerender } = renderHook(({ ids }) => usePlantObservationCounts(ids, 3), {
      initialProps: { ids: [1, 2] },
    });
    await waitFor(() => expect(fetchPlantObservationCounts).toHaveBeenCalledTimes(1));
    rerender({ ids: [1, 2] });
    expect(fetchPlantObservationCounts).toHaveBeenCalledTimes(1);
  });

  it('refetch quand la clé de rafraîchissement (plants.length) change', async () => {
    const { rerender } = renderHook(({ ids, key }) => usePlantObservationCounts(ids, key), {
      initialProps: { ids: [1, 2], key: 3 },
    });
    await waitFor(() => expect(fetchPlantObservationCounts).toHaveBeenCalledTimes(1));
    rerender({ ids: [1, 2], key: 4 });
    await waitFor(() => expect(fetchPlantObservationCounts).toHaveBeenCalledTimes(2));
  });

  it('applyAcknowledged reporte localement les compteurs d’une fiche', async () => {
    const { result } = renderHook(() => usePlantObservationCounts([1]));
    await waitFor(() => expect(result.current.counts['1']).toBeTruthy());
    act(() =>
      result.current.applyAcknowledged(1, {
        my_observation_count: 3,
        site_observation_count: 6,
        extra: 'ignoré',
      }),
    );
    expect(result.current.counts['1']).toEqual({
      my_observation_count: 3,
      site_observation_count: 6,
    });
  });

  it('refetch sur foretmap_session_changed et se désabonne au démontage', async () => {
    const { unmount } = renderHook(() => usePlantObservationCounts([1]));
    await waitFor(() => expect(fetchPlantObservationCounts).toHaveBeenCalledTimes(1));
    await act(async () => {
      window.dispatchEvent(new Event('foretmap_session_changed'));
    });
    await waitFor(() => expect(fetchPlantObservationCounts).toHaveBeenCalledTimes(2));
    unmount();
    window.dispatchEvent(new Event('foretmap_session_changed'));
    expect(fetchPlantObservationCounts).toHaveBeenCalledTimes(2);
  });
});
