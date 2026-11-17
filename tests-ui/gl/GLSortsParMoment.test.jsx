import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GLSortsParMoment } from '../../src/gl/components/tenir/GLSortsParMoment.jsx';

const apiGlMock = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));

const moments = [
  {
    key: 'avant',
    label: 'Avant de lancer',
    sorts: [
      {
        code: 'SL042',
        nom: 'Sentier',
        cout: 2,
        ressource: 'coeurs',
        ouvert: true,
        effetCourt: 'la prochaine case Souffle n’a pas d’effet',
      },
    ],
  },
  {
    key: 'apres',
    label: 'Après le jet',
    sorts: [
      {
        code: 'SL002',
        nom: 'Progression',
        cout: 1,
        ressource: 'choix',
        ouvert: false,
        message:
          'Ce sort se lance en phase « jeu », juste après le jet de l’équipe — avant tout autre geste de l’équipe.',
      },
    ],
  },
];

describe('GLSortsParMoment — sorts rangés par moment du tour', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
    apiGlMock.mockResolvedValue({ teamId: 2, moments });
  });

  test('un titre par moment ; un sort hors fenêtre reste visible, grisé, avec son message', async () => {
    const onJeter = vi.fn();
    render(<GLSortsParMoment gameId={7} onJeter={onJeter} />);
    await waitFor(() => screen.getByText('Avant de lancer'));
    expect(apiGlMock).toHaveBeenCalledWith('/api/gl/games/7/tenir/sorts');
    expect(screen.getByText('Après le jet')).toBeTruthy();
    // M10 : jeter un sort est le geste de l'Assistante ou de l'Assistant.
    expect(screen.getByText('C’est le moment de l’Assistante ou de l’Assistant.')).toBeTruthy();

    const ouvert = screen.getByRole('button', { name: /Sentier · 2 ❤️/ });
    expect(ouvert.disabled).toBe(false);
    fireEvent.click(ouvert);
    expect(onJeter).toHaveBeenCalledWith('SL042');

    const ferme = screen.getByRole('button', { name: /Progression/ });
    expect(ferme.disabled).toBe(true);
    expect(screen.getByText(/avant tout autre geste de l’équipe/)).toBeTruthy();
    fireEvent.click(ferme);
    expect(onJeter).toHaveBeenCalledTimes(1);
  });

  test('le prof lit les sorts d’une équipe ; une clé de rafraîchissement relit les fenêtres', async () => {
    const { rerender } = render(<GLSortsParMoment gameId={7} teamId={3} refreshKey="1:jeu:4" />);
    await waitFor(() => screen.getByText('Avant de lancer'));
    expect(apiGlMock).toHaveBeenCalledWith('/api/gl/games/7/tenir/sorts?teamId=3');
    rerender(<GLSortsParMoment gameId={7} teamId={3} refreshKey="1:jeu:5" />);
    await waitFor(() => expect(apiGlMock).toHaveBeenCalledTimes(2));
  });
});
