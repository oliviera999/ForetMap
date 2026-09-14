/**
 * Temps réel Socket.IO — diffusion d’événements métier vers les clients.
 * Les émissions sont no-op tant que initRealtime() n’a pas été appelé (ex. tests supertest).
 * Présence staff : refcount in-process (1 instance o2switch) — voir `lib/shared/presenceCore.js`.
 */
const logger = require('./logger');
const { verifyJwtToken } = require('./auth/jwtPipeline');
const { hydrateGlAuthFromClaims } = require('./auth/glHydration');
const { queryOne, execute } = require('../database');
const { JWT_SECRET, hydrateAuthFromTokenClaims } = require('../middleware/requireTeacher');
const { canAccessGlGame } = require('./glGameAccess');
const { canAccessGlClass } = require('./glClassAccess');
const {
  isSocketIoWebsocketAllowed,
  getSocketIoServerTransportOptions,
} = require('./socketIoTransport');
const { nowIsoUtc } = require('./shared/isoTimestamp');
const {
  PRESENCE_EVENT,
  PRESENCE_STATUS,
  presenceStaffRoom,
  presenceKey,
  canSubscribePresence,
  presenceTrackedUserId,
  buildPresencePayload,
  resolvePresenceStatus,
} = require('./shared/presenceCore');
const { isModuleEnabled } = require('./shared/moduleGate');
const { getSettingValue } = require('./settings');
const { mapExists } = require('./mapQueries');

/** @type {import('socket.io').Server | null} */
let io = null;
const DOMAIN_ROOM = {
  tasks: 'domain:tasks',
  students: 'domain:students',
  garden: 'domain:garden',
  forum: 'domain:forum',
  context_comments: 'domain:context_comments',
  observations: 'domain:observations',
};

/** @type {Map<string, number>} clé `product:userId` → refcount sockets */
const presenceRefcounts = new Map();
/** @type {Map<string, ReturnType<typeof setTimeout>>} coalescence emits */
const presenceEmitTimers = new Map();

function glGameRoomName(gameId) {
  return `gl:game:${gameId}`;
}

function glClassRoomName(classId) {
  return `gl:class:${classId}`;
}

function normalizeMapId(value) {
  const raw = value == null ? '' : String(value).trim();
  return raw || null;
}

function mapRoomName(mapId) {
  return `map:${mapId}`;
}

async function touchLastSeen({ product, userId, userType }) {
  const id = String(userId || '').trim();
  if (!id) return null;
  const p = String(product || 'foret').toLowerCase();
  const iso = nowIsoUtc();
  try {
    if (p === 'gl') {
      const ut = String(userType || '').toLowerCase();
      if (ut === 'gl_player') {
        await execute('UPDATE gl_players SET last_seen = NOW(), updated_at = NOW() WHERE id = ?', [
          id,
        ]);
      } else if (ut === 'gl_admin') {
        await execute('UPDATE gl_admins SET last_seen = NOW() WHERE id = ?', [id]);
      }
      return iso;
    }
    await execute('UPDATE users SET last_seen = ?, updated_at = NOW() WHERE id = ?', [iso, id]);
    return iso;
  } catch (err) {
    logger.warn({ err, product: p, userId: id }, 'Présence : mise à jour last_seen en échec');
    return null;
  }
}

function getOnlineUserIdSet(product) {
  const p = String(product || 'foret').toLowerCase() === 'gl' ? 'gl' : 'foret';
  const prefix = `${p}:`;
  const ids = new Set();
  for (const [key, count] of presenceRefcounts) {
    if (count > 0 && key.startsWith(prefix)) ids.add(key.slice(prefix.length));
  }
  return ids;
}

function schedulePresenceEmit(product, userId, status, lastSeen) {
  if (!io) return;
  const key = presenceKey(product, userId);
  if (!key) return;
  const run = async () => {
    presenceEmitTimers.delete(key);
    try {
      if (!(await isModuleEnabled(product, 'presence'))) return;
      const room = presenceStaffRoom(product);
      const body = {
        ts: Date.now(),
        ...buildPresencePayload({ product, userId, status, lastSeen }),
      };
      io.to(room).emit(PRESENCE_EVENT, body);
    } catch (err) {
      logger.warn({ err, product, userId }, 'Présence : émission en échec');
    }
  };
  void getSettingValue('runtime.socket_presence_emit_coalesce_ms', 500).then((ms) => {
    const delay = Math.max(0, Number(ms) || 0);
    const prev = presenceEmitTimers.get(key);
    if (prev) clearTimeout(prev);
    if (delay <= 0) {
      void run();
      return;
    }
    presenceEmitTimers.set(
      key,
      setTimeout(() => {
        void run();
      }, delay),
    );
  });
}

async function registerPresenceSocket(socket) {
  const product = String(socket.data?.product || 'foret').toLowerCase() === 'gl' ? 'gl' : 'foret';
  const auth = socket.data?.auth;
  if (!(await isModuleEnabled(product, 'presence'))) return;
  if (canSubscribePresence(auth, product)) {
    socket.join(presenceStaffRoom(product));
  }
  const trackedId = presenceTrackedUserId(auth, product);
  if (!trackedId) return;
  const key = presenceKey(product, trackedId);
  const prev = presenceRefcounts.get(key) || 0;
  presenceRefcounts.set(key, prev + 1);
  socket.data.presenceKey = key;
  socket.data.presenceProduct = product;
  socket.data.presenceUserId = trackedId;
  if (prev === 0) {
    const lastSeen = await touchLastSeen({
      product,
      userId: trackedId,
      userType: auth?.userType,
    });
    schedulePresenceEmit(product, trackedId, PRESENCE_STATUS.ONLINE, lastSeen);
  }
}

async function unregisterPresenceSocket(socket) {
  const key = socket.data?.presenceKey;
  if (!key) return;
  const product = socket.data.presenceProduct || 'foret';
  const userId = socket.data.presenceUserId;
  const prev = presenceRefcounts.get(key) || 0;
  const next = Math.max(0, prev - 1);
  if (next === 0) {
    presenceRefcounts.delete(key);
    const lastSeen = await touchLastSeen({
      product,
      userId,
      userType: socket.data?.auth?.userType,
    });
    schedulePresenceEmit(
      product,
      userId,
      resolvePresenceStatus({ socketConnected: false, lastSeen }),
      lastSeen,
    );
  } else {
    presenceRefcounts.set(key, next);
  }
  socket.data.presenceKey = null;
}

function getRealtimeSnapshot() {
  const allowWebsocket = isSocketIoWebsocketAllowed();
  if (!io || !io.engine) {
    return { enabled: false, clients: 0, allowWebsocket };
  }
  const count = Number(io.engine.clientsCount);
  return {
    enabled: true,
    clients: Number.isFinite(count) ? count : 0,
    allowWebsocket,
  };
}

function leaveDeniedGlRoom(socket, room, dataKey) {
  if (!socket || !room) return;
  socket.leave(room);
  if (socket.data && socket.data[dataKey] === room) {
    socket.data[dataKey] = null;
  }
}

async function joinMapRoomIfExists(socket, mapId) {
  const normalized = normalizeMapId(mapId);
  if (!normalized) return;
  try {
    if (!(await mapExists(normalized))) return;
  } catch (err) {
    logger.warn(
      { err, mapId: normalized, socketId: socket.id },
      'Socket.IO : lecture carte en échec',
    );
    return;
  }
  const nextRoom = mapRoomName(normalized);
  if (socket.data.mapRoom && socket.data.mapRoom !== nextRoom) {
    socket.leave(socket.data.mapRoom);
  }
  socket.join(nextRoom);
  socket.data.mapRoom = nextRoom;
}

function parseSocketToken(socket) {
  const fromAuth = socket?.handshake?.auth?.token;
  if (fromAuth) return String(fromAuth);
  const authHeader = socket?.handshake?.headers?.authorization;
  if (authHeader && String(authHeader).startsWith('Bearer ')) return String(authHeader).slice(7);
  // Jeton en query string : fuite possible (logs proxy, historique). Réservé aux tests locaux.
  const allowQueryToken =
    String(process.env.NODE_ENV || '')
      .trim()
      .toLowerCase() === 'test' ||
    String(process.env.E2E_DISABLE_RATE_LIMIT || '').trim() === '1' ||
    String(process.env.FORETMAP_SOCKET_QUERY_TOKEN || '').trim() === '1';
  if (allowQueryToken) {
    const fromQuery = socket?.handshake?.query?.token;
    if (fromQuery) return String(fromQuery);
  }
  return null;
}

function socketCorsOrigin() {
  if (process.env.NODE_ENV === 'production') {
    const rawOrigins = String(process.env.FRONTEND_ORIGINS || '').trim();
    if (rawOrigins) {
      const origins = rawOrigins
        .split(',')
        .map((value) => String(value || '').trim())
        .filter(Boolean);
      if (origins.length > 0) return origins;
    }
    if (process.env.FRONTEND_ORIGIN) return process.env.FRONTEND_ORIGIN;
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
  const transportOpts = getSocketIoServerTransportOptions();
  io = new Server(httpServer, {
    path: '/socket.io',
    cors: {
      origin: socketCorsOrigin(),
      methods: ['GET', 'POST'],
    },
    // Défaut : polling seul (o2switch / Tiger Protect). WS si FORETMAP_SOCKETIO_ALLOW_WEBSOCKET.
    transports: transportOpts.transports,
    allowUpgrades: transportOpts.allowUpgrades,
    // Reprise rapide après micro-coupure. `skipMiddlewares` DOIT rester false :
    // le défaut Socket.IO (true) sauterait l'hydratation JWT/BDD, et un compte
    // révoqué récupérerait rooms + `socket.data.auth` périmé jusqu'à 120 s
    // (événements GL auto-portés, pas de refetch REST).
    connectionStateRecovery: {
      maxDisconnectionDuration: 120000,
      skipMiddlewares: false,
    },
    // Heartbeat : intervalle modéré (réactivité si la ligne lâche) + timeout large (mobile, proxy, onglet en veille).
    pingInterval: 20000,
    pingTimeout: 60000,
  });

  io.use(async (socket, next) => {
    const token = parseSocketToken(socket);
    if (!token) {
      logger.warn(
        { msg: 'socket_auth_missing', socketId: socket.id },
        'Socket.IO : absence de jeton',
      );
      return next(new Error('unauthorized'));
    }
    let claims;
    try {
      claims = verifyJwtToken(token, JWT_SECRET);
    } catch (_) {
      logger.warn(
        { msg: 'socket_auth_invalid', socketId: socket.id },
        'Socket.IO : jeton invalide ou expiré',
      );
      return next(new Error('unauthorized'));
    }

    // Isolement produit : un jeton GL ne doit pas recevoir les événements métier ForetMap.
    const product = String(claims.product || 'foret').toLowerCase();

    // Un jeton GL vaut 24 h ; la signature seule ne dit donc rien de l'état ACTUEL du
    // compte. Sans relecture en base, un membre du staff désactivé ou supprimé gardait
    // le flux live de sa classe jusqu'à l'expiration de son jeton — alors que la même
    // révocation prend effet immédiatement sur les routes HTTP, qui ré-hydratent à
    // chaque requête. Une connexion socket est bien plus durable qu'une requête : c'est
    // précisément là qu'il fallait revérifier.
    if (product === 'gl') {
      let glAuth = null;
      try {
        glAuth = await hydrateGlAuthFromClaims(claims, { queryOne });
      } catch (err) {
        // Panne d'infrastructure : ne pas transformer une base indisponible en
        // déconnexion générale — le client reconnecterait en boucle.
        logger.error({ err, msg: 'socket_gl_hydration_failed' }, 'Socket.IO : hydratation GL');
        return next(new Error('unavailable'));
      }
      if (!glAuth) {
        logger.warn(
          { msg: 'socket_auth_revoked', socketId: socket.id },
          'Socket.IO : compte GL désactivé ou supprimé',
        );
        return next(new Error('unauthorized'));
      }
      socket.data.auth = glAuth;
      socket.data.product = product;
      return next();
    }

    let foretAuth = null;
    try {
      foretAuth = await hydrateAuthFromTokenClaims(claims);
    } catch (err) {
      logger.error(
        { err, msg: 'socket_foret_hydration_failed' },
        'Socket.IO : hydratation ForetMap',
      );
      return next(new Error('unavailable'));
    }
    if (!foretAuth) {
      logger.warn(
        { msg: 'socket_auth_revoked', socketId: socket.id },
        'Socket.IO : compte ForetMap désactivé ou supprimé',
      );
      return next(new Error('unauthorized'));
    }
    socket.data.auth = foretAuth;
    socket.data.product = product;
    return next();
  });

  io.on('connection', (socket) => {
    // Les rooms métier ForetMap (tâches, élèves, jardin, forum, cartes) sont réservées
    // aux jetons ForetMap. Un jeton GL reste connecté uniquement pour subscribe:gl-*.
    const isForetProduct = socket.data?.product !== 'gl';
    if (isForetProduct) {
      socket.join(DOMAIN_ROOM.tasks);
      socket.join(DOMAIN_ROOM.students);
      socket.join(DOMAIN_ROOM.garden);
      socket.join(DOMAIN_ROOM.forum);
      socket.join(DOMAIN_ROOM.context_comments);
      socket.join(DOMAIN_ROOM.observations);
    }
    socket.data.mapRoom = null;
    void registerPresenceSocket(socket);

    const initialMapId = normalizeMapId(
      socket?.handshake?.auth?.mapId || socket?.handshake?.query?.mapId,
    );
    if (isForetProduct && initialMapId) {
      void joinMapRoomIfExists(socket, initialMapId);
    }

    socket.on('subscribe:map', (payload = {}) => {
      if (!isForetProduct) return;
      void joinMapRoomIfExists(socket, payload.mapId);
    });

    socket.on('subscribe:gl-game', async (payload = {}) => {
      const gameId = normalizeMapId(payload.gameId);
      if (!gameId) return;
      const nextRoom = glGameRoomName(gameId);
      try {
        if (!(await canAccessGlGame(socket.data?.auth, gameId))) {
          // Une reprise de session a pu restaurer la room : la quitter, pas seulement
          // refuser le nouvel abonnement — sinon le flux live continue.
          leaveDeniedGlRoom(socket, nextRoom, 'glGameRoom');
          socket.emit('gl:game:subscription-refused', {
            gameId,
            error: 'Accès refusé à cette partie',
          });
          return;
        }
        const current = socket.data.glGameRoom || null;
        if (current && current !== nextRoom) socket.leave(current);
        socket.join(nextRoom);
        socket.data.glGameRoom = nextRoom;
      } catch (err) {
        logger.warn(
          { err, gameId, socketId: socket.id },
          'Socket.IO GL : vérification d’accès à la partie en échec',
        );
        leaveDeniedGlRoom(socket, nextRoom, 'glGameRoom');
        socket.emit('gl:game:subscription-refused', {
          gameId,
          error: 'Accès refusé à cette partie',
        });
      }
    });

    socket.on('subscribe:gl-class', async (payload = {}) => {
      const classId = normalizeMapId(payload.classId);
      if (!classId) return;
      const nextRoom = glClassRoomName(classId);
      try {
        if (!(await canAccessGlClass(socket.data?.auth, classId))) {
          leaveDeniedGlRoom(socket, nextRoom, 'glClassRoom');
          socket.emit('gl:class:subscription-refused', {
            classId,
            error: 'Accès refusé à cette classe',
          });
          return;
        }
        const current = socket.data.glClassRoom || null;
        if (current && current !== nextRoom) socket.leave(current);
        socket.join(nextRoom);
        socket.data.glClassRoom = nextRoom;
      } catch (err) {
        logger.warn(
          { err, classId, socketId: socket.id },
          'Socket.IO GL : vérification d’accès à la classe en échec',
        );
        leaveDeniedGlRoom(socket, nextRoom, 'glClassRoom');
        socket.emit('gl:class:subscription-refused', {
          classId,
          error: 'Accès refusé à cette classe',
        });
      }
    });

    logger.debug(
      {
        socketId: socket.id,
        userType: socket.data?.auth?.userType || null,
        roleSlug: socket.data?.auth?.roleSlug || null,
      },
      'Client Socket.IO connecté',
    );
    socket.on('disconnect', (reason) => {
      void unregisterPresenceSocket(socket);
      const abnormal =
        reason === 'transport error' || reason === 'transport close' || reason === 'ping timeout';
      if (abnormal) {
        logger.warn(
          {
            socketId: socket.id,
            reason,
            userType: socket.data?.auth?.userType || null,
            msg: 'socket_disconnect_abnormal',
          },
          'Socket.IO déconnexion anormale',
        );
      } else {
        logger.debug({ socketId: socket.id, reason }, 'Client Socket.IO déconnecté');
      }
    });
  });

  io.engine.on('connection_error', (err) => {
    const rawMsg = err && (err.message != null ? String(err.message) : String(err));
    const staleSession = typeof rawMsg === 'string' && /session id unknown/i.test(rawMsg);
    if (staleSession) {
      logger.debug(
        { err: { message: rawMsg, code: err?.code }, msg: 'socket_io_engine_stale_session' },
        'Socket.IO : session obsolète (reconnexion client attendue)',
      );
      return;
    }
    logger.warn(
      { err, msg: 'socket_io_engine_connection_error' },
      'Socket.IO moteur : erreur de connexion',
    );
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

/** Ferme les connexions Socket.IO avant `server.close()` (arrêt gracieux). */
function shutdownRealtime() {
  return new Promise((resolve) => {
    for (const t of presenceEmitTimers.values()) clearTimeout(t);
    presenceEmitTimers.clear();
    presenceRefcounts.clear();
    if (!io) {
      resolve();
      return;
    }
    const instance = io;
    io = null;
    instance.close((err) => {
      if (err) {
        logger.warn({ err, msg: 'socket_io_shutdown' }, 'Socket.IO : fermeture avec avertissement');
      } else {
        logger.info({ msg: 'socket_io_shutdown' }, 'Socket.IO fermé');
      }
      resolve();
    });
  });
}

/** Alias explicite pour les tests : remet le singleton à zéro entre serveurs éphémères. */
const resetRealtimeForTests = shutdownRealtime;

/** Cache coupe-circuit emits (évite async dans le chemin chaud). */
let signalsEnabledCache = true;
let signalsEnabledCacheAt = 0;
const SIGNALS_CACHE_TTL_MS = 5000;

function refreshSignalsEnabledCache() {
  void getSettingValue('runtime.realtime_signals_enabled', true)
    .then((v) => {
      signalsEnabledCache = v !== false;
      signalsEnabledCacheAt = Date.now();
    })
    .catch(() => {
      signalsEnabledCache = true;
      signalsEnabledCacheAt = Date.now();
    });
}

function safeEmit(event, payload, options = {}) {
  if (!io) return;
  try {
    if (Date.now() - signalsEnabledCacheAt > SIGNALS_CACHE_TTL_MS) {
      refreshSignalsEnabledCache();
    }
    if (!signalsEnabledCache) return;
    const body = { ts: Date.now(), ...payload };
    const domain =
      options.domain && DOMAIN_ROOM[options.domain] ? DOMAIN_ROOM[options.domain] : null;
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

/** Après création ou suppression d’une observation (carnet) */
function emitObservationsChanged(extra = {}) {
  safeEmit('observations:changed', extra, { domain: 'observations' });
}

function emitGlGameEvent(gameId, payload = {}) {
  if (!io) return;
  try {
    io.to(glGameRoomName(gameId)).emit('gl:game:event', {
      ts: Date.now(),
      gameId,
      ...payload,
    });
  } catch (err) {
    logger.warn({ err, gameId }, 'Émission Socket.IO G&L en échec');
  }
}

function emitGlSpellCastDraftChanged(gameId, payload = {}) {
  if (!io) return;
  const normalizedGameId = Number(gameId);
  if (!Number.isFinite(normalizedGameId) || normalizedGameId <= 0) return;
  try {
    io.to(glGameRoomName(normalizedGameId)).emit('gl:spell_cast:draft', {
      ts: Date.now(),
      gameId: normalizedGameId,
      ...payload,
    });
  } catch (err) {
    logger.warn({ err, gameId: normalizedGameId }, 'Émission Socket.IO brouillon sort GL en échec');
  }
}

function emitGlMarketTradeChanged(classId, payload = {}) {
  if (!io) return;
  const normalizedClassId = Number(classId);
  if (!Number.isFinite(normalizedClassId) || normalizedClassId <= 0) return;
  try {
    io.to(glClassRoomName(normalizedClassId)).emit('gl:market:trade-changed', {
      ts: Date.now(),
      classId: normalizedClassId,
      ...payload,
    });
  } catch (err) {
    logger.warn({ err, classId: normalizedClassId }, 'Émission Socket.IO marché GL en échec');
  }
}

module.exports = {
  initRealtime,
  shutdownRealtime,
  resetRealtimeForTests,
  emitTasksChanged,
  emitStudentsChanged,
  emitGardenChanged,
  emitForumChanged,
  emitContextCommentsChanged,
  emitObservationsChanged,
  emitGlGameEvent,
  emitGlSpellCastDraftChanged,
  emitGlMarketTradeChanged,
  getRealtimeSnapshot,
  getOnlineUserIdSet,
  glClassRoomName,
  parseSocketToken,
  PRESENCE_EVENT,
};
