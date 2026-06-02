import { describe, it, expect } from 'vitest';
import {
  isSpellCastReady,
  sumContributionTotals,
  canEditContributionRow,
  needsOtherPlayerConfirm,
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
