'use strict';

/**
 * Notifications adressées à un compte précis (migration 289).
 *
 * Chaque notification nomme l'élément concerné (titre de la tâche, nom du lieu, sujet du fil)
 * et porte une **cible** que le client sait ouvrir : `task`, `place`, `thread` ou `settings`.
 *
 * Règles communes à tous les émetteurs :
 *  - l'auteur de l'action n'est jamais notifié de sa propre action ;
 *  - une notification ne fait jamais échouer l'action métier (`notifyUsersInBackground`) ;
 *  - pas de notification sans destinataire (audit communication 2026-09-18, §C2).
 */

const { queryAll, queryOne, execute } = require('../database');
const logger = require('./logger');
const { emitNotificationToUsers } = require('./realtime');

const TARGET_TYPES = Object.freeze(['task', 'place', 'thread', 'settings']);
const PLACE_KINDS = Object.freeze(['zone', 'marker']);
const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 100;
const DEFAULT_RETENTION_DAYS = 60;
const TITLE_MAX = 200;
const BODY_MAX = 500;

function truncate(value, max) {
  const text = String(value == null ? '' : value)
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** « Prénom N. » — assez pour reconnaître quelqu'un sans afficher son nom complet. */
function shortPersonName(firstName, lastName) {
  const first = String(firstName || '').trim();
  const last = String(lastName || '').trim();
  if (!first && !last) return '';
  if (!last) return first;
  if (!first) return last;
  return `${first} ${last.charAt(0).toUpperCase()}.`;
}

/** « 24/09 » pour une date `YYYY-MM-DD` (ou Date) ; chaîne vide sinon. */
function formatDayMonth(value) {
  if (!value) return '';
  const raw = value instanceof Date ? value.toISOString() : String(value);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : '';
}

/** Cible normalisée ; `null` si le type n'est pas au catalogue. */
function normalizeTarget(target) {
  if (!target || typeof target !== 'object') return null;
  const type = String(target.type || '').trim();
  if (!TARGET_TYPES.includes(type)) return null;
  const id = target.id == null || target.id === '' ? null : truncate(target.id, 64);
  const mapId = target.mapId == null || target.mapId === '' ? null : truncate(target.mapId, 64);
  const extra = {};
  if (type === 'place') {
    const kind = String(target.kind || '').trim();
    extra.kind = PLACE_KINDS.includes(kind) ? kind : 'zone';
  }
  if (type === 'thread' && target.postId) extra.postId = String(target.postId);
  if (type === 'settings' && target.section) extra.section = String(target.section);
  if (type === 'task' && target.filter) extra.filter = String(target.filter);
  return { type, id, mapId, extra };
}

function uniqueIds(ids) {
  return [...new Set((ids || []).map((id) => String(id == null ? '' : id).trim()).filter(Boolean))];
}

/**
 * Crée une notification par destinataire et prévient leurs sessions ouvertes.
 *
 * @param {{
 *   userIds: string[], kind: string, title: string, body?: string,
 *   target?: { type: string, id?: string, mapId?: string, kind?: string, postId?: string,
 *              section?: string, filter?: string },
 *   actorUserId?: string|null, dedupeKey?: string|null,
 *   db?: { queryAll: Function, execute: Function }
 * }} params
 * @returns {Promise<{ inserted: number, userIds: string[] }>}
 */
async function notifyUsers(params = {}) {
  const db = params.db || { queryAll, execute };
  const actor = params.actorUserId == null ? '' : String(params.actorUserId).trim();
  const candidates = uniqueIds(params.userIds).filter((id) => id !== actor);
  const title = truncate(params.title, TITLE_MAX);
  const kind = truncate(params.kind, 48);
  if (!candidates.length || !title || !kind) return { inserted: 0, userIds: [] };

  const placeholders = candidates.map(() => '?').join(', ');
  const existing = await db.queryAll(
    `SELECT id FROM users WHERE id IN (${placeholders}) AND is_active = 1`,
    candidates,
  );
  const recipients = uniqueIds(existing.map((row) => row.id));
  if (!recipients.length) return { inserted: 0, userIds: [] };

  const target = normalizeTarget(params.target);
  const body = params.body ? truncate(params.body, BODY_MAX) : null;
  const extraJson =
    target && Object.keys(target.extra).length ? JSON.stringify(target.extra) : null;
  const dedupeKey = params.dedupeKey ? truncate(params.dedupeKey, 120) : null;

  const rows = [];
  const values = [];
  for (const userId of recipients) {
    rows.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    values.push(
      userId,
      kind,
      title,
      body,
      target ? target.type : null,
      target ? target.id : null,
      target ? target.mapId : null,
      extraJson,
      actor || null,
      dedupeKey,
    );
  }
  // INSERT IGNORE : le doublon (même compte, même `dedupe_key`) est silencieusement écarté.
  const result = await db.execute(
    `INSERT IGNORE INTO notifications
       (user_id, kind, title, body, target_type, target_id, map_id, target_extra_json,
        actor_user_id, dedupe_key)
     VALUES ${rows.join(', ')}`,
    values,
  );
  const inserted = Number(result?.affectedRows) || 0;
  if (inserted > 0) emitNotificationToUsers(recipients, { kind });
  return { inserted, userIds: recipients };
}

/** Variante « lancer sans attendre » : une panne de notification ne remonte jamais. */
function notifyUsersInBackground(params) {
  Promise.resolve()
    .then(() => notifyUsers(params))
    .catch((err) => {
      logger.warn({ err, kind: params?.kind }, 'Notification non créée');
    });
}

/** Comptes actifs dont le rôle principal porte la permission. */
async function listUserIdsWithPermission(permissionKey) {
  const rows = await queryAll(
    `SELECT DISTINCT u.id
       FROM users u
       INNER JOIN user_roles ur ON ur.user_id = u.id AND ur.is_primary = 1
       INNER JOIN role_permissions rp ON rp.role_id = ur.role_id
      WHERE rp.permission_key = ? AND u.is_active = 1`,
    [permissionKey],
  );
  return uniqueIds(rows.map((row) => row.id));
}

async function listTaskAssigneeIds(taskId) {
  const rows = await queryAll(
    'SELECT student_id FROM task_assignments WHERE task_id = ? AND student_id IS NOT NULL',
    [taskId],
  );
  return uniqueIds(rows.map((row) => row.student_id));
}

async function listTaskReferentIds(taskId) {
  const rows = await queryAll('SELECT user_id FROM task_referents WHERE task_id = ?', [taskId]);
  return uniqueIds(rows.map((row) => row.user_id));
}

/** Auteur du sujet et auteurs des messages non supprimés du fil. */
async function listForumThreadParticipantIds(threadId) {
  const rows = await queryAll(
    `SELECT author_user_id AS id FROM forum_threads WHERE id = ?
     UNION
     SELECT author_user_id AS id FROM forum_posts WHERE thread_id = ? AND is_deleted = 0`,
    [threadId, threadId],
  );
  return uniqueIds(rows.map((row) => row.id));
}

/** Lieu (zone ou repère) : libellé et carte, pour nommer la notification. */
async function loadPlaceSummary(kind, id) {
  if (kind === 'zone') {
    return queryOne('SELECT id, name AS label, map_id FROM zones WHERE id = ? LIMIT 1', [id]);
  }
  if (kind === 'marker') {
    return queryOne('SELECT id, label, map_id FROM map_markers WHERE id = ? LIMIT 1', [id]);
  }
  return null;
}

function parseExtra(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function serializeNotification(row) {
  const extra = parseExtra(row.target_extra_json);
  const target = row.target_type
    ? {
        type: String(row.target_type),
        id: row.target_id == null ? null : String(row.target_id),
        mapId: row.map_id == null ? null : String(row.map_id),
        ...extra,
      }
    : null;
  return {
    id: String(row.id),
    kind: String(row.kind),
    title: String(row.title),
    body: row.body == null ? '' : String(row.body),
    target,
    read: row.read_at != null,
    read_at: row.read_at || null,
    created_at: row.created_at,
  };
}

function normalizeListLimit(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIST_LIMIT;
  return Math.min(parsed, MAX_LIST_LIMIT);
}

/**
 * Notifications d'un compte, de la plus récente à la plus ancienne. `before` (id) pagine.
 * @returns {Promise<{ items: object[], unread_count: number }>}
 */
async function listNotificationsForUser(userId, { limit, before } = {}) {
  const pageSize = normalizeListLimit(limit);
  const beforeId = parseInt(before, 10);
  const params = [userId];
  let beforeClause = '';
  if (Number.isFinite(beforeId) && beforeId > 0) {
    beforeClause = 'AND id < ?';
    params.push(String(beforeId));
  }
  // LIMIT en chaîne : mysql2 encode un nombre JS en DOUBLE, refusé par MySQL pour LIMIT.
  params.push(String(pageSize));
  const rows = await queryAll(
    `SELECT id, kind, title, body, target_type, target_id, map_id, target_extra_json,
            read_at, created_at
       FROM notifications
      WHERE user_id = ? ${beforeClause}
      ORDER BY id DESC
      LIMIT ?`,
    params,
  );
  const unread = await queryOne(
    'SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL',
    [userId],
  );
  return { items: rows.map(serializeNotification), unread_count: Number(unread?.c || 0) };
}

async function markNotificationRead(userId, id) {
  const result = await execute(
    'UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE id = ? AND user_id = ?',
    [id, userId],
  );
  return Number(result?.affectedRows) > 0;
}

async function markAllNotificationsRead(userId) {
  const result = await execute(
    'UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL',
    [userId],
  );
  return Number(result?.affectedRows) || 0;
}

async function deleteNotification(userId, id) {
  const result = await execute('DELETE FROM notifications WHERE id = ? AND user_id = ?', [
    id,
    userId,
  ]);
  return Number(result?.affectedRows) > 0;
}

/** Purge quotidienne : les notifications plus anciennes que la rétention sont supprimées. */
async function purgeOldNotifications(opts = {}) {
  const db = opts.db || { execute };
  const days = Math.max(1, Math.floor(Number(opts.olderThanDays) || DEFAULT_RETENTION_DAYS));
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await db.execute('DELETE FROM notifications WHERE created_at < ?', [cutoff]);
  const purged = Number(result?.affectedRows) || 0;
  if (purged > 0) logger.info({ purged, days }, 'Notifications anciennes purgées');
  return { purged, days };
}

module.exports = {
  TARGET_TYPES,
  DEFAULT_RETENTION_DAYS,
  truncate,
  shortPersonName,
  formatDayMonth,
  normalizeTarget,
  notifyUsers,
  notifyUsersInBackground,
  listUserIdsWithPermission,
  listTaskAssigneeIds,
  listTaskReferentIds,
  listForumThreadParticipantIds,
  loadPlaceSummary,
  serializeNotification,
  listNotificationsForUser,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  purgeOldNotifications,
};
