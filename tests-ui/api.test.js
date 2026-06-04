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

  test('envoie Accept application/json sur les requêtes api()', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({}),
    });
    await api('/api/version');
    expect(fetchMock.mock.calls[0][1].headers.Accept).toBe('application/json');
  });

  test('POST réessaie sur 503 HTML passerelle puis réussit', async () => {
    const html503 = '<html><body>Service Unavailable</body></html>';
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        headers: { get: (name) => (String(name).toLowerCase() === 'content-type' ? 'text/html' : null) },
        json: async () => { throw new Error('not json'); },
        text: async () => html503,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        headers: { get: (name) => (String(name).toLowerCase() === 'content-type' ? 'text/html' : null) },
        json: async () => { throw new Error('not json'); },
        text: async () => html503,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ validated: true }),
      });

    const result = await api('/api/tasks/task-1/validate', 'POST');
    expect(result).toEqual({ validated: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test('POST ne réessaie pas sur 503 JSON métier', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      headers: { get: (name) => (String(name).toLowerCase() === 'content-type' ? 'application/json' : null) },
      json: async () => ({ error: 'Forum désactivé' }),
      text: async () => '',
    });

    await expect(api('/api/forum/posts', 'POST', { body: 'x' })).rejects.toMatchObject({
      message: 'Forum désactivé',
      status: 503,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('POST réessaie sur 503 JSON SERVICE_RESTARTING puis réussit', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        headers: { get: () => 'application/json' },
        json: async () => ({
          error: 'Service en redémarrage — réessayez dans quelques secondes.',
          code: 'SERVICE_RESTARTING',
        }),
        text: async () => '',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ ok: true }),
      });

    const result = await api('/api/tasks/task-2/validate', 'POST');
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
