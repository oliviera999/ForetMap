import { describe, test, expect, vi, beforeEach } from 'vitest';

/**
 * Client `profilesApi` (piste B, étape B7) : chaque fonction doit produire EXACTEMENT l'appel
 * `api(chemin, méthode, corps)` que faisaient les vues avant l'extraction — c'est ce qui
 * garantit un comportement inchangé (rejeu, erreurs, tests qui simulent `api()`).
 */

const apiMock = vi.fn(async () => ({ ok: true }));

vi.mock('../../src/services/api', () => ({
  api: (...args) => apiMock(...args),
}));

const { profilesApi } = await import('../../src/services/profilesApi.js');

beforeEach(() => {
  apiMock.mockClear();
});

const CASES = [
  ['me', () => profilesApi.me(), ['/api/auth/me']],
  [
    'impersonate',
    () => profilesApi.impersonate({ userType: 'student', userId: 'u-1' }),
    ['/api/auth/admin/impersonate', 'POST', { userType: 'student', userId: 'u-1' }],
  ],
  ['listProfiles', () => profilesApi.listProfiles(), ['/api/rbac/profiles']],
  [
    'createProfile',
    () => profilesApi.createProfile({ slug: 'x' }),
    ['/api/rbac/profiles', 'POST', { slug: 'x' }],
  ],
  [
    'updateProfile',
    () => profilesApi.updateProfile(7, { display_order: 2 }),
    ['/api/rbac/profiles/7', 'PATCH', { display_order: 2 }],
  ],
  [
    'duplicateProfile',
    () => profilesApi.duplicateProfile(7, { slug: 'copie' }),
    ['/api/rbac/profiles/7/duplicate', 'POST', { slug: 'copie' }],
  ],
  [
    'setProfilePermissions',
    () => profilesApi.setProfilePermissions(7, ['tasks.manage']),
    ['/api/rbac/profiles/7/permissions', 'PUT', { permissions: ['tasks.manage'] }],
  ],
  [
    'setProgressionByValidatedTasks',
    () => profilesApi.setProgressionByValidatedTasks(1),
    ['/api/rbac/progression-by-validated-tasks', 'PATCH', { enabled: true }],
  ],
  [
    'recomputeProgression',
    () => profilesApi.recomputeProgression({ scope: 'all', dryRun: true }),
    ['/api/rbac/progression/recompute', 'POST', { scope: 'all', dryRun: true }],
  ],
  ['listUsers', () => profilesApi.listUsers(), ['/api/rbac/users']],
  [
    'createUser',
    () => profilesApi.createUser({ first_name: 'A' }),
    ['/api/rbac/users', 'POST', { first_name: 'A' }],
  ],
  [
    'userDetail',
    () => profilesApi.userDetail('teacher', 'id avec/espace'),
    ['/api/rbac/users/teacher/id%20avec%2Fespace'],
  ],
  [
    'updateUser',
    () => profilesApi.updateUser('student', 'u-1', { is_active: false }),
    ['/api/rbac/users/student/u-1', 'PATCH', { is_active: false }],
  ],
  [
    'deleteTeacher',
    () => profilesApi.deleteTeacher('t-1'),
    ['/api/rbac/users/teacher/t-1', 'DELETE'],
  ],
  [
    'setUserRole',
    () => profilesApi.setUserRole('student', 'u-1', 4),
    ['/api/rbac/users/student/u-1/role', 'PUT', { role_id: 4 }],
  ],
  [
    'bulkSetRole',
    () => profilesApi.bulkSetRole({ role_id: 4, users: [] }),
    ['/api/rbac/users/bulk-role', 'POST', { role_id: 4, users: [] }],
  ],
  ['deleteStudent', () => profilesApi.deleteStudent('s-1'), ['/api/students/s-1', 'DELETE']],
  [
    'duplicateStudent',
    () => profilesApi.duplicateStudent('s-1'),
    ['/api/students/s-1/duplicate', 'POST', {}],
  ],
  [
    'importStudents',
    () => profilesApi.importStudents({ fileName: 'a.csv', dryRun: true }),
    ['/api/students/import', 'POST', { fileName: 'a.csv', dryRun: true }],
  ],
  ['accountStats', () => profilesApi.accountStats(), ['/api/stats/all']],
];

describe('profilesApi', () => {
  test.each(CASES)('%s : appel transmis tel quel au transport', async (_name, run, expected) => {
    await expect(run()).resolves.toEqual({ ok: true });
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(apiMock.mock.calls[0]).toEqual(expected);
  });

  test('chaque fonction exportée est couverte', () => {
    expect(Object.keys(profilesApi).sort()).toEqual(CASES.map(([name]) => name).sort());
  });

  test('les erreurs du transport remontent telles quelles', async () => {
    const err = Object.assign(new Error('Permission insuffisante'), { status: 403 });
    apiMock.mockRejectedValueOnce(err);
    await expect(profilesApi.listProfiles()).rejects.toBe(err);
  });
});
