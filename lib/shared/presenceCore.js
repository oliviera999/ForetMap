'use strict';

/**
 * Cœur présence « en ligne » partagé ForetMap / GL.
 * Seuils, libellés, rooms staff, authz subscribe, enrichissement de lignes stats.
 * La map refcount / emit vit dans `lib/realtime.js` (singleton Socket.IO).
 */

const PRESENCE_EVENT = 'presence:update';
const PRESENCE_STATUS = Object.freeze({
  ONLINE: 'online',
  RECENT: 'recent',
  OFFLINE: 'offline',
});

/** Fenêtre « vu récemment » après déconnexion (ms). */
const RECENT_WINDOW_MS = 15 * 60 * 1000;

const STATUS_LABELS_FR = Object.freeze({
  online: 'En ligne',
  recent: 'Vu récemment',
  offline: 'Hors ligne',
});

function presenceStaffRoom(product) {
  const p = String(product || 'foret').toLowerCase() === 'gl' ? 'gl' : 'foret';
  return `presence:${p}-staff`;
}

function presenceKey(product, userId) {
  const p = String(product || 'foret').toLowerCase() === 'gl' ? 'gl' : 'foret';
  const id = String(userId || '').trim();
  return id ? `${p}:${id}` : null;
}

function parseLastSeenMs(lastSeen) {
  if (lastSeen == null || lastSeen === '') return null;
  // Depuis la migration 254, `users.last_seen` remonte en objet `Date` (colonne typée) ;
  // les jumeaux GL et les appels de test passent encore des chaînes.
  if (lastSeen instanceof Date) {
    const ms = lastSeen.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  const ms = Date.parse(String(lastSeen));
  return Number.isFinite(ms) ? ms : null;
}

/**
 * @param {{ socketConnected?: boolean, lastSeen?: string|Date|null, nowMs?: number }} opts
 * @returns {'online'|'recent'|'offline'}
 */
function resolvePresenceStatus({
  socketConnected = false,
  lastSeen = null,
  nowMs = Date.now(),
} = {}) {
  if (socketConnected) return PRESENCE_STATUS.ONLINE;
  const seenMs = parseLastSeenMs(lastSeen);
  if (seenMs != null && nowMs - seenMs < RECENT_WINDOW_MS) return PRESENCE_STATUS.RECENT;
  return PRESENCE_STATUS.OFFLINE;
}

function presenceLabelFr(status) {
  return STATUS_LABELS_FR[status] || STATUS_LABELS_FR.offline;
}

/**
 * Staff autorisé à rejoindre la room présence / voir les pastilles.
 * FM : permission stats.* ou teacher.access (admin inclus via permissions).
 * GL : gl_admin ou permission gl.players.manage.
 */
function canSubscribePresence(auth, product) {
  if (!auth) return false;
  const p = String(product || 'foret').toLowerCase();
  const perms = Array.isArray(auth.permissions) ? auth.permissions : [];
  if (p === 'gl') {
    const ut = String(auth.userType || '').toLowerCase();
    if (ut === 'gl_admin') return true;
    return perms.includes('gl.players.manage');
  }
  if (perms.includes('stats.read.all') || perms.includes('stats.read.group')) return true;
  if (perms.includes('teacher.access')) return true;
  const role = String(auth.roleSlug || '').toLowerCase();
  return role === 'admin' || role === 'n3boss';
}

/**
 * Identifiant suivi pour la présence socket (élève/prof FM ou joueur GL).
 * Invités / observateurs GL : null (pas de pastille).
 */
function presenceTrackedUserId(auth, product) {
  if (!auth) return null;
  const p = String(product || 'foret').toLowerCase();
  const ut = String(auth.userType || '').toLowerCase();
  const id = String(auth.userId || auth.canonicalUserId || '').trim();
  if (!id) return null;
  if (p === 'gl') {
    if (ut === 'gl_player' || ut === 'gl_admin') return id;
    return null;
  }
  if (ut === 'student' || ut === 'teacher') return id;
  return null;
}

/**
 * Enrichit des lignes stats avec `presence_status` / `presence_label`.
 * @param {Array<object>} rows
 * @param {{ onlineIds?: Set<string>|string[], idKey?: string, lastSeenKey?: string, nowMs?: number }} opts
 */
function attachPresenceStatus(rows, opts = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const idKey = opts.idKey || 'id';
  const lastSeenKey = opts.lastSeenKey || 'last_seen';
  const nowMs = opts.nowMs != null ? opts.nowMs : Date.now();
  const onlineSet = opts.onlineIds instanceof Set ? opts.onlineIds : new Set(opts.onlineIds || []);
  return list.map((row) => {
    const id = String(row?.[idKey] ?? '').trim();
    const socketConnected = id ? onlineSet.has(id) : false;
    const status = resolvePresenceStatus({
      socketConnected,
      lastSeen: row?.[lastSeenKey],
      nowMs,
    });
    return {
      ...row,
      presence_status: status,
      presence_label: presenceLabelFr(status),
    };
  });
}

function buildPresencePayload({ product, userId, status, lastSeen = null }) {
  return {
    product: String(product || 'foret').toLowerCase() === 'gl' ? 'gl' : 'foret',
    userId: String(userId),
    status,
    lastSeen: lastSeen || null,
    label: presenceLabelFr(status),
  };
}

module.exports = {
  PRESENCE_EVENT,
  PRESENCE_STATUS,
  RECENT_WINDOW_MS,
  STATUS_LABELS_FR,
  presenceStaffRoom,
  presenceKey,
  resolvePresenceStatus,
  presenceLabelFr,
  canSubscribePresence,
  presenceTrackedUserId,
  attachPresenceStatus,
  buildPresencePayload,
  parseLastSeenMs,
};
