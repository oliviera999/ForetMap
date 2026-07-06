import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PinModal } from '../../../src/components/auth/PinModal.jsx';

describe('PinModal', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('affiche la modale de connexion n3boss (login e-mail direct, plus d’onglet PIN)', () => {
    render(<PinModal onSuccess={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Connexion n3boss' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'PIN' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Code PIN')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Email n3boss')).toBeInTheDocument();
    expect(screen.getByLabelText('Mot de passe')).toBeInTheDocument();
  });

  test('login : champs identifiants + réinitialisation, email vide → « Email et mot de passe requis »', async () => {
    const user = userEvent.setup();
    render(<PinModal onSuccess={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByLabelText('Email n3boss')).toBeInTheDocument();
    expect(screen.getByLabelText('Mot de passe')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Envoyer un lien de réinitialisation' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(screen.getByText('Email et mot de passe requis')).toBeInTheDocument();
  });

  test('bouton Google visible par défaut, masqué si allow_google_teacher === false', () => {
    const { unmount } = render(<PinModal onSuccess={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Continuer avec Google' })).toBeInTheDocument();
    unmount();
    render(
      <PinModal
        onSuccess={vi.fn()}
        onClose={vi.fn()}
        uiSettings={{ auth: { allow_google_teacher: false } }}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Continuer avec Google' })).not.toBeInTheDocument();
  });

  test('« Annuler » appelle onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<PinModal onSuccess={vi.fn()} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
