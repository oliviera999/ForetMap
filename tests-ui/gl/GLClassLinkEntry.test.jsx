import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GLClassLinkEntry } from '../../src/gl/components/tenir/GLClassLinkEntry.jsx';

const apiGlMock = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));

const ouverture = {
  className: 'Sixième B',
  game: { id: 7, name: 'Partie du jeudi', status: 'live' },
  teams: [
    { teamId: 11, name: 'Gnomes A', type: 'gnome', mascotId: null, color: '#65a30d' },
    { teamId: 12, name: 'Licornes A', type: 'unicorn', mascotId: null, color: '#a855f7' },
  ],
  phase: 'jeu',
};

describe('GLClassLinkEntry — « J’ai le code de la classe »', () => {
  // Accolades obligatoires : `mockReset()` renvoie le mock, et vitest rappellerait la valeur
  // renvoyée par `beforeEach` comme une fonction de nettoyage.
  beforeEach(() => {
    apiGlMock.mockReset();
  });

  test('code saisi → équipes de la classe → mascotte touchée → session d’équipe', async () => {
    apiGlMock.mockResolvedValueOnce(ouverture).mockResolvedValueOnce({
      token: 'jeton',
      gameId: 7,
      teamId: 12,
      teamName: 'Licornes A',
      className: 'Sixième B',
    });
    const onSession = vi.fn();
    render(<GLClassLinkEntry onSession={onSession} />);

    const champ = screen.getByTestId('gl-class-link-code');
    const continuer = screen.getByRole('button', { name: 'Continuer' });
    expect(continuer.disabled).toBe(true);
    fireEvent.change(champ, { target: { value: 'abcd-efgh' } });
    expect(champ.value).toBe('ABCDEFGH');
    fireEvent.click(continuer);

    await waitFor(() => screen.getByText('Touchez la mascotte de votre équipe.'));
    expect(apiGlMock).toHaveBeenCalledWith('/api/gl/class-link/open', 'POST', {
      code: 'ABCDEFGH',
    });
    expect(screen.getByText('Sixième B')).toBeTruthy();
    // Une cible par équipe, large : la tablette se touche, elle ne se saisit pas.
    fireEvent.click(screen.getByTestId('gl-class-link-team-12'));
    await waitFor(() => expect(onSession).toHaveBeenCalledTimes(1));
    expect(apiGlMock).toHaveBeenLastCalledWith('/api/gl/class-link/session', 'POST', {
      code: 'ABCDEFGH',
      teamId: 12,
    });
    const session = onSession.mock.calls[0][0];
    expect(session.token).toBe('jeton');
    expect(session.auth.userType).toBe('gl_guest');
    expect(session.auth.teamSession).toEqual({ gameId: 7, teamId: 12 });
  });

  test('QR scanné : le jeton de l’adresse ouvre directement le choix de l’équipe', async () => {
    apiGlMock.mockResolvedValueOnce(ouverture);
    render(<GLClassLinkEntry initialToken="jeton-du-qr" onSession={vi.fn()} />);
    await waitFor(() => screen.getByTestId('gl-class-link-team-11'));
    expect(apiGlMock).toHaveBeenCalledWith('/api/gl/class-link/open', 'POST', {
      token: 'jeton-du-qr',
    });
    expect(screen.queryByTestId('gl-class-link-code')).toBeNull();
  });

  test('aucune partie en cours : message d’attente, aucun bouton d’équipe', async () => {
    apiGlMock.mockResolvedValueOnce({ className: 'Sixième B', game: null, teams: [], phase: null });
    render(<GLClassLinkEntry initialToken="jeton" onSession={vi.fn()} />);
    await waitFor(() => screen.getByText(/Aucune partie n’est en cours/));
    expect(screen.queryByText('Touchez la mascotte de votre équipe.')).toBeNull();
  });

  test('code inconnu : le message du serveur, et on peut ressaisir', async () => {
    apiGlMock.mockRejectedValueOnce(new Error('Ce code de classe n’est pas reconnu.'));
    const onCancel = vi.fn();
    render(
      <GLClassLinkEntry onSession={vi.fn()} onCancel={onCancel} notice="Tablette déconnectée." />,
    );
    expect(screen.getByText('Tablette déconnectée.')).toBeTruthy();
    fireEvent.change(screen.getByTestId('gl-class-link-code'), { target: { value: 'ZZZZZZZZ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    await waitFor(() => screen.getByText('Ce code de classe n’est pas reconnu.'));
    expect(screen.getByTestId('gl-class-link-code')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retour à la connexion' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
