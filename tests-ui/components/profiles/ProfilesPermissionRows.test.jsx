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
    rolePermissions: [{ key: 'tasks.manage' }],
    loading: false,
    hideTasksPropose: false,
    onToggle: vi.fn(),
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
    // chaque ligne : 1 case (Actif) → 3 perms × 1 = 3 (plus de case PIN/élévation)
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
  });

  test('Actif coché selon rolePermissions ; aucune case PIN', () => {
    setup();
    const actifs = screen.getAllByLabelText('Actif');
    // tasks.manage actif, les autres non
    expect(actifs[0]).toBeChecked();
    expect(actifs[1]).not.toBeChecked();
    expect(screen.queryByLabelText('PIN')).toBeNull();
  });

  test('toggle Actif appelle le handler avec la clé', () => {
    const { onToggle } = setup();
    fireEvent.click(screen.getAllByLabelText('Actif')[2]); // plants.manage
    expect(onToggle).toHaveBeenCalledWith('plants.manage', true);
  });

  test('hideTasksPropose masque la ligne tasks.propose', () => {
    setup({ hideTasksPropose: true });
    expect(screen.queryByText('Proposition de tâches')).not.toBeInTheDocument();
    expect(screen.getByText('Gestion tâches')).toBeInTheDocument();
  });
});
