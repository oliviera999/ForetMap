import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { GLTourScreen } from '../../src/gl/components/mj/GLTourScreen.jsx';

const apiGlMock = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
  getGlToken: () => 'tok',
}));
vi.mock('../../src/shared/components/AppDialogsProvider.jsx', () => ({
  useAppDialogs: () => ({
    confirm: vi.fn().mockResolvedValue(true),
    prompt: vi.fn().mockResolvedValue(''),
  }),
}));

const teams = [
  { id: 1, name: 'Gnomes A', type: 'gnome' },
  { id: 2, name: 'Licornes A', type: 'unicorn' },
];

function tourView(overrides = {}) {
  return {
    gameId: 7,
    roundNumber: 1,
    surface: 'tableau',
    desMode: 'physique',
    round: {
      number: 1,
      phase: 'jeu',
      ordre: [2, 1],
      equipeActiveId: 2,
      ventTeamId: null,
      souffle: null,
      passeur: null,
      oluErreur: { id: 'olu-55', texte: 'Le manchot vole très bien, c’est connu.' },
      oluCorrigeTeamId: null,
      operateurs: {},
      absences: [],
      effets: [],
      fenetresFouille: {},
      desEnAttente: [],
    },
    teams: [
      {
        id: 1,
        name: 'Gnomes A',
        type: 'gnome',
        pathIndex: 3,
        auCamp: false,
        hasRolledDiceThisRound: false,
      },
      {
        id: 2,
        name: 'Licornes A',
        type: 'unicorn',
        pathIndex: 1,
        auCamp: false,
        hasRolledDiceThisRound: false,
      },
    ],
    campIndex: 11,
    lumiere: { total: 0, paliers: [] },
    ...overrides,
  };
}

const tenir = {
  enabled: true,
  surface: 'tableau',
  settings: { des_count: 2, des_mode_effectif: 'physique', sablier_secondes: 180, voile: true },
  retraits: [],
};

describe('GLTourScreen', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
    apiGlMock.mockImplementation(async (path) => {
      if (path.endsWith('/tenir/tour')) return tourView();
      if (path.includes('/journal/')) return { events: [], teams: [] };
      return { ok: true };
    });
  });

  test('affiche le bandeau de phase, les cartes d’équipe dans l’ordre inverse du plateau et le sablier', async () => {
    render(
      <GLTourScreen
        game={{ id: 7 }}
        teams={teams}
        roster={[]}
        tenir={tenir}
        token="tok"
        onReloadGame={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText(/Tour 1 · Jeu · tableau/)).toBeInTheDocument());
    const cards = screen.getAllByTestId(/gl-tour-team-/);
    expect(cards[0]).toHaveAttribute('data-testid', 'gl-tour-team-2');
    expect(cards[0]).toHaveAttribute('aria-current', 'true');
    expect(screen.getByTestId('gl-tour-sablier')).toHaveTextContent('3:00');
    expect(screen.getByTestId('gl-tour-olu')).toHaveTextContent('manchot');
  });

  test('en tableau, seule l’équipe active peut saisir un jet ; « Équipe suivante » appelle le serveur', async () => {
    render(
      <GLTourScreen
        game={{ id: 7 }}
        teams={teams}
        roster={[]}
        tenir={tenir}
        token="tok"
        onReloadGame={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getAllByTestId('gl-tour-des').length).toBe(2));
    const [active, inactive] = screen.getAllByTestId('gl-tour-des');
    expect(active.querySelector('button[type="submit"]').disabled).toBe(false);
    expect(inactive.querySelector('button[type="submit"]').disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Équipe suivante' }));
    await waitFor(() =>
      expect(apiGlMock).toHaveBeenCalledWith(
        '/api/gl/games/7/tenir/tour/equipe-suivante',
        'POST',
        {},
      ),
    );
  });

  test('sans tour ouvert : bouton « Ouvrir le tour »', async () => {
    apiGlMock.mockImplementation(async (path) => {
      if (path.endsWith('/tenir/tour')) return tourView({ round: null, roundNumber: 0 });
      return { events: [], teams: [] };
    });
    render(
      <GLTourScreen
        game={{ id: 7 }}
        teams={teams}
        roster={[]}
        tenir={tenir}
        token="tok"
        onReloadGame={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Ouvrir le tour' })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le tour' }));
    await waitFor(() =>
      expect(apiGlMock).toHaveBeenCalledWith('/api/gl/games/7/tenir/tour/ouvrir', 'POST', {}),
    );
  });
  test('tour clos : la ligne « Ce tour : … » donne les durées par phase ; rien pendant le jeu', async () => {
    const libelle = 'ouverture 1 min 10, jeu 6 min 40, souffle 0 min 50';
    apiGlMock.mockImplementation(async (path) => {
      if (path.endsWith('/tenir/tour')) {
        const view = tourView();
        return {
          ...view,
          round: {
            ...view.round,
            phase: 'clos',
            durees: { phases: { ouverture: 70, jeu: 400, souffle: 50 }, libelle },
          },
        };
      }
      if (path.includes('/journal/')) return { events: [], teams: [] };
      return { ok: true };
    });
    const { unmount } = render(
      <GLTourScreen
        game={{ id: 7 }}
        teams={teams}
        roster={[]}
        tenir={tenir}
        token="tok"
        onReloadGame={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('gl-tour-durees')).toHaveTextContent(`Ce tour : ${libelle}`),
    );
    unmount();

    apiGlMock.mockImplementation(async (path) => {
      if (path.endsWith('/tenir/tour')) {
        const view = tourView();
        return {
          ...view,
          round: {
            ...view.round,
            durees: { phases: { ouverture: 70 }, libelle: 'ouverture 1 min 10' },
          },
        };
      }
      if (path.includes('/journal/')) return { events: [], teams: [] };
      return { ok: true };
    });
    render(
      <GLTourScreen
        game={{ id: 7 }}
        teams={teams}
        roster={[]}
        tenir={tenir}
        token="tok"
        onReloadGame={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText(/Tour 1 · Jeu · tableau/)).toBeInTheDocument());
    expect(screen.queryByTestId('gl-tour-durees')).toBeNull();
  });
  test('sablier éteint : aucun sablier affiché, le bouton « Sablier » permet de le rallumer', async () => {
    const sablier = {
      actif: false,
      equipeSecondes: 180,
      phaseSecondes: 0,
      phaseAuto: false,
      phase: null,
    };
    apiGlMock.mockImplementation(async (path) => {
      if (path.endsWith('/tenir/tour')) return tourView({ sablier });
      if (path.includes('/journal/')) return { events: [], teams: [] };
      return { ok: true, sablier };
    });
    render(
      <GLTourScreen
        game={{ id: 7 }}
        teams={teams}
        roster={[]}
        tenir={tenir}
        token="tok"
        onReloadGame={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText(/Tour 1 · Jeu · tableau/)).toBeInTheDocument());
    expect(screen.queryByTestId('gl-tour-sablier')).toBeNull();
    expect(screen.queryByRole('timer')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Sablier/ }));
    fireEvent.click(screen.getByRole('switch', { name: 'Sablier' }));
    await waitFor(() =>
      expect(apiGlMock).toHaveBeenCalledWith('/api/gl/games/7/tenir/sablier', 'PUT', {
        actif: true,
      }),
    );
  });

  test('hybride : le sablier du tour vient du serveur ; un clic du prof règle la durée pour la partie', async () => {
    const sablier = {
      actif: true,
      equipeSecondes: 180,
      phaseSecondes: 300,
      phaseAuto: false,
      phase: { secondes: 300, restantSecondes: 240, enPause: false, termine: false, auto: false },
    };
    apiGlMock.mockImplementation(async (path) => {
      if (path.endsWith('/tenir/tour')) return tourView({ surface: 'hybride', sablier });
      if (path.includes('/journal/')) return { events: [], teams: [] };
      return { ok: true, sablier };
    });
    render(
      <GLTourScreen
        game={{ id: 7 }}
        teams={teams}
        roster={[]}
        tenir={{ ...tenir, surface: 'hybride' }}
        token="tok"
        onReloadGame={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('gl-sablier-phase')).toHaveTextContent('4:00'));
    expect(screen.queryByTestId('gl-tour-sablier')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Sablier 4:00 : régler/ }));
    fireEvent.click(screen.getByRole('button', { name: '8 min' }));
    await waitFor(() =>
      expect(apiGlMock).toHaveBeenCalledWith('/api/gl/games/7/tenir/sablier', 'PUT', {
        phaseSecondes: 480,
      }),
    );
  });

  test('hybride : à zéro, rien n’est annulé — la console met en avant le passage au souffle', async () => {
    const sablier = {
      actif: true,
      equipeSecondes: 180,
      phaseSecondes: 60,
      phaseAuto: false,
      phase: { secondes: 60, restantSecondes: 0, enPause: false, termine: true, auto: false },
    };
    apiGlMock.mockImplementation(async (path) => {
      if (path.endsWith('/tenir/tour')) return tourView({ surface: 'hybride', sablier });
      if (path.includes('/journal/')) return { events: [], teams: [] };
      return { ok: true };
    });
    render(
      <GLTourScreen
        game={{ id: 7 }}
        teams={teams}
        roster={[]}
        tenir={{ ...tenir, surface: 'hybride' }}
        token="tok"
        onReloadGame={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('gl-sablier-phase')).toHaveTextContent('0:00'));
    expect(screen.getByTestId('gl-sablier-phase')).toHaveTextContent('rien n’est annulé');
    await waitFor(() =>
      expect(screen.getByTestId('gl-sablier-alerte')).toHaveTextContent(
        'c’est le moment de passer au souffle',
      ),
    );
    expect(screen.getByRole('button', { name: 'Passer au souffle' })).toBeInTheDocument();
    expect(apiGlMock).not.toHaveBeenCalledWith(
      '/api/gl/games/7/tenir/tour/phase',
      'POST',
      expect.anything(),
    );
  });
  test('« Passer au souffle à la fin » : à zéro, la console ouverte passe au souffle, une seule fois', async () => {
    const sablier = {
      actif: true,
      equipeSecondes: 180,
      phaseSecondes: 60,
      phaseAuto: true,
      phase: { secondes: 60, restantSecondes: 0, enPause: false, termine: true, auto: true },
    };
    apiGlMock.mockImplementation(async (path) => {
      if (path.endsWith('/tenir/tour')) return tourView({ surface: 'tablette', sablier });
      if (path.includes('/journal/')) return { events: [], teams: [] };
      return { ok: true };
    });
    render(
      <GLTourScreen
        game={{ id: 7 }}
        teams={teams}
        roster={[]}
        tenir={{ ...tenir, surface: 'tablette' }}
        token="tok"
        onReloadGame={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(apiGlMock).toHaveBeenCalledWith('/api/gl/games/7/tenir/tour/phase', 'POST', {
        phase: 'souffle',
      }),
    );
    await waitFor(() => expect(screen.getByTestId('gl-sablier-phase')).toBeInTheDocument());
    const appels = apiGlMock.mock.calls.filter(([p]) => p === '/api/gl/games/7/tenir/tour/phase');
    expect(appels).toHaveLength(1);
  });

  test('« Mot de passe oublié » : le mot de passe provisoire s’affiche une fois, puis s’efface seul', async () => {
    apiGlMock.mockImplementation(async (path) => {
      if (path.endsWith('/tenir/tour')) return tourView();
      if (path.includes('/journal/')) return { events: [], teams: [] };
      if (path.endsWith('/tenir/players/41/mot-de-passe')) {
        return { ok: true, playerId: 41, motDePasse: 'provisoire-de-test' };
      }
      return { ok: true };
    });
    render(
      <GLTourScreen
        game={{ id: 7 }}
        teams={teams}
        roster={[{ playerId: 41, pseudo: 'joueur-a', teamId: 1 }]}
        tenir={tenir}
        token="tok"
        onReloadGame={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByTestId('gl-tour-mdp-41'));
    await waitFor(() =>
      expect(screen.getByTestId('gl-tour-mdp')).toHaveTextContent('provisoire-de-test'),
    );
    expect(apiGlMock).toHaveBeenCalledWith(
      '/api/gl/games/7/tenir/players/41/mot-de-passe',
      'POST',
      {},
    );
    // Le minuteur d'effacement est posé à l'affichage : on le rejoue avec une horloge simulée.
    fireEvent.click(screen.getByRole('button', { name: 'Masquer' }));
    expect(screen.queryByTestId('gl-tour-mdp')).toBeNull();
    vi.useFakeTimers();
    try {
      await act(async () => {
        fireEvent.click(screen.getByTestId('gl-tour-mdp-41'));
        await vi.advanceTimersByTimeAsync(10);
      });
      expect(screen.getByTestId('gl-tour-mdp')).toHaveTextContent('provisoire-de-test');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(59_000);
      });
      expect(screen.getByTestId('gl-tour-mdp')).toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
      expect(screen.queryByTestId('gl-tour-mdp')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * Audit du 19/11/2026, J2 — un élève joue depuis un autre appareil : l'état de la partie se
   * recharge (temps réel), mais l'instantané du tour n'était relu qu'au montage et après un
   * geste du prof. La carte d'équipe et la file « Demandes » restaient figées.
   */
  describe('J2 : se relit quand la partie avance sans geste du prof', () => {
    function lectures(suffixe) {
      return apiGlMock.mock.calls.filter(([p]) => String(p).endsWith(suffixe)).length;
    }
    function ecran(props) {
      return (
        <GLTourScreen
          game={{ id: 7 }}
          teams={teams}
          roster={[]}
          tenir={{ ...tenir, round: { number: 1, phase: 'jeu' } }}
          token="tok"
          onReloadGame={vi.fn()}
          events={[]}
          {...props}
        />
      );
    }

    test('un évènement de la partie relit le tour et la file des demandes', async () => {
      let vue = tourView();
      apiGlMock.mockImplementation(async (path) => {
        if (path.endsWith('/tenir/tour')) return vue;
        if (path.endsWith('/tenir/demandes')) return { demandes: [] };
        if (path.includes('/journal/')) return { events: [], teams: [] };
        return { ok: true };
      });
      const { rerender } = render(ecran());
      await waitFor(() => expect(screen.getByTestId('gl-tour-team-2')).toHaveTextContent('case 2'));
      await waitFor(() => expect(lectures('/tenir/demandes')).toBeGreaterThan(0));
      const tourLu = lectures('/tenir/tour');
      const demandesLues = lectures('/tenir/demandes');

      // Un élève de l'équipe lance depuis sa tablette : le serveur a avancé, l'état de la
      // partie se recharge avec un évènement de plus.
      vue = tourView({
        teams: tourView().teams.map((t) =>
          t.id === 2 ? { ...t, pathIndex: 6, hasRolledDiceThisRound: true } : t,
        ),
      });
      rerender(ecran({ events: [{ id: 91, eventType: 'dice_roll', teamId: 2 }] }));

      await waitFor(() =>
        expect(screen.getByTestId('gl-tour-team-2')).toHaveTextContent('case 7 · dés lancés'),
      );
      expect(lectures('/tenir/tour')).toBe(tourLu + 1);
      await waitFor(() => expect(lectures('/tenir/demandes')).toBeGreaterThan(demandesLues));
    });

    test('un changement de phase ou de tour vu dans l’état de la partie relit le tour', async () => {
      const { rerender } = render(ecran());
      await waitFor(() => expect(screen.getByText(/Tour 1 · Jeu/)).toBeInTheDocument());
      const tourLu = lectures('/tenir/tour');
      rerender(ecran({ tenir: { ...tenir, round: { number: 1, phase: 'souffle' } } }));
      await waitFor(() => expect(lectures('/tenir/tour')).toBe(tourLu + 1));
      rerender(ecran({ tenir: { ...tenir, round: { number: 2, phase: 'ouverture' } } }));
      await waitFor(() => expect(lectures('/tenir/tour')).toBe(tourLu + 2));
    });

    test('un nouveau rendu sans rien de neuf ne relit rien', async () => {
      const { rerender } = render(ecran());
      await waitFor(() => expect(screen.getByText(/Tour 1 · Jeu/)).toBeInTheDocument());
      const tourLu = lectures('/tenir/tour');
      rerender(ecran({ events: [] }));
      rerender(ecran({ tenir: { ...tenir, round: { number: 1, phase: 'jeu' } } }));
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(lectures('/tenir/tour')).toBe(tourLu);
    });
  });
});
