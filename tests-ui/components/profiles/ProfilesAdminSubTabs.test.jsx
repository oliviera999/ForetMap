import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProfilesAdminSubTabs } from '../../../src/components/profiles/ProfilesAdminSubTabs.jsx';

describe('ProfilesAdminSubTabs', () => {
  test('affiche Profils / Comptes / Groupes / Imports pour un admin profils', () => {
    const onChange = vi.fn();
    render(
      <ProfilesAdminSubTabs
        active="profils"
        onChange={onChange}
        canManageProfiles
        canManageStudents
        canShowImports
        pendingVisitorsCount={3}
      />,
    );
    expect(screen.getByRole('tab', { name: 'Profils' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Comptes' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Groupes (3)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Imports & exports' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Comptes' }));
    expect(onChange).toHaveBeenCalledWith('comptes');
  });

  test('sans gestion profils : Comptes + Imports seulement', () => {
    render(
      <ProfilesAdminSubTabs
        active="comptes"
        onChange={() => {}}
        canManageProfiles={false}
        canManageStudents
        canShowImports
      />,
    );
    expect(screen.queryByRole('tab', { name: 'Profils' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Comptes' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /^Groupes/ })).not.toBeInTheDocument();
  });
});
