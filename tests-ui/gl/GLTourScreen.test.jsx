import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { GLTourScreen } from '../../src/gl/components/mj/GLTourScreen.jsx';

const apiGlMock = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
  getGlToken: () => 'tok',
}));
vi.mock('../../src/shared/components/AppDialogsProvider.jsx', () => ({
  useAppDialogs: () => ({ confirm: vi.fn().mockResolvedValue(true) }),
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
});
