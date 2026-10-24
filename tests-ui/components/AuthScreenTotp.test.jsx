import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Écran de connexion et double authentification : un mot de passe correct d'un compte
 * administrateur ou n3boss mène à l'étape du code (pas de session tant qu'il n'est pas
 * validé) ; une étape transmise par le retour Google / Moodle s'affiche d'emblée ;
 * l'invitation à activer (phase de transition) est reportable.
 */

const apiMock = vi.hoisted(() => vi.fn());
const saveStoredSession = vi.hoisted(() => vi.fn());
vi.mock('../../src/services/api', () => ({
  api: apiMock,
  saveStoredSession,
  withAppBase: (p) => p,
}));

const { AuthScreen } = await import('../../src/components/auth-views.jsx');

const SETTINGS = { auth: { allow_register: true } };
const TEACHER_BODY = {
  id: 'T1',
  email: 'prof@example.org',
  authToken: 'jeton-complet',
  auth: { userType: 'teacher', mfa: true },
};

beforeEach(() => {
  apiMock.mockReset();
  saveStoredSession.mockReset();
});

async function loginWithPassword(user) {
  await user.type(screen.getByLabelText('Identifiant (pseudo ou email)'), 'prof@example.org');
  await user.type(screen.getByLabelText('Mot de passe'), 'motdepasse');
  await user.click(screen.getByRole('button', { name: 'Se connecter' }));
}

describe('AuthScreen — double authentification', () => {
  test('mot de passe correct, code exigé : aucune session avant le code, puis connexion', async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn();
    apiMock.mockImplementation(async (path) => {
      if (path === '/api/auth/login') {
        return { mfaRequired: true, mfaToken: 'mfa-1', stage: 'verify' };
      }
      return TEACHER_BODY;
    });
    render(<AuthScreen onLogin={onLogin} uiSettings={SETTINGS} />);
    await loginWithPassword(user);
    const code = await screen.findByLabelText('Code à 6 chiffres');
    expect(onLogin).not.toHaveBeenCalled();
    expect(saveStoredSession).not.toHaveBeenCalled();
    await user.type(code, '123456');
    await user.click(screen.getByRole('button', { name: 'Valider' }));
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith(TEACHER_BODY));
    expect(saveStoredSession).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'jeton-complet' }),
    );
  });

  test('étape transmise par le retour Google / Moodle : affichée d’emblée', async () => {
    const consumed = vi.fn();
    render(
      <AuthScreen
        onLogin={vi.fn()}
        uiSettings={SETTINGS}
        initialMfaChallenge={{ mfaToken: 'mfa-g', stage: 'verify', next: 'teacher' }}
        onMfaChallengeConsumed={consumed}
      />,
    );
    expect(await screen.findByLabelText('Code à 6 chiffres')).toBeInTheDocument();
    expect(consumed).toHaveBeenCalled();
  });

  test('phase de transition : invitation à activer, « Plus tard » ouvre la session', async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn();
    const body = { ...TEACHER_BODY, mfaSetupSuggested: true };
    apiMock.mockResolvedValueOnce(body);
    render(<AuthScreen onLogin={onLogin} uiSettings={SETTINGS} />);
    await loginWithPassword(user);
    expect(
      await screen.findByRole('button', { name: 'Activer la double authentification' }),
    ).toBeInTheDocument();
    expect(onLogin).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Plus tard' }));
    expect(onLogin).toHaveBeenCalledWith(body);
  });
});
