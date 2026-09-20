import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fetchPlantObservationCounts } from '../../src/components/PlantSpeciesDiscoveryAcknowledge.jsx';

const apiMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/services/api', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getAuthToken: () => 'jeton',
    api: (...args) => apiMock(...args),
  };
});

describe('fetchPlantObservationCounts — lots 1A', () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockImplementation(async (path) => {
      const m = String(path).match(/plant_ids=([^&]+)/);
      const ids = m ? decodeURIComponent(m[1]).split(',').map(Number) : [];
      return {
        counts: Object.fromEntries(
          ids.map((id) => [String(id), { my_observation_count: 1, site_observation_count: id }]),
        ),
      };
    });
  });

  test('250 ids → 2 appels et fusion complète', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => i + 1);
    const counts = await fetchPlantObservationCounts(ids);
    expect(apiMock).toHaveBeenCalledTimes(2);
    expect(Object.keys(counts)).toHaveLength(250);
    expect(counts['1'].site_observation_count).toBe(1);
    expect(counts['250'].site_observation_count).toBe(250);
  });
});
