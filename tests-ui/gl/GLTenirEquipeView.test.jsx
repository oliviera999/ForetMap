import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
});
