import { describe, test, expect, beforeEach } from 'vitest';
import { buildProjectionSession, isGlProjection } from '../../src/gl/utils/glGuestMode.js';
import { buildTeamSession } from '../../src/gl/utils/glTeamSession.js';
import {
  getGlSession,
  getGlToken,
  saveGlSession,
  clearGlSession,
} from '../../src/gl/services/apiGL.js';

/** Jeton de projection factice, construit à l'exécution (aucune valeur en clair dans le dépôt). */
function jetonProjection(gameId = 9) {
  const b64 = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '');
  return [
    b64({ alg: 'none' }),
    b64({ userType: 'gl_guest', userId: 'projection', projection: { gameId } }),
    'signature',
  ].join('.');
}

/**
 * Audit du 19/11/2026, J3 — le lien de projection s'ouvre souvent sur le poste du prof (poste
 * unique relié au vidéoprojecteur). Sa session vit dans l'onglet de projection, comme la session
 * d'équipe : elle ne remplace jamais le compte ouvert dans `localStorage`, partagé entre onglets.
 */
describe('session de projection (J3)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  test('ne remplace pas la session du prof et reste dans l’onglet', () => {
    saveGlSession({ token: 'prof', auth: { userType: 'gl_mj', displayName: 'MJ' } });
    const projection = buildProjectionSession(jetonProjection(9));
    expect(isGlProjection(projection.auth)).toBe(true);

    saveGlSession(projection);

    // Le compte du prof, lu par ses autres onglets, n'a pas bougé.
    const stockee = JSON.parse(localStorage.getItem('gl_session'));
    expect(stockee.token).toBe('prof');
    expect(stockee.auth.displayName).toBe('MJ');
    // L'onglet de projection, lui, lit bien sa session — y compris après un F5.
    expect(getGlToken()).toBe(projection.token);
    expect(isGlProjection(getGlSession().auth)).toBe(true);
    expect(Object.keys(sessionStorage)).toHaveLength(1);
  });

  test('quitter la projection rend la main au compte, sans le déconnecter', () => {
    saveGlSession({ token: 'prof', auth: { userType: 'gl_mj' } });
    saveGlSession(buildProjectionSession(jetonProjection(9)));
    clearGlSession();
    expect(getGlToken()).toBe('prof');
    expect(Object.keys(sessionStorage)).toHaveLength(0);
  });

  test('sans compte derrière, la projection n’écrit rien dans le stockage partagé', () => {
    saveGlSession(buildProjectionSession(jetonProjection(4)));
    expect(localStorage.getItem('gl_session')).toBeNull();
    expect(Number(getGlSession().auth.projection.gameId)).toBe(4);
  });

  test('une session d’équipe ouverte ensuite dans l’onglet remplace la projection, pas l’inverse mêlé', () => {
    saveGlSession(buildProjectionSession(jetonProjection(4)));
    saveGlSession(buildTeamSession({ token: 'equipe', gameId: 4, teamId: 12 }));
    const session = getGlSession();
    expect(session.token).toBe('equipe');
    expect(session.auth.projection).toBeUndefined();
    // Et une projection rouverte ne garde rien de la session d'équipe.
    saveGlSession(buildProjectionSession(jetonProjection(4)));
    expect(getGlSession().auth.teamSession).toBeUndefined();
    expect(isGlProjection(getGlSession().auth)).toBe(true);
  });

  test('une connexion avec un compte remplace la projection de l’onglet', () => {
    saveGlSession(buildProjectionSession(jetonProjection(4)));
    saveGlSession({ token: 'eleve', auth: { userType: 'gl_player', userId: '4' } });
    expect(getGlToken()).toBe('eleve');
    expect(Object.keys(sessionStorage)).toHaveLength(0);
  });
});
