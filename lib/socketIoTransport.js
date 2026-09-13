'use strict';

/**
 * Transports Engine.IO / Socket.IO — drapeau d’environnement pour autoriser le WebSocket.
 *
 * En prod o2switch / Tiger Protect, le WS derrière HTTP/2 produit des trames invalides ;
 * le défaut reste donc le long-polling. Activer `FORETMAP_SOCKETIO_ALLOW_WEBSOCKET=1`
 * après validation du proxy (clients via `realtime.allow_websocket` dans settings/public
 * et config GL).
 */

function parseTruthyEnvFlag(raw) {
  const v = String(raw == null ? '' : raw)
    .trim()
    .toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/** @returns {boolean} */
function isSocketIoWebsocketAllowed() {
  return parseTruthyEnvFlag(process.env.FORETMAP_SOCKETIO_ALLOW_WEBSOCKET);
}

/**
 * Options serveur Socket.IO (transports + allowUpgrades).
 * @returns {{ transports: string[], allowUpgrades: boolean }}
 */
function getSocketIoServerTransportOptions() {
  const allowWebsocket = isSocketIoWebsocketAllowed();
  if (allowWebsocket) {
    return {
      transports: ['polling', 'websocket'],
      allowUpgrades: true,
    };
  }
  return {
    transports: ['polling'],
    allowUpgrades: false,
  };
}

/**
 * Fragment public exposé aux clients (snake_case API).
 * @returns {{ allow_websocket: boolean }}
 */
function getSocketIoRealtimePublicConfig() {
  return {
    allow_websocket: isSocketIoWebsocketAllowed(),
  };
}

module.exports = {
  isSocketIoWebsocketAllowed,
  getSocketIoServerTransportOptions,
  getSocketIoRealtimePublicConfig,
};
