// @vitest-environment jsdom
//
// Non-régression : une entrée de file « vu » **sans horodatage** doit se vider
// normalement. Le repli historique sur `Date.now()` dans `compactVisitSeenQueue`
// rendait `loadVisitSeenQueue()` non idempotente ; comme `flushVisitSeenQueue()`
// lit la file deux fois (avant/après les POST) pour détecter une modification
// concurrente, l'entrée était jugée modifiée dès que le flush franchissait une
// milliseconde — donc remise en file indéfiniment, re-POSTée à chaque flush, et
// `pendingSyncCount` bloqué à une valeur non nulle.

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  VISIT_SEEN_QUEUE_STORAGE_KEY,
  compactVisitSeenQueue,
  flushVisitSeenQueue,
  loadVisitSeenQueue,
  enqueueVisitSeenAction,
} from '../../src/utils/visitProgressClient.js';

beforeEach(() => {
  window.localStorage.clear();
});

describe('file « vu » — stabilité de la normalisation', () => {
  it('une entrée sans horodatage reçoit une valeur stable, pas l’heure courante', () => {
    const raw = [{ target_type: 'zone', target_id: 3, seen: true }];
    const first = compactVisitSeenQueue(raw);
    const second = compactVisitSeenQueue(raw);

    expect(first[0].updated_at).toBe(0);
    expect(first).toEqual(second);
  });

  it('deux lectures consécutives du même stockage sont identiques (idempotence)', () => {
    window.localStorage.setItem(
      VISIT_SEEN_QUEUE_STORAGE_KEY,
      JSON.stringify([{ target_type: 'zone', target_id: 3, seen: true }]),
    );

    const first = loadVisitSeenQueue();
    const second = loadVisitSeenQueue();

    expect(first).toEqual(second);
  });

  it('un horodatage invalide retombe aussi sur la valeur stable', () => {
    for (const bogus of [undefined, null, 'hier', NaN, Infinity]) {
      const [item] = compactVisitSeenQueue([
        { target_type: 'zone', target_id: 3, seen: true, updated_at: bogus },
      ]);
      expect(item.updated_at).toBe(0);
    }
  });

  it('un horodatage valide est préservé tel quel', () => {
    const [item] = compactVisitSeenQueue([
      { target_type: 'zone', target_id: 3, seen: true, updated_at: 1700000000000 },
    ]);
    expect(item.updated_at).toBe(1700000000000);
  });

  it('les entrées non horodatées sont traitées comme les plus anciennes', () => {
    const queue = compactVisitSeenQueue([
      { target_type: 'zone', target_id: 1, seen: true, updated_at: 500 },
      { target_type: 'zone', target_id: 2, seen: true },
    ]);
    expect(queue.map((i) => i.target_id)).toEqual(['2', '1']);
  });

  it('flush d’une entrée sans horodatage : la file est bien vidée', async () => {
    window.localStorage.setItem(
      VISIT_SEEN_QUEUE_STORAGE_KEY,
      JSON.stringify([{ target_type: 'zone', target_id: 3, seen: true }]),
    );

    const post = vi.fn(async () => {});
    const result = await flushVisitSeenQueue(post);

    expect(post).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ synced: 1, failed: 0, remaining: 0 });
    expect(loadVisitSeenQueue()).toEqual([]);
  });

  it('flush d’une entrée sans horodatage : robuste même si le POST traverse une milliseconde', async () => {
    // Reproduit la condition exacte du flake : le temps avance entre les deux
    // lectures internes de `flushVisitSeenQueue`.
    window.localStorage.setItem(
      VISIT_SEEN_QUEUE_STORAGE_KEY,
      JSON.stringify([{ target_type: 'zone', target_id: 3, seen: true }]),
    );

    let now = 1000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => (now += 25));
    try {
      const result = await flushVisitSeenQueue(async () => {});
      expect(result.remaining).toBe(0);
      expect(loadVisitSeenQueue()).toEqual([]);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('une entrée re-modifiée pendant le flush reste bien en file (garde préservée)', async () => {
    window.localStorage.setItem(
      VISIT_SEEN_QUEUE_STORAGE_KEY,
      JSON.stringify([{ target_type: 'zone', target_id: 3, seen: true, updated_at: 100 }]),
    );

    const result = await flushVisitSeenQueue(async () => {
      // Le joueur re-bascule l'élément pendant que le POST est en vol.
      enqueueVisitSeenAction({ target_type: 'zone', target_id: 3, seen: false });
    });

    expect(result.remaining).toBe(1);
    expect(loadVisitSeenQueue()).toEqual([
      expect.objectContaining({ target_type: 'zone', target_id: '3', seen: false }),
    ]);
  });

  it('un POST en échec laisse l’entrée en file', async () => {
    window.localStorage.setItem(
      VISIT_SEEN_QUEUE_STORAGE_KEY,
      JSON.stringify([{ target_type: 'zone', target_id: 3, seen: true }]),
    );

    const result = await flushVisitSeenQueue(async () => {
      throw new Error('réseau');
    });

    expect(result).toEqual({ synced: 0, failed: 1, remaining: 1 });
  });
});
