import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  JOURNAL_DRAFT_BODY_MAX,
  JOURNAL_DRAFT_QUEUE_STORAGE_KEY,
  clientUuidOfLocalArticle,
  createJournalDraft,
  draftToArticle,
  flushJournalDrafts,
  isLocalArticleId,
  journalDraftRequestBody,
  listJournalDrafts,
  updateJournalDraft,
} from '../../src/utils/journalDraftQueue.js';

beforeEach(() => {
  localStorage.removeItem(JOURNAL_DRAFT_QUEUE_STORAGE_KEY);
});

describe('brouillons du carnet écrits sans réseau', () => {
  test('un brouillon par « + Nouvel article », propre au compte', () => {
    const a = createJournalDraft('u1');
    createJournalDraft('u2');
    expect(a).toMatchObject({ user_id: 'u1', title: '', bodyMarkdown: '', zoneId: null });
    expect(listJournalDrafts('u1')).toHaveLength(1);
    expect(listJournalDrafts('u2')).toHaveLength(1);
    expect(createJournalDraft('')).toBeNull();
  });

  test('article local : identifiant, compteurs, pas d’images', () => {
    const draft = updateJournalDraft(createJournalDraft('u1').client_uuid, {
      title: 'Mare',
      bodyMarkdown: 'Tritons 🦎',
      zoneId: 'z1',
    });
    const article = draftToArticle(draft);
    expect(isLocalArticleId(article.id)).toBe(true);
    expect(clientUuidOfLocalArticle(article.id)).toBe(draft.client_uuid);
    expect(article).toMatchObject({
      title: 'Mare',
      zoneId: 'z1',
      local: true,
      pinned: false,
      assets: [],
      offlineError: '',
    });
    expect(article.usage.charCount).toBe([...'Tritons 🦎'].length);
    expect(journalDraftRequestBody(draft)).toEqual({
      client_uuid: draft.client_uuid,
      title: 'Mare',
      bodyMarkdown: 'Tritons 🦎',
      zoneId: 'z1',
    });
  });

  test('un texte trop long pour l’appareil n’est pas écrit (la saisie précédente reste)', () => {
    const { client_uuid: uuid } = createJournalDraft('u1');
    updateJournalDraft(uuid, { title: 'Court', bodyMarkdown: 'ok' });
    expect(
      updateJournalDraft(uuid, {
        title: 'Long',
        bodyMarkdown: 'x'.repeat(JOURNAL_DRAFT_BODY_MAX + 1),
      }),
    ).toBeNull();
    expect(listJournalDrafts('u1')[0]).toMatchObject({ title: 'Court', bodyMarkdown: 'ok' });
  });

  test('envoi : brouillons vides retirés, brouillon édité laissé, refus gardé avec le texte', async () => {
    const empty = createJournalDraft('u1');
    const editing = createJournalDraft('u1');
    const ok = createJournalDraft('u1');
    const refused = createJournalDraft('u1');
    updateJournalDraft(editing.client_uuid, { bodyMarkdown: 'en cours' });
    updateJournalDraft(ok.client_uuid, { bodyMarkdown: 'à envoyer' });
    updateJournalDraft(refused.client_uuid, { bodyMarkdown: 'zone supprimée', zoneId: 'z9' });
    const send = vi.fn(async (draft) => {
      if (draft.zoneId === 'z9') {
        throw Object.assign(new Error('Zone introuvable'), { status: 400 });
      }
      return { article: { id: 42 } };
    });
    const out = await flushJournalDrafts(send, 'u1', { skip: new Set([editing.client_uuid]) });
    expect(send.mock.calls.map(([d]) => d.client_uuid)).toEqual([
      ok.client_uuid,
      refused.client_uuid,
    ]);
    expect(out.synced).toBe(1);
    expect(out.refused[0].message).toBe('Zone introuvable');
    const left = listJournalDrafts('u1');
    expect(left.map((d) => d.client_uuid).sort()).toEqual(
      [editing.client_uuid, refused.client_uuid].sort(),
    );
    expect(left.some((d) => d.client_uuid === empty.client_uuid)).toBe(false);
    const kept = left.find((d) => d.client_uuid === refused.client_uuid);
    expect(draftToArticle(kept).offlineError).toBe('Zone introuvable');

    // Corrigé par l'élève : le refus est levé, le brouillon repart.
    updateJournalDraft(refused.client_uuid, { bodyMarkdown: 'zone supprimée', zoneId: null });
    await flushJournalDrafts(send, 'u1', { skip: new Set([editing.client_uuid]) });
    expect(listJournalDrafts('u1').map((d) => d.client_uuid)).toEqual([editing.client_uuid]);
  });
});
