import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

  test('inscription fermée : pas de barre d’onglets à un seul onglet (U3)', () => {
    render(<AuthScreen onLogin={() => {}} uiSettings={{ auth: { allow_register: false } }} />);
    expect(screen.queryByRole('button', { name: 'Connexion', exact: true })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Me connecter' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeInTheDocument();
  });

  test('deux portes de poids égal : « Découvrir le lieu » et « Me connecter » (U3)', async () => {
    const user = userEvent.setup();
    const onVisitGuest = vi.fn();
    render(
      <AuthScreen
        onLogin={() => {}}
        onVisitGuest={onVisitGuest}
        uiSettings={{ auth: { allow_register: false } }}
      />,
    );
    const visitDoor = screen.getByTestId('auth-door-visit');
    const loginDoor = screen.getByTestId('auth-door-login');
    expect(visitDoor).toHaveClass('auth-card');
    expect(loginDoor).toHaveClass('auth-card');
    const cta = screen.getByRole('button', { name: /Découvrir le lieu/ });
    expect(cta).toHaveClass('btn-primary');
    await user.click(cta);
    expect(onVisitGuest).toHaveBeenCalledTimes(1);
  });

  test('le sous-titre ne répète pas le nom du logiciel (U3)', () => {
    render(
      <AuthScreen
        onLogin={() => {}}
        uiSettings={{
          auth: { allow_register: false },
          content: { auth: { title: 'ForêtMap', subtitle: 'ForêtMap — Le terrain vivant' } },
        }}
      />,
    );
    expect(screen.getByText('Le terrain vivant')).toBeInTheDocument();
  });

  test('bascule vers le formulaire de création de compte', async () => {
    const user = userEvent.setup();
    render(<AuthScreen onLogin={() => {}} uiSettings={{ auth: { allow_register: true } }} />);
    await user.click(screen.getByRole('button', { name: 'Créer un compte' }));
    expect(screen.getByLabelText('Prénom', { exact: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Créer le compte' })).toBeInTheDocument();
  });

  test('inscription : l’éditeur riche de la description arrive à la demande, sans champ manquant', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AuthScreen onLogin={() => {}} uiSettings={{ auth: { allow_register: true } }} />,
    );
    // Écran de connexion : ni éditeur riche ni zone de saisie de description.
    expect(container.querySelector('.rich-text-editor')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Créer un compte' }));
    // Le champ existe tout de suite (zone de saisie simple le temps du chargement)…
    expect(screen.getByText('Description (optionnel)')).toBeInTheDocument();
    // … puis l'éditeur riche prend sa place.
    await waitFor(() => expect(container.querySelector('.rich-text-editor')).not.toBeNull());
    expect(container.querySelectorAll('textarea.markdown-textarea-input')).toHaveLength(0);
  });

  test('affiche les crédits par défaut tant que les réglages ne les fournissent pas', () => {
    render(<AuthScreen onLogin={() => {}} uiSettings={{ auth: { allow_register: true } }} />);
    const credits = screen.getByTestId('auth-credits');
    expect(credits).toHaveTextContent('Auteur : Mohammed');
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
