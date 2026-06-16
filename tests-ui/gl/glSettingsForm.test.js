import { describe, test, expect } from 'vitest';
import {
  GAMEPLAY_TOGGLES,
  MODULE_TOGGLES,
  SPELL_CAST_CONTRIBUTION_OPTIONS,
  SPELL_CAST_TEAM_SCOPE_OPTIONS,
  readGameplayFlag,
  readSelectSetting,
  normalizeInitialPoints,
  settingsToIdentityFields,
  areVitalityValuesValid,
  gameplayPresetChanges,
} from '../../src/gl/utils/glSettingsForm.js';

describe('constantes de réglages', () => {
  test('chaque toggle gameplay a une clé unique', () => {
    const keys = GAMEPLAY_TOGGLES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('chaque module a une clé unique', () => {
    const keys = MODULE_TOGGLES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('les options de sortilèges ont valeur + libellé', () => {
    for (const opt of [...SPELL_CAST_CONTRIBUTION_OPTIONS, ...SPELL_CAST_TEAM_SCOPE_OPTIONS]) {
      expect(typeof opt.value).toBe('string');
      expect(typeof opt.label).toBe('string');
    }
  });
});

describe('readGameplayFlag', () => {
  test('vrai pour booléen true', () => {
    expect(readGameplayFlag({ k: true }, 'k')).toBe(true);
  });

  test('vrai pour la chaîne "true"', () => {
    expect(readGameplayFlag({ k: 'true' }, 'k')).toBe(true);
  });

  test('faux pour autre valeur ou absence', () => {
    expect(readGameplayFlag({ k: false }, 'k')).toBe(false);
    expect(readGameplayFlag({ k: 'false' }, 'k')).toBe(false);
    expect(readGameplayFlag({}, 'k')).toBe(false);
    expect(readGameplayFlag(null, 'k')).toBe(false);
  });
});

describe('readSelectSetting', () => {
  test('retire les guillemets encadrants', () => {
    expect(readSelectSetting({ k: '"recit"' }, 'k', 'cle')).toBe('recit');
  });

  test('valeur sans guillemet inchangée', () => {
    expect(readSelectSetting({ k: 'once_per_team' }, 'k', 'every_arrival')).toBe('once_per_team');
  });

  test('repli quand absent', () => {
    expect(readSelectSetting({}, 'k', 'every_arrival')).toBe('every_arrival');
  });
});

describe('normalizeInitialPoints', () => {
  test('nombre converti en chaîne', () => {
    expect(normalizeInitialPoints(5)).toBe('5');
  });

  test('chaîne numérique parsée', () => {
    expect(normalizeInitialPoints('7')).toBe('7');
  });

  test('repli 3 si non numérique ou absent', () => {
    expect(normalizeInitialPoints(undefined)).toBe('3');
    expect(normalizeInitialPoints('abc')).toBe('3');
  });
});

describe('settingsToIdentityFields', () => {
  test('extrait titre/sous-titre/PV/PP', () => {
    expect(
      settingsToIdentityFields({
        'platform.title': 'Ma Plateforme',
        'platform.subtitle': 'Sous-titre',
        'gameplay.default_health_points': 4,
        'gameplay.default_power_points': '6',
      }),
    ).toEqual({
      title: 'Ma Plateforme',
      subtitle: 'Sous-titre',
      defaultHealthPoints: '4',
      defaultPowerPoints: '6',
    });
  });

  test('valeurs par défaut sur objet vide', () => {
    expect(settingsToIdentityFields({})).toEqual({
      title: 'Gnomes & Licornes',
      subtitle: '',
      defaultHealthPoints: '3',
      defaultPowerPoints: '3',
    });
  });
});

describe('areVitalityValuesValid', () => {
  test('vrai pour entiers dans [0,99]', () => {
    expect(areVitalityValuesValid(0, 99)).toBe(true);
    expect(areVitalityValuesValid(3, 3)).toBe(true);
  });

  test('faux hors bornes', () => {
    expect(areVitalityValuesValid(-1, 3)).toBe(false);
    expect(areVitalityValuesValid(3, 100)).toBe(false);
  });

  test('faux pour non-entiers', () => {
    expect(areVitalityValuesValid(2.5, 3)).toBe(false);
    expect(areVitalityValuesValid(NaN, 3)).toBe(false);
  });
});

describe('gameplayPresetChanges', () => {
  test('renvoie seulement les clés dont la valeur diffère', () => {
    const settings = { 'gameplay.turns_enabled': true, 'gameplay.scoring_enabled': false };
    const preset = {
      settings: { 'gameplay.turns_enabled': true, 'gameplay.scoring_enabled': true },
    };
    expect(gameplayPresetChanges(settings, preset)).toEqual([['gameplay.scoring_enabled', true]]);
  });

  test('liste vide si tout est déjà appliqué', () => {
    const settings = { 'gameplay.turns_enabled': true };
    const preset = { settings: { 'gameplay.turns_enabled': true } };
    expect(gameplayPresetChanges(settings, preset)).toEqual([]);
  });

  test('liste vide si preset sans settings', () => {
    expect(gameplayPresetChanges({}, {})).toEqual([]);
    expect(gameplayPresetChanges({}, null)).toEqual([]);
  });
});
