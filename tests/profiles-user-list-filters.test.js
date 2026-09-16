import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUserGroupIdsFromUsers,
  filterProfilesUsers,
  normalizePageSize,
  paginateList,
  resolveProfilesSubTab,
  sortProfilesUsers,
  normalizeProfilesSort,
  parseAccountsFilters,
  serializeAccountsFilters,
  hasActiveAccountsFilters,
  profilesUserKey,
  DEFAULT_PROFILES_PAGE_SIZE,
  DEFAULT_PROFILES_SUB_TAB,
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
    const map = buildUserGroupIdsFromUsers([
      { id: '1', groups: [{ id: 10 }] },
      { id: '2', groups: [{ id: 11 }] },
      { id: '3', groups: [{ id: 10 }] },
    ]);
    assert.equal(filterProfilesUsers(users, { groupId: 10, userGroupIdsByUserId: map }).length, 2);
    assert.equal(filterProfilesUsers(users, { groupId: 11, userGroupIdsByUserId: map }).length, 1);
    assert.equal(filterProfilesUsers(users, { groupId: 99, userGroupIdsByUserId: map }).length, 0);
  });

  it('ignore les comptes sans groupe et les identifiants vides', () => {
    const map = buildUserGroupIdsFromUsers([
      { id: '1', groups: [{ id: 10 }, { id: '' }, null] },
      { id: '2' },
      { id: '', groups: [{ id: 10 }] },
      { id: '3', groups: [] },
    ]);
    assert.equal(map.size, 1);
    assert.deepEqual([...map.get('1')], ['10']);
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

  it('P16 — la première visite ouvre sur Comptes, pas sur la configuration RBAC', () => {
    assert.equal(DEFAULT_PROFILES_SUB_TAB, 'comptes');
    assert.equal(resolveProfilesSubTab('', { canManageProfiles: true }), 'comptes');
    // Profils reste le repli quand Comptes n'est pas accessible.
    assert.equal(
      resolveProfilesSubTab('', { canManageProfiles: true, canManageStudents: false }),
      'comptes',
    );
  });

  it('clé de ligne composite (type + identifiant)', () => {
    assert.equal(profilesUserKey({ user_type: 'student', id: '7' }), 'student:7');
    assert.notEqual(
      profilesUserKey({ user_type: 'teacher', id: '7' }),
      profilesUserKey({ user_type: 'student', id: '7' }),
    );
  });
});

describe('tri de la liste des comptes (P6)', () => {
  const users = [
    {
      id: '1',
      user_type: 'student',
      display_name: 'Zoé',
      role_id: 2,
      role_display_name: 'Novice',
      groups: [{ id: 'a' }],
    },
    {
      id: '2',
      user_type: 'teacher',
      display_name: 'Alice',
      role_id: 1,
      role_display_name: 'Admin',
      groups: [],
    },
    {
      id: '3',
      user_type: 'student',
      display_name: 'Bob',
      role_id: null,
      role_display_name: null,
      groups: [{ id: 'a' }, { id: 'b' }],
    },
  ];

  it('ne mute pas la liste d’entrée', () => {
    const copy = [...users];
    sortProfilesUsers(users, 'name');
    assert.deepEqual(
      users.map((u) => u.id),
      copy.map((u) => u.id),
    );
  });

  it('tri par nom', () => {
    assert.deepEqual(
      sortProfilesUsers(users, 'name').map((u) => u.display_name),
      ['Alice', 'Bob', 'Zoé'],
    );
  });

  it('tri par défaut : type puis nom', () => {
    assert.deepEqual(
      sortProfilesUsers(users, 'default').map((u) => u.display_name),
      ['Bob', 'Zoé', 'Alice'],
    );
  });

  it('tri par profil : les comptes sans profil ferment la marche', () => {
    assert.deepEqual(
      sortProfilesUsers(users, 'role').map((u) => u.display_name),
      ['Alice', 'Zoé', 'Bob'],
    );
  });

  it('« sans profil d’abord » et « sans groupe d’abord »', () => {
    assert.equal(sortProfilesUsers(users, 'no-role')[0].display_name, 'Bob');
    assert.equal(sortProfilesUsers(users, 'no-group')[0].display_name, 'Alice');
  });

  it('valeur de tri inconnue → tri par défaut', () => {
    assert.equal(normalizeProfilesSort('n’importe quoi'), 'default');
    assert.deepEqual(
      sortProfilesUsers(users, 'bidon').map((u) => u.id),
      sortProfilesUsers(users, 'default').map((u) => u.id),
    );
  });
});

describe('filtres portés par l’URL (P7)', () => {
  it('lit une query string complète', () => {
    const f = parseAccountsFilters('?q=lea&profil=2&type=student&groupe=g1&tri=name');
    assert.deepEqual(f, {
      query: 'lea',
      roleId: '2',
      userType: 'student',
      groupId: 'g1',
      sort: 'name',
    });
  });

  it('query string vide → filtres vides', () => {
    assert.deepEqual(parseAccountsFilters(''), {
      query: '',
      roleId: '',
      userType: '',
      groupId: '',
      sort: 'default',
    });
  });

  it('tri illisible dans l’URL → défaut', () => {
    assert.equal(parseAccountsFilters('?tri=bidon').sort, 'default');
  });

  it('sérialise en omettant les valeurs par défaut', () => {
    assert.equal(serializeAccountsFilters({ query: 'lea', sort: 'default' }), '?q=lea');
    assert.equal(serializeAccountsFilters({}), '');
    assert.equal(
      serializeAccountsFilters({ query: '', roleId: '3', userType: '', groupId: '', sort: 'name' }),
      '?profil=3&tri=name',
    );
  });

  it('aller-retour stable', () => {
    const f = { query: 'a b', roleId: '2', userType: 'teacher', groupId: 'g9', sort: 'no-group' };
    assert.deepEqual(parseAccountsFilters(serializeAccountsFilters(f)), f);
  });

  it('détecte un filtre actif (P8 — proposer « Effacer les filtres »)', () => {
    assert.equal(hasActiveAccountsFilters({}), false);
    assert.equal(hasActiveAccountsFilters({ query: '', sort: 'default' }), false);
    assert.equal(hasActiveAccountsFilters({ query: 'lea' }), true);
    assert.equal(hasActiveAccountsFilters({ sort: 'name' }), true);
  });
});
