import { describe, it, expect } from 'vitest';
import {
  isSpellCastReady,
  sumContributionTotals,
  canEditContributionRow,
  needsOtherPlayerConfirm,
  groupRosterByTeam,
  formatSpellCost,
  resolveSpellCastInitialStep,
  buildContributionsSavePayload,
} from '../../src/gl/utils/glSpellCastRules.js';

describe('glSpellCastRules', () => {
  it('isSpellCastReady exige égalité stricte par devise', () => {
    expect(isSpellCastReady({ gems: 2, hearts: 0 }, { gems: 2, hearts: 0 })).toBe(true);
    expect(isSpellCastReady({ gems: 1, hearts: 0 }, { gems: 2, hearts: 0 })).toBe(false);
    expect(isSpellCastReady({ gems: 1, hearts: 1 }, { gems: 1, hearts: 1 })).toBe(true);
    expect(isSpellCastReady({ gems: 0, hearts: 0 }, { gems: 0, hearts: 0 })).toBe(false);
  });

  it('sumContributionTotals additionne gemmes et cœurs', () => {
    expect(sumContributionTotals([
      { gems: 1, hearts: 0 },
      { playerId: 2, gems: 1, hearts: 1 },
    ])).toEqual({ gems: 2, hearts: 1 });
  });

  it('canEditContributionRow selon le mode', () => {
    expect(canEditContributionRow({
      contributionMode: 'self_only',
      actorPlayerId: 1,
      targetPlayerId: 1,
    })).toBe(true);
    expect(canEditContributionRow({
      contributionMode: 'self_only',
      actorPlayerId: 1,
      targetPlayerId: 2,
    })).toBe(false);
    expect(canEditContributionRow({
      contributionMode: 'coordinator',
      actorPlayerId: 1,
      targetPlayerId: 2,
    })).toBe(true);
  });

  it('groupRosterByTeam regroupe par équipe', () => {
    const groups = groupRosterByTeam([
      { playerId: 1, teamId: 10, teamName: 'Gnomes' },
      { playerId: 2, teamId: 20, teamName: 'Licornes' },
      { playerId: 3, teamId: 10, teamName: 'Gnomes' },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].players).toHaveLength(2);
    expect(groups[1].players).toHaveLength(1);
  });

  it('formatSpellCost affiche gemmes et cœurs', () => {
    expect(formatSpellCost({ cout_gemmes: 2, cout_coeurs: 1 })).toContain('💎');
    expect(formatSpellCost({ required: { gems: 1, hearts: 0 } })).toBe('1 💎');
  });

  it('resolveSpellCastInitialStep saute team pour le staff', () => {
    expect(resolveSpellCastInitialStep({ isStaff: true, activeSpellCode: 'SCT01' })).toBe('fund');
    expect(resolveSpellCastInitialStep({ isStaff: false, activeSpellCode: 'SCT01' })).toBe('team');
    expect(resolveSpellCastInitialStep({ isStaff: true, activeSpellCode: null })).toBe('spell');
  });

  it('buildContributionsSavePayload aligne roster et contributions locales', () => {
    const roster = [
      { playerId: 1, teamId: 10 },
      { playerId: 2, teamId: 10 },
    ];
    const payload = buildContributionsSavePayload(roster, [
      { playerId: 1, gems: 2, hearts: 0 },
      { playerId: 2, gems: 0, hearts: 1 },
    ]);
    expect(payload).toEqual([
      { playerId: 1, gems: 2, hearts: 0 },
      { playerId: 2, gems: 0, hearts: 1 },
    ]);
  });

  it('needsOtherPlayerConfirm en mode both uniquement', () => {
    expect(needsOtherPlayerConfirm({
      contributionMode: 'both',
      actorPlayerId: 1,
      targetPlayerId: 2,
    })).toBe(true);
    expect(needsOtherPlayerConfirm({
      contributionMode: 'coordinator',
      actorPlayerId: 1,
      targetPlayerId: 2,
    })).toBe(false);
  });
});
