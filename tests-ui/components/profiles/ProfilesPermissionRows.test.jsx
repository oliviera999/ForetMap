import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProfilesPermissionRows } from '../../../src/components/profiles/ProfilesPermissionRows.jsx';

const CATALOG = [
  { key: 'tasks.manage', label: 'Gestion tâches' },
  { key: 'tasks.propose', label: 'Proposition de tâches' },
  { key: 'plants.manage', label: 'Gestion biodiversité' },
];

function setup(overrides = {}) {
  const props = {
    catalog: CATALOG,
    rolePermissions: [{ key: 'tasks.manage', requires_elevation: true }],
    loading: false,
    hideTasksPropose: false,
    onToggle: vi.fn(),
    onToggleElevation: vi.fn(),
    ...overrides,
  };
  render(
    <div>
      <ProfilesPermissionRows {...props} />
    </div>,
  );
  return props;
}

describe('ProfilesPermissionRows', () => {
  test('rend une ligne par permission du catalogue', () => {
    setup();
    expect(screen.getByText('Gestion tâches')).toBeInTheDocument();
    expect(screen.getByText('plants.manage')).toBeInTheDocument();
    // chaque ligne : 2 cases (Actif + PIN) → 3 perms × 2 = 6
    expect(screen.getAllByRole('checkbox')).toHaveLength(6);
  });

  test('Actif coché selon rolePermissions ; PIN reflète requires_elevation', () => {
    setup();
    const actifs = screen.getAllByLabelText('Actif');
    // tasks.manage actif, les autres non
    expect(actifs[0]).toBeChecked();
    expect(actifs[1]).not.toBeChecked();
    const pins = screen.getAllByLabelText('PIN');
    expect(pins[0]).toBeChecked(); // requires_elevation: true
    // PIN désactivé quand la permission n'est pas active
    expect(pins[1]).toBeDisabled();
  });

  test('toggle Actif / PIN appellent les handlers avec la clé', () => {
    const { onToggle, onToggleElevation } = setup();
    fireEvent.click(screen.getAllByLabelText('Actif')[2]); // plants.manage
    expect(onToggle).toHaveBeenCalledWith('plants.manage', true);
    fireEvent.click(screen.getAllByLabelText('PIN')[0]); // tasks.manage (actif → PIN cliquable)
    expect(onToggleElevation).toHaveBeenCalledWith('tasks.manage', false);
  });

  test('hideTasksPropose masque la ligne tasks.propose', () => {
    setup({ hideTasksPropose: true });
    expect(screen.queryByText('Proposition de tâches')).not.toBeInTheDocument();
    expect(screen.getByText('Gestion tâches')).toBeInTheDocument();
  });
});
