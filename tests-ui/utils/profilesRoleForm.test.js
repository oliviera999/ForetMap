import { describe, test, expect } from 'vitest';
import {
  buildRoleDetailsPatch,
  buildNewRoleProfile,
  buildDuplicateRoleProfile,
  suggestLadderRank,
} from '../../src/utils/profilesRoleForm.js';

describe('buildRoleDetailsPatch', () => {
  const role = {
    id: 7,
    slug: 'eleve_novice',
    display_name: 'Novice',
    rank: 100,
    emoji: '🌱',
    min_done_tasks: 3,
    display_order: 2,
  };

  test('payload PATCH normalisé', () => {
    expect(
      buildRoleDetailsPatch(role, {
        display_name: '  Mentor ',
        emoji: ' 🌳 ',
        min_done_tasks: '5',
        display_order: '4',
      }),
    ).toEqual({
      payload: {
        display_name: 'Mentor',
        rank: 100,
        emoji: '🌳',
        min_done_tasks: 5,
        display_order: 4,
      },
    });
  });

  test('nom vide → erreur', () => {
    expect(buildRoleDetailsPatch(role, { display_name: '  ' })).toEqual({
      error: 'Le nom du profil est requis',
    });
  });

  test('min_done_tasks vide → null ; emoji vide → null', () => {
    const res = buildRoleDetailsPatch(role, {
      display_name: 'Mentor',
      emoji: '',
      min_done_tasks: '',
      display_order: '0',
    });
    expect(res.payload.min_done_tasks).toBeNull();
    expect(res.payload.emoji).toBeNull();
  });

  test('niveau ou ordre invalide → erreur', () => {
    expect(
      buildRoleDetailsPatch(role, {
        display_name: 'Mentor',
        min_done_tasks: '-1',
        display_order: '0',
      }),
    ).toEqual({ error: 'Niveau requis invalide (entier >= 0)' });
    expect(
      buildRoleDetailsPatch(role, {
        display_name: 'Mentor',
        min_done_tasks: '',
        display_order: 'x',
      }),
    ).toEqual({ error: "Ordre d'affichage invalide (entier >= 0)" });
  });
});

describe('buildNewRoleProfile', () => {
  test('payload POST normalisé (profil non n3beur)', () => {
    expect(
      buildNewRoleProfile({
        slug: '  Mentor_Perso ',
        display_name: ' Mentor ',
        emoji: '',
        min_done_tasks: '',
        display_order: '50',
      }),
    ).toEqual({
      payload: {
        slug: 'mentor_perso',
        display_name: 'Mentor',
        rank: 150,
        emoji: null,
        min_done_tasks: null,
        display_order: 50,
      },
    });
  });

  test('slug eleve_ sans emoji → erreur', () => {
    expect(
      buildNewRoleProfile({
        slug: 'eleve_expert',
        display_name: 'Expert',
        emoji: '',
        min_done_tasks: '10',
        display_order: '100',
      }),
    ).toEqual({ error: 'Un profil n3beur doit avoir un emoji' });
  });

  test('slug eleve_ sans niveau requis → erreur', () => {
    expect(
      buildNewRoleProfile({
        slug: 'eleve_expert',
        display_name: 'Expert',
        emoji: '🔥',
        min_done_tasks: '',
        display_order: '100',
      }),
    ).toEqual({ error: 'Un profil n3beur doit avoir un niveau requis' });
  });

  test('slug eleve_ valide → payload', () => {
    expect(
      buildNewRoleProfile({
        slug: 'eleve_expert',
        display_name: 'Expert',
        emoji: '🔥',
        min_done_tasks: '12',
        display_order: '100',
      }),
    ).toEqual({
      payload: {
        slug: 'eleve_expert',
        display_name: 'Expert',
        rank: 150,
        emoji: '🔥',
        min_done_tasks: 12,
        display_order: 100,
      },
    });
  });

  test('slug ou nom manquant → erreur', () => {
    expect(buildNewRoleProfile({ slug: '', display_name: 'X' })).toEqual({
      error: 'Le slug technique est requis',
    });
    expect(buildNewRoleProfile({ slug: 'x', display_name: '' })).toEqual({
      error: 'Le nom du profil est requis',
    });
  });
});

describe('buildDuplicateRoleProfile', () => {
  const role = { id: 3, slug: 'prof', display_name: 'Prof' };

  test('payload duplication', () => {
    expect(
      buildDuplicateRoleProfile(role, {
        slug: '  Prof_Copie ',
        display_name: ' Prof (copie) ',
      }),
    ).toEqual({
      payload: {
        slug: 'prof_copie',
        display_name: 'Prof (copie)',
      },
    });
  });

  test('slug ou nom manquant → erreur', () => {
    expect(buildDuplicateRoleProfile(role, { slug: '', display_name: 'X' })).toEqual({
      error: 'Le slug technique est requis',
    });
    expect(buildDuplicateRoleProfile(role, { slug: 'x', display_name: '  ' })).toEqual({
      error: 'Le nom affiché est requis',
    });
  });
});

// Question 11 (audit du 25/09/2026) : un palier créé au rang par défaut (150) au-dessus de
// « chevronné » (300) perdait face à lui dans la règle « le plus élevé l'emporte ».
describe('suggestLadderRank', () => {
  const ROLES = [
    { slug: 'visiteur', rank: 50, min_done_tasks: null },
    { slug: 'eleve_novice', rank: 100, min_done_tasks: 0 },
    { slug: 'eleve_avance', rank: 200, min_done_tasks: 5 },
    { slug: 'eleve_chevronne', rank: 300, min_done_tasks: 10 },
    { slug: 'gl_player', rank: 120, min_done_tasks: 3 },
    { slug: 'personnel', rank: 320, min_done_tasks: null },
    { slug: 'prof', rank: 400, min_done_tasks: null },
  ];

  test('au-dessus du dernier palier : entre lui et le personnel', () => {
    expect(suggestLadderRank(ROLES, 40)).toBe(310);
  });

  test('entre deux paliers : à mi-chemin de leurs rangs', () => {
    expect(suggestLadderRank(ROLES, 7)).toBe(250);
  });

  test('à seuil égal à un palier : placé au-dessus de lui', () => {
    expect(suggestLadderRank(ROLES, 0)).toBe(150);
  });

  test('sans seuil, sans profils connus, ou sans place : rang par défaut', () => {
    expect(suggestLadderRank(ROLES, null)).toBe(150);
    expect(suggestLadderRank([], 12)).toBe(150);
    expect(
      suggestLadderRank(
        [
          { slug: 'a', rank: 318, min_done_tasks: 1 },
          { slug: 'b', rank: 319, min_done_tasks: 9 },
        ],
        5,
      ),
    ).toBe(150);
  });

  test('buildNewRoleProfile applique le rang déduit au nouveau palier', () => {
    const out = buildNewRoleProfile(
      { slug: 'eleve_expert', display_name: 'Expert', emoji: '🦉', min_done_tasks: '40' },
      { roles: ROLES },
    );
    expect(out.payload.rank).toBe(310);
  });
});
