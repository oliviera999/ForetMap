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

import { io } from 'socket.io-client';
import { useForetmapRealtime } from '../../src/hooks/useForetmapRealtime.js';

function mountRealtime(overrides = {}) {
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
    ...overrides,
  };
  return renderHook(() => useForetmapRealtime(props));
}

/**
 * Le client Socket.IO est chargé à la demande : le socket n'existe qu'une fois l'import
 * résolu. Sans cette attente, `fakeSocket.fire(…)` partirait avant l'abonnement du hook et
 * les assertions passeraient à vide.
 */
async function mountConnected(overrides) {
  const view = mountRealtime(overrides);
  await waitFor(() =>
    expect(fakeSocket.on).toHaveBeenCalledWith('connect_error', expect.any(Function)),
  );
  return view;
}

beforeEach(() => {
  fakeSocket = createFakeSocket();
  io.mockClear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('useForetmapRealtime — refus d’authentification', () => {
  it('coupe la reconnexion quand le serveur refuse le jeton', async () => {
    const { result } = await mountConnected();
    await waitFor(() => expect(result.current).toBe('connecting'));

    const before = fakeSocket.disconnect.mock.calls.length;
    act(() => {
      fakeSocket.fire('connect_error', new Error('unauthorized'));
    });

    expect(fakeSocket.disconnect.mock.calls.length).toBe(before + 1);
    await waitFor(() => expect(result.current).toBe('off'));
  });

  it('le retour du réseau ne relance pas une connexion refusée', async () => {
    await mountConnected();
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
    const { result } = await mountConnected();

    const before = fakeSocket.disconnect.mock.calls.length;
    act(() => {
      fakeSocket.fire('connect_error', new Error('unavailable'));
    });

    expect(fakeSocket.disconnect.mock.calls.length).toBe(before);
    await waitFor(() => expect(result.current).toBe('connecting'));
  });

  it('une erreur réseau ordinaire ne coupe pas la reconnexion', async () => {
    const { result } = await mountConnected();

    const before = fakeSocket.disconnect.mock.calls.length;
    act(() => {
      fakeSocket.fire('connect_error', new Error('xhr poll error'));
    });

    expect(fakeSocket.disconnect.mock.calls.length).toBe(before);
    expect(result.current).toBe('connecting');
  });
});

describe('useForetmapRealtime — client chargé à la demande', () => {
  it('n’ouvre aucune connexion tant qu’aucune session n’existe (écran de connexion)', async () => {
    const { result } = mountRealtime({ enabled: false });
    // Laisse passer les microtâches : un import parti à tort aurait le temps d'aboutir.
    await act(async () => {
      await Promise.resolve();
    });
    expect(io).not.toHaveBeenCalled();
    expect(result.current).toBe('off');
  });

  it('annonce « connecting » dès le montage, puis ouvre le socket une fois le client chargé', async () => {
    const { result } = mountRealtime();
    expect(result.current).toBe('connecting');
    await waitFor(() => expect(io).toHaveBeenCalledTimes(1));
    act(() => {
      fakeSocket.fire('connect');
    });
    expect(result.current).toBe('live');
    expect(fakeSocket.emit).toHaveBeenCalledWith('subscribe:map', { mapId: 'm1' });
  });

  it('un démontage avant la fin du chargement n’ouvre pas de socket', async () => {
    const { unmount } = mountRealtime();
    unmount();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(io).not.toHaveBeenCalled();
  });

  it('ferme le socket au démontage', async () => {
    const { unmount } = await mountConnected();
    unmount();
    expect(fakeSocket.disconnect).toHaveBeenCalledTimes(1);
  });
});
