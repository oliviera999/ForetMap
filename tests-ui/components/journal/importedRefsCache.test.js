import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const apiCalls = vi.hoisted(() => []);
const apiMock = vi.hoisted(() =>
  vi.fn(async () => ({ refs: [{ resourceType: 'plant', resourceRef: '3' }] })),
);

vi.mock('../../../src/services/api', () => ({
  api: (path, ...rest) => {
    apiCalls.push(String(path));
    return apiMock(path, ...rest);
  },
}));

const { getImportedRefs, invalidateImportedRefs, resetImportedRefsCache } =
  await import('../../../src/components/journal/importedRefsCache.js');

/**
 * Liste des refs importées — mutualisation (régression de charge).
 *
 * `/api/user-journal/me/imports/refs` renvoie la liste **entière** des imports. Chaque
 * vignette du catalogue la demandait pour n'y chercher qu'une entrée : 12 vignettes = 12
 * appels identiques, 78 espèces en production = 78. La garde `PlantCatalogTiles.test.jsx`
 * ne l'avait pas vu parce que sa fixture, privée de zones, n'affichait plus aucune vignette
 * depuis l'arrivée du filtre « Présente sur cette carte ».
 */
describe('importedRefsCache', () => {
  beforeEach(() => {
    apiCalls.length = 0;
    apiMock.mockClear();
    resetImportedRefsCache();
  });
  afterEach(() => resetImportedRefsCache());

  test('douze appels simultanés ne font qu’une requête', async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => getImportedRefs()));
    expect(apiCalls).toEqual(['/api/user-journal/me/imports/refs']);
    // Et chacun reçoit bien la liste, pas `undefined`.
    for (const refs of results) expect(refs).toEqual([{ resourceType: 'plant', resourceRef: '3' }]);
  });

  test('un appel ultérieur est servi depuis le cache, sans requête', async () => {
    await getImportedRefs();
    await getImportedRefs();
    expect(apiCalls).toHaveLength(1);
  });

  test('après un import, la liste est redemandée', async () => {
    await getImportedRefs();
    invalidateImportedRefs();
    await getImportedRefs();
    expect(apiCalls).toHaveLength(2);
  });

  test('un échec n’est pas mémorisé : la vignette suivante réessaie', async () => {
    apiMock.mockRejectedValueOnce(new Error('réseau'));
    await expect(getImportedRefs()).rejects.toThrow('réseau');
    await expect(getImportedRefs()).resolves.toEqual([{ resourceType: 'plant', resourceRef: '3' }]);
    expect(apiCalls).toHaveLength(2);
  });

  test('une réponse sans `refs` exploitable donne une liste vide, pas une erreur', async () => {
    apiMock.mockResolvedValueOnce({});
    await expect(getImportedRefs()).resolves.toEqual([]);
  });
});
