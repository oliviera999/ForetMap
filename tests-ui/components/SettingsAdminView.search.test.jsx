import { SettingsAdminView } from '../../src/components/settings-admin-views.jsx';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../src/services/api', () => ({
  api: vi.fn(async (url) => {
    if (String(url).includes('/api/settings/admin')) {
      return {
        settings: [
          {
            key: 'system.maintenance_mode',
            type: 'boolean',
            scope: 'admin',
            value: false,
            default_value: false,
          },
          {
            key: 'ui.auth.allow_register',
            type: 'boolean',
            scope: 'public',
            value: true,
            default_value: true,
          },
          {
            key: 'security.password_min_length',
            type: 'number',
            scope: 'admin',
            value: 8,
            default_value: 8,
            constraints: { min: 4, max: 32 },
          },
        ],
        maps: [],
      };
    }
    return {};
  }),
}));

vi.mock('../../src/contexts/SessionContext.jsx', () => ({
  useSession: () => ({ isN3Affiliated: false }),
}));

vi.mock('../../src/shared/components/AppDialogsProvider.jsx', () => ({
  useAppDialogs: () => ({
    confirm: vi.fn(async () => false),
    prompt: vi.fn(async () => null),
  }),
}));

describe('SettingsAdminView — recherche globale', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('barre de recherche toujours visible ; filtre cross-onglets', async () => {
    const user = userEvent.setup();
    render(
      <SettingsAdminView
        canReadSettings
        canWriteSettings
        canManageTours
        canManageMoodle={false}
        canManageZones
        canManageMarkers
      />,
    );

    const search = await screen.findByTestId('settings-admin-search');
    expect(search).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Accueil/i })).toBeTruthy();

    const input = screen.getByLabelText(/Rechercher un paramètre/i);
    await user.type(input, 'maintenance');

    await waitFor(() => {
      expect(screen.getByTestId('settings-admin-search-results')).toBeTruthy();
    });
    expect(screen.queryByRole('tab', { name: /Accueil/i })).toBeNull();
    expect(screen.getByText(/Mode maintenance|maintenance/i)).toBeTruthy();
    expect(screen.getByText(/paramètre\(s\) trouvé\(s\)/i)).toBeTruthy();
  });

  test('mot-clé thématique propose « Aller à » puis ouvre la section', async () => {
    const user = userEvent.setup();
    render(
      <SettingsAdminView
        canReadSettings
        canWriteSettings
        canManageTours
        canManageMoodle={false}
        canManageZones
        canManageMarkers
      />,
    );

    await screen.findByTestId('settings-admin-search');
    await user.type(screen.getByLabelText(/Rechercher un paramètre/i), 'mascotte');

    const goVisit = await screen.findByRole('button', { name: /^Visite$/i });
    await user.click(goVisit);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /^Visite$/i })).toHaveClass('is-active');
    });
    expect(screen.getByLabelText(/Rechercher un paramètre/i)).toHaveValue('');
  });
});
