import { describe, test, expect } from 'vitest';
import { resolveProfilesSubTab } from '../../src/utils/profilesUserListFilters.js';

describe('resolveProfilesSubTab', () => {
  test('avant le chargement des droits : préférence mémorisée, sinon Comptes', () => {
    expect(resolveProfilesSubTab('groupes')).toBe('groupes');
    expect(resolveProfilesSubTab('inconnu')).toBe('comptes');
    expect(resolveProfilesSubTab('')).toBe('comptes');
  });

  test('administrateur : tout est permis, la préférence est respectée', () => {
    const caps = {
      canEditRoleDefinition: true,
      canListAccounts: true,
      canManageStudents: true,
      canManageGroups: true,
      canReadGroups: true,
      canImportGroups: true,
    };
    for (const tab of ['profils', 'comptes', 'groupes', 'imports']) {
      expect(resolveProfilesSubTab(tab, caps)).toBe(tab);
    }
  });

  test('prof de classe (groups.read + groups.manage) : Comptes et Groupes, pas Profils', () => {
    const caps = {
      canEditRoleDefinition: false,
      canListAccounts: true,
      canManageStudents: false,
      canManageGroups: true,
      canReadGroups: true,
      canImportGroups: true,
    };
    expect(resolveProfilesSubTab('groupes', caps)).toBe('groupes');
    expect(resolveProfilesSubTab('comptes', caps)).toBe('comptes');
    expect(resolveProfilesSubTab('profils', caps)).toBe('comptes');
    expect(resolveProfilesSubTab('imports', caps)).toBe('imports');
  });

  test('lecture seule des groupes : Groupes s’ouvre sans droit de gestion', () => {
    const caps = { canReadGroups: true };
    expect(resolveProfilesSubTab('groupes', caps)).toBe('groupes');
    expect(resolveProfilesSubTab('comptes', caps)).toBe('groupes');
  });

  test('attribution des profils seule : Comptes et Groupes, pas Profils (définition)', () => {
    const caps = { canListAccounts: true, canManageGroups: false, canEditRoleDefinition: false };
    expect(resolveProfilesSubTab('profils', caps)).toBe('comptes');
    expect(resolveProfilesSubTab('groupes', caps)).toBe('comptes');
  });

  test('compatibilité : canManageProfiles seul ouvre Profils, Comptes et Groupes', () => {
    const caps = { canManageProfiles: true };
    expect(resolveProfilesSubTab('profils', caps)).toBe('profils');
    expect(resolveProfilesSubTab('groupes', caps)).toBe('groupes');
    expect(resolveProfilesSubTab('imports', caps)).toBe('imports');
  });

  test('gestion des élèves seule : Comptes et Imports', () => {
    const caps = { canManageStudents: true };
    expect(resolveProfilesSubTab('profils', caps)).toBe('comptes');
    expect(resolveProfilesSubTab('imports', caps)).toBe('imports');
  });
});
