import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const api = vi.fn();
const getAuthClaims = vi.fn();

vi.mock('../../src/services/api', () => ({
  api: (...args) => api(...args),
  getAuthClaims: (...args) => getAuthClaims(...args),
}));

const { useAuthTokenRenewal, shouldAskTokenRenewal } =
  await import('../../src/hooks/useAuthTokenRenewal');

const NOW_MS = 1_800_000_000_000;
const TTL = 5400;

/** Claims d'un jeton auquel il reste `remaining` secondes à l'instant `nowMs`. */
function claimsRemaining(remaining, nowMs = Date.now()) {
  const exp = Math.floor(nowMs / 1000) + remaining;
  return { iat: exp - TTL, exp };
}

describe('shouldAskTokenRenewal', () => {
  it('ne demande rien tant qu’il reste plus d’un tiers de la durée de vie', () => {
    expect(shouldAskTokenRenewal(claimsRemaining(TTL, NOW_MS), NOW_MS)).toBe(false);
    expect(shouldAskTokenRenewal(claimsRemaining(TTL / 2, NOW_MS), NOW_MS)).toBe(false);
  });

  it('demande la prolongation dans le dernier tiers', () => {
    expect(shouldAskTokenRenewal(claimsRemaining(TTL / 3 - 1, NOW_MS), NOW_MS)).toBe(true);
    expect(shouldAskTokenRenewal(claimsRemaining(60, NOW_MS), NOW_MS)).toBe(true);
  });

  it('ne demande rien pour un jeton absent, illisible ou déjà expiré', () => {
    expect(shouldAskTokenRenewal(null, NOW_MS)).toBe(false);
    expect(shouldAskTokenRenewal({}, NOW_MS)).toBe(false);
    expect(shouldAskTokenRenewal(claimsRemaining(-1, NOW_MS), NOW_MS)).toBe(false);
  });
});

describe('useAuthTokenRenewal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.mockResolvedValue({ auth: { userType: 'teacher' }, refreshedToken: 'tok-neuf' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('appelle /api/auth/me et fusionne la réponse quand l’échéance approche', async () => {
    getAuthClaims.mockReturnValue(claimsRemaining(300));
    const mergeAuthMeResponse = vi.fn();
    renderHook(() => useAuthTokenRenewal({ enabled: true, mergeAuthMeResponse }));

    await waitFor(() => expect(api).toHaveBeenCalledWith('/api/auth/me'));
    await waitFor(() => expect(mergeAuthMeResponse).toHaveBeenCalledTimes(1));
    expect(mergeAuthMeResponse.mock.calls[0][0]).toMatchObject({ refreshedToken: 'tok-neuf' });
  });

  it('n’appelle rien tant que le jeton est loin de son échéance', () => {
    // Horloge simulée : seuls ces cas ont besoin d'avancer le temps (aucune promesse à
    // attendre). `waitFor` et les timers simulés ne font pas bon ménage.
    vi.useFakeTimers();
    getAuthClaims.mockReturnValue(claimsRemaining(TTL));
    renderHook(() => useAuthTokenRenewal({ enabled: true, mergeAuthMeResponse: vi.fn() }));
    vi.advanceTimersByTime(300_000);
    expect(api).not.toHaveBeenCalled();
  });

  it('n’appelle rien sans session établie', () => {
    vi.useFakeTimers();
    getAuthClaims.mockReturnValue(claimsRemaining(60));
    renderHook(() => useAuthTokenRenewal({ enabled: false, mergeAuthMeResponse: vi.fn() }));
    vi.advanceTimersByTime(300_000);
    expect(api).not.toHaveBeenCalled();
  });

  it('survit à un échec réseau sans casser ni reboucler en rafale', async () => {
    getAuthClaims.mockReturnValue(claimsRemaining(300));
    api.mockRejectedValue(new Error('réseau'));
    const mergeAuthMeResponse = vi.fn();
    renderHook(() => useAuthTokenRenewal({ enabled: true, mergeAuthMeResponse }));

    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    expect(mergeAuthMeResponse).not.toHaveBeenCalled();
  });
});
