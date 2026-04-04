#!/usr/bin/env node
'use strict';

/**
 * Smoke charge Socket.IO (transport polling, aligné prod) + option burst REST /api/tasks.
 * Utile pour estimer requêtes long-poll + heartbeats et la pression MySQL après « refetch ».
 *
 * Prérequis : serveur lancé, JWT valide (enseignant ou n3beur) dans l’environnement.
 *
 *   set FORETMAP_SOCKETIO_LOAD_JWT=eyJ...
 *   npm run test:load:socketio-smoke
 *
 * Variables :
 *   FORETMAP_SOCKETIO_LOAD_BASE_URL | BASE_URL  (défaut http://127.0.0.1:3000)
 *   FORETMAP_SOCKETIO_LOAD_JWT (obligatoire)
 *   FORETMAP_SOCKETIO_LOAD_CLIENTS (défaut 5)
 *   FORETMAP_SOCKETIO_LOAD_DURATION_MS (défaut 30000)
 *   FORETMAP_SOCKETIO_PATH (défaut /socket.io)
 *   FORETMAP_SOCKETIO_LOAD_MAP_ID (défaut foret)
 *   FORETMAP_SOCKETIO_LOAD_REST_BURST=1  → un GET /api/tasks?map_id=... par client après connexion
 */

require('dotenv').config();

const { io } = require('socket.io-client');

function parsePositiveInt(raw, fallback) {
  const n = parseInt(String(raw ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function main() {
  const baseUrl = String(
    process.env.FORETMAP_SOCKETIO_LOAD_BASE_URL || process.env.BASE_URL || 'http://127.0.0.1:3000'
  ).trim();
  const token = String(process.env.FORETMAP_SOCKETIO_LOAD_JWT || '').trim();
  if (!token) {
    console.error(
      '[socketio-smoke] Définir FORETMAP_SOCKETIO_LOAD_JWT (JWT session, ex. copié depuis le stockage navigateur après connexion).'
    );
    process.exit(1);
  }

  const clients = parsePositiveInt(process.env.FORETMAP_SOCKETIO_LOAD_CLIENTS, 5);
  const durationMs = parsePositiveInt(process.env.FORETMAP_SOCKETIO_LOAD_DURATION_MS, 30000);
  const socketPath = String(process.env.FORETMAP_SOCKETIO_PATH || '/socket.io').trim() || '/socket.io';
  const mapId = String(process.env.FORETMAP_SOCKETIO_LOAD_MAP_ID || 'foret').trim() || 'foret';
  const restBurst = String(process.env.FORETMAP_SOCKETIO_LOAD_REST_BURST || '').trim() === '1';

  const origin = new URL(baseUrl).origin;

  console.log('[socketio-smoke] origin=%s path=%s clients=%d durationMs=%d restBurst=%s', origin, socketPath, clients, durationMs, restBurst);

  let connected = 0;
  let connectErrors = 0;
  let disconnects = 0;
  const sockets = [];

  const makeClient = (idx) =>
    new Promise((resolve) => {
      const socket = io(origin, {
        path: socketPath,
        auth: { token, mapId },
        transports: ['polling'],
        upgrade: false,
        reconnection: false,
        timeout: 20000,
      });

      socket.on('connect', async () => {
        connected += 1;
        if (restBurst) {
          try {
            const u = new URL('/api/tasks', origin);
            u.searchParams.set('map_id', mapId);
            const res = await fetch(u, {
              headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            });
            if (!res.ok) {
              console.warn('[socketio-smoke] client %d GET /api/tasks → HTTP %s', idx, res.status);
            }
          } catch (e) {
            console.warn('[socketio-smoke] client %d REST burst échoué: %s', idx, e && e.message);
          }
        }
        resolve(socket);
      });
      socket.on('connect_error', (err) => {
        connectErrors += 1;
        console.warn('[socketio-smoke] client %d connect_error: %s', idx, err && err.message);
        resolve(socket);
      });
      socket.on('disconnect', () => {
        disconnects += 1;
      });
      sockets.push(socket);
    });

  await Promise.all(Array.from({ length: clients }, (_, i) => makeClient(i)));

  console.log(
    '[socketio-smoke] après poignées de main : connectés=%d erreurs=%d (cible clients=%d)',
    connected,
    connectErrors,
    clients
  );

  await new Promise((r) => setTimeout(r, durationMs));

  for (const s of sockets) {
    try {
      s.disconnect();
    } catch (_) {
      /* ignore */
    }
  }

  console.log(
    '[socketio-smoke] fin : connectés=%d connect_errors=%d disconnects=%d',
    connected,
    connectErrors,
    disconnects
  );
}

main().catch((e) => {
  console.error('[socketio-smoke]', e);
  process.exit(1);
});
