// Carnet sans réseau (piste D, audit du 25/09/2026, § 1.4.6 et § 2.4) : montage de la vue
// ForetMap avec sa vraie carte d'article ; seule l'API est bouchonnée.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../../../src/shared/platform/image.js', async (importOriginal) => ({
  ...(await importOriginal()),
  compressImageWithPreset: vi.fn(async () => 'data:image/png;base64,AAAA'),
  isLikelyImageFile: () => true,
}));
vi.mock('../../../src/services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
  getAuthUserId: vi.fn(() => 'u1'),
}));

const { api, NETWORK_FAILURE_CODE } = await import('../../../src/services/api');
const { UserJournalView } = await import('../../../src/components/journal/UserJournalView.jsx');
const { JOURNAL_DRAFT_QUEUE_STORAGE_KEY, listJournalDrafts } =
  await import('../../../src/utils/journalDraftQueue.js');

const offlineError = () =>
  Object.assign(new Error('Pas de réseau'), { code: NETWORK_FAILURE_CODE });
const SERVER = {
  limits: { maxChars: 0, maxAssets: 0 },
  articles: [{ id: 5, title: 'Article en ligne', createdAt: '2026-09-01T10:00:00Z' }],
  imports: [],
};

let online = false;
let created = [];

beforeEach(() => {
  localStorage.removeItem(JOURNAL_DRAFT_QUEUE_STORAGE_KEY);
  online = false;
  created = [];
  api.mockReset();
  api.mockImplementation(async (path, method, body) => {
    if (!online) throw offlineError();
    if (path === '/api/user-journal/me/articles' && method === 'POST') {
      created.push(body);
      return {
        article: {
          id: 90,
          title: body.title,
          bodyMarkdown: body.bodyMarkdown,
          createdAt: '2026-09-25T10:00:00Z',
        },
      };
    }
    if (path === '/api/user-journal/me') {
      return {
        ...SERVER,
        articles: [
          ...created.map((b, i) => ({
            id: 90 + i,
            title: b.title,
            createdAt: '2026-09-25T10:00:00Z',
          })),
          ...SERVER.articles,
        ],
      };
    }
    return {};
  });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('UserJournalView sans réseau', () => {
  test('le carnet dit qu’il manque le réseau, sans se prétendre vide', async () => {
    render(<UserJournalView />);
    expect(await screen.findByText(/Pas de réseau : ton carnet complet s’affichera/)).toBeTruthy();
    expect(screen.queryByText(/Ton carnet est encore vide/)).toBeNull();
    expect(screen.getByRole('button', { name: /Nouvel article/ })).not.toBeDisabled();
  });

  test('écrire un article sans réseau, puis l’envoyer au retour du réseau', async () => {
    render(<UserJournalView />);
    await screen.findByText(/Pas de réseau : ton carnet complet/);

    fireEvent.click(screen.getByRole('button', { name: /Nouvel article/ }));
    const editor = await screen.findByTestId('journal-article-edit');
    expect(editor).toHaveTextContent(
      'Gardé sur l’appareil — partira tout seul au retour du réseau',
    );
    expect(screen.queryByRole('button', { name: /Épingler/ })).toBeNull();

    fireEvent.change(screen.getByLabelText('Titre de l’article'), {
      target: { value: 'Sortie à la mare' },
    });
    fireEvent.change(screen.getByLabelText('Contenu de l’article'), {
      target: { value: 'Trois tritons palmés.' },
    });
    // Enregistrement automatique (anti-rebond 800 ms) : dans l'appareil, pas sur le réseau.
    await waitFor(
      () =>
        expect(listJournalDrafts('u1')[0]).toMatchObject({
          title: 'Sortie à la mare',
          bodyMarkdown: 'Trois tritons palmés.',
        }),
      { timeout: 3000 },
    );

    // Terminer l'édition puis retrouver le réseau : le brouillon part avec sa clé.
    fireEvent.click(screen.getByRole('button', { name: 'Terminer l’édition' }));
    const uuid = listJournalDrafts('u1')[0].client_uuid;
    online = true;
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]).toEqual({
      client_uuid: uuid,
      title: 'Sortie à la mare',
      bodyMarkdown: 'Trois tritons palmés.',
      zoneId: null,
    });
    expect(await screen.findByText('Ton article écrit sans réseau est envoyé ✓')).toBeTruthy();
    expect(listJournalDrafts('u1')).toHaveLength(0);
    expect(await screen.findByText('Article en ligne')).toBeTruthy();
    expect(screen.queryByText(/Pas de réseau : ton carnet complet/)).toBeNull();
  });

  test('une image sans réseau : message clair, le texte reste', async () => {
    render(<UserJournalView />);
    await screen.findByText(/Pas de réseau : ton carnet complet/);
    fireEvent.click(screen.getByRole('button', { name: /Nouvel article/ }));
    await screen.findByTestId('journal-article-edit');
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    const input = document.querySelector('input[type="file"]');
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    expect(await screen.findByText(/les images s’ajoutent une fois l’article envoyé/)).toBeTruthy();
    expect(listJournalDrafts('u1')).toHaveLength(1);
  });
});
