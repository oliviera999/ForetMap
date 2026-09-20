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
    // P15 — la pastille « à traiter » est une alerte nommée, pas un compteur de résultats.
    expect(screen.getByLabelText('3 comptes à rattacher')).toHaveClass('profiles-subtab-alert');
    expect(screen.getByRole('tab', { name: 'Imports & exports' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Comptes' }));
    expect(onChange).toHaveBeenCalledWith('comptes');
  });

  test('P15 — le compteur Comptes distingue les résultats filtrés du total', () => {
    render(
      <ProfilesAdminSubTabs
        active="comptes"
        onChange={() => {}}
        canManageProfiles
        canManageStudents
        accountsFilteredCount={12}
        accountsTotalCount={350}
      />,
    );
    expect(screen.getByRole('tab', { name: /Comptes/ })).toHaveTextContent('Comptes 12 / 350');
  });

  test('P15 — sans filtre actif, un seul nombre suffit', () => {
    render(
      <ProfilesAdminSubTabs
        active="comptes"
        onChange={() => {}}
        canManageProfiles
        canManageStudents
        accountsFilteredCount={350}
        accountsTotalCount={350}
      />,
    );
    expect(screen.getByRole('tab', { name: /Comptes/ })).toHaveTextContent('Comptes 350');
  });

  test('P15 — aucun visiteur en attente : pas de pastille d’alerte', () => {
    render(
      <ProfilesAdminSubTabs
        active="comptes"
        onChange={() => {}}
        canManageProfiles
        canManageStudents
        pendingVisitorsCount={0}
      />,
    );
    expect(screen.getByRole('tab', { name: /Groupes/ })).toBeInTheDocument();
    expect(document.querySelector('.profiles-subtab-alert')).toBeNull();
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

  test('prof de classe : Comptes + Groupes, sans Profils ni Imports', () => {
    render(
      <ProfilesAdminSubTabs
        active="groupes"
        onChange={() => {}}
        canShowProfiles={false}
        canShowAccounts
        canShowGroups
        canShowImports={false}
      />,
    );
    expect(screen.queryByRole('tab', { name: 'Profils' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Comptes' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Groupes/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: 'Imports & exports' })).not.toBeInTheDocument();
  });

  test('Profils demande la définition des rôles, pas seulement l’attribution', () => {
    render(
      <ProfilesAdminSubTabs
        active="comptes"
        onChange={() => {}}
        canShowProfiles={false}
        canShowAccounts
        canShowGroups
      />,
    );
    expect(screen.queryByRole('tab', { name: 'Profils' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Groupes/ })).toBeInTheDocument();
  });
});
