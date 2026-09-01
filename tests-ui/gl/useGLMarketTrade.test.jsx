// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * G2 (audit stabilité/perf 2026-09) — `gl:market:trade-changed` est émis à toute la
 * classe : le refetch qu'il déclenche doit être ÉTALÉ (`jitteredRefreshDelay`), pas
 * immédiat, sinon 25 postes rechargent leur page de marché dans la même seconde.
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

const apiGLMock = vi.fn(async () => ({ items: [] }));
vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGLMock(...args),
}));

// Délai jitteré rendu déterministe : on vérifie que le hook le DEMANDE et l'applique.
const JITTERED_DELAY_MS = 250;
const jitteredRefreshDelayMock = vi.fn(() => JITTERED_DELAY_MS);
vi.mock('../../src/utils/realtimeRefreshDelay', () => ({
  jitteredRefreshDelay: (...args) => jitteredRefreshDelayMock(...args),
  RT_REFRESH_JITTER_MS: 600,
}));

import { io } from 'socket.io-client';
import { useGLMarketTrade } from '../../src/gl/hooks/useGLMarketTrade.js';
import { resetGlSocketClientForTests } from '../../src/gl/realtime/glSocketClient.js';

function mountHook() {
  return renderHook(() =>
    useGLMarketTrade({ token: 'jeton-test', classId: 9, enabled: true, onTradeCompleted: vi.fn() }),
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

describe('useGLMarketTrade — étalement des refetchs temps réel', () => {
  it('programme le refetch de gl:market:trade-changed avec le délai jitteré, pas immédiatement', async () => {
    const { unmount } = mountHook();
    // Chargement initial (classmates + trades + feuillets) hors du champ du test.
    await waitFor(() => expect(apiGLMock).toHaveBeenCalled());
    await waitFor(() =>
      expect(fakeSocket.on).toHaveBeenCalledWith('gl:market:trade-changed', expect.any(Function)),
    );
    apiGLMock.mockClear();

    vi.useFakeTimers();
    act(() => {
      fakeSocket.fire('gl:market:trade-changed', { classId: 9 });
    });

    // Le délai vient bien du module d'étalement commun…
    expect(jitteredRefreshDelayMock).toHaveBeenCalledWith(0);
    // …et rien ne part avant son échéance.
    expect(apiGLMock).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(JITTERED_DELAY_MS - 1);
    });
    expect(apiGLMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(apiGLMock).toHaveBeenCalledWith('/api/gl/market/trades');
    unmount();
  });

  it('coalesce une rafale d’événements en un seul refetch', async () => {
    const { unmount } = mountHook();
    await waitFor(() => expect(apiGLMock).toHaveBeenCalled());
    await waitFor(() =>
      expect(fakeSocket.on).toHaveBeenCalledWith('gl:market:trade-changed', expect.any(Function)),
    );
    apiGLMock.mockClear();

    vi.useFakeTimers();
    act(() => {
      fakeSocket.fire('gl:market:trade-changed', { classId: 9 });
      fakeSocket.fire('gl:market:trade-changed', { classId: 9 });
      fakeSocket.fire('gl:market:trade-changed', { classId: 9 });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(JITTERED_DELAY_MS);
    });
    const tradesCalls = apiGLMock.mock.calls.filter(([url]) => url === '/api/gl/market/trades');
    expect(tradesCalls).toHaveLength(1);
    unmount();
  });

  it('ignore les événements d’une autre classe', async () => {
    const { unmount } = mountHook();
    await waitFor(() => expect(apiGLMock).toHaveBeenCalled());
    await waitFor(() =>
      expect(fakeSocket.on).toHaveBeenCalledWith('gl:market:trade-changed', expect.any(Function)),
    );
    apiGLMock.mockClear();

    vi.useFakeTimers();
    act(() => {
      fakeSocket.fire('gl:market:trade-changed', { classId: 8 });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(apiGLMock).not.toHaveBeenCalled();
    unmount();
  });

  it('démontage : le refetch programmé est annulé', async () => {
    const { unmount } = mountHook();
    await waitFor(() => expect(apiGLMock).toHaveBeenCalled());
    await waitFor(() =>
      expect(fakeSocket.on).toHaveBeenCalledWith('gl:market:trade-changed', expect.any(Function)),
    );
    apiGLMock.mockClear();

    vi.useFakeTimers();
    act(() => {
      fakeSocket.fire('gl:market:trade-changed', { classId: 9 });
    });
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(apiGLMock).not.toHaveBeenCalled();
  });

  it('partage une seule connexion io() pour deux hooks au même jeton', async () => {
    const a = mountHook();
    const b = mountHook();
    await waitFor(() => expect(io).toHaveBeenCalledTimes(1));
    a.unmount();
    b.unmount();
  });
});
