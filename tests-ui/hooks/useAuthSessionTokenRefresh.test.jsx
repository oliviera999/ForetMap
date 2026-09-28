import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useAuthSession } from '../../src/hooks/useAuthSession';
import { api, getAuthToken, getStoredSession } from '../../src/services/api';

/**
 * CDG-28 — le jeton glissant (`refreshedToken` de `/api/auth/me`) ne doit plus être
 * écrasé par le jeton d'origine que `student.authToken` gardait en mémoire. Ici le module
 * `api` est RÉEL (stockage jsdom) : on vérifie le jeton effectivement envoyé par `api()`.
 */

const makeParams = () => ({
  studentRef: { current: null },
  setStudent: vi.fn(),
  setSessionUser: vi.fn(),
  setAuthClaims: vi.fn(),
  setSessionValidationError: vi.fn(),
  setProfilePromotion: vi.fn(),
  setToast: vi.fn(),
  setRoleViewMode: vi.fn(),
  setTab: vi.fn(),
  setShowStats: vi.fn(),
  setShowProfile: vi.fn(),
});

/** Jeton à l'allure d'un JWT (en-tête.charge.signature) portant les claims donnés. */
function fakeJwt(claims) {
  const b64 = (obj) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'HS256' })}.${b64(claims)}.sig`;
}

const OLD = fakeJwt({ sub: 'S1', iat: 1000, exp: 6400 });
const NEW = fakeJwt({ sub: 'S1', iat: 5000, exp: 10400 });

function mockFetchOk() {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => ({ ok: true }),
  });
}

/** Le jeton n'est stocké qu'une fois (`session.token`) : jamais dans la fiche élève brute. */
function rawStoredStudentToken() {
  return JSON.parse(localStorage.getItem('foretmap_session') || 'null')?.student?.authToken;
}

describe('useAuthSession — jeton glissant (CDG-28)', () => {
  beforeEach(() => {
    localStorage.clear();
    // Pas de fiche élève au montage : l'effet de restauration lancerait sinon un
    // `POST /api/students/register` réel (hors sujet ici).
    localStorage.setItem(
      'foretmap_session',
      JSON.stringify({ token: OLD, user: { id: 'S1', userType: 'student', displayName: 'Léa' } }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('après /api/auth/me → refreshedToken, tous les exemplaires et api() portent le nouveau jeton', async () => {
    const params = makeParams();
    params.studentRef.current = { id: 'S1', first_name: 'Léa', authToken: OLD };
    const { result } = renderHook(() => useAuthSession(params));
    localStorage.setItem(
      'foretmap_session',
      JSON.stringify({
        token: OLD,
        user: { id: 'S1', userType: 'student', displayName: 'Léa' },
        student: { id: 'S1', first_name: 'Léa' },
      }),
    );

    act(() =>
      result.current.mergeAuthMeResponse({
        auth: { userType: 'student', userId: 'S1' },
        refreshedToken: NEW,
      }),
    );

    expect(getAuthToken()).toBe(NEW);
    expect(getStoredSession()?.student?.authToken).toBe(NEW);
    expect(rawStoredStudentToken()).toBeUndefined();
    expect(localStorage.getItem('foretmap_auth_token')).toBeNull();
    // L'état React suit aussi : la ref et le setter reçoivent le jeton renouvelé.
    expect(params.studentRef.current.authToken).toBe(NEW);
    const updater = params.setStudent.mock.calls.at(-1)[0];
    expect(updater({ id: 'S1', authToken: OLD })).toMatchObject({ authToken: NEW });

    const fetchMock = mockFetchOk();
    await api('/api/stats/me/S1');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${NEW}`);
  });

  it('updateStudentSession (montage, « Mon profil ») ne réécrit jamais le jeton d’origine', async () => {
    const params = makeParams();
    // Session en mémoire encore sur l'ancien jeton, stockage déjà renouvelé.
    params.studentRef.current = { id: 'S1', first_name: 'Léa', authToken: OLD };
    localStorage.setItem(
      'foretmap_session',
      JSON.stringify({ token: NEW, user: { id: 'S1', userType: 'student' } }),
    );
    const { result } = renderHook(() => useAuthSession(params));

    // Réponse de `/api/students/register` (sans jeton) : scénario du rechargement.
    act(() => result.current.updateStudentSession({ id: 'S1', first_name: 'Léa', last_name: 'B' }));
    expect(getAuthToken()).toBe(NEW);
    expect(params.studentRef.current.authToken).toBe(NEW);
    expect(getStoredSession()?.student?.authToken).toBe(NEW);

    // Un appelant qui propose explicitement un jeton PLUS ANCIEN ne l'impose pas non plus.
    act(() => result.current.updateStudentSession({ id: 'S1', authToken: OLD }));
    expect(getAuthToken()).toBe(NEW);
    expect(params.studentRef.current.authToken).toBe(NEW);

    const fetchMock = mockFetchOk();
    await api('/api/stats/me/S1');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${NEW}`);
  });

  it('un jeton proposé plus récent (connexion, prise de contrôle) remplace bien le jeton courant', () => {
    const params = makeParams();
    const NEWER = fakeJwt({ sub: 'S1', iat: 9000, exp: 14400 });
    const { result } = renderHook(() => useAuthSession(params));
    act(() => result.current.updateStudentSession({ id: 'S1', authToken: NEWER }));
    expect(getAuthToken()).toBe(NEWER);
    expect(getStoredSession()?.student?.authToken).toBe(NEWER);
    expect(rawStoredStudentToken()).toBeUndefined();
  });
});
