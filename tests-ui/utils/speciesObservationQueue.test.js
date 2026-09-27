import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  SPECIES_OBSERVATION_QUEUE_STORAGE_KEY,
  enqueueSpeciesObservation,
  flushSpeciesObservationQueue,
  listQueuedSpeciesObservations,
  newSpeciesObservationClientUuid,
  removeQueuedSpeciesObservation,
  speciesObservationRequestBody,
} from '../../src/utils/speciesObservationQueue.js';

function item(overrides = {}) {
  return {
    user_id: 'u1',
    client_uuid: newSpeciesObservationClientUuid(),
    map_id: 'foret',
    zone_id: 'z1',
    plant_id: 7,
    observed_at: '2026-09-20',
    detection_mode: 'vue',
    text: 'Deux individus',
    plant_label: '🐞 Coccinelle',
    place_label: 'Mare',
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.removeItem(SPECIES_OBSERVATION_QUEUE_STORAGE_KEY);
});

describe('observations d’espèces gardées sans réseau', () => {
  test('file propre à chaque compte, sans doublon de clé', () => {
    const a = item();
    expect(enqueueSpeciesObservation(a)).toBe(true);
    expect(enqueueSpeciesObservation(a)).toBe(true);
    enqueueSpeciesObservation(item({ user_id: 'u2' }));
    expect(listQueuedSpeciesObservations('u1')).toHaveLength(1);
    expect(listQueuedSpeciesObservations('u2')).toHaveLength(1);
    removeQueuedSpeciesObservation(a.client_uuid);
    expect(listQueuedSpeciesObservations('u1')).toHaveLength(0);
  });

  test('une observation vide (ni espèce ni texte) ou mal datée n’est pas gardée', () => {
    expect(enqueueSpeciesObservation(item({ plant_id: null, text: '  ' }))).toBe(false);
    expect(enqueueSpeciesObservation(item({ observed_at: 'hier' }))).toBe(false);
    expect(enqueueSpeciesObservation(item({ map_id: '' }))).toBe(false);
    expect(enqueueSpeciesObservation(item({ client_uuid: 'x' }))).toBe(false);
  });

  test('corps de requête : clé d’idempotence et champs renseignés seulement', () => {
    const a = item({ zone_id: null, marker_id: 'm1', detection_mode: null });
    expect(speciesObservationRequestBody(a)).toEqual({
      client_uuid: a.client_uuid,
      map_id: 'foret',
      observed_at: '2026-09-20',
      marker_id: 'm1',
      plant_id: 7,
      text: 'Deux individus',
    });
  });

  test('rejeu : envoyée → sort ; refus définitif → gardée avec le message ; réseau absent → reste', async () => {
    const ok = item({ text: 'ok' });
    const refused = item({ text: 'refusée' });
    enqueueSpeciesObservation(ok);
    enqueueSpeciesObservation(refused);
    const send = vi.fn(async (q) => {
      if (q.client_uuid === refused.client_uuid) {
        const err = new Error('Espèce introuvable');
        err.status = 400;
        throw err;
      }
      return { observation: { id: 1 } };
    });
    const out = await flushSpeciesObservationQueue(send, 'u1');
    expect(out.synced).toBe(1);
    expect(out.refused).toHaveLength(1);
    const left = listQueuedSpeciesObservations('u1');
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ refused: true, error: 'Espèce introuvable', text: 'refusée' });

    removeQueuedSpeciesObservation(refused.client_uuid);
    enqueueSpeciesObservation(item({ text: 'réseau' }));
    const offline = await flushSpeciesObservationQueue(async () => {
      throw new TypeError('Failed to fetch');
    }, 'u1');
    expect(offline.synced).toBe(0);
    expect(listQueuedSpeciesObservations('u1')).toHaveLength(1);
  });
});
