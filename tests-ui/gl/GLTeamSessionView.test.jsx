import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { GLTeamSessionView } from '../../src/gl/components/tenir/GLTeamSessionView.jsx';

const apiGlMock = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
  getGlToken: () => 'tok',
}));
vi.mock('../../src/gl/realtime/glSocketClient.js', () => ({
  acquireGlSocket: () => ({ socket: null, release() {} }),
  subscribeGlGame: () => () => {},
}));
vi.mock('../../src/gl/components/GLMapView.jsx', () => ({
  GLMapView: (props) => (
    <div
      data-testid="plateau"
      data-arrivee={String(props.markerArrivalEnabled)}
      data-equipe={String(props.playerTeamId)}
    />
  ),
}));

const auth = {
  userType: 'gl_guest',
  teamSession: { gameId: 7, teamId: 12 },
  teamName: 'Licornes A',
  className: 'Sixième B',
};

function etat({ phase = null, bourses = false } = {}) {
  const tourOuvert = !!phase && phase !== 'clos';
  return {
    game: { id: 7, name: 'Partie', status: 'live' },
    teams: [
      { id: 11, name: 'Gnomes A', type: 'gnome' },
      { id: 12, name: 'Licornes A', type: 'unicorn' },
    ],
    markers: [],
    events: [],
    roster: [
      {
        playerId: 1,
        teamId: 12,
        pseudo: 'joueur-a',
        ...(bourses ? { healthPoints: 4, powerPoints: 3 } : {}),
      },
    ],
    tenir: {
      enabled: true,
      surface: 'tablette',
      settings: { des_count: 2 },
      state: { voilePosition: -1 },
      round: { number: tourOuvert ? 1 : 0, phase, arriveesEnSuspens: [] },
      permissions: {
        jeter: tourOuvert,
        lancer: tourOuvert,
        repondre: tourOuvert,
        fouiller: tourOuvert,
        lire: tourOuvert,
      },
      reserves: [],
      tablette: { teamId: 12, horsTour: !tourOuvert },
    },
  };
}

function brancher(state) {
  apiGlMock.mockImplementation(async (path) => {
    if (path === '/api/gl/games/7') return state;
    if (path === '/api/gl/games/7/tenir/tour') return { round: state.tenir.round, teams: [] };
    if (path === '/api/gl/games/7/chasse') return { pages: [], total: 0, tenues: 0, trouvees: 0 };
    if (path === '/api/gl/games/7/tenir/olu') return { lignes: [], moments: {} };
    return {};
  });
}

describe('GLTeamSessionView — tablette d’équipe', () => {
  // Accolades obligatoires : `mockReset()` renvoie le mock, et vitest rappellerait la valeur
  // renvoyée par `beforeEach` comme une fonction de nettoyage.
  beforeEach(() => {
    apiGlMock.mockReset();
  });

  test('hors tour : lecture seule, aucun geste, aucune bourse', async () => {
    brancher(etat());
    render(<GLTeamSessionView auth={auth} token="tok" onQuit={vi.fn()} onEnded={vi.fn()} />);
    await waitFor(() => screen.getByTestId('gl-team-session-attente'));
    expect(screen.getByText(/Le tour n’est pas ouvert/)).toBeTruthy();
    expect(screen.queryByTestId('gl-tenir-equipe')?.querySelector('[data-geste]')).toBeFalsy();
    expect(screen.getByTestId('plateau').getAttribute('data-arrivee')).toBe('false');
    expect(document.body.textContent).not.toMatch(/❤️|💎/);
    expect(screen.getByText('Licornes A')).toBeTruthy();
  });

  test('tour ouvert : le même écran d’équipe que l’élève connecté, sans « Mes badges »', async () => {
    brancher(etat({ phase: 'jeu', bourses: true }));
    render(<GLTeamSessionView auth={auth} token="tok" onQuit={vi.fn()} onEnded={vi.fn()} />);
    await waitFor(() => screen.getByTestId('gl-tenir-equipe'));
    for (const geste of ['jeter', 'lancer', 'repondre', 'fouiller', 'lire']) {
      expect(document.querySelector(`[data-geste="${geste}"]`)).toBeTruthy();
    }
    expect(document.querySelector('[data-geste="lancer"]').disabled).toBe(false);
    expect(screen.queryByText('Mes badges')).toBeNull();
    expect(screen.getByTestId('plateau').getAttribute('data-equipe')).toBe('12');
    expect(screen.getByTestId('plateau').getAttribute('data-arrivee')).toBe('true');
    // Aucune route réservée à un compte n'est appelée.
    const chemins = apiGlMock.mock.calls.map((c) => c[0]);
    expect(chemins.some((p) => /rewards|auth\/me|market/.test(p))).toBe(false);
  });

  test('session terminée : la tablette revient au code de la classe avec le message du serveur', async () => {
    // L'erreur est fabriquée à l'appel : celle que lève `apiGL` quand le serveur répond
    // 401 `TEAM_SESSION_TERMINEE`.
    apiGlMock.mockImplementation(async () => {
      throw Object.assign(new Error('Cette tablette n’est plus connectée.'), {
        status: 401,
        teamSessionEnded: true,
      });
    });
    const onEnded = vi.fn();
    render(<GLTeamSessionView auth={auth} token="tok" onQuit={vi.fn()} onEnded={onEnded} />);
    await waitFor(() =>
      expect(onEnded).toHaveBeenCalledWith('Cette tablette n’est plus connectée.'),
    );
  });
});
