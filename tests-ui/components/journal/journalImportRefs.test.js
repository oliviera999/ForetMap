import { describe, test, expect, vi, beforeEach } from 'vitest';

const apiMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  api: (...args) => apiMock(...args),
}));

const { fetchJournalImportRefs, invalidateJournalImportRefs } =
  await import('../../../src/components/journal/journalImportRefs.js');

describe('journalImportRefs — liste des imports carnet, mutualisée', () => {
  beforeEach(() => {
    apiMock.mockReset();
    invalidateJournalImportRefs();
  });

  test('douze accusés montés ensemble ne font qu’un seul appel', async () => {
    apiMock.mockResolvedValue({ refs: [{ resourceType: 'plant', resourceRef: '3' }] });
    const résultats = await Promise.all(Array.from({ length: 12 }, () => fetchJournalImportRefs()));
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(apiMock).toHaveBeenCalledWith('/api/user-journal/me/imports/refs');
    for (const refs of résultats) {
      expect(refs).toEqual([{ resourceType: 'plant', resourceRef: '3' }]);
    }
  });

  test('après invalidation, la liste est relue', async () => {
    apiMock.mockResolvedValue({ refs: [] });
    await fetchJournalImportRefs();
    invalidateJournalImportRefs();
    await fetchJournalImportRefs();
    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  test('une réponse sans tableau `refs` rend une liste vide', async () => {
    apiMock.mockResolvedValue({});
    expect(await fetchJournalImportRefs()).toEqual([]);
  });

  test('un échec ne gèle pas le cache : le montage suivant réessaie', async () => {
    apiMock.mockRejectedValueOnce(new Error('réseau'));
    expect(await fetchJournalImportRefs()).toEqual([]);
    apiMock.mockResolvedValue({ refs: [{ resourceType: 'tutorial', resourceRef: '7' }] });
    expect(await fetchJournalImportRefs()).toEqual([
      { resourceType: 'tutorial', resourceRef: '7' },
    ]);
    expect(apiMock).toHaveBeenCalledTimes(2);
  });
});
