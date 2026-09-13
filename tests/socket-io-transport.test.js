'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const ENV_KEY = 'FORETMAP_SOCKETIO_ALLOW_WEBSOCKET';

describe('socketIoTransport', () => {
  let previous;

  beforeEach(() => {
    previous = process.env[ENV_KEY];
    delete process.env[ENV_KEY];
    // Rechargement du module pour relire l’env à chaque cas
  });

  afterEach(() => {
    if (previous === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = previous;
  });

  function loadFresh() {
    delete require.cache[require.resolve('../lib/socketIoTransport')];
    return require('../lib/socketIoTransport');
  }

  it('défaut : WebSocket interdit, polling seul', () => {
    const mod = loadFresh();
    assert.equal(mod.isSocketIoWebsocketAllowed(), false);
    assert.deepEqual(mod.getSocketIoServerTransportOptions(), {
      transports: ['polling'],
      allowUpgrades: false,
    });
    assert.deepEqual(mod.getSocketIoRealtimePublicConfig(), { allow_websocket: false });
  });

  it('FORETMAP_SOCKETIO_ALLOW_WEBSOCKET=1 active WS + upgrade', () => {
    process.env[ENV_KEY] = '1';
    const mod = loadFresh();
    assert.equal(mod.isSocketIoWebsocketAllowed(), true);
    assert.deepEqual(mod.getSocketIoServerTransportOptions(), {
      transports: ['polling', 'websocket'],
      allowUpgrades: true,
    });
    assert.deepEqual(mod.getSocketIoRealtimePublicConfig(), { allow_websocket: true });
  });

  it('accepte true / yes / on (insensible à la casse)', () => {
    for (const value of ['true', 'YES', 'On']) {
      process.env[ENV_KEY] = value;
      const mod = loadFresh();
      assert.equal(mod.isSocketIoWebsocketAllowed(), true, value);
    }
  });
});
