/**
 * Options Engine.IO alignées sur la prod o2switch (Tiger Protect / HTTP/2).
 * Le WebSocket derrière le proxy produit des trames invalides ; le long-polling
 * reste le transport fiable. `upgrade: false` interdit toute tentative WS.
 *
 * Partagé ForetMap / GL pour ne plus diverger (audit temps réel 2026-09).
 * Le serveur expose `realtime.allow_websocket` (env `FORETMAP_SOCKETIO_ALLOW_WEBSOCKET`)
 * pour réactiver WS côté client sans rebuild.
 */

/**
 * @param {{ allowWebsocket?: boolean }} [opts]
 * @returns {{ transports: string[], upgrade: boolean }}
 */
export function getSocketIoClientOptions({ allowWebsocket } = {}) {
  if (allowWebsocket === true) {
    return Object.freeze({
      transports: ['polling', 'websocket'],
      upgrade: true,
    });
  }
  return Object.freeze({
    transports: ['polling'],
    upgrade: false,
  });
}

/** Défaut client : polling uniquement (prod mutualisée). */
export const SOCKETIO_CLIENT_OPTIONS = getSocketIoClientOptions({ allowWebsocket: false });
