import { describe, test, expect, vi, beforeEach } from 'vitest';

/**
 * Client `groupsApi` (piste B, étape B7) : chaque fonction doit produire EXACTEMENT l'appel
 * `api(chemin, méthode, corps)` que faisaient les vues avant l'extraction.
 */

const apiMock = vi.fn(async () => ({ ok: true }));

vi.mock('../../src/services/api', () => ({
  api: (...args) => apiMock(...args),
}));

const { groupsApi } = await import('../../src/services/groupsApi.js');

beforeEach(() => {
  apiMock.mockClear();
});

/** Le troisième argument absent (`undefined`) équivaut à un appel sans corps. */
function normalizedCall(call) {
  const out = [...call];
  while (out.length && out[out.length - 1] === undefined) out.pop();
  return out;
}

const CASES = [
  ['list', () => groupsApi.list(), ['/api/groups']],
  ['options', () => groupsApi.options(), ['/api/groups/options']],
  ['pendingVisitors', () => groupsApi.pendingVisitors(), ['/api/groups/pending-visitors']],
  [
    'create',
    () => groupsApi.create({ name: '6e3', kind: 'class' }),
    ['/api/groups', 'POST', { name: '6e3', kind: 'class' }],
  ],
  [
    'update',
    () => groupsApi.update('g 1', { is_active: false }),
    ['/api/groups/g%201', 'PATCH', { is_active: false }],
  ],
  ['remove', () => groupsApi.remove('g1'), ['/api/groups/g1', 'DELETE']],
  [
    'classCode',
    () => groupsApi.classCode('g1', 'clear'),
    ['/api/groups/g1/class-code', 'POST', { action: 'clear' }],
  ],
  [
    'setMembers',
    () => groupsApi.setMembers('g1', { member_user_ids: ['u1'] }),
    ['/api/groups/g1/members', 'PUT', { member_user_ids: ['u1'] }],
  ],
  ['addMember', () => groupsApi.addMember('g1', 'u/1'), ['/api/groups/g1/members/u%2F1', 'POST']],
  [
    'removeMember',
    () => groupsApi.removeMember('g1', 'u1'),
    ['/api/groups/g1/members/u1', 'DELETE'],
  ],
  [
    'addMembersBulk',
    () => groupsApi.addMembersBulk('g1', ['u1', 'u2']),
    ['/api/groups/g1/members/bulk', 'POST', { user_ids: ['u1', 'u2'] }],
  ],
  [
    'importGroups',
    () => groupsApi.importGroups({ fileName: 'g.csv', dryRun: false }),
    ['/api/groups/import', 'POST', { fileName: 'g.csv', dryRun: false }],
  ],
];

describe('groupsApi', () => {
  test.each(CASES)('%s : appel transmis tel quel au transport', async (_name, run, expected) => {
    await expect(run()).resolves.toEqual({ ok: true });
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(normalizedCall(apiMock.mock.calls[0])).toEqual(expected);
  });

  test('addMember transmet le corps fourni (fiche d’un compte : `{}`)', async () => {
    await groupsApi.addMember('g1', 'u1', {});
    expect(apiMock.mock.calls[0]).toEqual(['/api/groups/g1/members/u1', 'POST', {}]);
  });

  test('chaque fonction exportée est couverte', () => {
    expect(Object.keys(groupsApi).sort()).toEqual(CASES.map(([name]) => name).sort());
  });
});
