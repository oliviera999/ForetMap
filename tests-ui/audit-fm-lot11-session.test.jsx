import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import {
  isAuthMeResponseForCurrentSession,
  SESSION_CLOSED_ELSEWHERE_MESSAGE,
  useAuthSession,
} from '../src/hooks/useAuthSession';
import { useSessionWindowSync } from '../src/hooks/useSessionWindowSync';
import {
  api,
  getStoredSession,
  getStoredSessionAccountKey,
  sessionAccountKeyFromRaw,
} from '../src/services/api';

/**
 * Audit ForetMap du 19/11/2026, lot 11 — F1 (changement de compte dans un autre onglet) et
 * F2 (réponse `/api/auth/me` tardive qui défait une déconnexion). Module `api` RÉEL : le
 * stockage jsdom joue le rôle du `localStorage` partagé entre onglets.
 */

const SESSION_KEY = 'foretmap_session';

/** Jeton à l'allure d'un JWT, construit à l'exécution (garde-fou des fichiers sensibles). */
function fakeJwt(claims) {
  const b64 = (obj) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'HS256' })}.${b64(claims)}.sig`;
}

const ADMIN_TOKEN = fakeJwt({ userType: 'teacher', userId: 'T1', iat: 1000 });
const ADMIN_TOKEN_RENEWED = fakeJwt({ userType: 'teacher', userId: 'T1', iat: 2000 });
const STUDENT_TOKEN = fakeJwt({ userType: 'student', userId: 'S9', iat: 1500 });

function sessionJson(token, user) {
  return JSON.stringify({ token, user });
}
const ADMIN_SESSION = sessionJson(ADMIN_TOKEN, {
  id: 'T1',
  userType: 'teacher',
  displayName: 'admin.test',
});
const STUDENT_SESSION = sessionJson(STUDENT_TOKEN, {
  id: 'S9',
  userType: 'student',
  displayName: 'Léa',
});

/** Simule l'écriture d'un AUTRE onglet : le stockage change, puis l'évènement `storage`. */
function writeFromOtherTab(newValue) {
  const oldValue = localStorage.getItem(SESSION_KEY);
  if (newValue == null) localStorage.removeItem(SESSION_KEY);
  else localStorage.setItem(SESSION_KEY, newValue);
  window.dispatchEvent(new StorageEvent('storage', { key: SESSION_KEY, oldValue, newValue }));
}

function renderWindowSync() {
  const params = {
    setAuthClaims: vi.fn(),
    setIsTeacher: vi.fn(),
    setSessionUser: vi.fn(),
    setToast: vi.fn(),
    forceLogout: vi.fn(),
    reloadPage: vi.fn(),
  };
  const hook = renderHook(() => useSessionWindowSync(params));
  return { params, ...hook };
}

const makeAuthParams = () => ({
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

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('F1 — session modifiée dans un autre onglet', () => {
  it('identité de compte : un jeton renouvelé garde la même, un autre compte non', () => {
    expect(sessionAccountKeyFromRaw(ADMIN_SESSION)).toBe('teacher:T1');
    expect(
      sessionAccountKeyFromRaw(sessionJson(ADMIN_TOKEN_RENEWED, { id: 'T1', userType: 'teacher' })),
    ).toBe('teacher:T1');
    expect(sessionAccountKeyFromRaw(STUDENT_SESSION)).toBe('student:S9');
    expect(sessionAccountKeyFromRaw(null)).toBe('');
    expect(sessionAccountKeyFromRaw('{pas du json')).toBe('');
  });

  it('déconnexion puis connexion d’un élève dans l’onglet A : l’onglet B recharge', () => {
    localStorage.setItem(SESSION_KEY, ADMIN_SESSION);
    const { params } = renderWindowSync();
    act(() => writeFromOtherTab(STUDENT_SESSION));
    expect(params.reloadPage).toHaveBeenCalledTimes(1);
    expect(params.forceLogout).not.toHaveBeenCalled();
    // Le stockage garde la session de l'élève (aucune écriture de l'onglet B).
    expect(getStoredSessionAccountKey()).toBe('student:S9');
  });

  it('simple déconnexion dans l’onglet A : B ferme sa session sans toucher au stockage', () => {
    localStorage.setItem(SESSION_KEY, ADMIN_SESSION);
    const { params } = renderWindowSync();
    act(() => writeFromOtherTab(null));
    expect(params.forceLogout).toHaveBeenCalledWith({
      message: SESSION_CLOSED_ELSEWHERE_MESSAGE,
      keepStorage: true,
    });
    expect(params.reloadPage).not.toHaveBeenCalled();
  });

  it('jeton renouvelé dans l’onglet A (même compte) : rien dans B', () => {
    localStorage.setItem(SESSION_KEY, ADMIN_SESSION);
    const { params } = renderWindowSync();
    act(() =>
      writeFromOtherTab(
        sessionJson(ADMIN_TOKEN_RENEWED, { id: 'T1', userType: 'teacher', displayName: 'a' }),
      ),
    );
    expect(params.forceLogout).not.toHaveBeenCalled();
    expect(params.reloadPage).not.toHaveBeenCalled();
  });

  it('onglet B sur l’écran de connexion : une connexion ailleurs ne le recharge pas', () => {
    const { params } = renderWindowSync();
    act(() => writeFromOtherTab(STUDENT_SESSION));
    act(() => writeFromOtherTab(null));
    expect(params.reloadPage).not.toHaveBeenCalled();
    expect(params.forceLogout).not.toHaveBeenCalled();
  });

  it('après une déconnexion ailleurs, un 401 reçu sans jeton ferme la session de B', async () => {
    localStorage.setItem(SESSION_KEY, ADMIN_SESSION);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => 'application/json' },
      json: async () => ({ error: 'Authentification requise' }),
      text: async () => JSON.stringify({ error: 'Authentification requise' }),
    });
    const { params } = renderWindowSync();
    // B a déjà envoyé son jeton (session vivante dans cette fenêtre).
    await api('/api/tasks').catch(() => {});
    params.forceLogout.mockClear();
    // A se déconnecte ; on simule un onglet B qui n'a pas (encore) traité l'évènement storage.
    localStorage.removeItem(SESSION_KEY);
    await api('/api/tasks').catch(() => {});
    expect(params.forceLogout).toHaveBeenCalledWith({
      message: SESSION_CLOSED_ELSEWHERE_MESSAGE,
      keepStorage: true,
    });
    // Une seule fois : le second 401 sans jeton ne redéconnecte pas.
    params.forceLogout.mockClear();
    await api('/api/tasks').catch(() => {});
    expect(params.forceLogout).not.toHaveBeenCalled();
  });
});

describe('F2 — réponse /api/auth/me tardive', () => {
  it('isAuthMeResponseForCurrentSession : sans jeton ou autre compte → faux', () => {
    const d = { auth: { userType: 'teacher', userId: 'T1' } };
    expect(isAuthMeResponseForCurrentSession(d, null)).toBe(false);
    expect(isAuthMeResponseForCurrentSession(d, { userType: 'teacher', userId: 'T1' })).toBe(true);
    expect(isAuthMeResponseForCurrentSession(d, { userType: 'student', userId: 'S9' })).toBe(false);
  });

  it('déconnexion pendant la requête : ni droits reposés, ni jeton réécrit', () => {
    localStorage.setItem(SESSION_KEY, ADMIN_SESSION);
    const params = makeAuthParams();
    const { result } = renderHook(() => useAuthSession(params));
    // Clic sur « Déconnexion » pendant que /api/auth/me est en vol.
    act(() => result.current.forceLogout({ message: 'bye' }));
    params.setAuthClaims.mockClear();
    params.setSessionUser.mockClear();
    let applied;
    act(() => {
      applied = result.current.mergeAuthMeResponse({
        auth: { userType: 'teacher', userId: 'T1', permissions: ['teacher.access'] },
        refreshedToken: ADMIN_TOKEN_RENEWED,
      });
    });
    expect(applied).toBe(false);
    expect(params.setAuthClaims).not.toHaveBeenCalled();
    expect(params.setSessionUser).not.toHaveBeenCalled();
    expect(getStoredSession()).toBeNull();
  });

  it('un élève s’est connecté entre-temps : la réponse prof ne lui donne pas ses droits', () => {
    localStorage.setItem(SESSION_KEY, STUDENT_SESSION);
    const params = makeAuthParams();
    const { result } = renderHook(() => useAuthSession(params));
    act(() => {
      result.current.mergeAuthMeResponse({
        auth: { userType: 'teacher', userId: 'T1', permissions: ['teacher.access'] },
        refreshedToken: ADMIN_TOKEN_RENEWED,
      });
    });
    expect(params.setAuthClaims).not.toHaveBeenCalled();
    expect(getStoredSessionAccountKey()).toBe('student:S9');
  });

  it('réponse du compte courant : toujours appliquée (jeton renouvelé compris)', () => {
    localStorage.setItem(SESSION_KEY, ADMIN_SESSION);
    const params = makeAuthParams();
    const { result } = renderHook(() => useAuthSession(params));
    let applied;
    act(() => {
      applied = result.current.mergeAuthMeResponse({
        auth: { userType: 'teacher', userId: 'T1', permissions: ['teacher.access'] },
        refreshedToken: ADMIN_TOKEN_RENEWED,
      });
    });
    expect(applied).toBe(true);
    expect(params.setAuthClaims).toHaveBeenCalled();
    expect(getStoredSession()?.token).toBe(ADMIN_TOKEN_RENEWED);
  });
});
