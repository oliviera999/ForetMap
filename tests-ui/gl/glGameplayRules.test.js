import { describe, test, expect } from 'vitest';
import {
  GL_DEFAULT_GAMEPLAY,
  computeCanRequestAction,
  computeCanSpellCast,
  computePlayerVitality,
  findPlayerMascotId,
} from '../../src/gl/utils/glGameplayRules.js';

describe('computeCanRequestAction', () => {
  const base = {
    showStaffAdminUi: false,
    gameplaySettings: { ...GL_DEFAULT_GAMEPLAY, playerActionsEnabled: true },
    auth: { teamId: 7 },
    currentTeamId: null,
  };

  test('joueur affecté avec module actif → autorisé', () => {
    expect(computeCanRequestAction(base)).toBe(true);
  });

  test('staff ou module coupé → refusé', () => {
    expect(computeCanRequestAction({ ...base, showStaffAdminUi: true })).toBe(false);
    expect(computeCanRequestAction({ ...base, gameplaySettings: GL_DEFAULT_GAMEPLAY })).toBe(false);
  });

  test('sans équipe → refusé', () => {
    expect(computeCanRequestAction({ ...base, auth: {} })).toBe(false);
    expect(computeCanRequestAction({ ...base, auth: null })).toBe(false);
  });

  test('jeu en tours : seulement au tour de son équipe', () => {
    const turns = { ...base.gameplaySettings, turnsEnabled: true };
    expect(computeCanRequestAction({ ...base, gameplaySettings: turns, currentTeamId: 8 })).toBe(
      false,
    );
    expect(computeCanRequestAction({ ...base, gameplaySettings: turns, currentTeamId: 7 })).toBe(
      true,
    );
    expect(computeCanRequestAction({ ...base, gameplaySettings: turns, currentTeamId: null })).toBe(
      true,
    );
  });
});

describe('computeCanSpellCast', () => {
  const base = {
    modules: { spellCastEnabled: true },
    gameplaySettings: { ...GL_DEFAULT_GAMEPLAY, vitalityEnabled: true },
    gameState: { game: { id: 3, status: 'live' } },
    auth: { teamId: 7 },
    currentTeamId: null,
    showsPlayerChrome: true,
    showStaffAdminUi: false,
  };

  test('module actif + vitalité + partie live → autorisé', () => {
    expect(computeCanSpellCast(base)).toBe(true);
  });

  test('le réglage gameplay peut activer le sort sans le module', () => {
    expect(
      computeCanSpellCast({
        ...base,
        modules: {},
        gameplaySettings: { ...base.gameplaySettings, spellCastEnabled: true },
      }),
    ).toBe(true);
    expect(computeCanSpellCast({ ...base, modules: {} })).toBe(false);
  });

  test('vitalité coupée ou partie absente/non live → refusé', () => {
    expect(
      computeCanSpellCast({
        ...base,
        gameplaySettings: { ...base.gameplaySettings, vitalityEnabled: false },
      }),
    ).toBe(false);
    expect(computeCanSpellCast({ ...base, gameState: null })).toBe(false);
    expect(computeCanSpellCast({ ...base, gameState: { game: { id: 3, status: 'draft' } } })).toBe(
      false,
    );
  });

  test('spellCastMjOnly réserve le lancer au staff', () => {
    const mjOnly = { ...base.gameplaySettings, spellCastMjOnly: true };
    expect(computeCanSpellCast({ ...base, gameplaySettings: mjOnly })).toBe(false);
    expect(computeCanSpellCast({ ...base, gameplaySettings: mjOnly, showStaffAdminUi: true })).toBe(
      true,
    );
  });

  test('jeu en tours : le chrome joueur attend le tour de son équipe', () => {
    const turns = { ...base.gameplaySettings, turnsEnabled: true };
    expect(computeCanSpellCast({ ...base, gameplaySettings: turns, currentTeamId: 8 })).toBe(false);
    expect(computeCanSpellCast({ ...base, gameplaySettings: turns, currentTeamId: 7 })).toBe(true);
    expect(
      computeCanSpellCast({
        ...base,
        gameplaySettings: turns,
        currentTeamId: 8,
        showsPlayerChrome: false,
        showStaffAdminUi: true,
      }),
    ).toBe(true);
  });
});

describe('computePlayerVitality', () => {
  const base = {
    showsPlayerChrome: true,
    vitalityEnabled: true,
    auth: { userId: 42 },
    gameState: null,
    profile: null,
  };

  test('chrome staff, vitalité coupée ou joueur inconnu → null', () => {
    expect(computePlayerVitality({ ...base, showsPlayerChrome: false })).toBeNull();
    expect(computePlayerVitality({ ...base, vitalityEnabled: false })).toBeNull();
    expect(computePlayerVitality({ ...base, auth: {} })).toBeNull();
  });

  test('priorité aux points temps réel de la partie', () => {
    const gameState = { vitality: { byPlayerId: { 42: { health: 2, power: 5 } } } };
    const profile = { health_points: 9, power_points: 9 };
    expect(computePlayerVitality({ ...base, gameState, profile })).toEqual({ health: 2, power: 5 });
  });

  test('repli sur le profil GL, valeurs non numériques → 0', () => {
    expect(
      computePlayerVitality({ ...base, profile: { health_points: 3, power_points: null } }),
    ).toEqual({ health: 3, power: 0 });
  });

  test('aucune source → null', () => {
    expect(computePlayerVitality(base)).toBeNull();
  });
});

describe('findPlayerMascotId', () => {
  const teams = [
    { id: 1, mascot_id: 'gnome' },
    { id: 2, mascot_id: null },
  ];

  test('retourne la mascotte de l’équipe du joueur', () => {
    expect(findPlayerMascotId({ showsPlayerChrome: true, auth: { teamId: '1' }, teams })).toBe(
      'gnome',
    );
  });

  test('chrome staff, équipe absente ou sans mascotte → null', () => {
    expect(findPlayerMascotId({ showsPlayerChrome: false, auth: { teamId: 1 }, teams })).toBeNull();
    expect(findPlayerMascotId({ showsPlayerChrome: true, auth: {}, teams })).toBeNull();
    expect(
      findPlayerMascotId({ showsPlayerChrome: true, auth: { teamId: 1 }, teams: null }),
    ).toBeNull();
    expect(findPlayerMascotId({ showsPlayerChrome: true, auth: { teamId: 2 }, teams })).toBeNull();
    expect(findPlayerMascotId({ showsPlayerChrome: true, auth: { teamId: 9 }, teams })).toBeNull();
  });
});
