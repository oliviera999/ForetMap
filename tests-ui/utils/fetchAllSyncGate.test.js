import { describe, expect, test } from 'vitest';
import {
  canSkipFetchAllCycle,
  isValidSyncState,
  MAX_CONSECUTIVE_SYNC_SKIPS,
} from '../../src/utils/fetchAllSyncGate.js';

const baseline = { key: 'ctx-1', bootId: 'boot-a', writes: 42 };

describe('fetchAllSyncGate (polling différentiel)', () => {
  test('isValidSyncState exige bootId non vide et compteur fini', () => {
    expect(isValidSyncState({ bootId: 'a', writes: 0 })).toBe(true);
    expect(isValidSyncState({ bootId: '', writes: 3 })).toBe(false);
    expect(isValidSyncState({ bootId: 'a', writes: NaN })).toBe(false);
    expect(isValidSyncState({ bootId: 'a' })).toBe(false);
    expect(isValidSyncState(null)).toBe(false);
  });

  test('saute le cycle quand rien n’a changé dans le même contexte', () => {
    expect(
      canSkipFetchAllCycle({
        prev: baseline,
        next: { bootId: 'boot-a', writes: 42 },
        contextKey: 'ctx-1',
        consecutiveSkips: 0,
      }),
    ).toBe(true);
  });

  test('cycle complet sans baseline, sur sonde invalide, ou après écriture', () => {
    const next = { bootId: 'boot-a', writes: 42 };
    expect(
      canSkipFetchAllCycle({ prev: null, next, contextKey: 'ctx-1', consecutiveSkips: 0 }),
    ).toBe(false);
    expect(
      canSkipFetchAllCycle({
        prev: baseline,
        next: null,
        contextKey: 'ctx-1',
        consecutiveSkips: 0,
      }),
    ).toBe(false);
    expect(
      canSkipFetchAllCycle({
        prev: baseline,
        next: { bootId: 'boot-a', writes: 43 },
        contextKey: 'ctx-1',
        consecutiveSkips: 0,
      }),
    ).toBe(false);
  });

  test('cycle complet après redémarrage serveur ou changement de contexte client', () => {
    expect(
      canSkipFetchAllCycle({
        prev: baseline,
        next: { bootId: 'boot-B', writes: 42 },
        contextKey: 'ctx-1',
        consecutiveSkips: 0,
      }),
    ).toBe(false);
    expect(
      canSkipFetchAllCycle({
        prev: baseline,
        next: { bootId: 'boot-a', writes: 42 },
        contextKey: 'ctx-2',
        consecutiveSkips: 0,
      }),
    ).toBe(false);
  });

  test('le plafond de sauts consécutifs force un cycle complet périodique', () => {
    const next = { bootId: 'boot-a', writes: 42 };
    expect(
      canSkipFetchAllCycle({
        prev: baseline,
        next,
        contextKey: 'ctx-1',
        consecutiveSkips: MAX_CONSECUTIVE_SYNC_SKIPS - 1,
      }),
    ).toBe(true);
    expect(
      canSkipFetchAllCycle({
        prev: baseline,
        next,
        contextKey: 'ctx-1',
        consecutiveSkips: MAX_CONSECUTIVE_SYNC_SKIPS,
      }),
    ).toBe(false);
  });
});
