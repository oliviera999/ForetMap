'use strict';

/**
 * Vérifie que le module temps réel diffuse bien les événements Socket.IO
 * (sans passer par l’app Express complète).
 */
const { test } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const express = require('express');
const { io: clientIo } = require('socket.io-client');
const { initRealtime, emitTasksChanged, emitStudentsChanged, emitGardenChanged } = require('../lib/realtime');

test('emitTasksChanged sans Socket.IO initialisé ne lève pas', () => {
  assert.doesNotThrow(() => emitTasksChanged({ reason: 'noop' }));
});

test('Socket.IO : réception de tasks / students / garden', async () => {
  const app = express();
  const server = http.createServer(app);
  initRealtime(server);

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const { port } = server.address();

  const socket = clientIo(`http://127.0.0.1:${port}`, {
    path: '/socket.io',
    transports: ['websocket'],
    timeout: 8000,
  });

  await new Promise((resolve, reject) => {
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

  const once = (event) =>
    new Promise((resolve) => {
      socket.once(event, resolve);
    });

  emitTasksChanged({ reason: 'test_task', taskId: 't1' });
  const msgTasks = await once('tasks:changed');
  assert.ok(typeof msgTasks.ts === 'number');
  assert.strictEqual(msgTasks.reason, 'test_task');
  assert.strictEqual(msgTasks.taskId, 't1');

  emitStudentsChanged({ reason: 'test_student' });
  const msgStu = await once('students:changed');
  assert.strictEqual(msgStu.reason, 'test_student');

  emitGardenChanged({ reason: 'test_garden' });
  const msgGarden = await once('garden:changed');
  assert.strictEqual(msgGarden.reason, 'test_garden');

  socket.close();
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});
