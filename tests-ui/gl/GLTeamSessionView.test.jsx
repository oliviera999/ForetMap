import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { resetGlTenirOluCache } from '../../src/gl/hooks/useGlTenirOlu.js';
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
      data-presentation={String(props.presentation)}
    />
  ),
}));

const auth = {
  userType: 'gl_guest',
  teamSession: { gameId: 7, teamId: 12 },
  teamName: 'Licornes A',
  className: 'Sixième B',
};

function etat({ phase = null, bourses = false, surface = 'tablette' } = {}) {
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
      surface,
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
    resetGlTenirOluCache();
    window.sessionStorage.clear();
  });

  test('hors tour : le même écran d’équipe, qui attend le prof — aucun geste, aucune bourse', async () => {
    brancher(etat());
    const onQuit = vi.fn();
    render(<GLTeamSessionView auth={auth} token="tok" onQuit={onQuit} onEnded={vi.fn()} />);
    const equipe = await screen.findByTestId('gl-tenir-equipe');
    await waitFor(() =>
      expect(screen.getByTestId('gl-tenir-moment')).toHaveAttribute('data-etat', 'attente'),
    );
    expect(screen.getByTestId('gl-tenir-moment-attente')).toHaveTextContent(
      'Le prof ouvre bientôt le tour.',
    );
    // Un seul bandeau : plus d'en-tête de session, plus de nom de classe, plus d'« Actualiser ».
    expect(document.querySelector('.gl-team-session__head')).toBeNull();
    expect(screen.getByTestId('gl-tenir-bandeau')).toHaveTextContent('Licornes A');
    expect(screen.queryByText(/Sixième B/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Actualiser' })).toBeNull();
    expect(screen.queryByTestId('gl-team-session-attente')).toBeNull();
    // Aucun geste du tour : il ne reste que l'entrée des défis de la Trame.
    expect(
      [...equipe.querySelectorAll('[data-geste]')].map((b) => b.getAttribute('data-geste')),
    ).toEqual(['trame']);
    // Le plateau est dans l'écran, en scène épurée, et ne présente aucune case.
    const plateau = within(screen.getByTestId('gl-tenir-plateau')).getByTestId('plateau');
    expect(plateau.getAttribute('data-presentation')).toBe('tenir');
    expect(plateau.getAttribute('data-arrivee')).toBe('false');
    // La tablette n'affiche aucune bourse hors tour : le serveur les tait, le bandeau aussi.
    expect(document.body.textContent).not.toMatch(/❤️|💎/);
    // « Changer d'équipe » vit dans le tiroir.
    fireEvent.click(screen.getByTestId('gl-tenir-tiroir-bouton'));
    fireEvent.click(await screen.findByTestId('gl-tenir-changer-equipe'));
    expect(onQuit).toHaveBeenCalled();
  });

  test('tour ouvert : le même écran d’équipe que l’élève connecté, sans « Mes badges »', async () => {
    brancher(etat({ phase: 'jeu', bourses: true }));
    render(<GLTeamSessionView auth={auth} token="tok" onQuit={vi.fn()} onEnded={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('gl-tenir-maintenant')).toBeInTheDocument());
    // Les gestes ouverts : un gros bouton, puis des puces ; rien de grisé.
    expect(document.querySelector('.gl-tenir-moment__gros').getAttribute('data-geste')).toBe(
      'lancer',
    );
    for (const geste of ['lancer', 'fouiller', 'jeter']) {
      expect(document.querySelector(`[data-geste="${geste}"]`)).toBeTruthy();
    }
    expect(document.querySelectorAll('[data-geste]:disabled')).toHaveLength(0);
    expect(screen.getByTestId('gl-tenir-bourses')).toHaveTextContent('💎 3');
    expect(document.body.textContent).not.toMatch(/❤️/);
    expect(screen.getByTestId('plateau').getAttribute('data-equipe')).toBe('12');
    expect(screen.getByTestId('plateau').getAttribute('data-arrivee')).toBe('true');
    // Aucune route réservée à un compte n'est appelée.
    const chemins = apiGlMock.mock.calls.map((c) => c[0]);
    expect(chemins.some((p) => /rewards|auth\/me|market/.test(p))).toBe(false);
    // M13 : plus de Marché sur la tablette d'équipe — il passe par le compte de chacun. La
    // phrase n'est plus posée sous l'écran : Olu la dit, une fois.
    expect(screen.queryByTestId('gl-team-session-marche')).toBeNull();
    expect(screen.queryByText('Marché')).toBeNull();
    expect(screen.queryByTestId('gl-team-session-comptes')).toBeNull();
    await waitFor(() =>
      expect(screen.getByTestId('gl-olu-bulle')).toHaveTextContent(
        'Le Marché et le Seuil s’ouvrent depuis le compte de chacun.',
      ),
    );
    fireEvent.click(screen.getByTestId('gl-tenir-tiroir-bouton'));
    const tiroir = await screen.findByTestId('gl-tenir-tiroir');
    expect(within(tiroir).queryByText('Mes badges')).toBeNull();
  });

  /**
   * Garde-fou 12 — « au tableau, rien ne change sans décision » : quand la partie se joue au
   * tableau (ou que le prof a repris tous les gestes, « Tout au tableau »), la tablette garde
   * l'écran d'avant le chantier « écrans de séance ».
   */
  describe('surface « tableau » : l’ancien écran, inchangé', () => {
    test('hors tour : l’en-tête de session, « Le tour n’est pas ouvert », le plateau classique', async () => {
      brancher(etat({ surface: 'tableau' }));
      render(<GLTeamSessionView auth={auth} token="tok" onQuit={vi.fn()} onEnded={vi.fn()} />);
      await waitFor(() => screen.getByTestId('gl-team-session-attente'));
      expect(screen.getByText(/Le tour n’est pas ouvert/)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Changer d’équipe' })).toBeTruthy();
      expect(screen.getByText(/Sixième B/)).toBeTruthy();
      expect(screen.queryByTestId('gl-tenir-bandeau')).toBeNull();
      expect(screen.queryByTestId('gl-tenir-moment')).toBeNull();
      expect(screen.getByTestId('plateau').getAttribute('data-presentation')).toBe('standard');
      expect(document.body.textContent).not.toMatch(/❤️|💎/);
    });

    test('tour ouvert : les cinq boutons de l’ancien écran et la phrase sur les comptes', async () => {
      const state = etat({ phase: 'jeu', surface: 'tableau' });
      // Au tableau, le prof porte les gestes : le serveur n'en ouvre aucun à l'équipe.
      state.tenir.permissions = {};
      brancher(state);
      render(<GLTeamSessionView auth={auth} token="tok" onQuit={vi.fn()} onEnded={vi.fn()} />);
      await waitFor(() => screen.getByTestId('gl-tenir-equipe'));
      expect(screen.queryByTestId('gl-tenir-moment')).toBeNull();
      for (const geste of ['jeter', 'lancer', 'repondre', 'fouiller', 'lire']) {
        expect(document.querySelector(`[data-geste="${geste}"]`).disabled).toBe(true);
      }
      expect(screen.getByRole('button', { name: 'Actualiser' })).toBeTruthy();
      expect(screen.getByTestId('gl-team-session-comptes').textContent).toBe(
        'Le Marché et le Seuil s’ouvrent depuis le compte de chacun.',
      );
      expect(screen.getByTestId('plateau').getAttribute('data-presentation')).toBe('standard');
    });
  });

  test('partie illisible : l’erreur s’affiche, et « Changer d’équipe » reste à portée', async () => {
    apiGlMock.mockImplementation(async () => {
      throw new Error('Le serveur ne répond pas.');
    });
    const onQuit = vi.fn();
    render(<GLTeamSessionView auth={auth} token="tok" onQuit={onQuit} onEnded={vi.fn()} />);
    expect(await screen.findByText('Le serveur ne répond pas.')).toBeTruthy();
    expect(screen.getByText('Licornes A')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Changer d’équipe' }));
    expect(onQuit).toHaveBeenCalled();
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
