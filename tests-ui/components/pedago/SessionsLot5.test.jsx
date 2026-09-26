// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const apiMock = vi.fn();
vi.mock('../../../src/services/api.js', () => ({
  api: (...args) => apiMock(...args),
  getAuthToken: () => '',
  AccountDeletedError: class AccountDeletedError extends Error {},
}));

const { SessionsView, sessionLockFor } =
  await import('../../../src/components/pedago/SessionsView.jsx');
const { SessionStepEditor, moveStep } =
  await import('../../../src/components/pedago/SessionStepEditor.jsx');
const { PedagoSessionDoneDialog } =
  await import('../../../src/components/pedago/PedagoSessionDoneDialog.jsx');

const sessionA = {
  id: 'sa',
  slug: 'seance-a',
  title: 'Séance A',
  level: 'college',
  isPublished: true,
  templateKey: 'college_reconaitre',
  config: {},
  steps: [{ id: 'a1', title: 'A1', action: { type: 'message', payload: {} } }],
};
const sessionB = {
  id: 'sb',
  slug: 'seance-b',
  title: 'Séance B',
  level: 'lycee',
  isPublished: true,
  templateKey: 'custom',
  config: { requiresSessionId: 'sa' },
  steps: [{ id: 'b1', title: 'B1', action: { type: 'message', payload: {} } }],
};

function mockApi({ runs = [], rewards = [], catalogue = [] } = {}) {
  apiMock.mockImplementation(async (path) => {
    if (path.startsWith('/api/pedago-sessions/me/runs')) return { runs };
    if (path.startsWith('/api/pedago-sessions/stats')) return { stats: [] };
    if (path.includes('/share')) {
      return {
        link: 'https://x/?seance=seance-a',
        qrDataUrl: 'data:image/png;base64,AA',
        isPublished: true,
      };
    }
    if (path.includes('/runs')) {
      return {
        students: [
          {
            userId: 'u1',
            firstName: 'Ada',
            lastName: 'L',
            completed: true,
            completionCount: 1,
            startCount: 1,
          },
          {
            userId: 'u2',
            firstName: 'Bo',
            lastName: 'M',
            completed: false,
            completionCount: 0,
            startCount: 0,
          },
        ],
      };
    }
    if (path.startsWith('/api/pedago-sessions')) return { items: [sessionA, sessionB] };
    if (path.startsWith('/api/rewards/me')) return { rewards, catalogue };
    if (path.startsWith('/api/groups/options')) return { groups: [] };
    if (path.startsWith('/api/id-keys')) return { items: [] };
    return {};
  });
}

beforeEach(() => {
  apiMock.mockReset();
});

describe('sessionLockFor', () => {
  it('verrouille tant que le prérequis n’est pas terminé, jamais pour un gestionnaire', () => {
    expect(sessionLockFor(sessionB, {}, false)).toBe('sa');
    expect(sessionLockFor(sessionB, { sa: { completed: true } }, false)).toBeNull();
    expect(sessionLockFor(sessionB, {}, true)).toBeNull();
    expect(sessionLockFor(sessionA, {}, false)).toBeNull();
  });
});

describe('SessionsView — lot 5', () => {
  it('élève : séance verrouillée par prérequis + badges', async () => {
    mockApi({
      rewards: [{ key: 'session_first', emoji: '🌱', title: 'Première séance' }],
      catalogue: [
        { key: 'session_first', emoji: '🌱', title: 'Première séance', description: 'x' },
        { key: 'session_three', emoji: '🌿', title: 'Explorateur', description: 'y' },
      ],
    });
    render(<SessionsView isAuthenticated onStartSession={vi.fn()} />);
    const prereq = await screen.findByTestId('pedago-session-prereq');
    expect(prereq.textContent).toContain('Termine d’abord « Séance A »');
    const buttons = screen.getAllByRole('button', { name: 'Démarrer' });
    expect(buttons[1].disabled).toBe(true);
    await waitFor(() => expect(screen.getByTestId('pedago-rewards').textContent).toContain('1/2'));
  });

  it('récompenses éteintes (`rewardsEnabled=false`) : ni appel /api/rewards, ni « Mes badges »', async () => {
    mockApi({
      rewards: [{ key: 'session_first', emoji: '🌱', title: 'Première séance' }],
      catalogue: [
        { key: 'session_first', emoji: '🌱', title: 'Première séance', description: 'x' },
      ],
    });
    render(<SessionsView isAuthenticated rewardsEnabled={false} onStartSession={vi.fn()} />);
    await screen.findByText('Séance A');
    // Les exécutions restent chargées : seule la ludification est coupée.
    await waitFor(() =>
      expect(apiMock.mock.calls.some(([p]) => p.startsWith('/api/pedago-sessions/me/runs'))).toBe(
        true,
      ),
    );
    expect(apiMock.mock.calls.some(([p]) => p.startsWith('/api/rewards'))).toBe(false);
    expect(screen.queryByTestId('pedago-rewards')).toBeNull();
  });

  it('séances éteintes pour les élèves : bandeau pour le prof gestionnaire, catalogue intact', async () => {
    mockApi();
    render(
      <SessionsView canManage isAuthenticated moduleOffForLearners onStartSession={vi.fn()} />,
    );
    await screen.findByText('Séance A');
    const banners = screen.getAllByTestId('pedago-module-off-banner');
    expect(banners).toHaveLength(1);
    expect(banners[0].textContent).toContain(
      'Séances pédagogiques — module désactivé pour les élèves',
    );
    expect(banners[0].textContent).toContain('rien n’est visible côté élève');
    expect(screen.getByTestId('pedago-session-create')).toBeTruthy();
  });

  it('récompenses éteintes : bandeau pour le prof seulement, rien pour l’élève', async () => {
    mockApi();
    const { unmount } = render(
      <SessionsView canManage isAuthenticated rewardsEnabled={false} onStartSession={vi.fn()} />,
    );
    await screen.findByText('Séance A');
    expect(screen.getByTestId('pedago-module-off-banner').textContent).toContain(
      'apparaîtront tous au rallumage',
    );
    unmount();
    render(<SessionsView isAuthenticated rewardsEnabled={false} onStartSession={vi.fn()} />);
    await screen.findByText('Séance A');
    expect(screen.queryByTestId('pedago-module-off-banner')).toBeNull();
    expect(screen.queryByTestId('pedago-rewards')).toBeNull();
  });

  it('prof : partage (lien + QR) et suivi par élève', async () => {
    mockApi();
    render(<SessionsView canManage isAuthenticated onStartSession={vi.fn()} />);
    await screen.findByText('Séance A');
    fireEvent.click(screen.getAllByRole('button', { name: 'Partager' })[0]);
    const share = await screen.findByTestId('pedago-session-share');
    await waitFor(() => expect(share.textContent).toContain('https://x/?seance=seance-a'));
    expect(screen.getByAltText(/QR code/)).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Suivi' })[0]);
    await waitFor(() =>
      expect(screen.getByTestId('pedago-session-runs-summary').textContent).toContain('1 terminée'),
    );
    expect(screen.getByText('Pas commencée')).toBeTruthy();
  });

  it('prof : création d’une séance libre (brouillon) puis éditeur d’étapes', async () => {
    mockApi();
    apiMock.mockImplementationOnce(async () => ({ items: [] }));
    render(<SessionsView canManage isAuthenticated onStartSession={vi.fn()} />);
    await screen.findByTestId('pedago-session-create');
    const created = { ...sessionB, id: 'new', title: 'Nouvelle séance', config: {} };
    apiMock.mockImplementation(async (path, method) => {
      if (method === 'POST') return created;
      return path.startsWith('/api/pedago-sessions') ? { items: [] } : {};
    });
    fireEvent.click(screen.getByRole('button', { name: /Créer/ }));
    await screen.findByTestId('pedago-step-editor');
    expect(apiMock).toHaveBeenCalledWith(
      '/api/pedago-sessions',
      'POST',
      expect.objectContaining({ templateKey: 'custom' }),
    );
  });
});

describe('SessionStepEditor', () => {
  it('moveStep respecte les bornes', () => {
    const s = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(moveStep(s, 0, 1).map((x) => x.id)).toEqual([2, 1, 3]);
    expect(moveStep(s, 0, -1)).toBe(s);
    expect(moveStep(s, 2, 1)).toBe(s);
  });

  it('ajoute une étape et affiche les champs de l’outil choisi', () => {
    const onChange = vi.fn();
    const steps = [
      { id: 's1', title: 'A', body: '', action: { type: 'open_map_route', payload: {} } },
    ];
    render(
      <SessionStepEditor
        steps={steps}
        onChange={onChange}
        mapRoutes={[{ id: 'r1', slug: 'tour', title: 'Tour du jardin' }]}
      />,
    );
    expect(screen.getByRole('option', { name: 'Tour du jardin' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une étape' }));
    expect(onChange.mock.calls[0][0]).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Supprimer l’étape 1' }).disabled).toBe(true);
  });
});

describe('PedagoSessionDoneDialog — badges', () => {
  it('affiche les badges nouvellement obtenus', () => {
    render(
      <PedagoSessionDoneDialog
        session={{
          title: 'X',
          steps: [],
          newRewards: [
            { key: 'session_first', emoji: '🌱', title: 'Première séance', description: 'd' },
          ],
        }}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('pedago-session-new-rewards').textContent).toContain(
      'Première séance',
    );
  });

  it('module récompenses éteint (`showRewards=false`) : aucun badge affiché', () => {
    render(
      <PedagoSessionDoneDialog
        session={{
          title: 'X',
          steps: [],
          newRewards: [
            { key: 'session_first', emoji: '🌱', title: 'Première séance', description: 'd' },
          ],
        }}
        showRewards={false}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Séance terminée')).toBeTruthy();
    expect(screen.queryByTestId('pedago-session-new-rewards')).toBeNull();
  });
});
