import { describe, test, expect } from 'vitest';
import {
  isPrivilegedRole,
  isClassTeacherRole,
  isVisitorLikeRole,
  isForumExcludedRole,
  shouldUseTeacherChrome,
  canManagePedagoContent,
  resolveParticipationFlag,
  resolvePedagoModuleAccess,
} from '../../src/utils/appAccess';

describe('isClassTeacherRole / isVisitorLikeRole / shouldUseTeacherChrome', () => {
  test('prof_classe est tuteur et parcours type visiteur', () => {
    expect(isClassTeacherRole('prof_classe')).toBe(true);
    expect(isClassTeacherRole('prof')).toBe(false);
    expect(isVisitorLikeRole('prof_classe')).toBe(true);
    expect(isVisitorLikeRole('visiteur')).toBe(true);
    expect(isVisitorLikeRole('personnel')).toBe(true);
    expect(isVisitorLikeRole('eleve_novice')).toBe(false);
  });

  test('chrome TeacherTopTabs : n3boss oui, prof de classe non', () => {
    expect(
      shouldUseTeacherChrome({ roleSlug: 'prof', hasTeacherAccess: true, roleViewMode: 'native' }),
    ).toBe(true);
    expect(
      shouldUseTeacherChrome({
        roleSlug: 'prof_classe',
        hasTeacherAccess: true,
        roleViewMode: 'native',
      }),
    ).toBe(false);
    expect(
      shouldUseTeacherChrome({ roleSlug: 'prof', hasTeacherAccess: true, roleViewMode: 'student' }),
    ).toBe(false);
    expect(shouldUseTeacherChrome({ roleSlug: 'visiteur', hasTeacherAccess: false })).toBe(false);
  });
});

/**
 * Parcours et parole sont deux questions distinctes, côté front comme côté serveur
 * (`PARTICIPATION_EXCLUDED_ROLE_SLUGS`, `lib/shared/visitorRoles.js`). L'onglet Forum était
 * dérivé de `isVisitorLikeRole` : il disparaissait donc pour le personnel et les profs de
 * classe, deux publics que le serveur laisse désormais écrire — une fonction livrée que
 * personne ne trouve.
 */
describe('isForumExcludedRole', () => {
  test('seul le visiteur est privé de forum', () => {
    expect(isForumExcludedRole('visiteur')).toBe(true);
    expect(isForumExcludedRole(' VISITEUR ')).toBe(true);
    expect(isForumExcludedRole('personnel')).toBe(false);
    expect(isForumExcludedRole('prof_classe')).toBe(false);
    expect(isForumExcludedRole('eleve_novice')).toBe(false);
    expect(isForumExcludedRole('')).toBe(false);
    expect(isForumExcludedRole(null)).toBe(false);
  });

  test('ne se confond pas avec le parcours visiteur', () => {
    for (const slug of ['personnel', 'prof_classe']) {
      expect(isVisitorLikeRole(slug)).toBe(true);
      expect(isForumExcludedRole(slug)).toBe(false);
    }
  });
});

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

describe('resolvePedagoModuleAccess (décision du 25/09 révisée)', () => {
  test('réglages absents : tout est allumé et disponible, sans bandeau', () => {
    const access = resolvePedagoModuleAccess({ modules: {} });
    for (const key of ['idKeys', 'individuals', 'pedagoSessions']) {
      expect(access[key]).toEqual({ enabled: true, available: true, learnerOff: false });
    }
    expect(access.rewards.enabled).toBe(true);
    expect(resolvePedagoModuleAccess().idKeys.available).toBe(true);
  });

  test('module éteint : fermé à qui ne le gère pas', () => {
    const access = resolvePedagoModuleAccess({
      modules: { id_keys_enabled: false, rewards_enabled: false },
    });
    expect(access.idKeys).toEqual({ enabled: false, available: false, learnerOff: false });
    expect(access.individuals.available).toBe(true);
    expect(access.rewards.enabled).toBe(false);
  });

  test('module éteint : ouvert au gestionnaire, avec bandeau ; chaque droit pour son module', () => {
    const access = resolvePedagoModuleAccess({
      modules: {
        id_keys_enabled: false,
        individuals_enabled: false,
        pedago_sessions_enabled: false,
      },
      canManageIdKeys: true,
      canManagePedagoSessions: true,
    });
    expect(access.idKeys).toEqual({ enabled: false, available: true, learnerOff: true });
    expect(access.pedagoSessions).toEqual({ enabled: false, available: true, learnerOff: true });
    expect(access.individuals).toEqual({ enabled: false, available: false, learnerOff: false });
  });
});
