// @vitest-environment jsdom
import { describe, test, expect, afterEach, vi } from 'vitest';
import { daysUntil } from '../../src/utils/badges.jsx';

/**
 * `daysUntil` compare des dates NUES en heure locale : 0 = aujourd'hui, 1 = demain,
 * -1 = un jour de retard. La version précédente soustrayait deux instants — une date
 * nue étant parsée à minuit UTC, une tâche due le jour même passait pour « demain »
 * pendant les premières heures locales à l'est de Greenwich.
 */
afterEach(() => {
  vi.useRealTimers();
});

function freeze(iso) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

describe('daysUntil', () => {
  test('valeur absente ou illisible → null (aucune puce d’échéance rendue)', () => {
    expect(daysUntil(null)).toBeNull();
    expect(daysUntil('')).toBeNull();
    expect(daysUntil('pas-une-date')).toBeNull();
  });

  test('milieu de journée : aujourd’hui = 0, demain = 1, hier = -1', () => {
    freeze('2026-09-02T12:00:00');
    expect(daysUntil('2026-09-02')).toBe(0);
    expect(daysUntil('2026-09-03')).toBe(1);
    expect(daysUntil('2026-09-01')).toBe(-1);
    expect(daysUntil('2026-09-09')).toBe(7);
  });

  test('début de nuit locale : une échéance du jour reste « aujourd’hui »', () => {
    // Le cas qui échouait : à 00 h 30 locales, `new Date('2026-09-02')` (minuit UTC)
    // était encore dans le futur pour un fuseau à l'est de Greenwich.
    freeze('2026-09-02T00:30:00');
    expect(daysUntil('2026-09-02')).toBe(0);
    expect(daysUntil('2026-09-01')).toBe(-1);
  });

  test('fin de journée locale : l’échéance du jour n’est pas encore en retard', () => {
    freeze('2026-09-02T23:45:00');
    expect(daysUntil('2026-09-02')).toBe(0);
    expect(daysUntil('2026-09-03')).toBe(1);
  });

  test('changement d’heure (jour de 23 h) : l’écart reste un entier de jours', () => {
    // Bascule d'heure d'été européenne le 29 mars 2026.
    freeze('2026-03-28T12:00:00');
    expect(daysUntil('2026-03-30')).toBe(2);
  });
});
