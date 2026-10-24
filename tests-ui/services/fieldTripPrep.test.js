import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../src/services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(async () => ({})),
}));

const { api } = await import('../../src/services/api');
const { collectFieldTripUrls, prepareFieldTrip, FIELD_TRIP_EXTERNAL_PHOTOS_MAX } =
  await import('../../src/services/fieldTripPrep.js');

const ORIGIN = 'https://foretmap.test';

beforeEach(() => {
  api.mockReset();
});

describe('collectFieldTripUrls', () => {
  test('trie fichiers du site, photos externes et aperçus de tutoriels', () => {
    const urls = collectFieldTripUrls(
      {
        activeMapId: 'foret',
        maps: [
          { id: 'foret', map_image_url: '/uploads/maps/foret.jpg' },
          { id: 'n3', map_image_url: '/uploads/maps/n3.jpg' },
        ],
        zonePhotos: [
          { thumb_url: '/uploads/zones/z1/t.jpg', image_url: '/uploads/zones/z1/a.jpg' },
        ],
        plants: [
          { photos: [{ kind: 'photo', url: 'https://upload.wikimedia.org/menthe.jpg' }] },
          { photos: [{ kind: 'photo', url: 'data:image/png;base64,AA' }] },
        ],
        tutorials: [
          { id: 1, type: 'html' },
          { id: 2, type: 'link', source_url: 'https://exemple.org' },
          { id: 3, type: 'pdf', source_file_path: '/tutos/compost.pdf' },
          { id: 4, type: 'html', is_active: false },
        ],
      },
      ORIGIN,
    );
    expect(urls.sameOrigin).toEqual([
      '/uploads/maps/foret.jpg',
      '/uploads/zones/z1/t.jpg',
      '/uploads/zones/z1/a.jpg',
    ]);
    expect(urls.external).toEqual(['https://upload.wikimedia.org/menthe.jpg']);
    expect(urls.documents).toEqual(['/api/tutorials/1/view', '/tutos/compost.pdf']);
  });

  test('borne les photos externes', () => {
    const plants = Array.from({ length: FIELD_TRIP_EXTERNAL_PHOTOS_MAX + 10 }, (_, i) => ({
      photos: [{ kind: 'photo', url: `https://ext.test/${i}.jpg` }],
    }));
    expect(collectFieldTripUrls({ plants }, ORIGIN).external).toHaveLength(
      FIELD_TRIP_EXTERNAL_PHOTOS_MAX,
    );
  });
});

describe('prepareFieldTrip', () => {
  test('recharge les données, liste les photos des lieux de la carte et copie les fichiers', async () => {
    api.mockImplementation(async (path) =>
      String(path).endsWith('/photos') ? [{ image_url: `/uploads${path}.jpg` }] : {},
    );
    const refreshAll = vi.fn(async () => {});
    const fetchImpl = vi.fn(async () => ({ ok: true, blob: async () => new Blob(['x']) }));
    const progress = [];
    const result = await prepareFieldTrip({
      refreshAll,
      getData: () => ({
        activeMapId: 'foret',
        maps: [{ id: 'foret', map_image_url: '/uploads/maps/foret.jpg' }],
        zones: [
          { id: 'z1', map_id: 'foret' },
          { id: 'z2', map_id: 'n3' },
        ],
        markers: [{ id: 'm1', map_id: 'foret' }],
        plants: [],
        tutorials: [],
      }),
      onProgress: (p) => progress.push(p.step),
      fetchImpl,
    });
    expect(refreshAll).toHaveBeenCalledTimes(1);
    const paths = api.mock.calls.map(([path]) => path);
    expect(paths).toContain('/api/zones/z1/photos');
    expect(paths).toContain('/api/map/markers/m1/photos');
    expect(paths).not.toContain('/api/zones/z2/photos');
    // Toutes les lectures de la préparation demandent la copie terrain.
    for (const call of api.mock.calls) {
      expect(call[0]).toMatch(/^\/api\//);
    }
    const fetched = fetchImpl.mock.calls.map(([url, init]) => [
      url,
      init.headers['X-Foretmap-Terrain'],
    ]);
    expect(fetched).toEqual(
      expect.arrayContaining([
        [expect.stringContaining('/uploads/maps/foret.jpg'), '1'],
        [expect.stringContaining('/uploads/api/zones/z1/photos.jpg'), '1'],
      ]),
    );
    expect(result.failed).toBe(0);
    expect(result.ok).toBeGreaterThanOrEqual(5);
    expect(progress[0]).toBe('data');
    expect(progress.at(-1)).toBe('done');
  });

  test('fichier inaccessible : compté en échec, la préparation continue', async () => {
    api.mockResolvedValue([]);
    const fetchImpl = vi.fn(async () => ({ ok: false }));
    const result = await prepareFieldTrip({
      refreshAll: async () => {},
      getData: () => ({ maps: [{ id: 'a', map_image_url: '/uploads/maps/a.jpg' }] }),
      fetchImpl,
    });
    expect(result.failed).toBe(1);
  });
});
