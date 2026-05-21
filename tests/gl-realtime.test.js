'use strict';

require('./helpers/setup');

const { test } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const { io: clientIo } = require('socket.io-client');
const { initRealtime, emitGlGameEvent } = require('../lib/realtime');
const { JWT_SECRET } = require('../middleware/requireTeacher');

test('Socket.IO GL : réception gl:game:event', async () => {
  const app = express();
  const server = http.createServer(app);
  initRealtime(server);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  const token = jwt.sign({
    product: 'gl',
    userType: 'gl_admin',
    userId: '500',
    roleSlug: 'gl_admin',
    permissions: ['gl.read', 'gl.event.emit'],
  }, JWT_SECRET, { expiresIn: '1h' });

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

  const subscribeAck = await new Promise((resolve, reject) => {
    socket.timeout(2000).emit('subscribe:gl-game', { gameId: 77 }, (err, response) => {
      if (err) return reject(err);
      return resolve(response);
    });
  });
  assert.strictEqual(subscribeAck?.ok, true);
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

test('Socket.IO GL : refuse les abonnements de partie avec un token non GL', async () => {
  const app = express();
  const server = http.createServer(app);
  initRealtime(server);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  const token = jwt.sign({
    userType: 'teacher',
    userId: 'teacher-500',
    roleSlug: 'prof',
    permissions: ['teacher.access'],
  }, JWT_SECRET, { expiresIn: '1h' });

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

  const subscribeAck = await new Promise((resolve, reject) => {
    socket.timeout(2000).emit('subscribe:gl-game', { gameId: 77 }, (err, response) => {
      if (err) return reject(err);
      return resolve(response);
    });
  });
  assert.strictEqual(subscribeAck?.ok, false);
  assert.strictEqual(subscribeAck?.error, 'forbidden');

  socket.close();
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});
