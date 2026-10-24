import { describe, expect, it } from 'vitest';
import {
  buildUnitaryCreateRoleOptions,
  isStudentUnitaryCreateRole,
  UNITARY_CREATE_ROLE_SLUGS,
} from '../../src/utils/createUserRoleOptions.js';

describe('createUserRoleOptions', () => {
  it('liste les 8 profils ForetMap', () => {
    expect(UNITARY_CREATE_ROLE_SLUGS).toEqual([
      'visiteur',
      'personnel',
      'eleve_novice',
      'eleve_avance',
      'eleve_chevronne',
      'prof_classe',
      'prof',
      'admin',
    ]);
  });

  it('isStudentUnitaryCreateRole', () => {
    expect(isStudentUnitaryCreateRole('visiteur')).toBe(true);
    expect(isStudentUnitaryCreateRole('personnel')).toBe(true);
    expect(isStudentUnitaryCreateRole('eleve_avance')).toBe(true);
    expect(isStudentUnitaryCreateRole('prof')).toBe(false);
    expect(isStudentUnitaryCreateRole('prof_classe')).toBe(false);
  });

  it('filtre admin / enseignants selon les droits', () => {
    const studentOnly = buildUnitaryCreateRoleOptions({
      isAdmin: false,
      canCreateTeacherRoles: false,
    });
    expect(studentOnly.map((o) => o.value)).toEqual([
      'visiteur',
      'personnel',
      'eleve_novice',
      'eleve_avance',
      'eleve_chevronne',
    ]);

    const withTeachers = buildUnitaryCreateRoleOptions({
      isAdmin: false,
      canCreateTeacherRoles: true,
      roles: [{ slug: 'prof_classe', display_name: 'Tuteur' }],
    });
    expect(withTeachers.map((o) => o.value)).toContain('prof_classe');
    expect(withTeachers.find((o) => o.value === 'prof_classe')?.label).toBe('Tuteur');
    expect(withTeachers.map((o) => o.value)).not.toContain('admin');

    const admin = buildUnitaryCreateRoleOptions({ isAdmin: true });
    expect(admin.map((o) => o.value)).toEqual(UNITARY_CREATE_ROLE_SLUGS);
  });

  it('hors administrateur, pas de profil de rang égal au n3boss : « n3boss » réservé à l’admin', () => {
    const n3boss = buildUnitaryCreateRoleOptions({ isAdmin: false, canCreateTeacherRoles: true });
    expect(n3boss.map((o) => o.value)).not.toContain('prof');
    expect(n3boss.map((o) => o.value)).not.toContain('admin');
    expect(buildUnitaryCreateRoleOptions({ isAdmin: true }).map((o) => o.value)).toContain('prof');
  });
});
