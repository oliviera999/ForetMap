import { describe, test, expect } from 'vitest';
import {
  isN3beurTierConfigurableProfile,
  sortRolesForDisplay,
  deriveProfilesCapabilities,
  normalizeRoleEditFields,
} from '../../src/utils/profilesRbacHelpers.js';

describe('isN3beurTierConfigurableProfile', () => {
  test('false pour admin/prof/visiteur et null', () => {
    expect(isN3beurTierConfigurableProfile(null)).toBe(false);
    expect(isN3beurTierConfigurableProfile({ slug: 'admin' })).toBe(false);
    expect(isN3beurTierConfigurableProfile({ slug: 'prof' })).toBe(false);
    expect(isN3beurTierConfigurableProfile({ slug: 'visiteur' })).toBe(false);
  });
  test('true pour slug eleve_* ou rang < 400', () => {
    expect(isN3beurTierConfigurableProfile({ slug: 'eleve_novice' })).toBe(true);
    expect(isN3beurTierConfigurableProfile({ slug: 'custom', rank: 300 })).toBe(true);
    expect(isN3beurTierConfigurableProfile({ slug: 'custom', rank: 400 })).toBe(false);
    expect(isN3beurTierConfigurableProfile({ slug: 'custom', rank: 'x' })).toBe(false);
  });
});

describe('sortRolesForDisplay', () => {
  test('display_order ↑, puis rank ↓, puis id ↑ ; ne mute pas', () => {
    const roles = [
      { id: 3, display_order: 1, rank: 100 },
      { id: 1, display_order: 0, rank: 200 },
      { id: 2, display_order: 0, rank: 500 },
      { id: 5, display_order: 1, rank: 100 },
    ];
    expect(sortRolesForDisplay(roles).map((r) => r.id)).toEqual([2, 1, 3, 5]);
    expect(roles.map((r) => r.id)).toEqual([3, 1, 2, 5]); // entrée inchangée
  });
  test('tolère null/undefined', () => {
    expect(sortRolesForDisplay(null)).toEqual([]);
  });
});

describe('deriveProfilesCapabilities', () => {
  test('sans élévation : actions élevées refusées', () => {
    const caps = deriveProfilesCapabilities({
      authPerms: ['stats.export', 'students.import', 'students.delete', 'users.create', 'stats.read.all'],
      authElevated: false,
      authNativePrivileged: false,
      authRoleSlug: 'prof',
    });
    expect(caps.canExport).toBe(false);
    expect(caps.canImport).toBe(false);
    expect(caps.canDelete).toBe(false);
    expect(caps.canManageStudents).toBe(false);
    expect(caps.canReadAllStats).toBe(true);
    expect(caps.isAdmin).toBe(false);
  });
  test('avec élévation : actions ouvertes ; canDuplicate/canDeleteUi requièrent read.all', () => {
    const caps = deriveProfilesCapabilities({
      authPerms: ['stats.export', 'students.import', 'students.delete', 'users.create', 'stats.read.all', 'admin.roles.manage'],
      authElevated: true,
      authRoleSlug: 'admin',
    });
    expect(caps.canExport).toBe(true);
    expect(caps.canDelete).toBe(true);
    expect(caps.canCreateUsers).toBe(true);
    expect(caps.canDuplicateStudents).toBe(true);
    expect(caps.canDeleteUi).toBe(true);
    expect(caps.canEditRoleDefinition).toBe(true);
    expect(caps.canManageProfiles).toBe(true);
    expect(caps.isAdmin).toBe(true);
    expect(caps.effectiveElevated).toBe(true);
  });
  test('élévation native équivaut à élevé ; sans read.all, pas de duplicate/deleteUi', () => {
    const caps = deriveProfilesCapabilities({
      authPerms: ['students.delete', 'users.create'],
      authNativePrivileged: true,
    });
    expect(caps.effectiveElevated).toBe(true);
    expect(caps.canDelete).toBe(true);
    expect(caps.canDuplicateStudents).toBe(false);
    expect(caps.canDeleteUi).toBe(false);
  });
  test('canManageProfiles via assign_roles seul', () => {
    expect(deriveProfilesCapabilities({ authPerms: ['admin.users.assign_roles'] }).canManageProfiles).toBe(true);
    expect(deriveProfilesCapabilities({ authPerms: [] }).canManageProfiles).toBe(false);
  });
});

describe('normalizeRoleEditFields', () => {
  test('null → tout vide', () => {
    expect(normalizeRoleEditFields(null)).toEqual({
      emoji: '',
      minDoneTasks: '',
      displayOrder: '',
      maxConcurrentTasks: '',
    });
  });
  test('valeurs normalisées (plancher entier ≥ 0) ; display_order défaut 0', () => {
    expect(normalizeRoleEditFields({ emoji: '🌿', min_done_tasks: 5.9, display_order: 2 })).toEqual({
      emoji: '🌿',
      minDoneTasks: '5',
      displayOrder: '2',
      maxConcurrentTasks: '',
    });
    expect(normalizeRoleEditFields({}).displayOrder).toBe('0');
    expect(normalizeRoleEditFields({}).minDoneTasks).toBe('');
  });
  test('max_concurrent_tasks : null/"" → "" ; nombre → entier', () => {
    expect(normalizeRoleEditFields({ max_concurrent_tasks: 3 }).maxConcurrentTasks).toBe('3');
    expect(normalizeRoleEditFields({ max_concurrent_tasks: '' }).maxConcurrentTasks).toBe('');
    expect(normalizeRoleEditFields({ max_concurrent_tasks: null }).maxConcurrentTasks).toBe('');
  });
});
