import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const setActing = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({
  setGlActingPlayer: (...args) => setActing(...args),
}));
vi.mock('../../src/gl/components/GLMarketView.jsx', () => ({
  GLMarketView: ({ playerId, selfPowerPoints }) => (
    <div data-testid="stub-marche">
      marché de {playerId} · {selfPowerPoints}
    </div>
  ),
}));

import { GLMarcheTablette } from '../../src/gl/components/tenir/GLMarcheTablette.jsx';

const roster = [
  { playerId: 11, pseudo: 'joueur-a', teamId: 2, healthPoints: 3, powerPoints: 4 },
  { playerId: 12, pseudo: 'joueur-b', teamId: 2, healthPoints: 2, powerPoints: 1 },
  { playerId: 13, pseudo: 'joueur-c', teamId: 2, healthPoints: 5, powerPoints: 5 },
];

describe('GLMarcheTablette — « Qui agit ? »', () => {
  beforeEach(() => {
    // Accolades : `mockReset()` renvoie le mock, que vitest prendrait pour un nettoyage.
    setActing.mockReset();
  });

  test('demande qui agit parmi les présents, puis ouvre le Marché au nom de l’élève choisi', async () => {
    const onClose = vi.fn();
    render(
      <GLMarcheTablette
        token="t"
        classId={5}
        roster={roster}
        presents={[11, 13]}
        onClose={onClose}
      />,
    );
    expect(screen.getByText('Qui agit ?')).toBeTruthy();
    // Un absent (ou un élève en retrait) n'est pas proposé, sans que l'écran dise pourquoi.
    expect(screen.queryByTestId('gl-qui-agit-12')).toBeNull();
    expect(screen.queryByTestId('stub-marche')).toBeNull();

    fireEvent.click(screen.getByTestId('gl-qui-agit-13'));
    expect(setActing).toHaveBeenLastCalledWith(13);
    await waitFor(() => screen.getByTestId('stub-marche'));
    expect(screen.getByTestId('stub-marche').textContent).toContain('marché de 13 · 5');
    expect(screen.getByTestId('gl-qui-agit-choisi').textContent).toContain('joueur-c');

    // « Changer » : on oublie qui agissait et on redemande.
    fireEvent.click(screen.getByRole('button', { name: 'Changer' }));
    expect(setActing).toHaveBeenLastCalledWith(null);
    expect(screen.queryByTestId('stub-marche')).toBeNull();
    expect(screen.getByTestId('gl-qui-agit-11')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Fermer le Marché' }));
    expect(onClose).toHaveBeenCalled();
  });

  test('l’élève choisi devient absent : le Marché se referme sur « Qui agit ? »', async () => {
    const { rerender } = render(
      <GLMarcheTablette token="t" classId={5} roster={roster} presents={[11, 13]} />,
    );
    fireEvent.click(screen.getByTestId('gl-qui-agit-11'));
    await waitFor(() => screen.getByTestId('stub-marche'));
    rerender(<GLMarcheTablette token="t" classId={5} roster={roster} presents={[13]} />);
    await waitFor(() => expect(screen.queryByTestId('stub-marche')).toBeNull());
    expect(setActing).toHaveBeenLastCalledWith(null);
    expect(screen.queryByTestId('gl-qui-agit-11')).toBeNull();
  });

  test('présences pas encore confirmées : personne à proposer ; fermer oublie qui agissait', () => {
    const { unmount } = render(
      <GLMarcheTablette token="t" classId={5} roster={roster} presents={[]} />,
    );
    expect(screen.getByText('Confirmez d’abord les présences de l’équipe.')).toBeTruthy();
    unmount();
    expect(setActing).toHaveBeenLastCalledWith(null);
  });
});
