import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TotpProfileSection } from '../../../src/components/auth/TotpProfileSection.jsx';

/**
 * « Mon profil » — section « Double authentification » des comptes administrateur et n3boss :
 * état, activation, nouveaux codes de secours (affichés une fois). Rien pour un élève.
 */

const TEACHER = { id: 'T1', user_type: 'teacher', auth: { roleSlug: 'prof', userType: 'teacher' } };

function statusOf(overrides = {}) {
  return {
    enforcement: 'enroll',
    subject: true,
    required: false,
    enrolled: false,
    enabledAt: null,
    backupCodesRemaining: 0,
    keyConfigured: true,
    setupAvailable: true,
    sessionValidated: false,
    ...overrides,
  };
}

let request;
beforeEach(() => {
  request = vi.fn();
});

describe('TotpProfileSection', () => {
  test('élève : rien n’est affiché ni demandé au serveur', () => {
    const { container } = render(
      <TotpProfileSection
        account={{ id: 'S1', user_type: 'student', auth: { roleSlug: 'eleve_novice' } }}
        request={request}
        onUpdated={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(request).not.toHaveBeenCalled();
  });

  test('non activée : bouton d’activation, puis jeton neuf remis à la session', async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    request.mockImplementation(async (path) => {
      if (path === '/api/auth/totp/status') return statusOf();
      if (path === '/api/auth/totp/enroll/start') {
        return { secret: 'JBSWY3DPEHPK3PXP', qrDataUrl: 'data:image/png;base64,AAAA' };
      }
      return {
        backupCodes: ['aaaaa-bbbbb'],
        authToken: 'jeton-neuf',
        auth: { userType: 'teacher', mfa: true },
      };
    });
    render(<TotpProfileSection account={TEACHER} request={request} onUpdated={onUpdated} />);
    await user.click(
      await screen.findByRole('button', { name: 'Activer la double authentification' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Afficher le QR code' }));
    expect(request).toHaveBeenCalledWith('/api/auth/totp/enroll/start', 'POST', {});
    await user.type(await screen.findByLabelText('Code à 6 chiffres'), '123456');
    await user.click(screen.getByRole('button', { name: 'Activer' }));
    expect(await screen.findByText('aaaaa-bbbbb')).toBeInTheDocument();
    await user.click(screen.getByLabelText('J’ai noté ces codes en lieu sûr'));
    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    await waitFor(() =>
      expect(onUpdated).toHaveBeenCalledWith({
        authToken: 'jeton-neuf',
        auth: { userType: 'teacher', mfa: true },
      }),
    );
  });

  test('activée : état, alerte codes presque épuisés, régénération avec le code actuel', async () => {
    const user = userEvent.setup();
    request.mockImplementation(async (path) => {
      if (path === '/api/auth/totp/status') {
        return statusOf({
          enrolled: true,
          enabledAt: '2026-10-01T08:00:00.000Z',
          backupCodesRemaining: 2,
          sessionValidated: true,
        });
      }
      return { backupCodes: ['zzzzz-yyyyy'] };
    });
    render(<TotpProfileSection account={TEACHER} request={request} onUpdated={vi.fn()} />);
    expect(await screen.findByText(/Active depuis le/)).toBeInTheDocument();
    expect(screen.getByText(/Codes de secours restants : 2/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Il vous reste peu de codes de secours/);
    await user.click(screen.getByRole('button', { name: 'Nouveaux codes de secours' }));
    await user.type(screen.getByLabelText('Code actuel à 6 chiffres'), '111222');
    await user.click(screen.getByRole('button', { name: 'Générer' }));
    expect(await screen.findByText('zzzzz-yyyyy')).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/api/auth/totp/backup-codes', 'POST', {
      code: '111222',
    });
  });
});
