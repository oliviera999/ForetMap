import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useGLSession } from '../../src/gl/hooks/useGLSession.js';
import { apiGL, saveGlSession, clearGlSession } from '../../src/gl/services/apiGL.js';
import { buildTeamSession } from '../../src/gl/utils/glTeamSession.js';

/**
 * Audit du 19/11/2026, J6 — sur un 401 « session expirée », `apiGL` vide le stockage et émet
 * `gl_session_changed`. L'état React doit suivre : sans jeton, l'application rend l'écran de
 * connexion au lieu d'un écran vide.
 */
describe('useGLSession — relecture de la session (J6)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('une session vidée par apiGL sur un 401 quitte aussi l’état React', async () => {
    saveGlSession({ token: 'perime', auth: { userType: 'gl_player', userId: '4' } });
    const { result } = renderHook(() => useGLSession());
    expect(result.current.token).toBe('perime');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => 'application/json' },
      json: async () => ({ error: 'Token invalide ou expiré' }),
      text: async () => JSON.stringify({ error: 'Token invalide ou expiré' }),
    });
    let erreur = null;
    await act(async () => {
      erreur = await apiGL('/api/gl/games/7').catch((err) => err);
    });
    expect(erreur?.sessionExpired).toBe(true);
    await waitFor(() => expect(result.current.token).toBeNull());
    expect(result.current.session).toBeNull();
    expect(result.current.auth).toBeNull();
  });

  test('une déconnexion dans un autre onglet (évènement storage) est relue', () => {
    saveGlSession({ token: 'compte', auth: { userType: 'gl_player', userId: '4' } });
    const { result } = renderHook(() => useGLSession());
    act(() => {
      // Un autre onglet a retiré la clé : celui-ci ne reçoit que l'évènement `storage`.
      const removeItem = Storage.prototype.removeItem;
      removeItem.call(localStorage, 'gl_session');
      window.dispatchEvent(new StorageEvent('storage', { key: 'gl_session' }));
    });
    expect(result.current.token).toBeNull();
  });

  test('J3 + J6 : un onglet d’équipe garde sa session quand le compte derrière se déconnecte ailleurs', () => {
    saveGlSession({ token: 'compte', auth: { userType: 'gl_player', userId: '4' } });
    saveGlSession(buildTeamSession({ token: 'equipe', gameId: 7, teamId: 12 }));
    const { result } = renderHook(() => useGLSession());
    expect(result.current.token).toBe('equipe');
    act(() => {
      localStorage.removeItem('gl_session');
      window.dispatchEvent(new StorageEvent('storage', { key: 'gl_session' }));
    });
    expect(result.current.token).toBe('equipe');
  });

  test('un évènement sans changement de contenu ne change pas l’identité de la session', () => {
    saveGlSession({ token: 'compte', auth: { userType: 'gl_player', userId: '4' } });
    const { result } = renderHook(() => useGLSession());
    const avant = result.current.session;
    const authAvant = result.current.auth;
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'autre_cle' }));
      window.dispatchEvent(new StorageEvent('storage', { key: 'gl_session' }));
    });
    expect(result.current.session).toBe(avant);
    expect(result.current.auth).toBe(authAvant);
  });

  test('logout et updateSession gardent leur comportement', () => {
    const { result } = renderHook(() => useGLSession());
    act(() => result.current.updateSession({ token: 't', auth: { userType: 'gl_player' } }));
    expect(result.current.token).toBe('t');
    act(() => result.current.logout());
    expect(result.current.token).toBeNull();
    // La session vidée hors du hook reste lisible par un appel direct.
    act(() => clearGlSession());
    expect(result.current.session).toBeNull();
  });
});
