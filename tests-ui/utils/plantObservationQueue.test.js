import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  PLANT_OBSERVATION_QUEUE_MAX,
  PLANT_OBSERVATION_QUEUE_STORAGE_KEY,
  countQueuedObservations,
  enqueuePlantObservation,
  flushPlantObservationQueue,
  loadPlantObservationQueue,
  newObservationClientUuid,
} from '../../src/utils/plantObservationQueue.js';

const httpError = (status) => Object.assign(new Error(`HTTP ${status}`), { status });

beforeEach(() => {
  localStorage.removeItem(PLANT_OBSERVATION_QUEUE_STORAGE_KEY);
});

describe('file hors ligne des observations d’espèce', () => {
  test('une clé par observation, acceptée par le serveur', () => {
    const a = newObservationClientUuid();
    const b = newObservationClientUuid();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9-]{8,64}$/);
  });

  test('pas de doublon de clé ; entrées invalides écartées', () => {
    enqueuePlantObservation({ user_id: 'u1', plant_id: 3, client_uuid: 'cle-000001' });
    enqueuePlantObservation({ user_id: 'u1', plant_id: 3, client_uuid: 'cle-000001' });
    enqueuePlantObservation({ user_id: '', plant_id: 3, client_uuid: 'cle-000002' });
    enqueuePlantObservation({ user_id: 'u1', plant_id: 0, client_uuid: 'cle-000003' });
    enqueuePlantObservation({ user_id: 'u1', plant_id: 3, client_uuid: 'x' });
    expect(loadPlantObservationQueue()).toHaveLength(1);
    expect(countQueuedObservations('u1', 3)).toBe(1);
    expect(countQueuedObservations('u2', 3)).toBe(0);
  });

  test('la file est bornée', () => {
    for (let i = 0; i < PLANT_OBSERVATION_QUEUE_MAX + 5; i += 1) {
      enqueuePlantObservation({ user_id: 'u1', plant_id: 1, client_uuid: `cle-${1000 + i}` });
    }
    const queue = loadPlantObservationQueue();
    expect(queue).toHaveLength(PLANT_OBSERVATION_QUEUE_MAX);
    expect(queue.at(-1).client_uuid).toBe(`cle-${1000 + PLANT_OBSERVATION_QUEUE_MAX + 4}`);
  });

  test('rejeu : succès et refus définitifs sortent, réseau et 401/429 restent', async () => {
    for (const [i, uuid] of [
      'cle-ok-0001',
      'cle-404-001',
      'cle-429-001',
      'cle-net-001',
    ].entries()) {
      enqueuePlantObservation({ user_id: 'u1', plant_id: i + 1, client_uuid: uuid });
    }
    const send = vi.fn(async (item) => {
      if (item.client_uuid === 'cle-404-001') throw httpError(404);
      if (item.client_uuid === 'cle-429-001') throw httpError(429);
      return { success: true };
    });
    const out = await flushPlantObservationQueue(send, 'u1');
    expect(out).toEqual({ synced: 1, dropped: 1, remaining: 2 });
    // Le 429 interrompt le rejeu : l'observation suivante n'est pas tentée.
    expect(send).toHaveBeenCalledTimes(3);
    expect(loadPlantObservationQueue().map((q) => q.client_uuid)).toEqual([
      'cle-429-001',
      'cle-net-001',
    ]);
  });

  test('rejeu propre au compte connecté, jamais sans compte', async () => {
    enqueuePlantObservation({ user_id: 'u1', plant_id: 1, client_uuid: 'cle-u1-0001' });
    enqueuePlantObservation({ user_id: 'u2', plant_id: 1, client_uuid: 'cle-u2-0001' });
    const send = vi.fn(async () => ({ success: true }));
    expect(await flushPlantObservationQueue(send, '')).toEqual({
      synced: 0,
      dropped: 0,
      remaining: 0,
    });
    expect(send).not.toHaveBeenCalled();
    await flushPlantObservationQueue(send, 'u2');
    expect(send).toHaveBeenCalledTimes(1);
    expect(loadPlantObservationQueue().map((q) => q.user_id)).toEqual(['u1']);
  });

  test('un seul rejeu à la fois', async () => {
    enqueuePlantObservation({ user_id: 'u1', plant_id: 1, client_uuid: 'cle-one-0001' });
    let release;
    const send = vi.fn(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const first = flushPlantObservationQueue(send, 'u1');
    const second = flushPlantObservationQueue(send, 'u1');
    expect(second).toBe(first);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    release({ success: true });
    await first;
    expect(send).toHaveBeenCalledTimes(1);
  });
});
