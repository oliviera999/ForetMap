import { describe, expect, test } from 'vitest';
import {
  normalizeProfilesPayload,
  filterGroupDefaultRoles,
} from '../../src/utils/groupDefaultRoleOptions.js';

describe('normalizeProfilesPayload', () => {
  test('lit la forme réelle de GET /api/rbac/profiles (`{ roles }`)', () => {
    const roles = [{ id: 1, slug: 'visiteur' }];
    expect(normalizeProfilesPayload({ roles })).toEqual(roles);
  });

  test('accepte encore un tableau nu, et neutralise le reste', () => {
    const roles = [{ id: 1, slug: 'visiteur' }];
    expect(normalizeProfilesPayload(roles)).toEqual(roles);
    expect(normalizeProfilesPayload(null)).toEqual([]);
    expect(normalizeProfilesPayload(undefined)).toEqual([]);
    expect(normalizeProfilesPayload({})).toEqual([]);
  });
});

describe('filterGroupDefaultRoles', () => {
  const withFlag = [
    { slug: 'visiteur', group_default_allowed: true },
    { slug: 'personnel', group_default_allowed: true },
    { slug: 'eleve_novice', group_default_allowed: true },
    { slug: 'prof_classe', group_default_allowed: false },
    { slug: 'prof', group_default_allowed: false },
    { slug: 'admin', group_default_allowed: false },
    { slug: 'gl_mj', group_default_allowed: false },
  ];

  test('suit `group_default_allowed` quand le serveur le fournit', () => {
    expect(filterGroupDefaultRoles(withFlag).map((r) => r.slug)).toEqual([
      'visiteur',
      'personnel',
      'eleve_novice',
    ]);
  });

  test('un profil sur mesure marqué autorisé est proposé malgré son rang', () => {
    expect(
      filterGroupDefaultRoles([{ slug: 'jardinier', rank: 900, group_default_allowed: true }]).map(
        (r) => r.slug,
      ),
    ).toEqual(['jardinier']);
  });

  test('repli sans le champ : tous les profils ForetMap sauf G&L, du plus élevé au plus bas', () => {
    const legacy = [
      { slug: 'visiteur', rank: 50 },
      { slug: 'personnel', rank: 50 },
      { slug: 'eleve_avance', rank: 200 },
      { slug: 'prof', rank: 400 },
      { slug: 'admin', rank: 500 },
      { slug: 'gl_player', rank: 120 },
    ];
    expect(filterGroupDefaultRoles(legacy).map((r) => r.slug)).toEqual([
      'admin',
      'prof',
      'eleve_avance',
      'visiteur',
      'personnel',
    ]);
  });

  test('entrée non tabulaire → liste vide', () => {
    expect(filterGroupDefaultRoles(null)).toEqual([]);
    expect(filterGroupDefaultRoles({ roles: [] })).toEqual([]);
  });
});
