import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  isGlTeamSession,
  readClassLinkTokenFromUrl,
  normalizeClassCode,
  buildTeamSession,
  absoluteClassLinkUrl,
} from '../../src/gl/utils/glTeamSession.js';
import {
  getGlSession,
  getGlToken,
  saveGlSession,
  clearGlSession,
  apiGL,
  setGlActingPlayer,
  getGlActingPlayer,
} from '../../src/gl/services/apiGL.js';

describe('session d’équipe (tablette de classe)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  test('lecture du QR, code normalisé, session construite', () => {
    expect(readClassLinkTokenFromUrl('?classe=abc_DEF-123')).toBe('abc_DEF-123');
    expect(readClassLinkTokenFromUrl('?projection=x')).toBeNull();
    expect(normalizeClassCode(' abcd-ef gh ')).toBe('ABCDEFGH');
    expect(absoluteClassLinkUrl('gl.html?classe=t', 'https://exemple.test/jeu/gl.html?x=1')).toBe(
      'https://exemple.test/jeu/gl.html?classe=t',
    );
    const session = buildTeamSession({
      token: 't',
      gameId: 7,
      teamId: 12,
      teamName: 'Licornes A',
      className: 'Sixième B',
    });
    expect(isGlTeamSession(session.auth)).toBe(true);
    expect(session.auth.permissions).toEqual(['gl.read', 'gl.action.request']);
    expect(buildTeamSession({ token: 't', gameId: 7 })).toBeNull();
    expect(isGlTeamSession({ userType: 'gl_guest' })).toBe(false);
    expect(isGlTeamSession({ userType: 'gl_player', teamSession: { teamId: 1 } })).toBe(false);
  });

  test('la session d’équipe vit dans l’onglet et ne recouvre pas un compte', () => {
    saveGlSession({ token: 'compte', auth: { userType: 'gl_player', userId: '4' } });
    expect(getGlToken()).toBe('compte');

    saveGlSession(buildTeamSession({ token: 'equipe', gameId: 7, teamId: 12 }));
    expect(getGlToken()).toBe('equipe');
    expect(JSON.parse(localStorage.getItem('gl_session')).token).toBe('compte');
    expect(JSON.parse(sessionStorage.getItem('gl_team_session')).token).toBe('equipe');

    // Quitter la session d'équipe rend la main au compte, sans le déconnecter.
    clearGlSession();
    expect(sessionStorage.getItem('gl_team_session')).toBeNull();
    expect(getGlToken()).toBe('compte');
    clearGlSession();
    expect(getGlSession()).toBeNull();
  });

  test('« Qui agit ? » : la tablette n’annonce l’élève qu’au Marché, jamais avec un compte', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ items: [] }),
      text: async () => '{"items":[]}',
    });
    const entetes = () => fetchMock.mock.calls.at(-1)[1].headers;
    saveGlSession(buildTeamSession({ token: 'equipe', gameId: 7, teamId: 12 }));
    setGlActingPlayer(41);
    expect(getGlActingPlayer()).toBe(41);
    await apiGL('/api/gl/market/annonces');
    expect(entetes()['X-GL-On-Behalf-Of']).toBe('41');
    await apiGL('/api/gl/games/7');
    expect(entetes()['X-GL-On-Behalf-Of']).toBeUndefined();
    setGlActingPlayer(null);
    await apiGL('/api/gl/market/annonces');
    expect(entetes()['X-GL-On-Behalf-Of']).toBeUndefined();
    // Avec un compte d'élève, on n'agit que pour soi : aucun en-tête.
    setGlActingPlayer(41);
    saveGlSession({ token: 'compte', auth: { userType: 'gl_player', userId: '4' } });
    await apiGL('/api/gl/market/annonces');
    expect(entetes()['X-GL-On-Behalf-Of']).toBeUndefined();
    setGlActingPlayer(null);
    fetchMock.mockRestore();
  });

  test('une connexion avec un compte remplace la session d’équipe de l’onglet', () => {
    saveGlSession(buildTeamSession({ token: 'equipe', gameId: 7, teamId: 12 }));
    saveGlSession({ token: 'compte', auth: { userType: 'gl_player', userId: '4' } });
    expect(sessionStorage.getItem('gl_team_session')).toBeNull();
    expect(getGlToken()).toBe('compte');
  });
});
