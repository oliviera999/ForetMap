'use strict';

require('./helpers/setup');

const { test } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const express = require('express');
const { io: clientIo } = require('socket.io-client');
const { initRealtime, emitGlGameEvent } = require('../lib/realtime');
const { signAuthToken } = require('../middleware/requireTeacher');
const { initSchema, execute, queryOne } = require('../database');
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  createGlGameWithTeams,
  signTokens,
} = require('./helpers/glFixtures');

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

test('Socket.IO GL : refuse la souscription joueur à une partie étrangère', async () => {
  await initSchema();
  const stamp = Date.now();
  const admin = await createGlAdmin({
    email: `gl.socket.access.${stamp}@ecole.local`,
    displayName: 'MJ Socket Acces',
  });
  const chapter = await queryOne("SELECT id FROM gl_chapters WHERE slug = 'foret-magique' LIMIT 1");
  const ownClass = await createGlClass({
    name: `Classe Socket A ${stamp}`,
    school: 'Ecole',
    adminId: admin.id,
  });
  const foreignClass = await createGlClass({
    name: `Classe Socket B ${stamp}`,
    school: 'Ecole',
    adminId: admin.id,
  });
  const ownGame = await createGlGameWithTeams({
    classId: ownClass.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    teams: [{ name: 'Equipe Socket', type: 'gnome' }],
  });
  const foreignGame = await createGlGameWithTeams({
    classId: foreignClass.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    teams: [{ name: 'Equipe Cachee', type: 'gnome' }],
  });
  const player = await createGlPlayer({
    classId: ownClass.id,
    pseudo: `socket-access-player-${stamp}`,
    password: 'motdepasse123',
    teamId: ownGame.teams[0].id,
  });
  await execute(
    `INSERT INTO gl_team_members (game_id, team_id, player_id, joined_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE team_id = VALUES(team_id), joined_at = NOW()`,
    [ownGame.game.id, ownGame.teams[0].id, player.id]
  );
  const { playerToken } = await signTokens({
    playerId: player.id,
    playerPseudo: `socket-access-player-${stamp}`,
    playerPermissions: ['gl.read'],
    teamId: ownGame.teams[0].id,
  });

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
    auth: { token: playerToken },
  });

  try {
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

    const refused = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timeout refus souscription GL')), 8000);
      socket.once('gl:game:subscription-refused', (msg) => {
        clearTimeout(timeout);
        resolve(msg);
      });
    });
    socket.emit('subscribe:gl-game', { gameId: String(foreignGame.game.id) });
    const refusal = await refused;
    assert.strictEqual(Number(refusal.gameId), Number(foreignGame.game.id));
    assert.match(String(refusal.error || ''), /accès refusé/i);

    let receivedForeignEvent = false;
    socket.once('gl:game:event', () => {
      receivedForeignEvent = true;
    });
    emitGlGameEvent(foreignGame.game.id, { eventType: 'move', teamId: foreignGame.teams[0].id });
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.strictEqual(receivedForeignEvent, false);
  } finally {
    socket.close();
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});
