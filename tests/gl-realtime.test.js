'use strict';

require('./helpers/setup');

const { test } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const express = require('express');
const { io: clientIo } = require('socket.io-client');
const { initRealtime, emitGlGameEvent } = require('../lib/realtime');
const { signAuthToken } = require('../middleware/requireTeacher');

test('Socket.IO GL : réception gl:game:event', async () => {
  const app = express();
  const server = http.createServer(app);
  initRealtime(server);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  const token = await signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: '500',
    roleSlug: 'gl_admin',
    permissions: ['gl.read', 'gl.event.emit'],
  });

  const socket = clientIo(`http://127.0.0.1:${port}`, {
    path: '/socket.io',
    transports: ['websocket'],
    timeout: 8000,
    auth: { token },
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timeout connexion Socket.IO GL')), 8000);
    socket.once('connect', () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once('connect_error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  socket.emit('subscribe:gl-game', { gameId: 77 });
  await new Promise((resolve) => setTimeout(resolve, 120));
  const payload = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timeout event GL')), 8000);
    socket.once('gl:game:event', (msg) => {
      clearTimeout(timeout);
      resolve(msg);
    });
    emitGlGameEvent(77, { eventType: 'move', teamId: 4 });
  });
  assert.strictEqual(Number(payload.gameId), 77);
  assert.strictEqual(payload.eventType, 'move');
  assert.strictEqual(payload.teamId, 4);

  socket.close();
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

test('Socket.IO GL : refuse l’abonnement avec un jeton non GL', async () => {
  const app = express();
  const server = http.createServer(app);
  initRealtime(server);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  const token = await signAuthToken({
    product: 'foret',
    userType: 'student',
    userId: 'student-1',
    roleSlug: 'student',
    permissions: ['tasks.read'],
  });

  const socket = clientIo(`http://127.0.0.1:${port}`, {
    path: '/socket.io',
    transports: ['websocket'],
    timeout: 8000,
    auth: { token },
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timeout connexion Socket.IO non GL')), 8000);
    socket.once('connect', () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once('connect_error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  const denied = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timeout refus abonnement GL')), 8000);
    socket.once('gl:subscription:error', (msg) => {
      clearTimeout(timeout);
      resolve(msg);
    });
  });
  socket.emit('subscribe:gl-game', { gameId: 88 });
  const denial = await denied;
  assert.strictEqual(Number(denial.gameId), 88);

  const received = await new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), 250);
    socket.once('gl:game:event', () => {
      clearTimeout(timeout);
      resolve(true);
    });
    emitGlGameEvent(88, { eventType: 'move', teamId: 4 });
  });
  assert.strictEqual(received, false);

  socket.close();
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});
