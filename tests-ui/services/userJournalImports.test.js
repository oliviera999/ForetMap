import { describe, test, expect, vi, beforeEach } from 'vitest';

/**
 * Garde de charge du carnet : `GET /api/user-journal/me/imports/refs` renvoie la même liste
 * à tous les appelants, et le catalogue de biodiversité monte un `FmLearnAndImportSlot` par
 * vignette. Sans mutualisation, 78 espèces affichées font 78 requêtes identiques à chaque
 * ouverture — la régression qu'a attrapée `PlantCatalogTiles.test.jsx`.
 */

const apiMock = vi.hoisted(() =>
  vi.fn(async () => ({ refs: [{ resourceType: 'plant', resourceRef: '3' }] })),
);

vi.mock('../../src/services/api', () => ({ api: apiMock }));

const { loadImportedRefs, invalidateImportedRefs, refsContain } =
  await import('../../src/services/userJournalImports.js');

describe('userJournalImports', () => {
  beforeEach(() => {
    apiMock.mockClear();
    invalidateImportedRefs();
  });

  test('appels concurrents : une seule requête, même résultat pour tous', async () => {
    const results = await Promise.all([loadImportedRefs(), loadImportedRefs(), loadImportedRefs()]);
    expect(apiMock).toHaveBeenCalledTimes(1);
    for (const refs of results) expect(refs).toEqual([{ resourceType: 'plant', resourceRef: '3' }]);
  });

  test('appels successifs : la liste mémorisée est resservie pendant le TTL', async () => {
    await loadImportedRefs();
    await loadImportedRefs();
    expect(apiMock).toHaveBeenCalledTimes(1);
  });

  test('TTL expiré : la liste est rechargée', async () => {
    await loadImportedRefs({ now: () => 0 });
    await loadImportedRefs({ now: () => 60000 });
    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  test('invalidation : un import force le rechargement', async () => {
    await loadImportedRefs();
    invalidateImportedRefs();
    await loadImportedRefs();
    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  test('échec réseau : liste vide, et pas de promesse en vol conservée', async () => {
    apiMock.mockRejectedValueOnce(new Error('réseau'));
    expect(await loadImportedRefs()).toEqual([]);
    await loadImportedRefs();
    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  test('refsContain compare le type et la référence, en tolérant les nombres', () => {
    const refs = [{ resourceType: 'plant', resourceRef: '3' }];
    expect(refsContain(refs, 'plant', 3)).toBe(true);
    expect(refsContain(refs, 'plant', '3')).toBe(true);
    expect(refsContain(refs, 'glossary', '3')).toBe(false);
    expect(refsContain(refs, 'plant', '')).toBe(false);
    expect(refsContain(null, 'plant', '3')).toBe(false);
  });
});
