import { describe, test, expect } from 'vitest';
import {
  isN3beurTierConfigurableProfile,
  sortRolesForDisplay,
  deriveProfilesCapabilities,
  normalizeRoleEditFields,
  buildRoleReorderPatches,
  parseMaxConcurrentTasksLimit,
  parseMinDoneTasksThreshold,
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

describe('buildRoleReorderPatches', () => {
  const roles = [
    { id: 1, display_order: 0 },
    { id: 2, display_order: 1 },
    { id: 3, display_order: 2 },
  ];
  test('descendre un profil échange les deux positions concernées seulement', () => {
    expect(buildRoleReorderPatches(roles, 1, +1)).toEqual([
      { id: 2, display_order: 0 },
      { id: 1, display_order: 1 },
    ]);
  });
  test('monter un profil', () => {
    expect(buildRoleReorderPatches(roles, 3, -1)).toEqual([
      { id: 3, display_order: 1 },
      { id: 2, display_order: 2 },
    ]);
  });
  test('hors liste ou en bord de liste → null ; entrée non mutée', () => {
    expect(buildRoleReorderPatches(roles, 99, +1)).toBeNull();
    expect(buildRoleReorderPatches(roles, 1, -1)).toBeNull();
    expect(buildRoleReorderPatches(roles, 3, +1)).toBeNull();
    expect(roles.map((r) => r.id)).toEqual([1, 2, 3]);
  });
  test('renvoie aussi les corrections des positions désynchronisées (display_order ≠ index)', () => {
    const desync = [
      { id: 1, display_order: 5 },
      { id: 2, display_order: 1 },
      { id: 3, display_order: 2 },
    ];
    expect(buildRoleReorderPatches(desync, 2, +1)).toEqual([
      { id: 1, display_order: 0 },
      { id: 3, display_order: 1 },
      { id: 2, display_order: 2 },
    ]);
  });
  test('ignore les profils sans id', () => {
    const withNull = [{ id: 1, display_order: 0 }, { id: null, display_order: 1 }];
    expect(buildRoleReorderPatches(withNull, 1, +1)).toEqual([{ id: 1, display_order: 1 }]);
  });
});

describe('parseMaxConcurrentTasksLimit', () => {
  test('vide → héritage du réglage global (value null) avec message dédié', () => {
    expect(parseMaxConcurrentTasksLimit('')).toEqual({
      value: null,
      message: 'Plafond d’inscriptions : héritage du réglage global (Paramètres n3boss) enregistré',
    });
    expect(parseMaxConcurrentTasksLimit('   ').value).toBeNull();
  });
  test('0 → pas de limite ; 1..99 → message avec la valeur', () => {
    expect(parseMaxConcurrentTasksLimit('0')).toEqual({
      value: 0,
      message: 'Pas de limite d’inscriptions pour ce profil (0) : enregistré.',
    });
    expect(parseMaxConcurrentTasksLimit(' 7 ')).toEqual({
      value: 7,
      message: 'Plafond d’inscriptions simultanées : 7 tâche(s) non validée(s) — enregistré.',
    });
  });
  test('hors bornes ou non numérique → erreur', () => {
    for (const raw of ['-1', '100', 'abc']) {
      expect(parseMaxConcurrentTasksLimit(raw)).toEqual({
        error: 'Plafond invalide : entier entre 0 et 99 (0 = pas de limite pour ce profil), ou champ vide pour hériter du réglage global',
      });
    }
  });
});

describe('parseMinDoneTasksThreshold', () => {
  test('entier ≥ 0 accepté (espaces tolérés)', () => {
    expect(parseMinDoneTasksThreshold('0')).toEqual({ value: 0 });
    expect(parseMinDoneTasksThreshold(' 12 ')).toEqual({ value: 12 });
  });
  test('vide, négatif ou non numérique → erreur', () => {
    for (const raw of ['', '   ', '-3', 'abc']) {
      expect(parseMinDoneTasksThreshold(raw)).toEqual({ error: 'Seuil invalide : indiquez un entier ≥ 0' });
    }
  });
});
