import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('../../src/gl/services/apiGL.js', () => ({ apiGL: vi.fn() }));

import { apiGL } from '../../src/gl/services/apiGL.js';
import { defaultTabForGlAuth } from '../../src/gl/utils/glAppShellHelpers.js';
import { useGlSessionState } from '../../src/gl/hooks/useGlSessionState.js';

function setup() {
  const deps = {
    updateSession: vi.fn(),
    setError: vi.fn(),
    setTab: vi.fn(),
    setGlViewMode: vi.fn(),
    setActiveGameId: vi.fn(),
  };
  const rendered = renderHook(() => useGlSessionState(deps));
  return { deps, ...rendered };
}

describe('useGlSessionState', () => {
  beforeEach(() => {
    vi.mocked(apiGL).mockReset();
  });

  it('applyGlImpersonation applique la session, la partie active et bascule sur la carte', () => {
    const { deps, result } = setup();
    const payload = {
      authToken: 'jwt-imp',
      auth: { userType: 'gl_player', userId: 7, gameId: 42 },
    };
    act(() => {
      result.current.applyGlImpersonation(payload);
    });
    expect(deps.setGlViewMode).toHaveBeenCalledWith('native');
    expect(deps.updateSession).toHaveBeenCalledWith({ token: 'jwt-imp', auth: payload.auth });
    expect(deps.setActiveGameId).toHaveBeenCalledWith(42);
    expect(deps.setTab).toHaveBeenCalledWith('maps');
    expect(deps.setError).toHaveBeenLastCalledWith('');
  });

  it('applyGlImpersonation ignore la partie active si gameId absent ou invalide', () => {
    const { deps, result } = setup();
    act(() => {
      result.current.applyGlImpersonation({
        authToken: 'jwt-imp',
        auth: { userType: 'gl_player', userId: 7 },
      });
    });
    expect(deps.setActiveGameId).not.toHaveBeenCalled();
    expect(deps.setTab).toHaveBeenCalledWith('maps');
  });

  it('applyGlImpersonation signale un payload invalide sans toucher la session', () => {
    const { deps, result } = setup();
    act(() => {
      result.current.applyGlImpersonation({ authToken: null, auth: null });
    });
    expect(deps.setError).toHaveBeenCalledWith('Réponse serveur invalide');
    expect(deps.updateSession).not.toHaveBeenCalled();
    expect(deps.setTab).not.toHaveBeenCalled();
    expect(deps.setGlViewMode).not.toHaveBeenCalled();
  });

  it('stopGlImpersonation restaure la session staff et son onglet par défaut', async () => {
    const restoredAuth = { userType: 'gl_admin', role: 'admin' };
    vi.mocked(apiGL).mockResolvedValueOnce({ authToken: 'jwt-staff', auth: restoredAuth });
    const { deps, result } = setup();
    await act(async () => {
      await result.current.stopGlImpersonation();
    });
    expect(apiGL).toHaveBeenCalledWith('/api/gl/auth/admin/impersonate/stop', 'POST');
    expect(deps.setGlViewMode).toHaveBeenCalledWith('native');
    expect(deps.updateSession).toHaveBeenCalledWith({ token: 'jwt-staff', auth: restoredAuth });
    expect(deps.setTab).toHaveBeenCalledWith(defaultTabForGlAuth(restoredAuth));
    expect(deps.setError).toHaveBeenLastCalledWith('');
  });

  it('stopGlImpersonation signale une réponse serveur invalide', async () => {
    vi.mocked(apiGL).mockResolvedValueOnce({});
    const { deps, result } = setup();
    await act(async () => {
      await result.current.stopGlImpersonation();
    });
    expect(deps.setError).toHaveBeenCalledWith('Réponse serveur invalide');
    expect(deps.updateSession).not.toHaveBeenCalled();
  });

  it('stopGlImpersonation remonte le message d’erreur API', async () => {
    vi.mocked(apiGL).mockRejectedValueOnce(new Error('session expirée'));
    const { deps, result } = setup();
    await act(async () => {
      await result.current.stopGlImpersonation();
    });
    expect(deps.setError).toHaveBeenCalledWith('session expirée');
  });
});
