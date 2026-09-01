// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * Boucle de reconnexion Socket.IO face à un refus d'authentification.
 *
 * Le client est en `reconnectionAttempts: Infinity` — bon réglage pour une coupure réseau,
 * mais désastreux quand le serveur refuse le jeton : le transport étant en long-polling,
 * chaque tentative est une requête HTTP, et une session expirée laissée ouverte martelait
 * `/socket.io` toutes les 1 à 5 s jusqu'au rechargement de la page.
 */

/** Socket factice : enregistre les gestionnaires et expose ce que le hook déclenche. */
function createFakeSocket() {
  const handlers = new Map();
  const managerHandlers = new Map();
  return {
    connected: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    close: vi.fn(),
    emit: vi.fn(),
    on: vi.fn((event, fn) => handlers.set(event, fn)),
    off: vi.fn(),
    io: {
      on: vi.fn((event, fn) => managerHandlers.set(event, fn)),
      off: vi.fn(),
    },
    /** Déclenche un évènement côté socket, comme le ferait socket.io-client. */
    fire(event, payload) {
      const fn = handlers.get(event);
      if (fn) fn(payload);
    },
    fireManager(event, payload) {
      const fn = managerHandlers.get(event);
      if (fn) fn(payload);
    },
  };
}

let fakeSocket;

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => fakeSocket),
}));

vi.mock('../../src/services/api', () => ({
  api: vi.fn(async () => []),
  API: '',
  withAppBase: (p) => p,
  getAuthToken: () => 'jeton-test',
  AccountDeletedError: class AccountDeletedError extends Error {},
}));

import { useForetmapRealtime } from '../../src/hooks/useForetmapRealtime.js';

function mountRealtime() {
  // Props STABLES : recréer les setters à chaque rendu relancerait l'effet de connexion
  // (et donc le socket) en boucle, ce qui n'a rien à voir avec ce qu'on teste ici.
  const props = {
    enabled: true,
    fetchAll: vi.fn(),
    forceLogout: vi.fn(),
    activeMapId: 'm1',
    setTasks: vi.fn(),
    setTaskProjects: vi.fn(),
    setZones: vi.fn(),
    setPlants: vi.fn(),
    setMarkers: vi.fn(),
  };
  return renderHook(() => useForetmapRealtime(props));
}

beforeEach(() => {
  fakeSocket = createFakeSocket();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('useForetmapRealtime — refus d’authentification', () => {
  it('coupe la reconnexion quand le serveur refuse le jeton', async () => {
    const { result } = mountRealtime();
    await waitFor(() => expect(result.current).toBe('connecting'));

    const before = fakeSocket.disconnect.mock.calls.length;
    act(() => {
      fakeSocket.fire('connect_error', new Error('unauthorized'));
    });

    expect(fakeSocket.disconnect.mock.calls.length).toBe(before + 1);
    await waitFor(() => expect(result.current).toBe('off'));
  });

  it('le retour du réseau ne relance pas une connexion refusée', async () => {
    mountRealtime();
    act(() => {
      fakeSocket.fire('connect_error', new Error('unauthorized'));
    });
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    // Le retour du réseau ne rouvre pas de connexion avec le jeton refusé.
    expect(fakeSocket.connect).not.toHaveBeenCalled();
  });

  it('une panne serveur passagère laisse la reconnexion automatique faire son travail', async () => {
    const { result } = mountRealtime();

    const before = fakeSocket.disconnect.mock.calls.length;
    act(() => {
      fakeSocket.fire('connect_error', new Error('unavailable'));
    });

    expect(fakeSocket.disconnect.mock.calls.length).toBe(before);
    await waitFor(() => expect(result.current).toBe('connecting'));
  });

  it('une erreur réseau ordinaire ne coupe pas la reconnexion', async () => {
    const { result } = mountRealtime();

    const before = fakeSocket.disconnect.mock.calls.length;
    act(() => {
      fakeSocket.fire('connect_error', new Error('xhr poll error'));
    });

    expect(fakeSocket.disconnect.mock.calls.length).toBe(before);
    expect(result.current).toBe('connecting');
  });
});
