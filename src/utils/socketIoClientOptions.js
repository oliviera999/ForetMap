/**
 * Options Engine.IO alignées sur la prod o2switch (Tiger Protect / HTTP/2).
 * Le WebSocket derrière le proxy produit des trames invalides ; le long-polling
 * reste le transport fiable. `upgrade: false` interdit toute tentative WS.
 *
 * Partagé ForetMap / GL pour ne plus diverger (audit temps réel 2026-09).
 */
export const SOCKETIO_CLIENT_OPTIONS = Object.freeze({
  transports: ['polling'],
  upgrade: false,
});
