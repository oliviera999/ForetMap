import { describe, expect, test } from 'vitest';
import {
  jitteredRefreshDelay,
  RT_REFRESH_JITTER_MS,
} from '../../src/utils/realtimeRefreshDelay.js';

/**
 * Étalement des refetchs temps réel : un événement part à toute une classe à la fois, et
 * un debounce fixe faisait taper tous les postes dans la même fenêtre.
 */
describe('jitteredRefreshDelay', () => {
  test('n’avance jamais le refetch avant son debounce', () => {
    expect(jitteredRefreshDelay(400, () => 0)).toBe(400);
    expect(jitteredRefreshDelay(220, () => 0.999)).toBeGreaterThanOrEqual(220);
  });

  test('étale sur toute la fenêtre de jitter, sans la dépasser', () => {
    expect(jitteredRefreshDelay(400, () => 0.999)).toBeLessThan(400 + RT_REFRESH_JITTER_MS);
    expect(jitteredRefreshDelay(400, () => 0.5)).toBe(400 + Math.floor(0.5 * RT_REFRESH_JITTER_MS));
  });

  test('deux clients tirent des délais différents (c’est tout l’objet)', () => {
    const a = jitteredRefreshDelay(400, () => 0.1);
    const b = jitteredRefreshDelay(400, () => 0.9);
    expect(a).not.toBe(b);
  });

  test('un debounce absent ou absurde ne produit pas de délai négatif', () => {
    expect(jitteredRefreshDelay(0, () => 0)).toBe(0);
    expect(jitteredRefreshDelay(-5, () => 0)).toBe(0);
    expect(jitteredRefreshDelay(undefined, () => 0)).toBe(0);
  });
});
