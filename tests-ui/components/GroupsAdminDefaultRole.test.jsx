import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

/**
 * Profil par défaut d'un groupe borné aux profils élèves : le panneau de réglages le rappelle,
 * et signale un profil enregistré hors de cette famille (donnée antérieure), qui n'est conféré
 * à aucun membre (`default_role_conferrable === false`, publié par `GET /api/groups`).
 */

const apiMock = vi.fn();

vi.mock('../../src/services/api', () => ({
  api: (...args) => apiMock(...args),
  API: '',
  withAppBase: (p) => p,
  getAuthToken: () => null,
}));

import { GroupsAdminView } from '../../src/components/groups-views.jsx';

const baseGroup = {
  kind: 'class',
  is_active: true,
  parent_group_id: null,
  curriculum_niveau: 'cycle4',
  curriculum_niveau_effectif: 'cycle4',
  curriculum_niveau_herite_de: null,
  curriculum_niveau_manquant: false,
  curriculum_niveau_suggestion: null,
  members: [],
  scopes: [],
};

const GROUPS = [
  {
    ...baseGroup,
    id: 'inerte',
    name: 'Classe ancienne',
    slug: 'inerte',
    default_role_id: 2,
    default_role_slug: 'prof',
    default_role_display_name: 'n3boss',
    default_role_conferrable: false,
  },
  {
    ...baseGroup,
    id: 'novices',
    name: 'Classe novice',
    slug: 'novices',
    default_role_id: 7,
    default_role_slug: 'eleve_novice',
    default_role_display_name: 'n3beur novice',
    default_role_conferrable: true,
  },
];

const ROLES = {
  roles: [
    { id: 2, slug: 'prof', display_name: 'n3boss', rank: 400, group_default_allowed: false },
    {
      id: 7,
      slug: 'eleve_novice',
      display_name: 'n3beur novice',
      rank: 100,
      group_default_allowed: true,
    },
    { id: 9, slug: 'visiteur', display_name: 'Visiteur', rank: 50, group_default_allowed: true },
  ],
};

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation((path, method) => {
    if (path === '/api/groups' && (!method || method === 'GET')) {
      return Promise.resolve({ groups: GROUPS, can_manage: true, can_manage_default_role: true });
    }
    if (path === '/api/rbac/profiles') return Promise.resolve(ROLES);
    return Promise.resolve([]);
  });
});

async function openSettings(groupId) {
  render(<GroupsAdminView />);
  const row = await screen.findByTestId(`group-row-${groupId}`);
  fireEvent.click(within(row).getByRole('button', { name: 'Réglages' }));
  await screen.findByLabelText('Niveau de la classe');
}

describe('GroupsAdminView — profil conféré par le groupe', () => {
  test('signale un profil enregistré qui n’est pas un profil élève', async () => {
    await openSettings('inerte');
    const hint = screen.getByTestId('group-default-role-inert');
    expect(hint.textContent).toMatch(/n3boss/);
    expect(hint.textContent).toMatch(/conféré à aucun membre/);
    // Le sélecteur ne propose que les profils élèves.
    expect(screen.queryByRole('option', { name: 'n3boss' })).toBeNull();
    expect(screen.getByRole('option', { name: 'n3beur novice' })).toBeTruthy();
  });

  test('aucun signalement pour un profil élève', async () => {
    await openSettings('novices');
    expect(screen.queryByTestId('group-default-role-inert')).toBeNull();
    expect(screen.getByText(/ne confère qu’un profil élève/)).toBeTruthy();
  });
});
