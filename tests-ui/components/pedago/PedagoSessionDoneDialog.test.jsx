// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const apiMock = vi.fn();
vi.mock('../../../src/services/api.js', () => ({
  api: (...args) => apiMock(...args),
  getAuthToken: () => '',
  AccountDeletedError: class AccountDeletedError extends Error {},
}));

const { PedagoSessionDoneDialog, buildPedagoSessionNote } =
  await import('../../../src/components/pedago/PedagoSessionDoneDialog.jsx');
const { SessionsView } = await import('../../../src/components/pedago/SessionsView.jsx');

const session = {
  id: 'pedago-session-college-qui-mange',
  title: 'Qui mange qui sur le site',
  steps: [
    { id: 'b1', title: 'Consigne', action: { type: 'message', payload: {} } },
    { id: 'b2', title: 'Plante 1', action: { type: 'open_plant', payload: { plantId: 7 } } },
    {
      id: 'b3',
      title: 'Réseau',
      action: { type: 'open_foodweb', payload: { highlightPlantId: 7, mapId: 'm' } },
    },
    { id: 'b4', title: 'Plante 2', action: { type: 'open_plant', payload: { plantId: 9 } } },
  ],
};

beforeEach(() => {
  apiMock.mockReset();
});

describe('buildPedagoSessionNote', () => {
  it('liste les étapes, les invites et les plantes dédupliquées en encarts carnet', () => {
    const note = buildPedagoSessionNote(session);
    expect(note.title).toBe('Séance : Qui mange qui sur le site');
    expect(note.bodyMarkdown).toContain('1. Consigne');
    expect(note.bodyMarkdown).toContain('4. Plante 2');
    expect(note.bodyMarkdown).toContain('Ce que j’ai observé :');
    expect(note.bodyMarkdown).toContain('Ce que j’ai appris :');
    const embeds = note.bodyMarkdown.match(/data-embed-type="plant"/g) || [];
    expect(embeds).toHaveLength(2);
    expect(note.bodyMarkdown).toContain('data-ref="7"');
    expect(note.bodyMarkdown).toContain('data-ref="9"');
  });

  it('sans plante : pas de section plantes', () => {
    const note = buildPedagoSessionNote({ title: 'X', steps: [{ title: 'A' }] });
    expect(note.bodyMarkdown).not.toContain('Plantes de la séance');
  });
});

describe('PedagoSessionDoneDialog', () => {
  it('sans carnet : aucun bouton d’ajout', () => {
    render(
      <PedagoSessionDoneDialog session={session} canAddToNotebook={false} onClose={vi.fn()} />,
    );
    expect(screen.getByText('Séance terminée')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Ajouter une note/ })).toBeNull();
  });

  it('ajoute la note via la route carnet existante puis propose d’ouvrir le carnet', async () => {
    apiMock.mockResolvedValueOnce({ article: { id: 1 } });
    const onOpenNotebook = vi.fn();
    render(
      <PedagoSessionDoneDialog
        session={session}
        canAddToNotebook
        onClose={vi.fn()}
        onOpenNotebook={onOpenNotebook}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Ajouter une note/ }));
    await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());
    expect(apiMock).toHaveBeenCalledWith(
      '/api/user-journal/me/articles',
      'POST',
      expect.objectContaining({ title: 'Séance : Qui mange qui sur le site' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir mon carnet' }));
    expect(onOpenNotebook).toHaveBeenCalled();
  });

  it('erreur carnet : message affiché, bouton toujours présent', async () => {
    apiMock.mockRejectedValueOnce(new Error('Le carnet est désactivé sur cette plateforme'));
    render(<PedagoSessionDoneDialog session={session} canAddToNotebook onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Ajouter une note/ }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/désactivé/));
    expect(screen.getByRole('button', { name: /Ajouter une note/ })).toBeTruthy();
  });
});

describe('SessionsView — preuve légère', () => {
  function mockApi({ runs = [], stats = [] } = {}) {
    apiMock.mockImplementation(async (path) => {
      if (path.startsWith('/api/pedago-sessions/me/runs')) return { runs };
      if (path.startsWith('/api/pedago-sessions/stats')) return { stats };
      if (path.startsWith('/api/pedago-sessions')) {
        return { items: [{ ...session, level: 'college', isPublished: true }] };
      }
      if (path.startsWith('/api/id-keys')) return { items: [] };
      return {};
    });
  }

  it('élève connecté : badge Terminée ×N', async () => {
    mockApi({ runs: [{ sessionId: session.id, completed: true, completionCount: 2 }] });
    render(<SessionsView isAuthenticated onStartSession={vi.fn()} />);
    const badge = await screen.findByTestId('pedago-session-done-badge');
    expect(badge.textContent).toContain('Terminée ×2');
    expect(screen.queryByTestId('pedago-session-stats')).toBeNull();
  });

  it('prof : compteurs démarrées / terminées', async () => {
    mockApi({ stats: [{ sessionId: session.id, startedUsers: 5, completedUsers: 3 }] });
    render(<SessionsView canManage isAuthenticated onStartSession={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByTestId('pedago-session-stats').textContent).toBe(
        'Démarrée par 5 · terminée par 3',
      ),
    );
  });

  it('visiteur non connecté : ni /me/runs ni badge', async () => {
    mockApi();
    render(<SessionsView onStartSession={vi.fn()} />);
    await screen.findByText('Qui mange qui sur le site');
    expect(apiMock.mock.calls.some(([p]) => p.includes('/me/runs'))).toBe(false);
  });
});
