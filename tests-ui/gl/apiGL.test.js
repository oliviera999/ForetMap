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

  test('GET /api/gl/content/world accepte JSON 200 sans Content-Type json', async () => {
    saveGlSession({ token: 'token-123' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'text/plain; charset=utf-8' },
      json: async () => {
        throw new Error('not json ct');
      },
      text: async () =>
        JSON.stringify({
          slug: 'world',
          title: 'Le monde de Gnomes & Licornes',
          bodyMarkdown: 'Bienvenue',
        }),
    });

    const data = await apiGL('/api/gl/content/world');
    expect(data.slug).toBe('world');
    expect(data.bodyMarkdown).toBe('Bienvenue');
  });

  test('purge la session et message explicite si token expiré', async () => {
    saveGlSession({ token: 'expired-token' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => 'application/json' },
      json: async () => ({ error: 'Token invalide ou expiré' }),
    });

    await expect(apiGL('/api/gl/content/world')).rejects.toMatchObject({
      message: 'Session expirée — reconnectez-vous à Gnomes & Licornes.',
      status: 401,
      sessionExpired: true,
    });
    expect(localStorage.getItem('gl_session')).toBeNull();
  });

  test('200 HTML lève un message de contenu inattendu', async () => {
    clearGlSession();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'text/html' },
      json: async () => {
        throw new Error('not json');
      },
      text: async () => '<!DOCTYPE html><html></html>',
    });

    await expect(apiGL('/api/gl/content/world')).rejects.toThrow(
      /Impossible de charger le contenu/i,
    );
  });
});
