import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGroupForest,
  filterGroupMemberCandidates,
  filterGroupsList,
} from '../src/utils/groupsAdminListFilters.js';

describe('groupsAdminListFilters', () => {
  const groups = [
    { id: '1', name: '2nde A', slug: '2nde-a', kind: 'class', is_active: 1, parent_group_id: null },
    {
      id: '2',
      name: 'Équipe verte',
      slug: 'equipe-verte',
      kind: 'team',
      is_active: 1,
      parent_group_id: '1',
    },
    {
      id: '3',
      name: 'Club jardin',
      slug: 'club-jardin',
      kind: 'club',
      is_active: 0,
      parent_group_id: null,
    },
  ];

  it('filtre recherche / type / inactifs', () => {
    assert.equal(filterGroupsList(groups, { hideInactive: true }).length, 2);
    assert.equal(filterGroupsList(groups, { hideInactive: false }).length, 3);
    assert.equal(filterGroupsList(groups, { kind: 'club', hideInactive: false }).length, 1);
    assert.equal(filterGroupsList(groups, { query: 'verte' }).length, 1);
  });

  it('construit une forêt parent → enfants', () => {
    const forest = buildGroupForest(filterGroupsList(groups, { hideInactive: false }));
    assert.equal(forest.length, 2);
    const seconde = forest.find((n) => n.id === '1');
    assert.ok(seconde);
    assert.equal(seconde.children.length, 1);
    assert.equal(seconde.children[0].id, '2');
  });

  it('remonte un orphelin si le parent est hors filtre', () => {
    const onlyChild = filterGroupsList(groups, { query: 'verte' });
    const forest = buildGroupForest(onlyChild);
    assert.equal(forest.length, 1);
    assert.equal(forest[0].id, '2');
  });

  it('filtre candidats membres / non membres', () => {
    const users = [
      { id: '1', display_name: 'A' },
      { id: '2', display_name: 'B' },
      { id: '3', display_name: 'C' },
    ];
    const members = new Set(['1', '3']);
    assert.equal(
      filterGroupMemberCandidates(users, {
        membershipFilter: 'members',
        memberOrManagerIds: members,
      }).length,
      2,
    );
    assert.equal(
      filterGroupMemberCandidates(users, {
        membershipFilter: 'non_members',
        memberOrManagerIds: members,
      }).length,
      1,
    );
    assert.equal(
      filterGroupMemberCandidates(users, { query: 'b', membershipFilter: 'all' }).length,
      1,
    );
  });
});
