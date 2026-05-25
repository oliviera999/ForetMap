import { describe, expect, test, vi } from 'vitest';
import { api, getAuthToken, getStoredSession } from '../src/services/api.js';

describe('api ForetMap', () => {
  test('récupère le JWT depuis une session n3beur legacy', async () => {
    localStorage.setItem('foretmap_student', JSON.stringify({
      id: 'student-1',
      first_name: 'N3',
      last_name: 'Beur',
      authToken: 'legacy-token-123',
    }));
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ ok: true }),
    });

    expect(getAuthToken()).toBe('legacy-token-123');
    expect(getStoredSession()?.token).toBe('legacy-token-123');

    await api('/api/stats/me/student-1');
    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer legacy-token-123');
  });

  test('remplace le message brut Token requis si aucune session JWT n’existe', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: (name) => (String(name).toLowerCase() === 'content-type' ? 'application/json' : null) },
      json: async () => ({ error: 'Token requis' }),
    });

    let thrown = null;
    try {
      await api('/api/stats/me/student-1');
    } catch (err) {
      thrown = err;
    }

    expect(thrown?.message).toBe('Session locale incomplète : reconnecte-toi pour continuer.');
    expect(thrown?.status).toBe(401);
    expect(thrown?.body).toEqual({ error: 'Token requis' });
  });
});
