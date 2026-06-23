import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GLAuthView } from '../../src/gl/components/GLAuthView.jsx';

const apiGlMock = vi.fn();

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));

vi.mock('../../src/services/api.js', () => ({
  withAppBase: (path) => path,
}));

describe('GLAuthView', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
    apiGlMock.mockResolvedValue({ title: 'G&L', subtitle: '', allowGoogleStaff: false });
  });

  test('soumet le formulaire et appelle onLogin', async () => {
    apiGlMock
      .mockResolvedValueOnce({ title: 'G&L', subtitle: '', allowGoogleStaff: false })
      .mockResolvedValueOnce({ authToken: 'tok' });
    const onLogin = vi.fn();
    render(<GLAuthView onLogin={onLogin} />);

    fireEvent.change(screen.getByLabelText(/Identifiant/), { target: { value: 'teamA' } });
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Franchir le miroir' }));

    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
    expect(apiGlMock).toHaveBeenCalledWith('/api/gl/auth/login', 'POST', {
      identifier: 'teamA',
      password: '1234',
    });
  });

  test('affiche le panneau mot de passe oublié et envoie la demande', async () => {
    apiGlMock
      .mockResolvedValueOnce({ title: 'G&L', subtitle: '', allowGoogleStaff: false })
      .mockResolvedValueOnce({
        ok: true,
        message: 'Si un compte existe, un email de réinitialisation a été envoyé.',
      });
    render(<GLAuthView onLogin={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /Mot de passe oublié/i }));
    fireEvent.change(screen.getByLabelText(/^E-mail$/i), { target: { value: 'mj@ecole.local' } });
    fireEvent.click(screen.getByRole('button', { name: /Envoyer un lien de réinitialisation/i }));

    await waitFor(() => {
      expect(apiGlMock).toHaveBeenCalledWith('/api/gl/auth/forgot-password', 'POST', {
        email: 'mj@ecole.local',
      });
    });
    expect(screen.getByText(/email de réinitialisation/i)).toBeInTheDocument();
  });

  test('affiche un message d’erreur si login échoue', async () => {
    apiGlMock
      .mockResolvedValueOnce({ title: 'G&L', subtitle: '', allowGoogleStaff: false })
      .mockRejectedValueOnce(new Error('Identifiant ou mot de passe incorrect'));
    render(<GLAuthView onLogin={() => {}} />);

    fireEvent.change(screen.getByLabelText(/Identifiant/), { target: { value: 'teamA' } });
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'bad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Franchir le miroir' }));

    await waitFor(() => {
      expect(screen.getByText(/Identifiant ou mot de passe incorrect/)).toBeInTheDocument();
    });
  });

  test('affiche la page de garde (titre, accroche tournante, baseline, CTA miroir)', async () => {
    render(<GLAuthView onLogin={() => {}} />);

    expect(await screen.findByText(/réécrivez le monde vivant/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Franchir le miroir' })).toBeInTheDocument();
    const tagline = screen.getByTestId('gl-auth-tagline');
    expect(tagline.textContent.trim().length).toBeGreaterThan(0);
    expect(screen.getByText('Lire la quatrième de couverture')).toBeInTheDocument();
    expect(screen.getByText(/Une voyageuse est partie avant vous/i)).toBeInTheDocument();
  });
});
