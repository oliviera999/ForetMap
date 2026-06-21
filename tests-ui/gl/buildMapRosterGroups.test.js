import { describe, test, expect } from 'vitest';
import { buildMapRosterGroups } from '../../src/gl/utils/glSpellCastRules.js';

describe('buildMapRosterGroups', () => {
  test('une entrée par équipe, même vide', () => {
    const teams = [
      { id: 1, name: 'Gnomes', color: '#22c55e' },
      { id: 2, name: 'Licorne', color: '#a855f7' },
    ];
    const roster = [{ playerId: 10, teamId: 1, teamName: 'Gnomes', pseudo: 'Alice' }];
    const groups = buildMapRosterGroups(teams, roster);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      teamId: 1,
      teamName: 'Gnomes',
      teamColor: '#22c55e',
      players: [{ playerId: 10 }],
    });
    expect(groups[1]).toMatchObject({
      teamId: 2,
      teamName: 'Licorne',
      players: [],
    });
  });

  test('tableau vide si aucune équipe', () => {
    expect(buildMapRosterGroups([], [{ playerId: 1, teamId: 1 }])).toEqual([]);
  });
});
