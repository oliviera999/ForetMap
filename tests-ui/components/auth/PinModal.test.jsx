import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PinModal } from '../../../src/components/auth/PinModal.jsx';

const apiMock = vi.hoisted(() => vi.fn());
vi.mock('../../../src/services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  api: apiMock,
}));

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

  test('double authentification : le code est demandé avant d’ouvrir la session n3boss', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    apiMock.mockImplementation(async (path) => {
      if (path === '/api/auth/login') {
        return { mfaRequired: true, mfaToken: 'mfa-pin', stage: 'verify' };
      }
      return {
        id: 'T1',
        authToken: 'jeton-complet',
        auth: { userType: 'teacher', permissions: ['teacher.access'], mfa: true },
      };
    });
    render(<PinModal onSuccess={onSuccess} onClose={vi.fn()} />);
    await user.type(screen.getByLabelText('Email n3boss'), 'prof@example.org');
    await user.type(screen.getByLabelText('Mot de passe'), 'motdepasse');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));
    const code = await screen.findByLabelText('Code à 6 chiffres');
    expect(onSuccess).not.toHaveBeenCalled();
    await user.type(code, '123456');
    await user.click(screen.getByRole('button', { name: 'Valider' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(apiMock).toHaveBeenCalledWith('/api/auth/totp/verify', 'POST', {
      mfaToken: 'mfa-pin',
      code: '123456',
    });
  });
});
