// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * G2 (audit stabilité/perf 2026-09) — le refetch de brouillon déclenché par
 * `gl:spell_cast:draft` (émis à toute la partie) est étalé via `jitteredRefreshDelay`,
 * comme les autres refetchs temps réel.
 */

function createFakeSocket() {
  const handlers = new Map();
  return {
    connected: false,
    disconnect: vi.fn(),
    close: vi.fn(),
    emit: vi.fn(),
    on: vi.fn((event, fn) => handlers.set(event, fn)),
    off: vi.fn(),
    fire(event, payload) {
      const fn = handlers.get(event);
      if (fn) fn(payload);
    },
  };
}

let fakeSocket;

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => fakeSocket),
}));

const apiGLMock = vi.fn(async () => ({ draft: { id: 5, status: 'draft' } }));
vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGLMock(...args),
}));

const JITTERED_DELAY_MS = 250;
const jitteredRefreshDelayMock = vi.fn(() => JITTERED_DELAY_MS);
vi.mock('../../src/utils/realtimeRefreshDelay', () => ({
  jitteredRefreshDelay: (...args) => jitteredRefreshDelayMock(...args),
  RT_REFRESH_JITTER_MS: 600,
}));

import { io } from 'socket.io-client';
import { useGLSpellCast } from '../../src/gl/hooks/useGLSpellCast.js';
import { resetGlSocketClientForTests } from '../../src/gl/realtime/glSocketClient.js';

function mountHook() {
  return renderHook(() =>
    useGLSpellCast({ token: 'jeton-test', gameId: 3, enabled: true, onCastComplete: vi.fn() }),
  );
}

beforeEach(() => {
  fakeSocket = createFakeSocket();
  apiGLMock.mockClear();
  jitteredRefreshDelayMock.mockClear();
  io.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  resetGlSocketClientForTests();
});

describe('useGLSpellCast — étalement du refetch de brouillon', () => {
  it('programme refreshDraft avec le délai jitteré quand l’événement ne porte pas le brouillon', async () => {
    const { result, unmount } = mountHook();
    // Le socket est branché via un import dynamique : attendre l'abonnement.
    await waitFor(() =>
      expect(fakeSocket.on).toHaveBeenCalledWith('gl:spell_cast:draft', expect.any(Function)),
    );

    // Un événement portant le brouillon complet le pose sans appel API.
    act(() => {
      fakeSocket.fire('gl:spell_cast:draft', { gameId: 3, draft: { id: 5, status: 'draft' } });
    });
    expect(result.current.draft?.id).toBe(5);
    expect(apiGLMock).not.toHaveBeenCalled();

    vi.useFakeTimers();
    act(() => {
      fakeSocket.fire('gl:spell_cast:draft', { gameId: 3, draftId: 5 });
    });
    expect(jitteredRefreshDelayMock).toHaveBeenCalledWith(0);
    expect(apiGLMock).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(JITTERED_DELAY_MS - 1);
    });
    expect(apiGLMock).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(apiGLMock).toHaveBeenCalledWith('/api/gl/games/3/spell-casts/drafts/5');
    unmount();
  });

  it('démontage : le refetch programmé est annulé', async () => {
    const { result, unmount } = mountHook();
    await waitFor(() =>
      expect(fakeSocket.on).toHaveBeenCalledWith('gl:spell_cast:draft', expect.any(Function)),
    );
    act(() => {
      fakeSocket.fire('gl:spell_cast:draft', { gameId: 3, draft: { id: 5, status: 'draft' } });
    });
    expect(result.current.draft?.id).toBe(5);

    vi.useFakeTimers();
    act(() => {
      fakeSocket.fire('gl:spell_cast:draft', { gameId: 3, draftId: 5 });
    });
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(apiGLMock).not.toHaveBeenCalled();
  });
});
