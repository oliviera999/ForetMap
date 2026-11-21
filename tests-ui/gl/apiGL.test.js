import { describe, test, expect, vi, afterEach } from 'vitest';
import {
  apiGL,
  saveGlSession,
  clearGlSession,
  glNetworkFailureMessage,
  GL_PANNE_RESEAU_CODE,
  GL_PANNE_RESEAU_EQUIPE,
} from '../../src/gl/services/apiGL.js';
import {
  NETWORK_FAILURE_STAFF_MESSAGE,
  NETWORK_FAILURE_USER_MESSAGE,
} from '../../src/shared/networkFailureMessages.js';
import { apiRetryGate } from '../../src/shared/apiRetryGate.js';
import { resetReachabilityState } from '../../src/shared/networkStatus.js';

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
    saveGlSession({ token: 'token-123' });
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
    // Public sans session (écran d'accueil du jeu) : phrase simple du redémarrage (audit U2).
    clearGlSession();
    await expect(apiGL('/api/gl/content/world')).rejects.toThrow(
      'Le site redémarre, il revient dans un instant.',
    );
  });
});

describe('apiGL — panne réseau et identifiant de requête (écrans de séance, K8)', () => {
  const PROF = { token: 'tok-prof', auth: { userType: 'gl_admin', roleSlug: 'gl_mj' } };
  const ELEVE = { token: 'tok-eleve', auth: { userType: 'gl_player', roleSlug: 'gl_player' } };

  /** Coupe le réseau de l'appareil : l'échec est immédiat, sans nouvelles tentatives. */
  function horsLigne(valeur) {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: !valeur });
  }

  afterEach(() => {
    horsLigne(false);
    sessionStorage.clear();
    localStorage.clear();
    apiRetryGate.clear();
    resetReachabilityState();
    vi.restoreAllMocks();
  });

  test('la phrase dépend de qui est connecté ; jamais le « Failed to fetch » du navigateur', () => {
    const dire = (session) => glNetworkFailureMessage({ session, dev: false });
    expect(dire(PROF)).toBe(NETWORK_FAILURE_STAFF_MESSAGE);
    expect(dire(ELEVE)).toBe(NETWORK_FAILURE_USER_MESSAGE);
    // Tablette d'équipe et projection : l'écran parle à l'équipe, au « vous ».
    expect(dire({ token: 't', auth: { teamSession: true } })).toBe(GL_PANNE_RESEAU_EQUIPE);
    expect(dire({ token: 't', auth: { projection: true } })).toBe(GL_PANNE_RESEAU_EQUIPE);
    expect(GL_PANNE_RESEAU_EQUIPE).toMatch(/Réessayez .* prévenez le prof\./);
    expect(GL_PANNE_RESEAU_EQUIPE).not.toMatch(/\b(tu|ton|ta|tes|toi)\b/i);
    // Écran de connexion, sans compte : la phrase simple du redémarrage.
    expect(dire(null)).toBe('Le site redémarre, il revient dans un instant.');
    // Un prof qui a pris la main d'un élève lit ce que l'élève lirait.
    expect(dire({ token: 't', auth: { userType: 'gl_admin', impersonating: true } })).toBe(
      NETWORK_FAILURE_USER_MESSAGE,
    );
    for (const session of [PROF, ELEVE, null]) {
      expect(dire(session)).not.toMatch(/fetch/i);
    }
  });

  test('réseau coupé : apiGL lève une erreur en français, marquée, avec sa cause', async () => {
    saveGlSession(ELEVE);
    horsLigne(true);
    const cause = new TypeError('Failed to fetch');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(cause);
    const err = await apiGL('/api/gl/games/7/state').catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe(glNetworkFailureMessage());
    expect(err.message).not.toMatch(/failed to fetch/i);
    expect(err.code).toBe(GL_PANNE_RESEAU_CODE);
    expect(err.network).toBe(true);
    expect(err.offline).toBe(true);
    expect(err.cause).toBe(cause);
  });

  test('serveur injoignable après les nouvelles tentatives : même phrase, pas l’erreur brute', async () => {
    saveGlSession(PROF);
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new TypeError('Failed to fetch'));
    // Une écriture n'est retentée que deux fois (≈ 1,5 s) : le test attend la vraie fenêtre.
    const err = await apiGL('/api/gl/games/7/tenir/tour/ouvrir', 'POST', {}).catch((e) => e);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    expect(err.message).toBe(glNetworkFailureMessage());
    expect(err.message).not.toMatch(/failed to fetch/i);
    expect(err.code).toBe(GL_PANNE_RESEAU_CODE);
  }, 15_000);

  function reponseSansMessage() {
    return {
      ok: false,
      status: 500,
      headers: {
        get: (name) => {
          const cle = String(name).toLowerCase();
          if (cle === 'content-type') return 'application/json';
          if (cle === 'x-request-id') return 'req-4f2a';
          return null;
        },
      },
      json: async () => ({}),
    };
  }

  test('un élève ne lit jamais l’identifiant de requête ; il reste sur l’erreur', async () => {
    saveGlSession(ELEVE);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(reponseSansMessage());
    const err = await apiGL('/api/gl/games/7/tenir/lancer', 'POST', {}).catch((e) => e);
    expect(err.message).toBe('Erreur serveur (HTTP 500)');
    expect(err.message).not.toMatch(/requête|req-4f2a/);
    expect(err.requestId).toBe('req-4f2a');
  });

  test('une tablette d’équipe non plus', async () => {
    saveGlSession({ token: 'tok-equipe', auth: { teamSession: true, userType: 'gl_guest' } });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(reponseSansMessage());
    const err = await apiGL('/api/gl/games/7/tenir/lancer', 'POST', {}).catch((e) => e);
    expect(err.message).not.toMatch(/requête|req-4f2a/);
  });

  test('le prof le garde (la console le montre en petit)', async () => {
    saveGlSession(PROF);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(reponseSansMessage());
    const err = await apiGL('/api/gl/games/7/tenir/lancer', 'POST', {}).catch((e) => e);
    expect(err.message).toBe('Erreur serveur (HTTP 500) [requête req-4f2a]');
    expect(err.requestId).toBe('req-4f2a');
  });
});
