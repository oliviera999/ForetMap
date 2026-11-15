import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { GLTenirEquipeView } from '../../src/gl/components/tenir/GLTenirEquipeView.jsx';

const apiGlMock = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));

const gameState = {
  game: { id: 7, status: 'live' },
  teams: [{ id: 2, name: 'Licornes A', type: 'unicorn' }],
  roster: [
    { playerId: 10, teamId: 2, pseudo: 'joueur-a', healthPoints: 3, powerPoints: 4 },
    { playerId: 11, teamId: 3, pseudo: 'joueur-b' },
  ],
};

function tenirWith(permissions, extra = {}) {
  return {
    enabled: true,
    surface: 'tablette',
    settings: { des_count: 2, des_mode_effectif: 'serveur' },
    round: { number: 1, phase: 'jeu' },
    permissions,
    ...extra,
  };
}

describe('GLTenirEquipeView', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
    apiGlMock.mockResolvedValue({ round: { number: 1, phase: 'jeu' } });
  });

  test('grise les gestes selon les permissions servies (tablette en jeu : tout ouvert)', async () => {
    // « Répondre » s'allume quand une question de case attend l'équipe (lot 2).
    apiGlMock.mockResolvedValue({
      round: { number: 1, phase: 'jeu', questionsEnAttente: [{ teamId: 2, markerId: 31 }] },
    });
    render(
      <GLTenirEquipeView
        gameState={gameState}
        tenir={tenirWith({ jeter: true, lancer: true, repondre: true, fouiller: true, lire: true })}
        teamId={2}
        onReloadGame={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('gl-tenir-equipe')).toBeInTheDocument());
    for (const geste of ['jeter', 'lancer', 'repondre', 'fouiller', 'lire']) {
      expect(
        screen.getByRole('button', {
          name: new RegExp(geste === 'repondre' ? 'Répondre' : geste, 'i'),
        }).disabled,
      ).toBe(false);
    }
    expect(screen.getByText(/joueur-a/)).toBeInTheDocument();
    expect(screen.queryByText(/joueur-b/)).toBeNull();
  });

  test('hybride hors fenêtre : fouiller grisé, lancer/répondre grisés, lire ouvert', async () => {
    render(
      <GLTenirEquipeView
        gameState={gameState}
        tenir={tenirWith(
          { jeter: true, lancer: false, repondre: false, fouiller: false, lire: true },
          { surface: 'hybride' },
        )}
        teamId={2}
        onReloadGame={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('gl-tenir-equipe')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Fouiller' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Lancer' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Répondre' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Lire' }).disabled).toBe(false);
  });

  test('en retrait : mention visible, sans motif', async () => {
    render(
      <GLTenirEquipeView
        gameState={gameState}
        tenir={tenirWith(
          { jeter: false, lancer: true, repondre: true, fouiller: true, lire: true },
          { enRetrait: true },
        )}
        teamId={2}
        onReloadGame={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText(/en retrait jusqu’à nouvel ordre/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/motif/i)).toBeNull();
  });

  test('jet en suspens (Relance) : case et effet affichés, « Garder ce jet » et « Relance… »', async () => {
    const round = {
      number: 1,
      phase: 'jeu',
      arriveesEnSuspens: [
        {
          teamId: 2,
          markerId: 40,
          index: 4,
          total: 3,
          faces: [1, 2],
          label: 'Averse tropicale',
          question: false,
          effectSummary: 'Rien ne se passe.',
          relanceSpellCode: 'SL005',
        },
      ],
    };
    apiGlMock.mockImplementation((url, method) =>
      Promise.resolve(method === 'POST' ? { ok: true } : { round }),
    );
    const onJeter = vi.fn();
    render(
      <GLTenirEquipeView
        gameState={gameState}
        tenir={tenirWith({ jeter: true, lancer: true, repondre: true, fouiller: true, lire: true })}
        teamId={2}
        onReloadGame={vi.fn()}
        onJeter={onJeter}
      />,
    );
    const carte = await screen.findByTestId('gl-tenir-jet-suspens');
    expect(carte.textContent).toMatch(/Jet de l’équipe : 3/);
    expect(carte.textContent).toMatch(/case 5 « Averse tropicale »/);
    expect(carte.textContent).toMatch(/Effet de la case : Rien ne se passe\./);
    fireEvent.click(screen.getByTestId('gl-tenir-relance'));
    expect(onJeter).toHaveBeenCalledWith('SL005');
    fireEvent.click(screen.getByTestId('gl-tenir-garder-jet'));
    await waitFor(() =>
      expect(apiGlMock).toHaveBeenCalledWith('/api/gl/games/7/tenir/arrivee/garder', 'POST', {}),
    );
  });

  test('« Répondre » : éteint sans question due ; présente la question de la case due, puis le retour du serveur', async () => {
    const round = { number: 1, phase: 'jeu', questionsEnAttente: [] };
    apiGlMock.mockImplementation(async (path, method) => {
      if (path === '/api/gl/games/7/tenir/tour') return { round };
      if (path === '/api/gl/games/7/markers/31/present-question' && method === 'POST') {
        return {
          questionCode: 'TEX-P1-01',
          presentation: {
            presentationToken: 'jeton',
            question: 'Qui disperse les graines du figuier ?',
            choices: [
              { id: 'c1', text: 'Le calao' },
              { id: 'c2', text: 'Le vent seul' },
            ],
          },
        };
      }
      if (path === '/api/gl/games/7/qcm/answer') {
        return { correct: false, feedback: 'Pas encore : le figuier compte sur un oiseau.' };
      }
      return {};
    });
    const { rerender } = render(
      <GLTenirEquipeView
        gameState={gameState}
        tenir={tenirWith({ jeter: true, lancer: true, repondre: true, fouiller: true, lire: true })}
        teamId={2}
        onReloadGame={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('gl-tenir-equipe')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Répondre' }).disabled).toBe(true);

    // Une question attend l'équipe (elle a pu être déplacée depuis par un sort).
    round.questionsEnAttente = [{ teamId: 2, markerId: 31 }];
    fireEvent.click(screen.getByRole('button', { name: 'Actualiser' }));
    rerender(
      <GLTenirEquipeView
        gameState={gameState}
        tenir={tenirWith({ jeter: true, lancer: true, repondre: true, fouiller: true, lire: true })}
        teamId={2}
        onReloadGame={vi.fn()}
      />,
    );
    const bouton = await screen.findByRole('button', { name: 'Répondre à la question' });
    expect(bouton.disabled).toBe(false);
    fireEvent.click(bouton);
    await screen.findByText('Qui disperse les graines du figuier ?');
    fireEvent.click(screen.getByLabelText('Le vent seul'));
    fireEvent.click(screen.getByRole('button', { name: 'Répondre' }));
    const retour = await screen.findByTestId('gl-tenir-case-retour');
    expect(retour.textContent).toBe('Pas encore : le figuier compte sur un oiseau.');
    expect(apiGlMock).toHaveBeenCalledWith('/api/gl/games/7/qcm/answer', 'POST', {
      questionCode: 'TEX-P1-01',
      presentationToken: 'jeton',
      choiceId: 'c2',
    });
  });

  test('sans jet en suspens pour l’équipe : pas de carte', async () => {
    apiGlMock.mockResolvedValue({
      round: { number: 1, phase: 'jeu', arriveesEnSuspens: [{ teamId: 9, total: 2 }] },
    });
    render(
      <GLTenirEquipeView
        gameState={gameState}
        tenir={tenirWith({ jeter: true, lancer: true, repondre: true, fouiller: true, lire: true })}
        teamId={2}
        onReloadGame={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('gl-tenir-equipe')).toBeInTheDocument());
    expect(screen.queryByTestId('gl-tenir-jet-suspens')).toBeNull();
  });
});
