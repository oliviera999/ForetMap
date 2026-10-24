import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthScreen } from '../../src/components/auth-views.jsx';

describe('AuthScreen', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ publicSettings: { auth: { allow_register: true } } }),
      }),
    );
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

  test('affiche les crédits par défaut tant que les réglages ne les fournissent pas', () => {
    render(<AuthScreen onLogin={() => {}} uiSettings={{ auth: { allow_register: true } }} />);
    const credits = screen.getByTestId('auth-credits');
    expect(credits).toHaveTextContent('Auteur : Mohammed El Farrai');
    expect(credits).toHaveTextContent('Contributeur : Olivier Arnould-Laurent');
    expect(screen.queryByTestId('auth-credit-message')).toBeNull();
  });

  test('les crédits et le message suivent les réglages ; une valeur vide masque la mention', () => {
    render(
      <AuthScreen
        onLogin={() => {}}
        uiSettings={{
          auth: { allow_register: true },
          content: {
            auth: {
              credit_author: '',
              credit_contributor: 'Équipe SVT',
              credit_message: 'Merci !',
            },
          },
        }}
      />,
    );
    const credits = screen.getByTestId('auth-credits');
    expect(credits).toHaveTextContent('Contributeur : Équipe SVT');
    expect(credits).not.toHaveTextContent('Auteur');
    expect(screen.getByTestId('auth-credit-message')).toHaveTextContent('Merci !');
  });

  test('un resetToken dans l’URL ouvre le formulaire et disparaît de la barre d’adresse (CDG-52)', async () => {
    window.history.replaceState(null, '', '/?resetToken=abc123&resetType=teacher');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    try {
      render(<AuthScreen onLogin={() => {}} uiSettings={{ auth: { allow_register: true } }} />);
      expect(await screen.findByPlaceholderText('Nouveau mot de passe')).toBeInTheDocument();
      expect(replaceSpy).toHaveBeenCalled();
      expect(window.location.search).not.toContain('resetToken');
      expect(window.location.search).not.toContain('resetType');
    } finally {
      replaceSpy.mockRestore();
      window.history.replaceState(null, '', '/');
    }
  });
});
