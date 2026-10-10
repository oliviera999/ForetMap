import { describe, test, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TotpChallenge } from '../../../src/components/auth/TotpChallenge.jsx';

/**
 * Étape « second facteur » de la connexion : saisie du code TOTP (ou d'un code de secours),
 * ou enrôlement imposé (QR code → premier code → codes de secours à noter).
 */

const SESSION_BODY = { id: 'u1', authToken: 'jeton-complet', auth: { userType: 'teacher' } };

describe('TotpChallenge — vérification', () => {
  test('saisie du code : champ adapté (chiffres, autocomplétion OTP), envoi et session', async () => {
    const user = userEvent.setup();
    const request = vi.fn(async () => SESSION_BODY);
    const onComplete = vi.fn();
    render(
      <TotpChallenge
        challenge={{ mfaToken: 'mfa-1', stage: 'verify', displayName: 'Prof Martin' }}
        request={request}
        onComplete={onComplete}
        onCancel={vi.fn()}
      />,
    );
    const input = screen.getByLabelText('Code à 6 chiffres');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(input).toHaveAttribute('autocomplete', 'one-time-code');
    await user.type(input, '123456');
    await user.click(screen.getByRole('button', { name: 'Valider' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(SESSION_BODY));
    expect(request).toHaveBeenCalledWith('/api/auth/totp/verify', 'POST', {
      mfaToken: 'mfa-1',
      code: '123456',
    });
  });

  test('code de secours : bascule, envoi du code de secours', async () => {
    const user = userEvent.setup();
    const request = vi.fn(async () => SESSION_BODY);
    render(
      <TotpChallenge
        challenge={{ mfaToken: 'mfa-2', stage: 'verify' }}
        request={request}
        onComplete={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Utiliser un code de secours' }));
    await user.type(screen.getByLabelText('Code de secours'), 'abcde-fghjk');
    await user.click(screen.getByRole('button', { name: 'Valider' }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith('/api/auth/totp/verify', 'POST', {
        mfaToken: 'mfa-2',
        backupCode: 'abcde-fghjk',
      }),
    );
  });

  test('code refusé : message d’erreur annoncé, pas de session', async () => {
    const user = userEvent.setup();
    const request = vi.fn(async () => {
      throw new Error('Code incorrect ou déjà utilisé');
    });
    const onComplete = vi.fn();
    render(
      <TotpChallenge
        challenge={{ mfaToken: 'mfa-3', stage: 'verify' }}
        request={request}
        onComplete={onComplete}
        onCancel={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText('Code à 6 chiffres'), '000000');
    await user.click(screen.getByRole('button', { name: 'Valider' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Code incorrect ou déjà utilisé');
    expect(onComplete).not.toHaveBeenCalled();
  });
});

describe('TotpChallenge — enrôlement imposé', () => {
  test('QR code, premier code, puis codes de secours à confirmer avant de continuer', async () => {
    const user = userEvent.setup();
    const request = vi.fn(async (path) => {
      if (path === '/api/auth/totp/enroll/start') {
        return {
          secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
          otpauthUri: 'otpauth://totp/App:prof?secret=JBSW',
          qrDataUrl: 'data:image/png;base64,AAAA',
        };
      }
      return { backupCodes: ['aaaaa-bbbbb', 'ccccc-ddddd'], ...SESSION_BODY };
    });
    const onComplete = vi.fn();
    render(
      <TotpChallenge
        challenge={{ mfaToken: 'mfa-e', stage: 'enroll', setupAvailable: true }}
        request={request}
        onComplete={onComplete}
        onCancel={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Afficher le QR code' }));
    expect(
      await screen.findByAltText('QR code à scanner avec votre application d’authentification'),
    ).toHaveAttribute('src', 'data:image/png;base64,AAAA');
    expect(screen.getByTestId('totp-manual-secret')).toHaveTextContent('JBSW Y3DP');
    expect(request).toHaveBeenCalledWith('/api/auth/totp/enroll/start', 'POST', {
      mfaToken: 'mfa-e',
    });
    await user.type(screen.getByLabelText('Code à 6 chiffres'), '654321');
    await user.click(screen.getByRole('button', { name: 'Activer' }));
    expect(await screen.findByText('aaaaa-bbbbb')).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/api/auth/totp/enroll/confirm', 'POST', {
      mfaToken: 'mfa-e',
      code: '654321',
    });
    const proceed = screen.getByRole('button', { name: 'Continuer' });
    expect(proceed).toBeDisabled();
    await user.click(screen.getByLabelText('J’ai noté ces codes en lieu sûr'));
    await user.click(proceed);
    expect(onComplete).toHaveBeenCalledWith(SESSION_BODY);
  });

  test('clé de chiffrement absente côté serveur : explication, aucune requête', () => {
    const request = vi.fn();
    render(
      <TotpChallenge
        challenge={{ mfaToken: 'mfa-x', stage: 'enroll', setupAvailable: false }}
        request={request}
        onComplete={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/pas encore configurée/);
    expect(screen.queryByRole('button', { name: 'Afficher le QR code' })).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
});
