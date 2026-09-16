import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProfilesUserAssignmentList } from '../../../src/components/profiles/ProfilesUserAssignmentList.jsx';

const USERS = [
  {
    user_type: 'student',
    id: 's1',
    display_name: 'Léa',
    role_id: 3,
    role_slug: 'eleve_novice',
    groups: [{ id: 'g1', name: '2nde B', kind: 'class', role_in_group: 'member' }],
  },
  {
    user_type: 'teacher',
    id: 't1',
    display_name: 'Prof X',
    role_id: 2,
    role_slug: 'admin',
    groups: [],
  },
];
const ROLES = [
  { id: 2, display_name: 'Admin' },
  { id: 3, display_name: 'Novice' },
];

function setup(overrides = {}) {
  const props = {
    users: USERS,
    roles: ROLES,
    loading: false,
    editUserLoadState: 'idle',
    isAdmin: false,
    onAssignRole: vi.fn(),
    onOpenEditUser: vi.fn(),
    ...overrides,
  };
  render(<ProfilesUserAssignmentList {...props} />);
  return props;
}

describe('ProfilesUserAssignmentList', () => {
  test('rend une ligne par utilisateur (nom + type) avec sélecteur de profil', () => {
    setup();
    expect(screen.getByText('Léa')).toBeInTheDocument();
    expect(screen.getByText('Élève')).toBeInTheDocument();
    const selects = screen.getAllByRole('combobox');
    expect(selects).toHaveLength(2);
    expect(selects[0]).toHaveValue('3'); // Léa → Novice
  });

  test('chaque ligne montre le rattachement groupes (ou son absence)', () => {
    setup();
    expect(screen.getByText('2nde B')).toBeInTheDocument();
    expect(screen.getByTestId('user-groups-empty')).toHaveTextContent('Aucun groupe');
    expect(screen.getByLabelText('Profil de Léa')).toBeInTheDocument();
  });

  test('au-delà de 3 groupes, la ligne résume le surplus par un compteur', () => {
    setup({
      users: [
        {
          ...USERS[0],
          groups: ['A', 'B', 'C', 'D'].map((n) => ({
            id: `g-${n}`,
            name: n,
            kind: 'class',
            role_in_group: 'member',
          })),
        },
      ],
    });
    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(screen.queryByText('D')).not.toBeInTheDocument();
  });

  test('changer le profil appelle onAssignRole(userType, id, roleId)', () => {
    const { onAssignRole } = setup();
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '2' } });
    expect(onAssignRole).toHaveBeenCalledWith('student', 's1', 2);
  });

  test('non-admin ne peut pas modifier un admin (bouton désactivé + titre)', () => {
    setup({ isAdmin: false });
    const editButtons = screen.getAllByRole('button', { name: 'Modifier' });
    expect(editButtons[0]).not.toBeDisabled(); // Léa (non-admin)
    expect(editButtons[1]).toBeDisabled(); // Prof X (admin)
    expect(editButtons[1]).toHaveAttribute('title', expect.stringContaining('administrateur'));
  });

  test('admin peut modifier un admin ; clic appelle onOpenEditUser', () => {
    const { onOpenEditUser } = setup({ isAdmin: true });
    const editButtons = screen.getAllByRole('button', { name: 'Modifier' });
    expect(editButtons[1]).not.toBeDisabled();
    fireEvent.click(editButtons[0]);
    expect(onOpenEditUser).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }));
  });
});
