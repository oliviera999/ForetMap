'use strict';

/**
 * Périmètre cartes sur la socket — filet du lot H de `docs/AUDIT_SECURITE_2026-09-22.md` (§4.3).
 *
 * Le constat : `subscribe:map` ne vérifiait que l'**existence** de la carte. Un compte ForêtMap
 * authentifié mais borné par le périmètre de son groupe pouvait donc s'abonner à n'importe
 * quelle carte — y compris celle du plan — et recevoir ensuite tous ses signaux de mutation.
 * La charge utile ne porte pas de contenu, mais elle trahit l'activité d'une carte qu'on n'a
 * pas le droit de lire. Les routes HTTP appliquaient déjà ce périmètre ; la socket, bien plus
 * durable qu'une requête, ne l'appliquait pas.
 *
 * Les trois cas ci-dessous couvrent les trois chemins d'abonnement : la carte passée à la
 * **poignée de main**, l'événement `subscribe:map`, et le compte **non borné** — qui doit
 * continuer de tout recevoir, sans quoi la garde serait une panne.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');
const crypto = require('node:crypto');
const { io: clientIo } = require('socket.io-client');

const { initSchema, queryOne, execute } = require('../database');
const { initRealtime, emitTasksChanged, shutdownRealtime } = require('../lib/realtime');
const { signAuthToken } = require('../middleware/requireTeacher');
const { clearMapAccessCache } = require('../lib/mapAccess');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');

const SOCKET_CONNECT_OPTS = {
  path: '/socket.io',
  transports: ['polling'],
  upgrade: false,
  timeout: 8000,
};

const stamp = Date.now();
/** Carte du périmètre du groupe de l'élève. */
const MAP_IN = `rt-scope-in-${stamp}`;
/** Carte hors périmètre : celle que l'abonnement doit refuser. */
const MAP_OUT = `rt-scope-out-${stamp}`;
const GROUP_ID = `grp-rt-scope-${stamp}`;

let adminToken;
let studentToken;

/** Élève novice (aucune permission prof) rattaché au groupe borné. */
async function createScopedStudent() {
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO users
      (id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name,
       password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'student', NULL, NULL, NULL, 'Socket', ?, ?, NULL, 'local', 1, NOW(), NOW())`,
    [id, `Eleve${stamp}`, `Socket Eleve${stamp}`],
  );
  const role = await queryOne("SELECT id FROM roles WHERE slug = 'eleve_novice' LIMIT 1");
  assert.ok(role?.id, 'le rôle eleve_novice doit exister');
  await execute(
    `INSERT INTO user_roles (user_type, user_id, role_id, is_primary)
     VALUES ('student', ?, ?, 1)
     ON DUPLICATE KEY UPDATE role_id = VALUES(role_id), is_primary = 1`,
    [id, role.id],
  );
  await execute('UPDATE users SET assigned_role_id = ? WHERE id = ?', [role.id, id]);
  await execute(
    "INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, 'student')",
    [GROUP_ID, id],
  );
  clearMapAccessCache();
  return signAuthToken({
    product: 'foret',
    userType: 'student',
    userId: id,
    roleSlug: 'eleve_novice',
    permissions: [],
  });
}

/** Serveur temps réel éphémère : chaque cas a le sien, pour ne rien laisser derrière lui. */
async function startRealtimeServer() {
  const server = http.createServer(express());
  initRealtime(server);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return { server, port: server.address().port };
}

async function stopRealtimeServer(server, sockets = []) {
  for (const socket of sockets) if (socket) socket.close();
  await new Promise((resolve, reject) => {
    if (!server.listening) return resolve();
    server.close((err) => (err && err.code !== 'ERR_SERVER_NOT_RUNNING' ? reject(err) : resolve()));
  });
  await shutdownRealtime();
}

async function waitConnect(socket) {
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
  // L'abonnement à la carte de la poignée de main est asynchrone (lecture base + périmètre).
  await new Promise((resolve) => setTimeout(resolve, 200));
}

/** Événements reçus pendant `ms` après l'émission — un abonnement refusé n'en rend aucun. */
async function collectAfterEmit(socket, mapId, ms = 300) {
  const received = [];
  const onEvent = (msg) => received.push(msg);
  socket.on('tasks:changed', onEvent);
  emitTasksChanged({ reason: `rt-scope-${mapId}`, mapId });
  await new Promise((resolve) => setTimeout(resolve, ms));
  socket.off('tasks:changed', onEvent);
  return received;
}

test.before(async () => {
  await initSchema();
  adminToken = await ensureAdminTeacherAuthToken({ elevated: true });

  await execute(
    'INSERT INTO maps (id, label, map_image_url, sort_order, is_active) VALUES (?, ?, NULL, 910, 1), (?, ?, NULL, 911, 1)',
    [MAP_IN, `Socket dedans ${stamp}`, MAP_OUT, `Socket dehors ${stamp}`],
  );
  await execute(
    "INSERT INTO `groups` (id, slug, name, kind, is_active) VALUES (?, ?, ?, 'class', 1)",
    [GROUP_ID, GROUP_ID, `Classe socket ${stamp}`],
  );
  await execute('INSERT INTO group_scopes (group_id, map_id, project_id) VALUES (?, ?, NULL)', [
    GROUP_ID,
    MAP_IN,
  ]);
  clearMapAccessCache();
  studentToken = await createScopedStudent();
});

test.after(async () => {
  await execute('DELETE FROM group_scopes WHERE group_id = ?', [GROUP_ID]);
  await execute('DELETE FROM group_members WHERE group_id = ?', [GROUP_ID]);
  await execute('DELETE FROM `groups` WHERE id = ?', [GROUP_ID]);
  await execute('DELETE FROM users WHERE first_name = ? AND last_name = ?', [
    'Socket',
    `Eleve${stamp}`,
  ]);
  await execute('DELETE FROM maps WHERE id IN (?, ?)', [MAP_IN, MAP_OUT]);
  clearMapAccessCache();
});

test('la carte de la poignée de main est bornée au périmètre du compte (S-H)', async () => {
  const { server, port } = await startRealtimeServer();
  const socket = clientIo(`http://127.0.0.1:${port}`, {
    ...SOCKET_CONNECT_OPTS,
    auth: { token: studentToken, mapId: MAP_OUT },
  });
  await waitConnect(socket);

  const received = await collectAfterEmit(socket, MAP_OUT);
  assert.equal(
    received.length,
    0,
    'une carte hors périmètre passée à la poignée de main ne doit abonner à rien',
  );

  await stopRealtimeServer(server, [socket]);
});

test('subscribe:map refuse une carte hors périmètre et quitte la salle courante', async () => {
  const { server, port } = await startRealtimeServer();
  const socket = clientIo(`http://127.0.0.1:${port}`, {
    ...SOCKET_CONNECT_OPTS,
    auth: { token: studentToken, mapId: MAP_IN },
  });
  await waitConnect(socket);

  // La carte du périmètre, elle, doit bien être servie : une garde qui ferme tout est une panne.
  assert.equal(
    (await collectAfterEmit(socket, MAP_IN)).length,
    1,
    'la carte du périmètre doit rester abonnée',
  );

  socket.emit('subscribe:map', { mapId: MAP_OUT });
  await new Promise((resolve) => setTimeout(resolve, 250));

  assert.equal(
    (await collectAfterEmit(socket, MAP_OUT)).length,
    0,
    'la carte hors périmètre ne doit jamais être servie',
  );
  // Le refus **quitte** la salle précédente : un périmètre révoqué en cours de session ne doit
  // pas laisser le flux d'avant ouvert.
  assert.equal(
    (await collectAfterEmit(socket, MAP_IN)).length,
    0,
    'un abonnement refusé doit aussi quitter la salle courante',
  );

  await stopRealtimeServer(server, [socket]);
});

test('un compte non borné garde l’accès à toutes les cartes', async () => {
  const { server, port } = await startRealtimeServer();
  const socket = clientIo(`http://127.0.0.1:${port}`, {
    ...SOCKET_CONNECT_OPTS,
    auth: { token: adminToken, mapId: MAP_OUT },
  });
  await waitConnect(socket);

  assert.equal(
    (await collectAfterEmit(socket, MAP_OUT)).length,
    1,
    'un compte de gestion ne doit pas être borné par le périmètre de groupe',
  );

  await stopRealtimeServer(server, [socket]);
});
