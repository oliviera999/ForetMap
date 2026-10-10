import { describe, test, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserTotpAdminPanel } from '../../../src/components/profiles/UserTotpAdminPanel.jsx';

/**
 * Fiche d'un compte (administration) : état de la double authentification et
 * réinitialisation (téléphone perdu), avec confirmation en place.
 */

describe('UserTotpAdminPanel', () => {
  test('compte enrôlé : état affiché, réinitialisation après confirmation', async () => {
    const user = userEvent.setup();
    let enrolled = true;
    const request = vi.fn(async (path, method) => {
      if (method === 'POST') {
        enrolled = false;
        return { ok: true, hadTotp: true };
      }
      return {
        subject: true,
        enrolled,
        enabledAt: enrolled ? '2026-10-01T08:00:00.000Z' : null,
        backupCodesRemaining: enrolled ? 7 : 0,
      };
    });
    render(<UserTotpAdminPanel userId="U9" request={request} />);
    expect(await screen.findByText(/Active depuis le/)).toBeInTheDocument();
    expect(screen.getByText(/7 codes de secours/)).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Réinitialiser la double authentification' }),
    );
    expect(request).not.toHaveBeenCalledWith('/api/auth/totp/users/U9/reset', 'POST', {});
    expect(screen.getByRole('alertdialog')).toHaveTextContent(/toutes ses sessions/);
    await user.click(screen.getByRole('button', { name: 'Confirmer la réinitialisation' }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith('/api/auth/totp/users/U9/reset', 'POST', {}),
    );
    expect(await screen.findByText(/Double authentification réinitialisée/)).toBeInTheDocument();
    expect(await screen.findByText(/Non activée/)).toBeInTheDocument();
  });

  test('compte non concerné et non enrôlé : rien n’est affiché', async () => {
    const request = vi.fn(async () => ({ subject: false, enrolled: false }));
    const { container } = render(<UserTotpAdminPanel userId="S1" request={request} />);
    await waitFor(() => expect(request).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
