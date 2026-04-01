'use strict';

/**
 * Vérifie que le module temps réel diffuse bien les événements Socket.IO
 * (sans passer par l’app Express complète).
 */
const { test } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const { io: clientIo } = require('socket.io-client');
const {
  initRealtime,
  emitTasksChanged,
  emitStudentsChanged,
  emitGardenChanged,
  emitForumChanged,
  emitContextCommentsChanged,
} = require('../lib/realtime');
const { signAuthToken, JWT_SECRET } = require('../middleware/requireTeacher');

test('emitTasksChanged sans Socket.IO initialisé ne lève pas', () => {
  assert.doesNotThrow(() => emitTasksChanged({ reason: 'noop' }));
});

test('Socket.IO : réception de tasks / students / garden / forum / context-comments', async () => {
  const app = express();
  const server = http.createServer(app);
  initRealtime(server);

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const { port } = server.address();

  const token = signAuthToken({
    userType: 'teacher',
    roleSlug: 'prof',
    permissions: ['teacher.access'],
  });
  const socket = clientIo(`http://127.0.0.1:${port}`, {
    path: '/socket.io',
    transports: ['websocket'],
    timeout: 8000,
    auth: { token, mapId: 'foret' },
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

  const tasksPromise = once('tasks:changed');
  emitTasksChanged({ reason: 'test_task', taskId: 't1', mapId: 'foret' });
  const msgTasks = await tasksPromise;
  assert.ok(typeof msgTasks.ts === 'number');
  assert.strictEqual(msgTasks.reason, 'test_task');
  assert.strictEqual(msgTasks.taskId, 't1');
  assert.strictEqual(msgTasks.mapId, 'foret');

  const studentPromise = once('students:changed');
  emitStudentsChanged({ reason: 'test_student' });
  const msgStu = await studentPromise;
  assert.strictEqual(msgStu.reason, 'test_student');

  const gardenPromise = once('garden:changed');
  emitGardenChanged({ reason: 'test_garden' });
  const msgGarden = await gardenPromise;
  assert.strictEqual(msgGarden.reason, 'test_garden');

  const forumPromise = once('forum:changed');
  emitForumChanged({ reason: 'test_forum' });
  const msgForum = await forumPromise;
  assert.strictEqual(msgForum.reason, 'test_forum');

  const commentsPromise = once('context-comments:changed');
  emitContextCommentsChanged({ reason: 'test_context_comments', contextType: 'task', contextId: 't1' });
  const msgComments = await commentsPromise;
  assert.strictEqual(msgComments.reason, 'test_context_comments');
  assert.strictEqual(msgComments.contextType, 'task');
  assert.strictEqual(msgComments.contextId, 't1');

  socket.close();
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

test('Socket.IO : connexion refusée sans token', async () => {
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
    timeout: 4000,
  });

  await new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('timeout connect_error attendu')), 5000);
    socket.once('connect', () => {
      clearTimeout(to);
      reject(new Error('la connexion sans token ne devrait pas aboutir'));
    });
    socket.once('connect_error', () => {
      clearTimeout(to);
      resolve();
    });
  });

  socket.close();
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

test('Socket.IO : connexion refusée avec JWT invalide', async () => {
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
    timeout: 4000,
    auth: { token: 'not.a.valid.jwt', mapId: 'foret' },
  });

  await new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('timeout connect_error attendu (JWT invalide)')), 5000);
    socket.once('connect', () => {
      clearTimeout(to);
      reject(new Error('la connexion avec JWT invalide ne devrait pas aboutir'));
    });
    socket.once('connect_error', () => {
      clearTimeout(to);
      resolve();
    });
  });

  socket.close();
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

test('Socket.IO : connexion refusée avec JWT expiré', async () => {
  const app = express();
  const server = http.createServer(app);
  initRealtime(server);

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();

  const expiredToken = jwt.sign(
    {
      userType: 'teacher',
      userId: 'expired-user',
      roleSlug: 'prof',
      exp: Math.floor(Date.now() / 1000) - 120,
    },
    JWT_SECRET
  );

  const socket = clientIo(`http://127.0.0.1:${port}`, {
    path: '/socket.io',
    transports: ['websocket'],
    timeout: 4000,
    auth: { token: expiredToken, mapId: 'foret' },
  });

  await new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('timeout connect_error attendu (JWT expiré)')), 5000);
    socket.once('connect', () => {
      clearTimeout(to);
      reject(new Error('la connexion avec JWT expiré ne devrait pas aboutir'));
    });
    socket.once('connect_error', () => {
      clearTimeout(to);
      resolve();
    });
  });

  socket.close();
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

test('Socket.IO : subscribe:map quitte l’ancienne salle map', async () => {
  const app = express();
  const server = http.createServer(app);
  initRealtime(server);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  const token = signAuthToken({
    userType: 'teacher',
    userId: 'sub-map-test',
    roleSlug: 'prof',
    permissions: ['teacher.access'],
  });

  const socket = clientIo(`http://127.0.0.1:${port}`, {
    path: '/socket.io',
    transports: ['websocket'],
    auth: { token, mapId: 'foret' },
  });

  await new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('timeout connexion')), 8000);
    socket.once('connect', () => { clearTimeout(to); resolve(); });
    socket.once('connect_error', (err) => { clearTimeout(to); reject(err); });
  });

  socket.emit('subscribe:map', { mapId: 'n3' });
  await new Promise((resolve) => setTimeout(resolve, 150));

  const received = [];
  socket.on('tasks:changed', (msg) => received.push(msg));

  emitTasksChanged({ reason: 'foret_apres_switch', taskId: 't-f', mapId: 'foret' });
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.strictEqual(
    received.some((m) => m.mapId === 'foret'),
    false,
    'ne doit plus recevoir les événements map:foret après subscribe:map vers n3'
  );

  socket.removeAllListeners('tasks:changed');
  const n3Msg = await new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('timeout événement map n3')), 5000);
    socket.once('tasks:changed', (msg) => {
      clearTimeout(to);
      resolve(msg);
    });
    emitTasksChanged({ reason: 'sur_n3', taskId: 't-n3', mapId: 'n3' });
  });
  assert.strictEqual(n3Msg.reason, 'sur_n3');
  assert.strictEqual(n3Msg.mapId, 'n3');

  socket.close();
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

test('Socket.IO : emitTasksChanged sans mapId atteint domain:tasks (toutes les cartes)', async () => {
  const app = express();
  const server = http.createServer(app);
  initRealtime(server);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  const token = signAuthToken({
    userType: 'teacher',
    userId: 'domain-broadcast',
    roleSlug: 'prof',
    permissions: ['teacher.access'],
  });

  const socketForet = clientIo(`http://127.0.0.1:${port}`, {
    path: '/socket.io',
    transports: ['websocket'],
    auth: { token, mapId: 'foret' },
  });
  const socketN3 = clientIo(`http://127.0.0.1:${port}`, {
    path: '/socket.io',
    transports: ['websocket'],
    auth: { token, mapId: 'autre-carte' },
  });

  await Promise.all([
    new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('timeout socketForet')), 8000);
      socketForet.once('connect', () => { clearTimeout(to); resolve(); });
      socketForet.once('connect_error', (err) => { clearTimeout(to); reject(err); });
    }),
    new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('timeout socketN3')), 8000);
      socketN3.once('connect', () => { clearTimeout(to); resolve(); });
      socketN3.once('connect_error', (err) => { clearTimeout(to); reject(err); });
    }),
  ]);

  const pForet = new Promise((resolve) => socketForet.once('tasks:changed', resolve));
  const pN3 = new Promise((resolve) => socketN3.once('tasks:changed', resolve));
  emitTasksChanged({ reason: 'domain_broadcast_test' });
  const [msgA, msgB] = await Promise.all([pForet, pN3]);
  assert.strictEqual(msgA.reason, 'domain_broadcast_test');
  assert.strictEqual(msgB.reason, 'domain_broadcast_test');

  socketForet.close();
  socketN3.close();
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

test('Socket.IO : émission ciblée par mapId', async () => {
  const app = express();
  const server = http.createServer(app);
  initRealtime(server);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  const token = signAuthToken({
    userType: 'teacher',
    roleSlug: 'prof',
    permissions: ['teacher.access'],
  });

  const socketForet = clientIo(`http://127.0.0.1:${port}`, {
    path: '/socket.io',
    transports: ['websocket'],
    auth: { token, mapId: 'foret' },
  });
  const socketN3 = clientIo(`http://127.0.0.1:${port}`, {
    path: '/socket.io',
    transports: ['websocket'],
    auth: { token, mapId: 'n3' },
  });

  await Promise.all([
    new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('timeout socketForet')), 7000);
      socketForet.once('connect', () => { clearTimeout(to); resolve(); });
      socketForet.once('connect_error', (err) => { clearTimeout(to); reject(err); });
    }),
    new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('timeout socketN3')), 7000);
      socketN3.once('connect', () => { clearTimeout(to); resolve(); });
      socketN3.once('connect_error', (err) => { clearTimeout(to); reject(err); });
    }),
  ]);

  const foretEvent = new Promise((resolve) => socketForet.once('tasks:changed', resolve));
  let n3Received = false;
  socketN3.once('tasks:changed', () => { n3Received = true; });

  emitTasksChanged({ reason: 'map_only', taskId: 't-map', mapId: 'foret' });
  const msg = await foretEvent;
  assert.strictEqual(msg.reason, 'map_only');
  assert.strictEqual(msg.mapId, 'foret');

  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.strictEqual(n3Received, false);

  socketForet.close();
  socketN3.close();
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});
