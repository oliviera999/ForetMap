// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function createFakeSocket() {
  return {
    connected: false,
    disconnect: vi.fn(),
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  };
}

let fakeSocket;

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => fakeSocket),
}));

import { io } from 'socket.io-client';
import {
  acquireGlSocket,
  subscribeGlGame,
  resetGlSocketClientForTests,
  glSocketClientOpenCount,
} from '../../src/gl/realtime/glSocketClient.js';
import { SOCKETIO_CLIENT_OPTIONS } from '../../src/utils/socketIoClientOptions.js';

describe('glSocketClient', () => {
  beforeEach(() => {
    fakeSocket = createFakeSocket();
    io.mockClear();
  });

  afterEach(() => {
    resetGlSocketClientForTests();
  });

  it('n’ouvre qu’un io() par jeton et le ferme au dernier release', () => {
    const a = acquireGlSocket('tok');
    const b = acquireGlSocket('tok');
    expect(io).toHaveBeenCalledTimes(1);
    expect(io.mock.calls[0][1]).toEqual(expect.objectContaining(SOCKETIO_CLIENT_OPTIONS));
    expect(glSocketClientOpenCount()).toBe(1);
    expect(a.socket).toBe(b.socket);
    a.release();
    expect(fakeSocket.disconnect).not.toHaveBeenCalled();
    expect(glSocketClientOpenCount()).toBe(1);
    b.release();
    expect(fakeSocket.disconnect).toHaveBeenCalledTimes(1);
    expect(glSocketClientOpenCount()).toBe(0);
  });

  it('réémet subscribe:gl-game pour chaque abonnement actif', () => {
    fakeSocket.connected = true;
    acquireGlSocket('tok');
    const unsub = subscribeGlGame('tok', 12);
    expect(fakeSocket.emit).toHaveBeenCalledWith('subscribe:gl-game', { gameId: '12' });
    unsub();
  });
});
