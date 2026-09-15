import { SettingsAdminView } from '../../src/components/settings-admin-views.jsx';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../src/services/api', () => ({
  api: vi.fn(async (url) => {
    if (String(url).includes('/api/settings/admin')) {
      return { settings: [], maps: [] };
    }
    if (String(url).includes('/api/maps')) {
      return [];
    }
    return {};
  }),
}));

vi.mock('../../src/contexts/SessionContext.jsx', () => ({
  useSession: () => ({ isN3Affiliated: true }),
}));

vi.mock('../../src/shared/components/AppDialogsProvider.jsx', () => ({
  useAppDialogs: () => ({
    confirm: vi.fn(async () => false),
    prompt: vi.fn(async () => null),
  }),
}));

describe('SettingsAdminView — gates permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('tours-only : sous-onglet Visites guidées visible, pas Accueil', async () => {
    render(
      <SettingsAdminView
        canReadSettings={false}
        canWriteSettings={false}
        canManageTours
        canManageMoodle={false}
        canManageZones={false}
        canManageMarkers={false}
      />,
    );
    expect(await screen.findByRole('tab', { name: /Aide & découverte/i })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /Accueil/i })).toBeNull();
    expect(screen.queryByRole('tab', { name: /Intégrations/i })).toBeNull();
  });

  test('zones-only : Cartographie visible', async () => {
    render(
      <SettingsAdminView
        canReadSettings={false}
        canWriteSettings={false}
        canManageTours={false}
        canManageMoodle={false}
        canManageZones
        canManageMarkers={false}
      />,
    );
    expect(await screen.findByRole('tab', { name: /Cartographie/i })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /Intégrations/i })).toBeNull();
  });

  test('Moodle masqué sans integrations.moodle.manage', async () => {
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
    expect(await screen.findByRole('tab', { name: /Accueil/i })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /Intégrations/i })).toBeNull();
  });
});
