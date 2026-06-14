import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useOauthRedirectSession } from '../../src/hooks/useOauthRedirectSession';

const apiMocks = {
  getAuthClaims: vi.fn(() => ({ permissions: ['teacher.access'] })),
  getStoredSession: vi.fn(() => ({ user: { id: 'u1' }, token: 't0' })),
  saveLegacyStudentSnapshot: vi.fn(),
  saveStoredSession: vi.fn(),
};
vi.mock('../../src/services/api', () => ({
  getAuthClaims: () => apiMocks.getAuthClaims(),
  getStoredSession: () => apiMocks.getStoredSession(),
  saveLegacyStudentSnapshot: (...a) => apiMocks.saveLegacyStudentSnapshot(...a),
  saveStoredSession: (...a) => apiMocks.saveStoredSession(...a),
}));

const encodePayload = (obj) => {
  const json = JSON.stringify(obj);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const renderWithHash = (hash) => {
  window.history.replaceState({}, '', `/app${hash}`);
  const handlers = {
    onToast: vi.fn(),
    setSessionUser: vi.fn(),
    setAuthClaims: vi.fn(),
    setIsTeacher: vi.fn(),
    setStudent: vi.fn(),
  };
  renderHook(() => useOauthRedirectSession(handlers));
  return handlers;
};

describe('useOauthRedirectSession', () => {
  beforeEach(() => {
    apiMocks.saveStoredSession.mockClear();
    apiMocks.saveLegacyStudentSnapshot.mockClear();
    localStorage.clear();
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/');
    vi.clearAllMocks();
  });

  it('ne fait rien sans fragment OAuth', () => {
    const h = renderWithHash('');
    expect(h.onToast).not.toHaveBeenCalled();
    expect(apiMocks.saveStoredSession).not.toHaveBeenCalled();
  });

  it('signale une erreur OAuth et nettoie l’URL', () => {
    const h = renderWithHash('#oauth_error=access_denied');
    expect(h.onToast).toHaveBeenCalledTimes(1);
    expect(apiMocks.saveStoredSession).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('');
  });

  it('reconstitue une session prof à partir du payload', () => {
    const hash = `#oauth=${encodePayload({
      type: 'teacher',
      token: 'jwt-teacher',
      auth: { canonicalUserId: 'T1', roleDisplayName: 'Prof' },
    })}`;
    const h = renderWithHash(hash);
    expect(apiMocks.saveStoredSession).toHaveBeenCalledTimes(1);
    const saved = apiMocks.saveStoredSession.mock.calls[0][0];
    expect(saved.token).toBe('jwt-teacher');
    expect(saved.user.userType).toBe('teacher');
    expect(localStorage.getItem('foretmap_auth_token')).toBe('jwt-teacher');
    expect(h.setIsTeacher).toHaveBeenCalledWith(true);
    expect(h.setAuthClaims).toHaveBeenCalled();
    expect(window.location.hash).toBe('');
  });

  it('reconstitue une session élève à partir du payload', () => {
    const hash = `#oauth=${encodePayload({
      type: 'student',
      student: { id: 'S1', authToken: 'jwt-student', first_name: 'Léa', last_name: 'B' },
    })}`;
    const h = renderWithHash(hash);
    expect(apiMocks.saveLegacyStudentSnapshot).toHaveBeenCalledTimes(1);
    expect(apiMocks.saveStoredSession).toHaveBeenCalledTimes(1);
    expect(h.setStudent).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'S1', authToken: 'jwt-student' }),
    );
    expect(h.setIsTeacher).toHaveBeenCalledWith(false);
  });

  it('toaste un message d’erreur sur payload illisible', () => {
    const h = renderWithHash('#oauth=not-valid-base64!!!');
    expect(h.onToast).toHaveBeenCalled();
    expect(apiMocks.saveStoredSession).not.toHaveBeenCalled();
  });
});
