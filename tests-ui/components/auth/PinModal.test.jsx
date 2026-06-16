import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PinModal } from '../../../src/components/auth/PinModal.jsx';

describe('PinModal', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('affiche la modale n3boss avec les onglets PIN et Email', () => {
    render(<PinModal onSuccess={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Mode n3boss' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PIN' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Email' })).toBeInTheDocument();
    expect(screen.getByLabelText('Code PIN')).toBeInTheDocument();
  });

  test('PIN vide : message « Code requis » sans appel réseau', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const user = userEvent.setup();
    render(<PinModal onSuccess={vi.fn()} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Entrer' }));
    expect(screen.getByText('Code requis')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('PIN saisi sans session : demande de se connecter d’abord', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const user = userEvent.setup();
    render(<PinModal onSuccess={vi.fn()} onClose={vi.fn()} />);
    await user.type(screen.getByLabelText('Code PIN'), '1234');
    await user.click(screen.getByRole('button', { name: 'Entrer' }));
    expect(screen.getByText('Connecte-toi d’abord avant d’entrer ton code')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('onglet Email : champs identifiants + réinitialisation, email vide → « Email et mot de passe requis »', async () => {
    const user = userEvent.setup();
    render(<PinModal onSuccess={vi.fn()} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Email' }));
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
