import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProfilesUserAssignmentList } from '../../../src/components/profiles/ProfilesUserAssignmentList.jsx';

const USERS = [
  { user_type: 'student', id: 's1', display_name: 'Léa', role_id: 3, role_slug: 'eleve_novice' },
  { user_type: 'teacher', id: 't1', display_name: 'Prof X', role_id: 2, role_slug: 'admin' },
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
    expect(screen.getByText('(student)')).toBeInTheDocument();
    const selects = screen.getAllByRole('combobox');
    expect(selects).toHaveLength(2);
    expect(selects[0]).toHaveValue('3'); // Léa → Novice
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
