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
  apiGLAvecJeton,
  getGlEtatVersion,
  resetGlEtatVersions,
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

  test('version d’état : lue dans l’état de la partie, renvoyée avec chaque geste, jamais avec une lecture', async () => {
    resetGlEtatVersions();
    let corps = {};
    let statut = 200;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
      ok: statut < 400,
      status: statut,
      headers: { get: () => 'application/json' },
      json: async () => corps,
      text: async () => JSON.stringify(corps),
    }));
    const entetes = () => fetchMock.mock.calls.at(-1)[1].headers;
    saveGlSession(buildTeamSession({ token: 'equipe', gameId: 7, teamId: 12 }));

    // Avant toute lecture : aucun en-tête (le serveur accepte, comme pour un ancien écran).
    await apiGL('/api/gl/games/7/tenir/lancer', 'POST', {});
    expect(entetes()['X-GL-Etat-Version']).toBeUndefined();

    corps = { tenir: { equipe: { gameId: 7, teamId: 12, version: 4, main: null } } };
    await apiGL('/api/gl/games/7');
    expect(entetes()['X-GL-Etat-Version']).toBeUndefined();
    expect(getGlEtatVersion(7)).toBe(4);

    // Le geste part avec la version vue ; sa réponse rend la suivante.
    corps = { ok: true, etatVersion: { gameId: 7, teamId: 12, version: 5 } };
    await apiGL('/api/gl/games/7/chasse/fouiller', 'POST', { x: 0.1, y: 0.2 });
    expect(entetes()['X-GL-Etat-Version']).toBe('4');
    expect(getGlEtatVersion(7)).toBe(5);
    // Une autre partie, le Marché, une lecture : jamais d'en-tête.
    for (const [chemin, methode] of [
      ['/api/gl/games/8/tenir/lancer', 'POST'],
      ['/api/gl/market/dons', 'POST'],
      ['/api/gl/games/7/chasse', 'GET'],
    ]) {
      await apiGL(chemin, methode, methode === 'GET' ? null : {});
      expect(entetes()['X-GL-Etat-Version']).toBeUndefined();
    }
    // Plus aucun « au nom de » : le Marché passe par le compte de chacun.
    expect(entetes()['X-GL-On-Behalf-Of']).toBeUndefined();

    // État périmé : l'erreur porte son code, et les écrans sont prévenus pour recharger.
    const entendus = [];
    const ecoute = (evt) => entendus.push(evt.detail);
    window.addEventListener('gl:equipe-etat', ecoute);
    statut = 409;
    corps = {
      error: 'L’équipe a déjà joué ce geste. Voici où vous en êtes.',
      code: 'ETAT_PERIME',
      etatVersion: { gameId: 7, teamId: 12, version: 6 },
    };
    await expect(apiGL('/api/gl/games/7/tenir/lancer', 'POST', {})).rejects.toMatchObject({
      status: 409,
      code: 'ETAT_PERIME',
      message: 'L’équipe a déjà joué ce geste. Voici où vous en êtes.',
    });
    window.removeEventListener('gl:equipe-etat', ecoute);
    expect(entendus).toEqual([
      {
        code: 'ETAT_PERIME',
        message: 'L’équipe a déjà joué ce geste. Voici où vous en êtes.',
        gameId: 7,
      },
    ]);
    // La version rendue par le serveur est retenue : l'écran recharge, le geste suivant part de
    // l'état courant.
    expect(getGlEtatVersion(7)).toBe(6);
    // Réponse à une question déjà à l'écran : le refus reste silencieux (elle repartira une fois).
    corps = { ...corps, etatVersion: { gameId: 7, teamId: 12, version: 7 } };
    const entendusAvant = entendus.length;
    window.addEventListener('gl:equipe-etat', ecoute);
    await expect(
      apiGL('/api/gl/games/7/qcm/answer', 'POST', {}, { perimeSilencieux: true }),
    ).rejects.toMatchObject({ code: 'ETAT_PERIME' });
    window.removeEventListener('gl:equipe-etat', ecoute);
    expect(entendus.length).toBe(entendusAvant);
    expect(getGlEtatVersion(7)).toBe(7);
    fetchMock.mockRestore();
    resetGlEtatVersions();
  });

  test('demande d’appareil : lue avec le jeton de la demande, sans toucher à la session', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ statut: 'en_attente' }),
      text: async () => '{"statut":"en_attente"}',
    });
    saveGlSession({ token: 'compte', auth: { userType: 'gl_player', userId: '4' } });
    const etat = await apiGLAvecJeton('/api/gl/class-link/demande', 'jeton-de-la-demande');
    expect(etat).toEqual({ statut: 'en_attente' });
    expect(fetchMock.mock.calls.at(-1)[1].headers.Authorization).toBe('Bearer jeton-de-la-demande');
    expect(getGlToken()).toBe('compte');
    fetchMock.mockRestore();
  });

  test('une connexion avec un compte remplace la session d’équipe de l’onglet', () => {
    saveGlSession(buildTeamSession({ token: 'equipe', gameId: 7, teamId: 12 }));
    saveGlSession({ token: 'compte', auth: { userType: 'gl_player', userId: '4' } });
    expect(sessionStorage.getItem('gl_team_session')).toBeNull();
    expect(getGlToken()).toBe('compte');
  });
});
