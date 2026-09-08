import { describe, test, expect } from 'vitest';
import { createRequire } from 'node:module';
import {
  clampCooldownHours,
  formatHoursLabel,
  formatRemainingLabel,
  cooldownRemainingLabel,
  cooldownRetryHours,
  MS_PER_HOUR,
  MS_PER_DAY,
} from '../../src/shared/utils/cooldownDuration.js';

const require = createRequire(import.meta.url);
const core = require('../../lib/shared/cooldownDurationCore.js');

describe('cooldownDuration — parité avec lib/shared/cooldownDurationCore.js', () => {
  test('mêmes libellés de délai réglé (heures entières)', () => {
    for (const h of [0, 1, 6, 12, 23, 24, 36, 48, 72, 168, 8760, 99999, -3, 'x']) {
      expect(formatHoursLabel(h)).toBe(core.formatHoursLabel(h));
      expect(clampCooldownHours(h)).toBe(core.clampCooldownHours(h));
    }
  });

  test('mêmes libellés de temps restant', () => {
    for (const ms of [
      0,
      1,
      30 * 60 * 1000,
      MS_PER_HOUR,
      5 * MS_PER_HOUR + 1,
      MS_PER_DAY,
      26 * MS_PER_HOUR,
      3 * MS_PER_DAY,
    ]) {
      expect(formatRemainingLabel(ms)).toBe(core.formatRemainingLabel(ms));
    }
  });
});

describe('cooldownDuration — textes lisibles', () => {
  test('délai réglé : « aucun délai », heures, jours, mixte', () => {
    expect(formatHoursLabel(0)).toBe('aucun délai');
    expect(formatHoursLabel(6)).toBe('6 h');
    expect(formatHoursLabel(24)).toBe('1 jour');
    expect(formatHoursLabel(48)).toBe('2 jours');
    expect(formatHoursLabel(36)).toBe('1 j 12 h');
  });

  test('temps restant : minutes sous l’heure, arrondi au supérieur', () => {
    expect(formatRemainingLabel(90 * 1000)).toBe('2 min');
    expect(formatRemainingLabel(2.2 * MS_PER_HOUR)).toBe('3 h');
    expect(formatRemainingLabel(MS_PER_DAY + MS_PER_HOUR)).toBe('1 j 1 h');
  });

  test('cooldownRemainingLabel préfère le libellé serveur puis les champs de repli', () => {
    expect(cooldownRemainingLabel(null)).toBe('');
    expect(cooldownRemainingLabel({ remaining_label: '3 h', remaining_ms: 1 })).toBe('3 h');
    expect(cooldownRemainingLabel({ remaining_ms: 2 * MS_PER_HOUR })).toBe('2 h');
    expect(cooldownRemainingLabel({ remaining_hours: 5 })).toBe('5 h');
    expect(cooldownRemainingLabel({ remaining_days: 2 })).toBe('2 jours');
  });

  test('cooldownRetryHours lit les heures, puis les anciens jours, puis le bloc cooldown', () => {
    expect(cooldownRetryHours({ retry_cooldown_hours: 6 })).toBe(6);
    expect(cooldownRetryHours({ retry_hours: 0, retry_days: 3 })).toBe(0);
    expect(cooldownRetryHours({ retry_cooldown_days: 3 })).toBe(72);
    expect(cooldownRetryHours({ cooldown: { retry_days: 2 } })).toBe(48);
    expect(cooldownRetryHours({ cooldown: { retry_hours: 12 } })).toBe(12);
    expect(cooldownRetryHours({})).toBe(0);
  });
});
