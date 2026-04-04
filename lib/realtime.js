/**
 * Temps réel Socket.IO — diffusion d’événements métier vers les clients.
 * Les émissions sont no-op tant que initRealtime() n’a pas été appelé (ex. tests supertest).
 */
const logger = require('./logger');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/requireTeacher');

/** @type {import('socket.io').Server | null} */
let io = null;
const DOMAIN_ROOM = {
  tasks: 'domain:tasks',
  students: 'domain:students',
  garden: 'domain:garden',
  forum: 'domain:forum',
  context_comments: 'domain:context_comments',
};

function normalizeMapId(value) {
  const raw = value == null ? '' : String(value).trim();
  return raw || null;
}

function mapRoomName(mapId) {
  return `map:${mapId}`;
}

function parseSocketToken(socket) {
  const fromAuth = socket?.handshake?.auth?.token;
  if (fromAuth) return String(fromAuth);
  const authHeader = socket?.handshake?.headers?.authorization;
  if (authHeader && String(authHeader).startsWith('Bearer ')) return String(authHeader).slice(7);
  const fromQuery = socket?.handshake?.query?.token;
  if (fromQuery) return String(fromQuery);
  return null;
}

function socketCorsOrigin() {
  if (process.env.NODE_ENV === 'production' && process.env.FRONTEND_ORIGIN) {
    return process.env.FRONTEND_ORIGIN;
  }
  return true;
}

/**
 * @param {import('http').Server} httpServer
 * @returns {import('socket.io').Server | null}
 */
function initRealtime(httpServer) {
  if (io) return io;
  const { Server } = require('socket.io');
  io = new Server(httpServer, {
    path: '/socket.io',
    cors: {
      origin: socketCorsOrigin(),
      methods: ['GET', 'POST'],
    },
    // Polling en tête (prod o2switch / proxy) ; WebSocket conservé pour tests et outils locaux.
    transports: ['polling', 'websocket'],
    // Pas d’upgrade polling→WS : les navigateurs prod sont en polling uniquement ; évite du travail inutile côté moteur.
    allowUpgrades: false,
    // Reprise rapide après micro-coupure sans perdre l'état de connexion.
    connectionStateRecovery: {
      maxDisconnectionDuration: 120000,
    },
    // Heartbeat : intervalle modéré (réactivité si la ligne lâche) + timeout large (mobile, proxy, onglet en veille).
    pingInterval: 20000,
    pingTimeout: 60000,
  });

  io.use((socket, next) => {
    const token = parseSocketToken(socket);
    if (!token) {
      logger.warn({ msg: 'socket_auth_missing', socketId: socket.id }, 'Socket.IO : absence de jeton');
      return next(new Error('unauthorized'));
    }
    try {
      socket.data.auth = jwt.verify(token, JWT_SECRET);
      return next();
    } catch (_) {
      logger.warn({ msg: 'socket_auth_invalid', socketId: socket.id }, 'Socket.IO : jeton invalide ou expiré');
      return next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(DOMAIN_ROOM.tasks);
    socket.join(DOMAIN_ROOM.students);
    socket.join(DOMAIN_ROOM.garden);
    socket.join(DOMAIN_ROOM.forum);
    socket.join(DOMAIN_ROOM.context_comments);
    socket.data.mapRoom = null;

    const initialMapId = normalizeMapId(socket?.handshake?.auth?.mapId || socket?.handshake?.query?.mapId);
    if (initialMapId) {
      const room = mapRoomName(initialMapId);
      socket.join(room);
      socket.data.mapRoom = room;
    }

    socket.on('subscribe:map', (payload = {}) => {
      const mapId = normalizeMapId(payload.mapId);
      if (!mapId) return;
      const nextRoom = mapRoomName(mapId);
      if (socket.data.mapRoom && socket.data.mapRoom !== nextRoom) {
        socket.leave(socket.data.mapRoom);
      }
      socket.join(nextRoom);
      socket.data.mapRoom = nextRoom;
    });

    logger.debug(
      { socketId: socket.id, userType: socket.data?.auth?.userType || null, roleSlug: socket.data?.auth?.roleSlug || null },
      'Client Socket.IO connecté'
    );
    socket.on('disconnect', (reason) => {
      const abnormal = reason === 'transport error' || reason === 'transport close' || reason === 'ping timeout';
      if (abnormal) {
        logger.warn(
          { socketId: socket.id, reason, userType: socket.data?.auth?.userType || null, msg: 'socket_disconnect_abnormal' },
          'Socket.IO déconnexion anormale'
        );
      } else {
        logger.debug({ socketId: socket.id, reason }, 'Client Socket.IO déconnecté');
      }
    });
  });

  io.engine.on('connection_error', (err) => {
    const rawMsg = err && (err.message != null ? String(err.message) : String(err));
    const staleSession =
      typeof rawMsg === 'string' && /session id unknown/i.test(rawMsg);
    if (staleSession) {
      logger.debug(
        { err: { message: rawMsg, code: err?.code }, msg: 'socket_io_engine_stale_session' },
        'Socket.IO : session obsolète (reconnexion client attendue)'
      );
      return;
    }
    logger.warn({ err, msg: 'socket_io_engine_connection_error' }, 'Socket.IO moteur : erreur de connexion');
  });

  httpServer.once('close', () => {
    if (io) {
      const instance = io;
      io = null;
      instance.close(() => {
        logger.info('Socket.IO fermé');
      });
    }
  });

  logger.info('Socket.IO initialisé (path /socket.io)');
  return io;
}

function safeEmit(event, payload, options = {}) {
  if (!io) return;
  try {
    const body = { ts: Date.now(), ...payload };
    const domain = options.domain && DOMAIN_ROOM[options.domain] ? DOMAIN_ROOM[options.domain] : null;
    const mapId = normalizeMapId(options.mapId ?? payload?.mapId ?? payload?.map_id);
    const targets = new Set();
    if (mapId) targets.add(mapRoomName(mapId));
    else if (domain) targets.add(domain);
    if (targets.size === 0) {
      io.emit(event, body);
      logger.debug({ event, mode: 'broadcast' }, 'Émission Socket.IO');
      return;
    }
    logger.debug({ event, rooms: [...targets] }, 'Émission Socket.IO ciblée');
    for (const room of targets) {
      io.to(room).emit(event, body);
    }
  } catch (err) {
    logger.warn({ err, event }, 'Émission Socket.IO en échec');
  }
}

/** Après mutation sur les tâches / assignations / logs de tâche */
function emitTasksChanged(extra = {}) {
  safeEmit('tasks:changed', extra, { domain: 'tasks' });
}

/** Après inscription élève, suppression élève, ou tout impact sur la liste stats prof */
function emitStudentsChanged(extra = {}) {
  safeEmit('students:changed', extra, { domain: 'students' });
}

/** Après mutation zones, photos zone, biodiversité, marqueurs carte */
function emitGardenChanged(extra = {}) {
  safeEmit('garden:changed', extra, { domain: 'garden' });
}

/** Après mutation des sujets, messages ou signalements forum */
function emitForumChanged(extra = {}) {
  safeEmit('forum:changed', extra, { domain: 'forum' });
}

/** Après création/suppression/signalement de commentaires contextuels */
function emitContextCommentsChanged(extra = {}) {
  safeEmit('context-comments:changed', extra, { domain: 'context_comments' });
}

module.exports = {
  initRealtime,
  emitTasksChanged,
  emitStudentsChanged,
  emitGardenChanged,
  emitForumChanged,
  emitContextCommentsChanged,
};
