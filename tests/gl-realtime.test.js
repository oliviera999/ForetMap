'use strict';

require('./helpers/setup');

const { test } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const express = require('express');
const { io: clientIo } = require('socket.io-client');
const { initRealtime, emitGlGameEvent, shutdownRealtime } = require('../lib/realtime');
const { initSchema, execute, queryOne } = require('../database');
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  createGlGameWithTeams,
  signTokens,
} = require('./helpers/glFixtures');

const SOCKET_CONNECT_OPTS = {
  path: '/socket.io',
  transports: ['polling'],
  upgrade: false,
  timeout: 20_000,
};

async function closeGlRealtimeServer(server, socket) {
  if (socket) socket.close();
  await new Promise((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close((err) => {
      if (err && err.code === 'ERR_SERVER_NOT_RUNNING') resolve();
      else if (err) reject(err);
      else resolve();
    });
  });
  await shutdownRealtime();
}

test('Socket.IO GL : réception gl:game:event', async () => {
  // Le compte doit exister en base : depuis que la connexion socket ré-hydrate les droits
  // (révocation immédiate d'un compte désactivé), un jeton signé pour un identifiant
  // fabriqué est refusé — comme il l'est déjà sur les routes HTTP.
  await initSchema();
  const admin = await createGlAdmin({
    email: `gl.socket.evt.${Date.now()}@ecole.local`,
    displayName: 'MJ Socket Evt',
  });

  const app = express();
  const server = http.createServer(app);
  initRealtime(server);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  const { adminToken: token } = await signTokens({
    adminId: admin.id,
    adminPermissions: ['gl.read', 'gl.event.emit'],
  });

  const socket = clientIo(`http://127.0.0.1:${port}`, {
    ...SOCKET_CONNECT_OPTS,
    auth: { token },
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timeout connexion Socket.IO GL')), 20_000);
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

  await closeGlRealtimeServer(server, socket);
});

test('Socket.IO GL : un compte désactivé est refusé à la connexion', async () => {
  // Un jeton GL vaut 24 h : sans relecture en base, un membre du staff désactivé gardait
  // le flux live de sa classe jusqu'à expiration, alors que la révocation prend effet
  // immédiatement sur les routes HTTP. Une connexion socket dure bien plus qu'une requête.
  await initSchema();
  const stamp = Date.now();
  const admin = await createGlAdmin({
    email: `gl.socket.revoke.${stamp}@ecole.local`,
    displayName: 'MJ Socket Revoque',
  });
  const { adminToken } = await signTokens({
    adminId: admin.id,
    adminPermissions: ['gl.read', 'gl.event.emit'],
  });

  // Le jeton reste valide et signé — c'est le compte qui ne l'est plus.
  await execute('UPDATE gl_admins SET is_active = 0 WHERE id = ?', [admin.id]);

  const app = express();
  const server = http.createServer(app);
  initRealtime(server);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  const socket = clientIo(`http://127.0.0.1:${port}`, {
    ...SOCKET_CONNECT_OPTS,
    auth: { token: adminToken },
  });

  const error = await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('connexion acceptée : révocation ignorée')),
      20_000,
    );
    socket.once('connect', () => {
      clearTimeout(timeout);
      reject(new Error('un compte désactivé ne doit pas obtenir le flux live'));
    });
    socket.once('connect_error', (err) => {
      clearTimeout(timeout);
      resolve(err);
    });
  });
  assert.match(String(error?.message || ''), /unauthorized/i);

  await closeGlRealtimeServer(server, socket);
});

test('Socket.IO GL : un compte désactivé est refusé après reprise de session', async () => {
  // Micro-coupure (transport close) : Socket.IO restaure rooms + socket.data.
  // Sans rejouer l'hydratation, le MJ désactivé gardait gl:game:event 120 s.
  await initSchema();
  const stamp = Date.now();
  const admin = await createGlAdmin({
    email: `gl.socket.recover.${stamp}@ecole.local`,
    displayName: 'MJ Socket Recover',
  });
  const { adminToken } = await signTokens({
    adminId: admin.id,
    adminPermissions: ['gl.read', 'gl.event.emit'],
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
    ...SOCKET_CONNECT_OPTS,
    reconnection: true,
    reconnectionAttempts: 4,
    reconnectionDelay: 80,
    auth: { token: adminToken },
  });

  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timeout connexion initiale')), 20_000);
      socket.once('connect', () => {
        clearTimeout(timeout);
        resolve();
      });
      socket.once('connect_error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    socket.emit('subscribe:gl-game', { gameId: 91 });
    await new Promise((resolve) => setTimeout(resolve, 150));
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timeout event avant coupure')), 8000);
      socket.once('gl:game:event', () => {
        clearTimeout(timeout);
        resolve();
      });
      emitGlGameEvent(91, { eventType: 'move', teamId: 1 });
    });

    await execute('UPDATE gl_admins SET is_active = 0 WHERE id = ?', [admin.id]);

    const rejected = new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('reprise acceptée : révocation ignorée')),
        20_000,
      );
      const onError = (err) => {
        if (!/unauthorized/i.test(String(err?.message || ''))) return;
        cleanup();
        resolve(err);
      };
      const onConnect = () => {
        cleanup();
        reject(new Error('un compte désactivé ne doit pas récupérer le flux live'));
      };
      function cleanup() {
        clearTimeout(timeout);
        socket.off('connect_error', onError);
        socket.off('connect', onConnect);
      }
      socket.on('connect_error', onError);
      socket.once('connect', onConnect);
    });

    // Coupe le transport (raison récupérable) sans socket.disconnect() côté client,
    // qui interdirait la reprise et forcerait une connexion neuve.
    socket.io.engine.close();
    const error = await rejected;
    assert.match(String(error?.message || ''), /unauthorized/i);
  } finally {
    await closeGlRealtimeServer(server, socket);
  }
});

test('Socket.IO GL : un joueur retiré de la partie ne garde pas la room après refus', async () => {
  await initSchema();
  const stamp = Date.now();
  const admin = await createGlAdmin({
    email: `gl.socket.kick.${stamp}@ecole.local`,
    displayName: 'MJ Socket Kick',
  });
  const chapter = await queryOne("SELECT id FROM gl_chapters WHERE slug = 'foret-magique' LIMIT 1");
  const klass = await createGlClass({
    name: `Classe Socket Kick ${stamp}`,
    school: 'Ecole',
    adminId: admin.id,
  });
  const game = await createGlGameWithTeams({
    classId: klass.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    teams: [{ name: 'Equipe Kick', type: 'gnome' }],
  });
  const player = await createGlPlayer({
    classId: klass.id,
    pseudo: `socket-kick-player-${stamp}`,
    password: 'motdepasse123',
    teamId: game.teams[0].id,
  });
  await execute(
    `INSERT INTO gl_team_members (game_id, team_id, player_id, joined_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE team_id = VALUES(team_id), joined_at = NOW()`,
    [game.game.id, game.teams[0].id, player.id],
  );
  const { playerToken } = await signTokens({
    playerId: player.id,
    playerPseudo: `socket-kick-player-${stamp}`,
    playerPermissions: ['gl.read'],
    teamId: game.teams[0].id,
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
    ...SOCKET_CONNECT_OPTS,
    auth: { token: playerToken },
  });

  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timeout connexion Socket.IO GL')), 20_000);
      socket.once('connect', () => {
        clearTimeout(timeout);
        resolve();
      });
      socket.once('connect_error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    socket.emit('subscribe:gl-game', { gameId: String(game.game.id) });
    await new Promise((resolve) => setTimeout(resolve, 150));
    const first = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timeout event avant retrait')), 8000);
      socket.once('gl:game:event', (msg) => {
        clearTimeout(timeout);
        resolve(msg);
      });
      emitGlGameEvent(game.game.id, { eventType: 'move', teamId: game.teams[0].id });
    });
    assert.strictEqual(Number(first.gameId), Number(game.game.id));

    await execute('DELETE FROM gl_team_members WHERE game_id = ? AND player_id = ?', [
      game.game.id,
      player.id,
    ]);

    const refused = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timeout refus après retrait')), 20_000);
      socket.once('gl:game:subscription-refused', (msg) => {
        clearTimeout(timeout);
        resolve(msg);
      });
    });
    socket.emit('subscribe:gl-game', { gameId: String(game.game.id) });
    const refusal = await refused;
    assert.strictEqual(Number(refusal.gameId), Number(game.game.id));

    let receivedAfterKick = false;
    socket.once('gl:game:event', () => {
      receivedAfterKick = true;
    });
    emitGlGameEvent(game.game.id, { eventType: 'narration', teamId: game.teams[0].id });
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.strictEqual(receivedAfterKick, false);
  } finally {
    await closeGlRealtimeServer(server, socket);
  }
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
    [ownGame.game.id, ownGame.teams[0].id, player.id],
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
    ...SOCKET_CONNECT_OPTS,
    auth: { token: playerToken },
  });

  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timeout connexion Socket.IO GL')), 20_000);
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
      const timeout = setTimeout(() => reject(new Error('timeout refus souscription GL')), 20_000);
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
    await closeGlRealtimeServer(server, socket);
  }
});
