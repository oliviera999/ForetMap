import { describe, test, expect, vi } from 'vitest';
import { apiGL, saveGlSession, clearGlSession } from '../../src/gl/services/apiGL.js';

describe('apiGL', () => {
  test('injecte le header Bearer quand un token est présent', async () => {
    saveGlSession({ token: 'token-123' });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ ok: true }),
    });

    await apiGL('/api/gl/auth/me');
    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer token-123');
  });

  test('n’ajoute pas Authorization sans token', async () => {
    clearGlSession();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ ok: true }),
    });

    await apiGL('/api/gl/auth/config');
    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.Authorization).toBeUndefined();
  });

  test('lève une erreur enrichie sur statut 4xx JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => 'application/json' },
      json: async () => ({ error: 'Non autorisé' }),
    });

    await expect(apiGL('/api/gl/private')).rejects.toMatchObject({
      message: 'Non autorisé',
      status: 401,
      body: { error: 'Non autorisé' },
    });
  });
});
