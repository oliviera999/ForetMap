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
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));

    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
    expect(apiGlMock).toHaveBeenCalledWith('/api/gl/auth/login', 'POST', {
      identifier: 'teamA',
      password: '1234',
    });
  });

  test('affiche un message d’erreur si login échoue', async () => {
    apiGlMock
      .mockResolvedValueOnce({ title: 'G&L', subtitle: '', allowGoogleStaff: false })
      .mockRejectedValueOnce(new Error('Identifiant ou mot de passe incorrect'));
    render(<GLAuthView onLogin={() => {}} />);

    fireEvent.change(screen.getByLabelText(/Identifiant/), { target: { value: 'teamA' } });
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'bad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));

    await waitFor(() => {
      expect(screen.getByText(/Identifiant ou mot de passe incorrect/)).toBeInTheDocument();
    });
  });
});
