// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

/**
 * Audit du 19/11/2026 — éditeur de tutoriels G&L.
 *  - C4 (écran) : `is_published !== false` était toujours vrai (la base renvoie 0 ou 1) ; à la
 *    réouverture, la case revenait cochée et l'enregistrement automatique republiait.
 *  - E6 : chaque enregistrement automatique vidait le brouillon et fermait l'éditeur.
 */

vi.mock('../../src/gl/services/apiGL.js', () => ({ apiGL: vi.fn() }));
vi.mock('../../src/shared/components/AppDialogsProvider.jsx', () => ({
  useAppDialogs: () => ({ confirm: vi.fn(async () => true) }),
}));
vi.mock('../../src/gl/components/ui/GLRichTextEditor.jsx', () => ({
  GLRichTextEditor: ({ value, onChange }) => (
    <textarea aria-label="Texte enrichi" value={value} onChange={onChange} />
  ),
}));
vi.mock('../../src/gl/components/GLLearningAcknowledgeButton.jsx', () => ({
  GLLearningAcknowledgeButton: () => null,
}));
vi.mock('../../src/gl/components/GLJournalImportButton.jsx', () => ({
  GLJournalImportButton: () => null,
}));
vi.mock('../../src/gl/components/GLGlossaryMarkdown.jsx', () => ({
  GLGlossaryMarkdown: () => null,
}));

import { apiGL } from '../../src/gl/services/apiGL.js';
import { GLTutorialsView } from '../../src/gl/components/GLTutorialsView.jsx';

const DEBOUNCE_MS = 800;
let tutorials = [];
let postGate = null;

function callsTo(method, urlPart = '/api/gl/tutorials') {
  return vi
    .mocked(apiGL)
    .mock.calls.filter(([url, m]) => (m || 'GET') === method && String(url).includes(urlPart));
}

async function advance(ms) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const titleInput = () => screen.getByLabelText('Titre');
const bodyInput = () => screen.getByLabelText('Texte enrichi');
const publishedBox = () => screen.getByRole('checkbox');

beforeEach(() => {
  vi.useFakeTimers();
  tutorials = [];
  postGate = null;
  vi.mocked(apiGL).mockReset();
  vi.mocked(apiGL).mockImplementation(async (url, method, body) => {
    if (url === '/api/gl/tutorials' && !method) return { tutorials };
    if (url === '/api/gl/tutorials' && method === 'POST') {
      if (postGate) await postGate.promise;
      const created = {
        id: 42,
        slug: body.slug,
        title: body.title,
        body_markdown: body.bodyMarkdown,
        is_published: body.isPublished ? 1 : 0,
      };
      tutorials = [created];
      return created;
    }
    if (method === 'PUT') return { id: 42 };
    const found = tutorials.find((t) => url === `/api/gl/tutorials/${t.id}`);
    if (found) return found;
    return {};
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GLTutorialsView — édition', () => {
  test('C4 — un tutoriel non publié se rouvre case décochée', async () => {
    tutorials = [
      { id: 7, slug: 'brouillon', title: 'Brouillon', body_markdown: 'x', is_published: 0 },
    ];
    render(<GLTutorialsView canManage />);
    await advance(0);
    fireEvent.click(screen.getByRole('button', { name: 'Éditer' }));
    await advance(0);
    expect(publishedBox().checked).toBe(false);
  });

  test('C4 — un tutoriel publié se rouvre case cochée', async () => {
    tutorials = [{ id: 8, slug: 'publie', title: 'Publié', body_markdown: 'x', is_published: 1 }];
    render(<GLTutorialsView canManage />);
    await advance(0);
    fireEvent.click(screen.getByRole('button', { name: 'Éditer' }));
    await advance(0);
    expect(publishedBox().checked).toBe(true);
  });

  test('E6 — l’enregistrement automatique garde l’éditeur ouvert, le texte et l’id créé', async () => {
    render(<GLTutorialsView canManage />);
    await advance(0);
    fireEvent.click(screen.getByRole('button', { name: 'Nouveau tutoriel' }));
    fireEvent.change(titleInput(), { target: { value: 'Mon tutoriel' } });
    fireEvent.change(bodyInput(), { target: { value: 'Premier jet' } });
    await advance(DEBOUNCE_MS + 50);

    expect(callsTo('POST')).toHaveLength(1);
    expect(titleInput().value).toBe('Mon tutoriel');
    expect(bodyInput().value).toBe('Premier jet');

    // La suite de la saisie met à jour le tutoriel créé : pas de second tutoriel.
    fireEvent.change(bodyInput(), { target: { value: 'Premier jet, suite' } });
    await advance(DEBOUNCE_MS + 50);
    expect(callsTo('POST')).toHaveLength(1);
    const puts = callsTo('PUT', '/api/gl/tutorials/42');
    expect(puts).toHaveLength(1);
    expect(puts[0][2].bodyMarkdown).toBe('Premier jet, suite');
    expect(bodyInput().value).toBe('Premier jet, suite');
  });

  test('E6 — ce qui est tapé pendant la création n’est pas perdu', async () => {
    let release;
    postGate = { promise: new Promise((resolve) => (release = resolve)) };
    render(<GLTutorialsView canManage />);
    await advance(0);
    fireEvent.click(screen.getByRole('button', { name: 'Nouveau tutoriel' }));
    fireEvent.change(titleInput(), { target: { value: 'Mon tutoriel' } });
    fireEvent.change(bodyInput(), { target: { value: 'Début' } });
    await advance(DEBOUNCE_MS + 50);
    expect(callsTo('POST')).toHaveLength(1);

    fireEvent.change(bodyInput(), { target: { value: 'Début et suite' } });
    release();
    // Un `act` à part : la création se termine et l'écran se redessine avec l'id créé avant
    // que le minuteur de la saisie suivante ne tombe (comme dans un navigateur).
    await advance(0);
    await advance(DEBOUNCE_MS * 2 + 100);

    expect(bodyInput().value).toBe('Début et suite');
    expect(callsTo('POST')).toHaveLength(1);
    const puts = callsTo('PUT', '/api/gl/tutorials/42');
    expect(puts.at(-1)[2].bodyMarkdown).toBe('Début et suite');
  });

  test('E6 — l’éditeur ne se ferme que sur le bouton, après un dernier enregistrement', async () => {
    tutorials = [{ id: 42, slug: 't', title: 'Titre', body_markdown: 'x', is_published: 1 }];
    render(<GLTutorialsView canManage />);
    await advance(0);
    fireEvent.click(screen.getByRole('button', { name: 'Éditer' }));
    await advance(0);
    fireEvent.change(bodyInput(), { target: { value: 'dernier mot' } });
    fireEvent.click(screen.getByRole('button', { name: 'Fermer l’éditeur' }));
    await advance(0);

    expect(screen.queryByLabelText('Titre')).toBeNull();
    const puts = callsTo('PUT', '/api/gl/tutorials/42');
    expect(puts).toHaveLength(1);
    expect(puts[0][2].bodyMarkdown).toBe('dernier mot');
  });
});
