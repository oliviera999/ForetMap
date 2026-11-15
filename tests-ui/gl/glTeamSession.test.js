import { describe, test, expect, beforeEach } from 'vitest';
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

  test('une connexion avec un compte remplace la session d’équipe de l’onglet', () => {
    saveGlSession(buildTeamSession({ token: 'equipe', gameId: 7, teamId: 12 }));
    saveGlSession({ token: 'compte', auth: { userType: 'gl_player', userId: '4' } });
    expect(sessionStorage.getItem('gl_team_session')).toBeNull();
    expect(getGlToken()).toBe('compte');
  });
});
