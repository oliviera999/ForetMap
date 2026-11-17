// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

/**
 * Écran de connexion : la séance qui attend (lien `?seance=slug`) est annoncée — lot 5,
 * « parcours d'apprentissage ». Sans lien en attente, rien n'est rendu.
 */

const apiMock = vi.fn();
vi.mock('../../../src/services/api.js', () => ({
  api: (...args) => apiMock(...args),
}));

const { PendingSessionNotice } =
  await import('../../../src/components/pedago/PendingSessionNotice.jsx');

beforeEach(() => {
  apiMock.mockReset();
  window.sessionStorage.clear();
});
afterEach(() => cleanup());

describe('PendingSessionNotice', () => {
  it('aucun lien en attente : rien', () => {
    const { container } = render(<PendingSessionNotice />);
    expect(container.innerHTML).toBe('');
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('séance en attente : titre, invitation à se connecter, mot sur la visite sans compte', async () => {
    window.sessionStorage.setItem('foretmap.pendingSeance.v1', 'qui-mange-qui');
    apiMock.mockResolvedValue({ title: 'Qui mange qui' });
    render(<PendingSessionNotice guestVisitOffered />);
    expect(apiMock).toHaveBeenCalledWith('/api/pedago-sessions/qui-mange-qui');
    expect(await screen.findByText('🧭 Une séance t’attend : « Qui mange qui ».')).toBeTruthy();
    const notice = screen.getByTestId('auth-pending-session');
    expect(notice.textContent).toContain('Connecte-toi pour la commencer');
    expect(notice.textContent).toContain('La visite sans compte ne lance pas les séances.');
  });

  it('séance introuvable : l’annonce reste, sans titre', async () => {
    window.sessionStorage.setItem('foretmap.pendingSeance.v1', 'disparue');
    apiMock.mockRejectedValue(new Error('404'));
    render(<PendingSessionNotice />);
    expect(screen.getByText('🧭 Une séance t’attend.')).toBeTruthy();
    expect(screen.getByTestId('auth-pending-session').textContent).not.toContain('visite');
  });
});
