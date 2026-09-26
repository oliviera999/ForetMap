import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  PEDAGO_SESSION_STORAGE_KEY,
  activePedagoSessionId,
  withPedagoSessionParam,
  withPedagoSessionScope,
} from '../../src/utils/pedagoSessionScope.js';

/**
 * La séance en cours est annoncée au serveur par `?pedagoSession=` sur les appels du
 * verrouillage : elle impose son niveau (décision du 25/09/2026).
 */

beforeEach(() => {
  sessionStorage.clear();
});

describe('pedagoSessionScope', () => {
  test('sans séance : chemins inchangés', () => {
    expect(activePedagoSessionId()).toBe(null);
    expect(withPedagoSessionParam('/api/learning/gating/summary?resourceType=plant')).toBe(
      '/api/learning/gating/summary?resourceType=plant',
    );
  });

  test('séance en cours : identifiant ajouté, une seule fois', () => {
    sessionStorage.setItem(
      PEDAGO_SESSION_STORAGE_KEY,
      JSON.stringify({ id: 'seance-lycee', steps: [], stepIndex: 0 }),
    );
    expect(activePedagoSessionId()).toBe('seance-lycee');
    expect(withPedagoSessionParam('/api/tutorials/3/acknowledge-read')).toBe(
      '/api/tutorials/3/acknowledge-read?pedagoSession=seance-lycee',
    );
    const once = withPedagoSessionParam('/api/learning/gating/challenge?resourceRef=1');
    expect(once).toBe('/api/learning/gating/challenge?resourceRef=1&pedagoSession=seance-lycee');
    expect(withPedagoSessionParam(once)).toBe(once);
  });

  test('stockage illisible : aucune séance', () => {
    sessionStorage.setItem(PEDAGO_SESSION_STORAGE_KEY, '{pas du json');
    expect(activePedagoSessionId()).toBe(null);
  });

  test('client enveloppé : méthode et corps transmis', async () => {
    sessionStorage.setItem(PEDAGO_SESSION_STORAGE_KEY, JSON.stringify({ id: 'a b', steps: [] }));
    const request = vi.fn().mockResolvedValue({ ok: true });
    await withPedagoSessionScope(request)('/api/plants/1/acknowledge-discovery', 'POST', {
      confirm: true,
    });
    expect(request).toHaveBeenCalledWith(
      '/api/plants/1/acknowledge-discovery?pedagoSession=a%20b',
      'POST',
      { confirm: true },
    );
  });
});
