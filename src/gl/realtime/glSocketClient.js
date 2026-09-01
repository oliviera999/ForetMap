/**
 * Un socket Engine.IO par jeton GL.
 *
 * Les hooks partie / journal / marché / sorts ouvraient chacun leur connexion
 * (jusqu’à 4 long-polls par onglet). Sur o2switch (Passenger, Entry Processes)
 * ça multiplie les sockets HTTP sans bénéfice : le serveur n’a qu’une room
 * `gl:game:{id}` et une room `gl:class:{id}` par socket.
 *
 * Ce module mutualise : compteur de refs par jeton, rooms avec refcount.
 */
import { io } from 'socket.io-client';
import { withAppBase } from '../../shared/appBase.js';
import { isSocketAuthRejection } from '../../utils/realtimeAuthRejection.js';
import { SOCKETIO_CLIENT_OPTIONS } from '../../utils/socketIoClientOptions.js';

/** @typedef {{ socket: import('socket.io-client').Socket, refs: number, games: Map<string, number>, classes: Map<string, number> }} GlSocketEntry */

/** @type {Map<string, GlSocketEntry>} */
const byToken = new Map();

function bump(map, key, delta) {
  const next = (map.get(key) || 0) + delta;
  if (next <= 0) map.delete(key);
  else map.set(key, next);
  return next;
}

function emitCurrentRooms(entry) {
  if (!entry?.socket?.connected) return;
  for (const gameId of entry.games.keys()) {
    entry.socket.emit('subscribe:gl-game', { gameId });
  }
  for (const classId of entry.classes.keys()) {
    entry.socket.emit('subscribe:gl-class', { classId });
  }
}

/**
 * @param {string} token
 * @returns {{ socket: import('socket.io-client').Socket | null, release: () => void }}
 */
export function acquireGlSocket(token) {
  const key = String(token || '').trim();
  if (!key) {
    return { socket: null, release() {} };
  }
  let entry = byToken.get(key);
  if (entry) {
    entry.refs += 1;
    return {
      socket: entry.socket,
      release() {
        releaseEntry(key);
      },
    };
  }
  const socket = io(withAppBase(''), {
    path: '/socket.io',
    ...SOCKETIO_CLIENT_OPTIONS,
    auth: { token: key },
  });
  entry = { socket, refs: 1, games: new Map(), classes: new Map() };
  byToken.set(key, entry);
  socket.on('connect', () => emitCurrentRooms(entry));
  socket.on('connect_error', (err) => {
    if (!isSocketAuthRejection(err)) return;
    socket.disconnect();
  });
  return {
    socket,
    release() {
      releaseEntry(key);
    },
  };
}

function releaseEntry(token) {
  const entry = byToken.get(token);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs > 0) return;
  entry.socket.disconnect();
  byToken.delete(token);
}

/**
 * @param {string} token
 * @param {string|number} gameId
 * @returns {() => void} désabonnement
 */
export function subscribeGlGame(token, gameId) {
  const key = String(token || '').trim();
  const entry = byToken.get(key);
  if (!entry || gameId == null || gameId === '') return () => {};
  const roomKey = String(gameId);
  bump(entry.games, roomKey, 1);
  emitCurrentRooms(entry);
  return () => {
    bump(entry.games, roomKey, -1);
    emitCurrentRooms(entry);
  };
}

/**
 * @param {string} token
 * @param {string|number} classId
 * @returns {() => void}
 */
export function subscribeGlClass(token, classId) {
  const key = String(token || '').trim();
  const entry = byToken.get(key);
  if (!entry || classId == null || classId === '') return () => {};
  const roomKey = String(classId);
  bump(entry.classes, roomKey, 1);
  emitCurrentRooms(entry);
  return () => {
    bump(entry.classes, roomKey, -1);
    emitCurrentRooms(entry);
  };
}

/** Remet le singleton à zéro entre tests Vitest. */
export function resetGlSocketClientForTests() {
  for (const entry of byToken.values()) {
    try {
      entry.socket.disconnect();
    } catch (_) {
      /* ignore */
    }
  }
  byToken.clear();
}

/** Nombre de connexions ouvertes (tests). */
export function glSocketClientOpenCount() {
  return byToken.size;
}
