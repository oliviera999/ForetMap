'use strict';

require('./helpers/setup');

/**
 * Audit ForetMap du 19/11/2026, lot 1 — S1.
 *
 * Une connexion ou une déconnexion Socket.IO pendant que la base ne répond pas (pool fermé,
 * saturé, cache des réglages périmé) produisait un rejet non géré dans la présence en ligne :
 * `server.js` arrête alors le process (`unhandledRejection` → `process.exit(1)`).
 *
 * Rejeu : `getSettingValue` est remplacé, **avant** le chargement de `lib/realtime.js` et de
 * `lib/shared/moduleGate.js` (qui le déstructurent), par une version qui échoue à la demande
 * comme le ferait un cache périmé sur une base injoignable. Le reste (auth, jeton) utilise la
 * vraie base de test.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const express = require('express');
const { io: clientIo } = require('socket.io-client');

const settings = require('../lib/settings');

let failSettings = false;
const realGetSettingValue = settings.getSettingValue;
settings.getSettingValue = async (key, fallback) => {
  // Seules les lectures de la présence échouent : l'hydratation d'auth (MFA…) lit aussi les
  // réglages, et la connexion serait refusée avant d'atteindre le code rejoué.
  const presenceKey =
    key === 'ui.modules.presence_enabled' || key === 'runtime.socket_presence_emit_coalesce_ms';
  if (failSettings && presenceKey) throw new Error('Pool is closed.');
  return realGetSettingValue(key, fallback);
};

const { initRealtime, shutdownRealtime } = require('../lib/realtime');
const { initSchema } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');

const SOCKET_CONNECT_OPTS = {
  path: '/socket.io',
  transports: ['polling'],
  upgrade: false,
  timeout: 8000,
  reconnection: false,
};

function waitConnect(socket) {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('timeout connexion Socket.IO')), 10000);
    socket.once('connect', () => {
      clearTimeout(to);
      resolve();
    });
    socket.once('connect_error', (err) => {
      clearTimeout(to);
      reject(err);
    });
  });
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('S1 — base injoignable à la connexion / déconnexion : aucun rejet non géré', async () => {
  await initSchema();
  const token = await ensureAdminTeacherAuthToken();

  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);

  const app = express();
  const server = http.createServer(app);
  initRealtime(server);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}`;

  const sockets = [];
  try {
    // 1) Connexion pendant que la base répond : la présence est inscrite.
    const first = clientIo(url, { ...SOCKET_CONNECT_OPTS, auth: { token } });
    sockets.push(first);
    await waitConnect(first);
    await pause(150);

    // 2) La base tombe : une nouvelle connexion (registerPresenceSocket → isModuleEnabled).
    failSettings = true;
    const second = clientIo(url, { ...SOCKET_CONNECT_OPTS, auth: { token } });
    sockets.push(second);
    await waitConnect(second);
    await pause(150);

    // 3) Déconnexions (unregisterPresenceSocket → schedulePresenceEmit → getSettingValue).
    second.close();
    first.close();
    await pause(400);

    assert.deepStrictEqual(
      unhandled.map((r) => String(r?.message || r)),
      [],
      'aucun rejet non géré ne doit remonter de la présence temps réel',
    );
  } finally {
    failSettings = false;
    for (const s of sockets) s.close();
    process.off('unhandledRejection', onUnhandled);
    await new Promise((resolve) => server.close(() => resolve()));
    await shutdownRealtime();
  }
});
