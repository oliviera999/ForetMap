import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

import { useAuthSession } from '../../src/hooks/useAuthSession';

const { AccountDeletedErrorMock } = vi.hoisted(() => {
  class AccountDeletedErrorMock extends Error {
    constructor() {
      super('deleted');
      this.deleted = true;
    }
  }
  return { AccountDeletedErrorMock };
});

const apiMocks = {
  api: vi.fn(),
  getAuthClaims: vi.fn(() => null),
  getAuthToken: vi.fn(() => null),
  getStoredSession: vi.fn(() => null),
  saveLegacyStudentSnapshot: vi.fn(),
  saveStoredSession: vi.fn(),
  clearStoredSession: vi.fn(),
  isElevatedJwt: vi.fn(() => false),
};
vi.mock('../../src/services/api', () => ({
  api: (...a) => apiMocks.api(...a),
  AccountDeletedError: AccountDeletedErrorMock,
  getAuthClaims: () => apiMocks.getAuthClaims(),
  getAuthToken: () => apiMocks.getAuthToken(),
  getStoredSession: () => apiMocks.getStoredSession(),
  saveLegacyStudentSnapshot: (...a) => apiMocks.saveLegacyStudentSnapshot(...a),
  saveStoredSession: (...a) => apiMocks.saveStoredSession(...a),
  clearStoredSession: (...a) => apiMocks.clearStoredSession(...a),
  isElevatedJwt: (t) => apiMocks.isElevatedJwt(t),
}));

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

const renderAuthSession = () => {
  const params = makeParams();
  const rendered = renderHook(() => useAuthSession(params));
  return { params, result: rendered.result };
};

describe('useAuthSession', () => {
  beforeEach(() => {
    localStorage.clear();
    apiMocks.api.mockResolvedValue({});
  });

  afterEach(() => {
    vi.clearAllMocks();
    apiMocks.getAuthClaims.mockReturnValue(null);
    apiMocks.getAuthToken.mockReturnValue(null);
    apiMocks.getStoredSession.mockReturnValue(null);
    apiMocks.isElevatedJwt.mockReturnValue(false);
  });

  it('restauration au montage : session n3beur locale revalidée côté serveur', async () => {
    localStorage.setItem('foretmap_student', JSON.stringify({ id: 'S1', first_name: 'Léa' }));
    apiMocks.api.mockResolvedValue({ id: 'S1', first_name: 'Léa', last_name: 'B' });
    const { params } = renderAuthSession();
    expect(params.setStudent).toHaveBeenCalledWith(expect.objectContaining({ id: 'S1' }));
    await waitFor(() =>
      expect(apiMocks.api).toHaveBeenCalledWith('/api/students/register', 'POST', {
        studentId: 'S1',
      }),
    );
  });

  it('restauration au montage : session user seule (sans n3beur) réhydratée', () => {
    apiMocks.getStoredSession.mockReturnValue({ user: { id: 'T1', userType: 'teacher' } });
    const { params } = renderAuthSession();
    expect(params.setSessionUser).toHaveBeenCalledWith({ id: 'T1', userType: 'teacher' });
    expect(apiMocks.api).not.toHaveBeenCalled();
  });

  it('forceLogout : purge la session et réinitialise les états', () => {
    const { params, result } = renderAuthSession();
    act(() => result.current.forceLogout());
    expect(apiMocks.clearStoredSession).toHaveBeenCalledTimes(1);
    expect(params.setStudent).toHaveBeenCalledWith(null);
    expect(params.setSessionUser).toHaveBeenCalledWith(null);
    expect(params.setAuthClaims).toHaveBeenCalledWith(null);
    expect(params.setSessionValidationError).toHaveBeenCalledWith(false);
    expect(params.setProfilePromotion).toHaveBeenCalledWith(null);
    expect(params.setToast).toHaveBeenCalledWith('Votre compte a été supprimé par un responsable.');
  });

  it('updateStudentSession : fusionne avec la session précédente et persiste', () => {
    const { params, result } = renderAuthSession();
    params.studentRef.current = { id: 'S1', avatar_path: '/a.png', auth: { roleSlug: 'eleve' } };
    act(() => result.current.updateStudentSession({ id: 'S1', first_name: 'Léa' }));
    const merged = params.studentRef.current;
    expect(merged).toMatchObject({
      id: 'S1',
      first_name: 'Léa',
      avatar_path: '/a.png',
      auth: { roleSlug: 'eleve' },
    });
    expect(params.setStudent).toHaveBeenCalledWith(merged);
    expect(apiMocks.saveLegacyStudentSnapshot).toHaveBeenCalledWith(merged);
    expect(apiMocks.saveStoredSession).toHaveBeenCalledWith(
      expect.objectContaining({ student: merged }),
    );
    expect(params.setSessionValidationError).toHaveBeenCalledWith(false);
  });

  it('updateStudentSession : un jeton élevé (PIN) n’est pas écrasé par le JWT élève tardif', () => {
    const { result } = renderAuthSession();
    apiMocks.getAuthToken.mockReturnValue('jwt-eleve-eleve');
    apiMocks.isElevatedJwt.mockImplementation((t) => t === 'jwt-eleve-eleve');
    act(() => result.current.updateStudentSession({ id: 'S1', authToken: 'jwt-basique' }));
    const saved = apiMocks.saveStoredSession.mock.calls.at(-1)[0];
    expect(saved.token).toBe('jwt-eleve-eleve');
  });

  it('validateStudentSession : erreur réseau → drapeau session non vérifiée + toast', async () => {
    const { params, result } = renderAuthSession();
    const err = new Error('boom');
    apiMocks.api.mockRejectedValue(err);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(() => result.current.validateStudentSession({ id: 'S1' }));
    expect(params.setSessionValidationError).toHaveBeenCalledWith(true);
    expect(params.setToast).toHaveBeenCalledWith(
      'Connexion instable: session n3beur non vérifiée.',
    );
    spy.mockRestore();
  });

  it('validateStudentSession : compte supprimé → forceLogout', async () => {
    const { params, result } = renderAuthSession();
    apiMocks.api.mockRejectedValue(new AccountDeletedErrorMock());
    await act(() => result.current.validateStudentSession({ id: 'S1' }));
    expect(apiMocks.clearStoredSession).toHaveBeenCalledTimes(1);
    expect(params.setToast).toHaveBeenCalledWith('Votre compte a été supprimé par un responsable.');
    expect(params.setSessionValidationError).not.toHaveBeenCalledWith(true);
  });

  it('mergeAuthMeResponse : refreshedToken persisté et claims relus (sauf régression d’élévation)', () => {
    const { params, result } = renderAuthSession();
    apiMocks.getAuthClaims.mockReturnValue({ permissions: ['teacher.access'] });
    apiMocks.getStoredSession.mockReturnValue({ token: 'old' });
    act(() =>
      result.current.mergeAuthMeResponse({
        auth: { userType: 'teacher', canonicalUserId: 'T1', roleDisplayName: 'Prof' },
        refreshedToken: ' jwt-neuf ',
      }),
    );
    expect(localStorage.getItem('foretmap_auth_token')).toBe('jwt-neuf');
    expect(apiMocks.saveStoredSession).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'jwt-neuf' }),
    );
    expect(params.setAuthClaims).toHaveBeenCalledWith({ permissions: ['teacher.access'] });
    const updater = params.setSessionUser.mock.calls.at(-1)[0];
    expect(updater(null)).toMatchObject({ id: 'T1', userType: 'teacher', displayName: 'Prof' });
  });

  it('mergeAuthMeResponse : promotion et drapeaux participation fusionnés côté n3beur', () => {
    const { params, result } = renderAuthSession();
    act(() =>
      result.current.mergeAuthMeResponse(
        {
          auth: { userType: 'student', userId: 'S1' },
          autoProfilePromotion: { to: 'n3pro' },
          forumParticipate: false,
        },
        { studentIdForMatch: 'S1' },
      ),
    );
    expect(params.setProfilePromotion).toHaveBeenCalledWith({ to: 'n3pro' });
    const updater = params.setStudent.mock.calls.at(-1)[0];
    expect(updater({ id: 'S1' })).toMatchObject({ id: 'S1', forumParticipate: false });
    expect(updater({ id: 'S2' })).toEqual({ id: 'S2' });
  });

  it('handleAdminImpersonationApplied (profil prof) : jeton posé, session prof, retour carte', () => {
    const { params, result } = renderAuthSession();
    localStorage.setItem('foretmap_student', 'x');
    act(() =>
      result.current.handleAdminImpersonationApplied({
        authToken: 'jwt-imp',
        auth: { userType: 'teacher', canonicalUserId: 'T9', roleDisplayName: 'Prof' },
        profile: { first_name: 'Ana', last_name: 'K' },
      }),
    );
    expect(localStorage.getItem('foretmap_auth_token')).toBe('jwt-imp');
    expect(localStorage.getItem('foretmap_teacher_token')).toBe('jwt-imp');
    expect(localStorage.getItem('foretmap_student')).toBeNull();
    expect(apiMocks.saveStoredSession).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'jwt-imp',
        user: expect.objectContaining({ id: 'T9', displayName: 'Ana K' }),
      }),
    );
    expect(params.setStudent).toHaveBeenCalledWith(null);
    expect(params.setRoleViewMode).toHaveBeenCalledWith('native');
    expect(params.setTab).toHaveBeenCalledWith('map');
    expect(params.setShowStats).toHaveBeenCalledWith(false);
    expect(params.setShowProfile).toHaveBeenCalledWith(false);
  });

  it('stopAdminImpersonation : restaure le compte admin et repasse sur la carte', async () => {
    const { params, result } = renderAuthSession();
    apiMocks.api.mockResolvedValue({
      authToken: 'jwt-admin',
      auth: { canonicalUserId: 'A1', roleDisplayName: 'Admin' },
    });
    await act(() => result.current.stopAdminImpersonation());
    expect(apiMocks.api).toHaveBeenCalledWith('/api/auth/admin/impersonate/stop', 'POST');
    expect(localStorage.getItem('foretmap_auth_token')).toBe('jwt-admin');
    expect(params.setStudent).toHaveBeenCalledWith(null);
    expect(params.setAuthClaims).toHaveBeenCalled();
    expect(params.setTab).toHaveBeenCalledWith('map');
    expect(params.setToast).toHaveBeenCalledWith(
      'Vous êtes reconnecté avec votre compte administrateur.',
    );
  });

  it('stopAdminImpersonation : réponse sans jeton → toast d’erreur, aucun état touché', async () => {
    const { params, result } = renderAuthSession();
    apiMocks.api.mockResolvedValue({});
    await act(() => result.current.stopAdminImpersonation());
    expect(params.setToast).toHaveBeenCalledWith('Réponse serveur invalide');
    expect(params.setStudent).not.toHaveBeenCalled();
  });
});
