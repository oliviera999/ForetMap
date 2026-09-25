import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  createOfflineQueue,
  isDefinitiveRefusal,
  newClientUuid,
} from '../../src/utils/offlineActionQueue.js';

const KEY = 'foretmap_test_offline_queue';
const httpError = (status) => Object.assign(new Error(`HTTP ${status}`), { status });

function makeQueue(max = 5) {
  return createOfflineQueue({
    storageKey: KEY,
    max,
    normalize: (raw) =>
      raw && typeof raw === 'object'
        ? {
            user_id: raw.user_id,
            client_uuid: raw.client_uuid,
            label: String(raw.label || ''),
            refused: !!raw.refused,
            error: raw.error ? String(raw.error) : '',
            queued_at: Number(raw.queued_at) || 0,
          }
        : null,
  });
}

beforeEach(() => {
  localStorage.removeItem(KEY);
});

describe('file hors ligne générique (piste D)', () => {
  test('clés d’idempotence uniques et au format du serveur', () => {
    const a = newClientUuid('done');
    expect(a).not.toBe(newClientUuid('done'));
    expect(a).toMatch(/^[A-Za-z0-9-]{8,64}$/);
  });

  test('refus définitif : 4xx sauf 401, 408 et 429', () => {
    expect(isDefinitiveRefusal(httpError(400))).toBe(true);
    expect(isDefinitiveRefusal(httpError(404))).toBe(true);
    for (const status of [401, 408, 429, 500, 503]) {
      expect(isDefinitiveRefusal(httpError(status))).toBe(false);
    }
    expect(isDefinitiveRefusal(new Error('réseau'))).toBe(false);
  });

  test('ajout sans doublon de clé ; entrées invalides refusées ; file bornée', () => {
    const q = makeQueue(3);
    expect(q.enqueue({ user_id: 'u1', client_uuid: 'cle-000001' })).toBe(true);
    expect(q.enqueue({ user_id: 'u1', client_uuid: 'cle-000001' })).toBe(true);
    expect(q.enqueue({ user_id: '', client_uuid: 'cle-000002' })).toBe(false);
    expect(q.enqueue({ user_id: 'u1', client_uuid: 'x' })).toBe(false);
    expect(q.load()).toHaveLength(1);
    for (let i = 2; i <= 5; i += 1) q.enqueue({ user_id: 'u1', client_uuid: `cle-00000${i}` });
    expect(q.load().map((x) => x.client_uuid)).toEqual(['cle-000003', 'cle-000004', 'cle-000005']);
  });

  test('stockage indisponible : rien n’est promis', () => {
    const q = makeQueue();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    try {
      expect(q.enqueue({ user_id: 'u1', client_uuid: 'cle-quota-01' })).toBe(false);
    } finally {
      spy.mockRestore();
    }
    expect(q.load()).toHaveLength(0);
  });

  test('rejeu : succès et refus définitifs sortent, réseau et 429 arrêtent le rejeu', async () => {
    const q = makeQueue(10);
    for (const uuid of ['cle-ok-0001', 'cle-400-001', 'cle-429-001', 'cle-net-001']) {
      q.enqueue({ user_id: 'u1', client_uuid: uuid });
    }
    const send = vi.fn(async (item) => {
      if (item.client_uuid === 'cle-400-001') throw httpError(400);
      if (item.client_uuid === 'cle-429-001') throw httpError(429);
      return { ok: true };
    });
    const out = await q.flush(send, 'u1');
    expect(out.synced).toBe(1);
    expect(out.dropped).toBe(1);
    expect(out.refused.map((r) => r.item.client_uuid)).toEqual(['cle-400-001']);
    expect(out.remaining).toBe(2);
    expect(send).toHaveBeenCalledTimes(3);
  });

  test('mode « keep » : un refus garde l’écriture, marquée, et ne la rejoue plus', async () => {
    const q = makeQueue();
    q.enqueue({ user_id: 'u1', client_uuid: 'cle-keep-01', label: 'Mon texte' });
    const send = vi.fn(async () => {
      throw Object.assign(new Error('Texte trop long'), { status: 400 });
    });
    const out = await q.flush(send, 'u1', { onRefusal: 'keep' });
    expect(out.refused).toHaveLength(1);
    const [kept] = q.load();
    expect(kept).toMatchObject({ label: 'Mon texte', refused: true, error: 'Texte trop long' });
    await q.flush(send, 'u1', { onRefusal: 'keep' });
    expect(send).toHaveBeenCalledTimes(1);
    // Une modification lève le refus : l'écriture repart au rejeu suivant.
    q.update('cle-keep-01', { label: 'Plus court', refused: false, error: '' });
    send.mockResolvedValueOnce({ ok: true });
    await q.flush(send, 'u1', { onRefusal: 'keep' });
    expect(q.load()).toHaveLength(0);
  });

  test('propre au compte connecté, jamais sans compte ; un seul rejeu à la fois', async () => {
    const q = makeQueue();
    q.enqueue({ user_id: 'u1', client_uuid: 'cle-u1-0001' });
    q.enqueue({ user_id: 'u2', client_uuid: 'cle-u2-0001' });
    const send = vi.fn(async () => ({ ok: true }));
    expect((await q.flush(send, '')).synced).toBe(0);
    expect(send).not.toHaveBeenCalled();
    const first = q.flush(send, 'u2');
    expect(q.flush(send, 'u2')).toBe(first);
    await first;
    expect(send).toHaveBeenCalledTimes(1);
    expect(q.load().map((x) => x.user_id)).toEqual(['u1']);
    expect(q.listFor('u1')).toHaveLength(1);
    expect(q.listFor('u2')).toHaveLength(0);
  });
});
