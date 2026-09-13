import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUserGroupIdsMap,
  filterProfilesUsers,
  normalizePageSize,
  paginateList,
  resolveProfilesSubTab,
  DEFAULT_PROFILES_PAGE_SIZE,
} from '../src/utils/profilesUserListFilters.js';

describe('profilesUserListFilters', () => {
  const users = [
    {
      id: '1',
      user_type: 'student',
      display_name: 'Léa Martin',
      first_name: 'Léa',
      last_name: 'Martin',
      pseudo: 'lea.m',
      email: 'lea@example.com',
      role_id: 2,
    },
    {
      id: '2',
      user_type: 'teacher',
      display_name: 'Paul Durand',
      first_name: 'Paul',
      last_name: 'Durand',
      pseudo: 'paul',
      email: 'paul@example.com',
      role_id: 1,
    },
    {
      id: '3',
      user_type: 'student',
      display_name: 'Samira Ben',
      first_name: 'Samira',
      last_name: 'Ben',
      pseudo: 'sam',
      email: 'sam@example.com',
      role_id: 2,
    },
  ];

  it('filtre par recherche (nom / pseudo / e-mail)', () => {
    assert.equal(filterProfilesUsers(users, { query: 'lea' }).length, 1);
    assert.equal(filterProfilesUsers(users, { query: 'paul@' }).length, 1);
    assert.equal(filterProfilesUsers(users, { query: 'sam' }).length, 1);
  });

  it('filtre par profil et type', () => {
    assert.equal(filterProfilesUsers(users, { roleId: 2 }).length, 2);
    assert.equal(filterProfilesUsers(users, { userType: 'teacher' }).length, 1);
    assert.equal(filterProfilesUsers(users, { roleId: 2, userType: 'student' }).length, 2);
  });

  it('filtre par groupe via la map d’appartenance', () => {
    const map = buildUserGroupIdsMap([
      { id: 10, members: [{ user_id: '1' }, { user_id: '3' }] },
      { id: 11, members: [{ user_id: '2' }] },
    ]);
    assert.equal(filterProfilesUsers(users, { groupId: 10, userGroupIdsByUserId: map }).length, 2);
    assert.equal(filterProfilesUsers(users, { groupId: 11, userGroupIdsByUserId: map }).length, 1);
    assert.equal(filterProfilesUsers(users, { groupId: 99, userGroupIdsByUserId: map }).length, 0);
  });

  it('pagine correctement', () => {
    const page1 = paginateList(users, 1, 2);
    assert.deepEqual(
      page1.items.map((u) => u.id),
      ['1', '2'],
    );
    assert.equal(page1.from, 1);
    assert.equal(page1.to, 2);
    assert.equal(page1.pageCount, 2);
    const page2 = paginateList(users, 2, 2);
    assert.deepEqual(
      page2.items.map((u) => u.id),
      ['3'],
    );
    assert.equal(page2.from, 3);
    assert.equal(page2.to, 3);
  });

  it('normalise la taille de page', () => {
    assert.equal(normalizePageSize(50), 50);
    assert.equal(normalizePageSize('nope'), DEFAULT_PROFILES_PAGE_SIZE);
  });

  it('résout le sous-onglet selon les droits', () => {
    assert.equal(resolveProfilesSubTab('groupes', { canManageProfiles: true }), 'groupes');
    assert.equal(
      resolveProfilesSubTab('profils', { canManageProfiles: false, canManageStudents: true }),
      'comptes',
    );
    assert.equal(resolveProfilesSubTab('comptes', {}), 'comptes');
  });
});
