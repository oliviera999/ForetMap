import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  resetForetmapSocketRegistryForTests,
  setForetmapSocket,
} from '../../src/services/foretmapSocketRegistry.js';
import { subscribeFresqueBoard } from '../../src/services/fresqueRealtime.js';

function fakeSocket({ connected = true } = {}) {
  const handlers = new Map();
  return {
    connected,
    emit: vi.fn(),
    on: vi.fn((event, fn) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(fn);
    }),
    off: vi.fn((event, fn) => handlers.get(event)?.delete(fn)),
    fire(event, payload) {
      for (const fn of handlers.get(event) || []) fn(payload);
    },
    listeners(event) {
      return handlers.get(event)?.size || 0;
    },
  };
}

afterEach(() => resetForetmapSocketRegistryForTests());

describe('subscribeFresqueBoard', () => {
  test('s’abonne sur la socket courante, filtre par plateau, se désabonne', () => {
    const socket = fakeSocket();
    setForetmapSocket(socket);
    const onChanged = vi.fn();
    const stop = subscribeFresqueBoard('b1', onChanged);
    expect(socket.emit).toHaveBeenCalledWith('subscribe:fresque-board', { boardId: 'b1' });
    socket.fire('fresque:board:changed', { boardId: 'b2', revision: 3 });
    expect(onChanged).not.toHaveBeenCalled();
    socket.fire('fresque:board:changed', { boardId: 'b1', revision: 3 });
    expect(onChanged).toHaveBeenCalledWith({ boardId: 'b1', revision: 3 });
    socket.fire('fresque:board:subscription-refused', { boardId: 'b1' });
    expect(onChanged).toHaveBeenLastCalledWith({ boardId: 'b1', refused: true });
    stop();
    expect(socket.emit).toHaveBeenCalledWith('unsubscribe:fresque-board', { boardId: 'b1' });
    expect(socket.listeners('fresque:board:changed')).toBe(0);
    socket.fire('fresque:board:changed', { boardId: 'b1', revision: 4 });
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  test('socket absente puis fournie, reconnexion : réabonnement', () => {
    const onChanged = vi.fn();
    const stop = subscribeFresqueBoard('b9', onChanged);
    const socket = fakeSocket({ connected: false });
    setForetmapSocket(socket);
    expect(socket.emit).not.toHaveBeenCalledWith('subscribe:fresque-board', { boardId: 'b9' });
    socket.fire('connect');
    expect(socket.emit).toHaveBeenCalledWith('subscribe:fresque-board', { boardId: 'b9' });
    const next = fakeSocket();
    setForetmapSocket(next);
    expect(socket.listeners('fresque:board:changed')).toBe(0);
    expect(next.emit).toHaveBeenCalledWith('subscribe:fresque-board', { boardId: 'b9' });
    stop();
    expect(next.emit).toHaveBeenCalledWith('unsubscribe:fresque-board', { boardId: 'b9' });
    expect(subscribeFresqueBoard('', onChanged)).toBeTypeOf('function');
  });
});
