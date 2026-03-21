/**
 * Temps réel Socket.IO — diffusion d’événements métier vers les clients.
 * Les émissions sont no-op tant que initRealtime() n’a pas été appelé (ex. tests supertest).
 */
const logger = require('./logger');

/** @type {import('socket.io').Server | null} */
let io = null;

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
    // Évite de garder des connexions pendant des heures sans heartbeat
    pingTimeout: 20000,
    pingInterval: 25000,
  });

  io.on('connection', (socket) => {
    logger.debug({ socketId: socket.id }, 'Client Socket.IO connecté');
    socket.on('disconnect', (reason) => {
      logger.debug({ socketId: socket.id, reason }, 'Client Socket.IO déconnecté');
    });
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

function safeEmit(event, payload) {
  if (!io) return;
  try {
    io.emit(event, { ts: Date.now(), ...payload });
  } catch (err) {
    logger.warn({ err, event }, 'Émission Socket.IO en échec');
  }
}

/** Après mutation sur les tâches / assignations / logs de tâche */
function emitTasksChanged(extra = {}) {
  safeEmit('tasks:changed', extra);
}

/** Après inscription élève, suppression élève, ou tout impact sur la liste stats prof */
function emitStudentsChanged(extra = {}) {
  safeEmit('students:changed', extra);
}

/** Après mutation zones, photos zone, plantes, marqueurs carte */
function emitGardenChanged(extra = {}) {
  safeEmit('garden:changed', extra);
}

module.exports = {
  initRealtime,
  emitTasksChanged,
  emitStudentsChanged,
  emitGardenChanged,
};
