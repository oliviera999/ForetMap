import { describe, test, expect } from 'vitest';
import {
  canEditContributionRow,
  filterSelectableTeams,
  isCasterKindAllowed,
} from '../../src/gl/utils/glSpellCastRules.js';
import {
  glSpellCasterKindBadge,
  GL_SPELL_CASTER_KIND_LABELS,
} from '../../src/gl/utils/glSpellFieldLabels.js';

const GNOME_TEAM = { id: 1, name: 'Gnomes', type: 'gnome' };
const UNICORN_TEAM = { id: 2, name: 'Licornes', type: 'unicorn' };

describe('isCasterKindAllowed (miroir front de lib/glSpellOptions.js)', () => {
  test('un sort ouvert accepte les deux peuples, et même un peuple inconnu', () => {
    expect(isCasterKindAllowed('any', 'gnome')).toBe(true);
    expect(isCasterKindAllowed('any', 'unicorn')).toBe(true);
    expect(isCasterKindAllowed('any', null)).toBe(true);
    expect(isCasterKindAllowed(undefined, null)).toBe(true);
  });

  test('un sort restreint exige exactement le peuple correspondant', () => {
    expect(isCasterKindAllowed('gnome', 'gnome')).toBe(true);
    expect(isCasterKindAllowed('gnome', 'unicorn')).toBe(false);
    expect(isCasterKindAllowed('unicorn', 'unicorn')).toBe(true);
    expect(isCasterKindAllowed('unicorn', 'gnome')).toBe(false);
    // Peuple indéterminé : refusé, comme côté serveur.
    expect(isCasterKindAllowed('gnome', null)).toBe(false);
  });
});

describe('filterSelectableTeams — restriction de peuple', () => {
  const base = {
    teams: [GNOME_TEAM, UNICORN_TEAM],
    teamScope: 'any_team',
    playerTeamId: null,
    currentTeamId: null,
    turnsEnabled: false,
    isStaff: true,
  };

  test('sans restriction, toutes les équipes restent proposées', () => {
    expect(filterSelectableTeams({ ...base, casterKind: 'any' }).map((t) => t.id)).toEqual([1, 2]);
    expect(filterSelectableTeams(base).map((t) => t.id)).toEqual([1, 2]);
  });

  test('un sort réservé aux gnomes ne propose que les équipes gnomes', () => {
    expect(filterSelectableTeams({ ...base, casterKind: 'gnome' }).map((t) => t.id)).toEqual([1]);
  });

  test('la restriction s’applique aussi au MJ', () => {
    const teams = filterSelectableTeams({ ...base, isStaff: true, casterKind: 'unicorn' });
    expect(teams.map((t) => t.id)).toEqual([2]);
  });

  test('elle se combine avec le périmètre d’équipe du joueur', () => {
    // Joueur licorne, sort réservé aux gnomes : plus aucune équipe sélectionnable.
    const teams = filterSelectableTeams({
      ...base,
      isStaff: false,
      teamScope: 'own_team',
      playerTeamId: 2,
      casterKind: 'gnome',
    });
    expect(teams).toEqual([]);
  });
});

describe('canEditContributionRow — restriction de peuple', () => {
  test('un joueur du bon peuple garde ses droits habituels', () => {
    expect(
      canEditContributionRow({
        contributionMode: 'self_only',
        actorPlayerId: 7,
        targetPlayerId: 7,
        casterKind: 'gnome',
        teamType: 'gnome',
      }),
    ).toBe(true);
  });

  test('un joueur du mauvais peuple ne peut pas contribuer, même en mode coordinateur', () => {
    expect(
      canEditContributionRow({
        contributionMode: 'coordinator',
        actorPlayerId: 7,
        targetPlayerId: 8,
        casterKind: 'gnome',
        teamType: 'unicorn',
      }),
    ).toBe(false);
  });

  test('la restriction prime même pour le MJ (le serveur refuserait le débit)', () => {
    expect(
      canEditContributionRow({
        contributionMode: 'coordinator',
        actorPlayerId: 1,
        targetPlayerId: 8,
        isStaff: true,
        casterKind: 'unicorn',
        teamType: 'gnome',
      }),
    ).toBe(false);
  });

  test('sans restriction, le comportement historique est inchangé', () => {
    expect(
      canEditContributionRow({
        contributionMode: 'self_only',
        actorPlayerId: 7,
        targetPlayerId: 8,
      }),
    ).toBe(false);
    expect(
      canEditContributionRow({
        contributionMode: 'both',
        actorPlayerId: 7,
        targetPlayerId: 8,
      }),
    ).toBe(true);
  });
});

describe('glSpellCasterKindBadge', () => {
  test('ne produit une pastille que pour un sort restreint', () => {
    expect(glSpellCasterKindBadge('any')).toBeNull();
    expect(glSpellCasterKindBadge(undefined)).toBeNull();
    expect(glSpellCasterKindBadge('gnome')).toContain('Gnomes');
    expect(glSpellCasterKindBadge('unicorn')).toContain('Licornes');
  });

  test('les libellés du formulaire couvrent les trois valeurs', () => {
    expect(Object.keys(GL_SPELL_CASTER_KIND_LABELS)).toEqual(['any', 'gnome', 'unicorn']);
  });
});
