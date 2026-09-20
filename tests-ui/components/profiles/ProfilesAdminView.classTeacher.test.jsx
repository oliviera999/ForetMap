import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * Montage de `ProfilesAdminView` avec les permissions du **prof de classe** :
 * `teacher.access, groups.read, groups.manage, stats.read.group, observations.read.group,
 * staff_plan.access` — ni `admin.roles.manage` ni `admin.users.assign_roles`.
 *
 * Ce profil doit disposer d'un onglet « Classe » utilisable : le sous-onglet Groupes et la
 * liste des comptes de ses groupes (`GET /api/rbac/users`, ouvert à `groups.manage`), sans
 * que le refus de `GET /api/rbac/profiles` ne casse le chargement.
 */

const CLASS_TEACHER_PERMS = [
  'teacher.access',
  'groups.read',
  'groups.manage',
  'stats.read.group',
  'observations.read.group',
  'staff_plan.access',
];

const USERS = [
  {
    id: 's1',
    user_type: 'student',
    is_active: true,
    display_name: 'Ana Blin',
    role_id: 1,
    role_slug: 'visiteur',
    role_display_name: 'Visiteur',
    assigned_role_id: 1,
    assigned_role_slug: 'visiteur',
    assigned_role_display_name: 'Visiteur',
    groups: [{ id: 'g1', name: 'Sixième 3', kind: 'class', is_active: true }],
  },
  {
    id: 's2',
    user_type: 'student',
    is_active: false,
    display_name: 'Bob Carr',
    role_id: 1,
    role_slug: 'visiteur',
    role_display_name: 'Visiteur',
    assigned_role_id: 1,
    groups: [{ id: 'g1', name: 'Sixième 3', kind: 'class', is_active: true }],
  },
];

const apiMock = vi.fn();

vi.mock('../../../src/services/api', () => ({
  api: (...args) => apiMock(...args),
  API: '',
  withAppBase: (p) => p,
  getAuthToken: () => null,
}));

vi.mock('../../../src/components/groups-views.jsx', () => ({
  GroupsAdminView: () => <div data-testid="groups-admin-view">Vue Groupes</div>,
}));

vi.mock('../../../src/utils/downloadApiFile.js', () => ({ downloadApiFile: vi.fn() }));

const { ProfilesAdminView } = await import('../../../src/components/profiles-views.jsx');

function forbidden(path) {
  const err = new Error(`Permission insuffisante (${path})`);
  err.status = 403;
  return Promise.reject(err);
}

describe('ProfilesAdminView — prof de classe (onglet « Classe »)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
    apiMock.mockReset();
    apiMock.mockImplementation((path) => {
      const p = String(path);
      if (p.startsWith('/api/auth/me')) {
        return Promise.resolve({
          id: 'T1',
          auth: { userId: 'T1', roleSlug: 'prof_classe', permissions: CLASS_TEACHER_PERMS },
        });
      }
      if (p.startsWith('/api/rbac/profiles')) return forbidden(p);
      if (p.startsWith('/api/rbac/users')) return Promise.resolve(USERS);
      if (p.startsWith('/api/groups/options')) {
        return Promise.resolve({ groups: [{ id: 'g1', name: 'Sixième 3' }] });
      }
      if (p.startsWith('/api/stats/all')) return forbidden(p);
      return Promise.resolve({});
    });
  });

  test('sous-onglets Comptes et Groupes accessibles, sans Profils ; les comptes sont listés', async () => {
    render(<ProfilesAdminView />);
    expect(await screen.findByRole('tab', { name: /^Comptes/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Groupes/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Profils' })).not.toBeInTheDocument();
    // `groups.manage` ouvre l'import de groupes : l'onglet Imports & exports reste proposé.
    expect(screen.getByRole('tab', { name: 'Imports & exports' })).toBeInTheDocument();

    // Comptes : la liste des élèves de ses groupes, en lecture seule pour le profil.
    expect(await screen.findByText('Ana Blin')).toBeInTheDocument();
    expect(screen.getByLabelText('Profil de Ana Blin')).toBeDisabled();
    expect(screen.getByTestId('user-inactive-s2')).toHaveTextContent('désactivé');
    expect(screen.getByLabelText('Modifier Ana Blin')).not.toBeDisabled();

    // Pas d'appel aux profils RBAC (refusé à ce rôle) ni de bandeau d'erreur.
    const calledPaths = apiMock.mock.calls.map((c) => String(c[0]));
    expect(calledPaths.some((p) => p.startsWith('/api/rbac/profiles'))).toBe(false);
    expect(calledPaths.some((p) => p.startsWith('/api/rbac/users'))).toBe(true);
    expect(document.querySelector('.auth-error')).toBeNull();
  });

  test('le sous-onglet Groupes monte la vue des groupes', async () => {
    render(<ProfilesAdminView />);
    fireEvent.click(await screen.findByRole('tab', { name: /^Groupes/ }));
    expect(await screen.findByTestId('groups-admin-view')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Groupes/ })).toHaveAttribute('aria-selected', 'true');
  });

  test('un refus partiel (profils) ne bloque pas les comptes quand les deux sont demandés', async () => {
    apiMock.mockImplementation((path) => {
      const p = String(path);
      if (p.startsWith('/api/auth/me')) {
        return Promise.resolve({
          auth: {
            userId: 'T1',
            roleSlug: 'prof',
            permissions: [...CLASS_TEACHER_PERMS, 'admin.roles.manage', 'admin.users.assign_roles'],
          },
        });
      }
      if (p.startsWith('/api/rbac/profiles')) return forbidden(p);
      if (p.startsWith('/api/rbac/users')) return Promise.resolve(USERS);
      if (p.startsWith('/api/groups/options')) return Promise.resolve({ groups: [] });
      return Promise.resolve({});
    });
    render(<ProfilesAdminView />);
    expect(await screen.findByText('Ana Blin')).toBeInTheDocument();
    await waitFor(() =>
      expect(document.querySelector('.auth-error')?.textContent).toContain(
        'Permission insuffisante (/api/rbac/profiles)',
      ),
    );
  });
});
