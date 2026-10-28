'use strict';

/**
 * Signal temps réel des plateaux de fresque : `subscribe:fresque-board` contrôlé par les mêmes
 * droits que `GET /boards/:id` (propriétaire → abonné ; autre élève → refusé, sans flux), puis
 * `fresque:board:changed` reçu après un enregistrement. Aucun code GL impliqué.
 */

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { io: clientIo } = require('socket.io-client');
const { initRealtime, emitFresqueBoardChanged, shutdownRealtime } = require('../lib/realtime');
const { initSchema, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { getOrCreateActiveBoard } = require('../lib/fresqueBoards');

const DECK = 'climat-junior-fr-v7-5';
const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const users = [];
let server;
let port;
let boardId;

async function createStudent(tag) {
  const id = `s-fresque-rt-${tag}-${stamp}`;
  await execute(
    `INSERT INTO users (id, user_type, pseudo, first_name, last_name, display_name, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'student', ?, 'Fresque', ?, ?, 'x', 'local', 1, NOW(), NOW())`,
    [id, id, `RT${tag}`, `Fresque RT${tag}`],
  );
  users.push(id);
  const token = await signAuthToken({ userType: 'student', userId: id, canonicalUserId: id });
  return { id, token };
}

function connect(token) {
  const socket = clientIo(`http://127.0.0.1:${port}`, {
    path: '/socket.io',
    transports: ['polling'],
    upgrade: false,
    timeout: 20_000,
    auth: { token },
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout connexion Socket.IO')), 20_000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function waitFor(socket, event, ms = 6000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ${event}`)), ms);
    socket.once(event, (msg) => {
      clearTimeout(timer);
      resolve(msg);
    });
  });
}

before(async () => {
  await initSchema();
  const app = express();
  server = http.createServer(app);
  initRealtime(server);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  port = server.address().port;
});

after(async () => {
  await new Promise((resolve) => server.close(() => resolve()));
  await shutdownRealtime();
  if (boardId) await execute('DELETE FROM fresque_boards WHERE id = ?', [boardId]).catch(() => {});
  for (const id of users) await execute('DELETE FROM users WHERE id = ?', [id]).catch(() => {});
});

test('propriétaire abonné et notifié ; autre élève refusé, sans flux', async () => {
  const owner = await createStudent('a');
  const other = await createStudent('c');
  const { row } = await getOrCreateActiveBoard({ userId: owner.id }, { deckId: DECK });
  boardId = row.id;

  const ownerSocket = await connect(owner.token);
  const otherSocket = await connect(other.token);
  try {
    const refusal = waitFor(otherSocket, 'fresque:board:subscription-refused');
    otherSocket.emit('subscribe:fresque-board', { boardId });
    const refused = await refusal;
    assert.equal(refused.boardId, boardId);

    const subscribed = waitFor(ownerSocket, 'fresque:board:subscribed');
    ownerSocket.emit('subscribe:fresque-board', { boardId });
    assert.equal((await subscribed).boardId, boardId);

    let leaked = false;
    otherSocket.on('fresque:board:changed', () => {
      leaked = true;
    });
    const received = waitFor(ownerSocket, 'fresque:board:changed');
    emitFresqueBoardChanged(boardId, { revision: 7, by: owner.id });
    const payload = await received;
    assert.equal(payload.boardId, boardId);
    assert.equal(payload.revision, 7);
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(leaked, false, 'un non-membre ne reçoit rien');

    // Un identifiant mal formé est ignoré sans erreur ; le désabonnement coupe le flux.
    ownerSocket.emit('subscribe:fresque-board', { boardId: '../x' });
    ownerSocket.emit('unsubscribe:fresque-board', {});
    // Transport long-polling : laisser le serveur traiter le désabonnement avant d'émettre.
    await new Promise((resolve) => setTimeout(resolve, 250));
    let afterUnsub = false;
    ownerSocket.on('fresque:board:changed', () => {
      afterUnsub = true;
    });
    emitFresqueBoardChanged(boardId, { revision: 8 });
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(afterUnsub, false);
  } finally {
    ownerSocket.close();
    otherSocket.close();
  }
});
