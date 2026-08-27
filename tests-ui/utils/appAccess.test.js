import { describe, test, expect } from 'vitest';
import {
  isPrivilegedRole,
  canManagePedagoContent,
  resolveParticipationFlag,
} from '../../src/utils/appAccess';

describe('isPrivilegedRole', () => {
  test('prof et admin sont privilégiés (insensible à la casse)', () => {
    expect(isPrivilegedRole('prof')).toBe(true);
    expect(isPrivilegedRole('ADMIN')).toBe(true);
  });

  test('les autres rôles ne le sont pas, sauf claim nativePrivileged', () => {
    expect(isPrivilegedRole('visiteur')).toBe(false);
    expect(isPrivilegedRole(null)).toBe(false);
    expect(isPrivilegedRole('visiteur', true)).toBe(true);
  });
});

describe('canManagePedagoContent', () => {
  const hasPermission = (perm) => perm === 'tutorials.manage';

  test('rôle privilégié + permission active → autorisé', () => {
    expect(
      canManagePedagoContent({ roleSlug: 'prof', permission: 'tutorials.manage', hasPermission }),
    ).toBe(true);
  });

  test('rôle privilégié sans la permission → refusé', () => {
    expect(
      canManagePedagoContent({ roleSlug: 'admin', permission: 'plants.manage', hasPermission }),
    ).toBe(false);
  });

  test('permission active mais rôle non privilégié → refusé', () => {
    expect(
      canManagePedagoContent({ roleSlug: 'eleve', permission: 'tutorials.manage', hasPermission }),
    ).toBe(false);
  });

  test('claim nativePrivileged suffit pour la partie rôle', () => {
    expect(
      canManagePedagoContent({
        roleSlug: 'eleve',
        nativePrivileged: true,
        permission: 'tutorials.manage',
        hasPermission,
      }),
    ).toBe(true);
  });

  test('sans fonction de permission → refusé', () => {
    expect(canManagePedagoContent({ roleSlug: 'admin', permission: 'tutorials.manage' })).toBe(
      false,
    );
  });
});

describe('resolveParticipationFlag', () => {
  const keys = { camelKey: 'forumParticipate', snakeKey: 'forum_participate' };

  test('prof : toujours autorisé', () => {
    expect(
      resolveParticipationFlag({ isTeacher: true, user: { forum_participate: 0 }, ...keys }),
    ).toBe(true);
  });

  test('sans profil chargé : autorisé (défaut permissif historique)', () => {
    expect(resolveParticipationFlag({ user: null, ...keys })).toBe(true);
  });

  test('le drapeau camelCase de /api/auth/me prime sur la colonne SQL', () => {
    expect(
      resolveParticipationFlag({
        user: { forumParticipate: false, forum_participate: 1 },
        ...keys,
      }),
    ).toBe(false);
  });

  test('colonne SQL 0/1 quand le drapeau camelCase est absent', () => {
    expect(resolveParticipationFlag({ user: { forum_participate: 0 }, ...keys })).toBe(false);
    expect(resolveParticipationFlag({ user: { forum_participate: 1 }, ...keys })).toBe(true);
  });

  test('aucun des deux champs → autorisé', () => {
    expect(resolveParticipationFlag({ user: { id: 12 }, ...keys })).toBe(true);
  });
});
