import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../src/services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const { api, NETWORK_FAILURE_CODE } = await import('../../src/services/api');
const { JOURNAL_OFFLINE_IMAGE_MESSAGE, JOURNAL_OFFLINE_PIN_MESSAGE, createOfflineJournalAdapter } =
  await import('../../src/services/userJournalOfflineAdapter.js');
const { JOURNAL_DRAFT_QUEUE_STORAGE_KEY, listJournalDrafts } =
  await import('../../src/utils/journalDraftQueue.js');

const offlineError = () =>
  Object.assign(new Error('Pas de réseau'), { code: NETWORK_FAILURE_CODE });

function makeAdapter(userId = 'u1') {
  const onOfflineChange = vi.fn();
  const adapter = createOfflineJournalAdapter({ getUserId: () => userId, onOfflineChange });
  return { adapter, onOfflineChange };
}

beforeEach(() => {
  api.mockReset();
  localStorage.removeItem(JOURNAL_DRAFT_QUEUE_STORAGE_KEY);
});

describe('carnet sans réseau — adaptateur ForetMap', () => {
  test('sans réseau : « + Nouvel article » ouvre un brouillon local', async () => {
    api.mockRejectedValue(offlineError());
    const { adapter, onOfflineChange } = makeAdapter();
    const { article } = await adapter.createArticle();
    expect(article).toMatchObject({ local: true, title: '', bodyMarkdown: '' });
    expect(String(article.id)).toMatch(/^local-/);
    expect(onOfflineChange).toHaveBeenCalledWith(true);

    // La saisie est enregistrée dans l'appareil, sans réseau.
    const saved = await adapter.updateArticle(article.id, {
      title: 'Sortie mare',
      bodyMarkdown: 'Trois tritons.',
      zoneId: 'z1',
    });
    expect(saved.article).toMatchObject({ title: 'Sortie mare', bodyMarkdown: 'Trois tritons.' });
    expect(listJournalDrafts('u1')[0]).toMatchObject({ title: 'Sortie mare', zoneId: 'z1' });
    expect(api).toHaveBeenCalledTimes(1);
  });

  test('images et épinglage attendent le réseau, avec un message clair', async () => {
    api.mockRejectedValue(offlineError());
    const { adapter } = makeAdapter();
    const { article } = await adapter.createArticle();
    await expect(adapter.addArticleAsset(article.id, 'data:image/png;base64,AA')).rejects.toThrow(
      JOURNAL_OFFLINE_IMAGE_MESSAGE,
    );
    await expect(adapter.pinArticle(article.id, true)).rejects.toThrow(JOURNAL_OFFLINE_PIN_MESSAGE);
  });

  test('lecture : brouillons en tête ; sans réseau, le fil ne montre qu’eux', async () => {
    api.mockRejectedValueOnce(offlineError());
    const { adapter, onOfflineChange } = makeAdapter();
    const { article } = await adapter.createArticle();
    await adapter.updateArticle(article.id, { title: 'Brouillon', bodyMarkdown: 'x' });

    api.mockResolvedValueOnce({
      limits: { maxChars: 500, maxAssets: 3 },
      articles: [{ id: 1, title: 'En ligne' }],
      imports: [],
    });
    const online = await adapter.fetchJournal();
    expect(online.articles.map((a) => a.title)).toEqual(['Brouillon', 'En ligne']);
    expect(onOfflineChange).toHaveBeenLastCalledWith(false);

    api.mockRejectedValueOnce(offlineError());
    const offline = await adapter.fetchJournal();
    expect(offline.articles.map((a) => a.title)).toEqual(['Brouillon']);
    expect(offline.limits).toEqual({ maxChars: 500, maxAssets: 3 });
    expect(onOfflineChange).toHaveBeenLastCalledWith(true);

    // Une erreur serveur n'est pas une panne réseau : elle remonte telle quelle.
    api.mockRejectedValueOnce(Object.assign(new Error('Erreur serveur'), { status: 500 }));
    await expect(adapter.fetchJournal()).rejects.toThrow('Erreur serveur');
  });

  test('envoi : un appel par brouillon avec sa clé ; l’éditeur resté ouvert suit l’article', async () => {
    api.mockRejectedValueOnce(offlineError());
    const { adapter } = makeAdapter();
    const { article } = await adapter.createArticle();
    await adapter.updateArticle(article.id, { title: 'Compost', bodyMarkdown: 'Retourné.' });
    const uuid = listJournalDrafts('u1')[0].client_uuid;

    api.mockResolvedValueOnce({ article: { id: 77 } });
    const out = await adapter.flushDrafts();
    expect(api).toHaveBeenLastCalledWith('/api/user-journal/me/articles', 'POST', {
      client_uuid: uuid,
      title: 'Compost',
      bodyMarkdown: 'Retourné.',
      zoneId: null,
    });
    expect(out.synced).toBe(1);
    expect(out.idMap.get(article.id)).toBe(77);
    expect(listJournalDrafts('u1')).toHaveLength(0);

    // Un enregistrement tardif de l'éditeur part vers l'article créé, pas vers un brouillon.
    api.mockResolvedValueOnce({ article: { id: 77, title: 'Compost bis' } });
    await adapter.updateArticle(article.id, { title: 'Compost bis', bodyMarkdown: 'Retourné.' });
    expect(api).toHaveBeenLastCalledWith('/api/user-journal/me/articles/77', 'PUT', {
      title: 'Compost bis',
      bodyMarkdown: 'Retourné.',
    });
  });

  test('tablette partagée : les brouillons d’un autre compte ne sont ni montrés ni envoyés', async () => {
    api.mockRejectedValueOnce(offlineError());
    const { adapter: other } = makeAdapter('u2');
    const { article } = await other.createArticle();
    await other.updateArticle(article.id, { title: 'À u2', bodyMarkdown: 'secret' });

    const { adapter } = makeAdapter('u1');
    api.mockResolvedValueOnce({ articles: [], imports: [] });
    expect((await adapter.fetchJournal()).articles).toEqual([]);
    api.mockClear();
    await adapter.flushDrafts();
    expect(api).not.toHaveBeenCalled();
    expect(listJournalDrafts('u2')).toHaveLength(1);
  });
});
