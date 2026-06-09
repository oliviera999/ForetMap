import React from 'react';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthScreen } from '../../src/components/auth-views.jsx';

describe('AuthScreen', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ publicSettings: { auth: { allow_register: true } } }),
    }));
  });

  test('affiche les onglets Connexion et Créer un compte', async () => {
    render(<AuthScreen onLogin={() => {}} uiSettings={{ auth: { allow_register: true } }} />);
    expect(screen.getByRole('button', { name: 'Connexion', exact: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Créer un compte' })).toBeInTheDocument();
  });

  test('bascule vers le formulaire de création de compte', async () => {
    const user = userEvent.setup();
    render(<AuthScreen onLogin={() => {}} uiSettings={{ auth: { allow_register: true } }} />);
    await user.click(screen.getByRole('button', { name: 'Créer un compte' }));
    expect(screen.getByLabelText('Prénom', { exact: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Créer le compte' })).toBeInTheDocument();
  });
});
