'use strict';

/**
 * Émetteurs de notifications métier : chaque fonction nomme l'élément concerné (titre de la
 * tâche, nom du lieu, sujet du fil), choisit ses destinataires et pose la cible à ouvrir.
 *
 * Les routes les appellent via `fireAndForget` : la réponse HTTP n'attend jamais la
 * notification, et une panne ici ne fait jamais échouer l'action de l'élève ou du prof.
 */

const { queryOne } = require('../database');
const logger = require('./logger');
const { resolveTaskMapId } = require('./taskRouteHelpers');
const {
  notifyUsers,
  truncate,
  shortPersonName,
  formatDayMonth,
  listUserIdsWithPermission,
  listTaskAssigneeIds,
  listTaskReferentIds,
  listForumThreadParticipantIds,
  loadPlaceSummary,
} = require('./notifications');

const EXCERPT_MAX = 140;

const PLACE_STATUS_LABELS = Object.freeze({
  pris_en_compte: 'a été pris en compte',
  traite: 'a été traité',
  sans_suite: 'a été classé sans suite',
});

/** Lance une émission sans l'attendre ; toute erreur est journalisée, jamais propagée. */
function fireAndForget(fn, context = {}) {
  Promise.resolve()
    .then(fn)
    .catch((err) => logger.warn({ err, ...context }, 'Notification métier non émise'));
}

function quote(title) {
  return `« ${truncate(title || 'Sans titre', 80)} »`;
}

/** Retire le balisage Markdown léger pour un extrait lisible dans la cloche. */
function plainExcerpt(text, max = EXCERPT_MAX) {
  const plain = String(text || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return truncate(plain, max);
}

function taskPlaceLabel(task) {
  const zone = Array.isArray(task?.zones) ? task.zones.find((z) => z?.name) : null;
  if (zone) return String(zone.name);
  const marker = Array.isArray(task?.markers) ? task.markers.find((m) => m?.label) : null;
  return marker ? String(marker.label) : '';
}

function taskTarget(task, filter) {
  return {
    type: 'task',
    id: String(task.id),
    mapId: resolveTaskMapId(task) || null,
    ...(filter ? { filter } : {}),
  };
}

/** « Mare — échéance 24/09 » : le lieu et l'échéance quand ils existent. */
function taskContextLine(task) {
  const parts = [];
  const place = taskPlaceLabel(task);
  if (place) parts.push(place);
  const due = formatDayMonth(task?.due_date);
  if (due) parts.push(`échéance ${due}`);
  return parts.join(' — ');
}

async function loadUserShortName(userId) {
  if (!userId) return '';
  const row = await queryOne(
    'SELECT first_name, last_name, display_name, pseudo FROM users WHERE id = ? LIMIT 1',
    [userId],
  );
  if (!row) return '';
  const short = shortPersonName(row.first_name, row.last_name);
  return short || String(row.display_name || row.pseudo || '').trim();
}

async function loadMapLabel(mapId) {
  if (!mapId) return '';
  const row = await queryOne('SELECT label FROM maps WHERE id = ? LIMIT 1', [mapId]);
  return row?.label ? String(row.label) : '';
}

function referentIdsOf(task) {
  return Array.isArray(task?.referent_user_ids) ? task.referent_user_ids.filter(Boolean) : [];
}

function assigneeIdsOf(task) {
  return (Array.isArray(task?.assignments) ? task.assignments : [])
    .map((a) => a?.student_id)
    .filter(Boolean);
}

// ── Tâches ──────────────────────────────────────────────────────────────────────────────

async function notifyTaskProposed({ task, proposerFirstName, proposerLastName, actorUserId }) {
  if (!task) return null;
  const proposer = shortPersonName(proposerFirstName, proposerLastName);
  const context = taskContextLine(task);
  return notifyUsers({
    userIds: await listUserIdsWithPermission('tasks.validate'),
    actorUserId,
    kind: 'task_proposed',
    title: `Nouvelle proposition : ${quote(task.title)}`,
    body: [proposer ? `Proposée par ${proposer}` : 'Proposée par un n3beur', context]
      .filter(Boolean)
      .join(' — '),
    target: taskTarget(task),
  });
}

async function notifyTaskSelfAssigned({ task, firstName, lastName, actorUserId }) {
  if (!task) return null;
  const who = shortPersonName(firstName, lastName) || 'Un n3beur';
  const taken = Array.isArray(task.assignments) ? task.assignments.length : 0;
  const seats = Number(task.required_students) || 0;
  return notifyUsers({
    userIds: referentIdsOf(task),
    actorUserId,
    kind: 'task_assigned_self',
    title: `${who} a pris ${quote(task.title)}`,
    body: [seats ? `${taken}/${seats} place(s) occupée(s)` : '', taskContextLine(task)]
      .filter(Boolean)
      .join(' — '),
    target: taskTarget(task),
  });
}

async function notifyTaskGroupAssigned({ task, studentIds, actorUserId }) {
  if (!task) return null;
  return notifyUsers({
    userIds: studentIds,
    actorUserId,
    kind: 'task_assigned_group',
    title: `Vous êtes inscrit à ${quote(task.title)}`,
    body: taskContextLine(task) || 'Retrouvez-la dans vos tâches.',
    target: taskTarget(task),
  });
}

async function notifyTaskDone({ task, firstName, lastName, actorUserId }) {
  if (!task || task.status !== 'done') return null;
  const who = shortPersonName(firstName, lastName);
  const validators = await listUserIdsWithPermission('tasks.validate');
  return notifyUsers({
    userIds: [...referentIdsOf(task), ...validators],
    actorUserId,
    kind: 'task_done',
    title: `${quote(task.title)} attend votre validation`,
    body: [who ? `Marquée faite par ${who}` : 'Marquée faite', taskContextLine(task)]
      .filter(Boolean)
      .join(' — '),
    target: taskTarget(task, 'to_validate'),
  });
}

/**
 * Transition de statut décidée par un n3boss (validation, renvoi, acceptation d'une
 * proposition). `task` est l'état **après** la modification.
 */
async function notifyTaskStatusChange({ task, previousStatus, actorUserId }) {
  if (!task) return null;
  const prev = String(previousStatus || '');
  const next = String(task.status || '');
  if (prev === next) return null;
  const results = [];
  if (next === 'validated') {
    results.push(
      await notifyUsers({
        userIds: assigneeIdsOf(task),
        actorUserId,
        kind: 'task_validated',
        title: `${quote(task.title)} est validée`,
        body: 'Votre participation a été validée.',
        target: taskTarget(task),
      }),
    );
  } else if (prev === 'done' && (next === 'in_progress' || next === 'available')) {
    results.push(
      await notifyUsers({
        userIds: assigneeIdsOf(task),
        actorUserId,
        kind: 'task_reopened',
        title: `${quote(task.title)} est à reprendre`,
        body: 'La tâche a été renvoyée en cours : elle n’est pas encore validée.',
        target: taskTarget(task),
      }),
    );
  }
  if (prev === 'proposed' && next !== 'proposed' && task.proposed_by_student_id) {
    results.push(
      await notifyUsers({
        userIds: [task.proposed_by_student_id],
        actorUserId,
        kind: 'task_proposal_accepted',
        title: `Votre proposition ${quote(task.title)} est acceptée`,
        body: taskContextLine(task) || 'Elle rejoint la liste des tâches.',
        target: taskTarget(task),
      }),
    );
  }
  return results;
}

/** À appeler avec les inscrits et le proposeur lus **avant** la suppression. */
async function notifyTaskDeleted({ task, assigneeIds, proposerId, actorUserId }) {
  if (!task) return null;
  if (String(task.status || '') === 'proposed') {
    if (!proposerId) return null;
    return notifyUsers({
      userIds: [proposerId],
      actorUserId,
      kind: 'task_proposal_rejected',
      title: `Votre proposition ${quote(task.title)} n’a pas été retenue`,
      body: 'Elle a été retirée par un n3boss.',
    });
  }
  return notifyUsers({
    userIds: assigneeIds,
    actorUserId,
    kind: 'task_deleted',
    title: `${quote(task.title)} a été supprimée`,
    body: 'Vous n’y êtes plus inscrit.',
  });
}

// ── Commentaires de contexte (tâches, lieux) ──────────────────────────────────────────────

async function loadTaskForComment(taskId) {
  const task = await queryOne(
    `SELECT t.id, t.title, t.map_id, z.map_id AS zone_map_id, m.map_id AS marker_map_id
       FROM tasks t
       LEFT JOIN zones z ON z.id = t.zone_id
       LEFT JOIN map_markers m ON m.id = t.marker_id
      WHERE t.id = ? LIMIT 1`,
    [taskId],
  );
  return task || null;
}

async function notifyContextComment({ contextType, contextId, body, actorUserId }) {
  const author = await loadUserShortName(actorUserId);
  const excerpt = plainExcerpt(body);
  const bodyLine = author ? `${author} : ${excerpt}` : excerpt;
  if (contextType === 'task') {
    const task = await loadTaskForComment(contextId);
    if (!task) return null;
    const [assignees, referents] = await Promise.all([
      listTaskAssigneeIds(task.id),
      listTaskReferentIds(task.id),
    ]);
    return notifyUsers({
      userIds: [...assignees, ...referents],
      actorUserId,
      kind: 'task_comment',
      title: `Nouveau commentaire sur ${quote(task.title)}`,
      body: bodyLine,
      target: taskTarget(task),
    });
  }
  if (contextType === 'zone' || contextType === 'marker') {
    const place = await loadPlaceSummary(contextType, contextId);
    if (!place) return null;
    const mapLabel = await loadMapLabel(place.map_id);
    return notifyUsers({
      userIds: await listUserIdsWithPermission('place_messages.manage'),
      actorUserId,
      kind: 'place_message',
      title: `Message sur ${quote(place.label)}${mapLabel ? ` (${truncate(mapLabel, 40)})` : ''}`,
      body: bodyLine,
      target: { type: 'place', id: String(place.id), mapId: place.map_id, kind: contextType },
    });
  }
  return null;
}

/** Retour à l'auteur d'un message de lieu : son message a changé de statut. */
async function notifyPlaceMessageStatus({ commentId, status, actorUserId }) {
  const label = PLACE_STATUS_LABELS[status];
  if (!label) return null;
  const comment = await queryOne(
    `SELECT id, context_type, context_id, body, author_user_id
       FROM context_comments WHERE id = ? LIMIT 1`,
    [commentId],
  );
  if (!comment?.author_user_id) return null;
  const place = await loadPlaceSummary(String(comment.context_type), String(comment.context_id));
  const placeName = place?.label ? quote(place.label) : 'un lieu supprimé';
  return notifyUsers({
    userIds: [comment.author_user_id],
    actorUserId,
    kind: 'place_message_status',
    title: `Votre message sur ${placeName} ${label}`,
    body: plainExcerpt(comment.body),
    target: place
      ? {
          type: 'place',
          id: String(place.id),
          mapId: place.map_id,
          kind: String(comment.context_type),
        }
      : null,
  });
}

// ── Forum ─────────────────────────────────────────────────────────────────────────────────

async function notifyForumReply({ threadId, postId, body, actorUserId }) {
  const thread = await queryOne('SELECT id, title FROM forum_threads WHERE id = ? LIMIT 1', [
    threadId,
  ]);
  if (!thread) return null;
  const author = await loadUserShortName(actorUserId);
  const excerpt = plainExcerpt(body);
  return notifyUsers({
    userIds: await listForumThreadParticipantIds(thread.id),
    actorUserId,
    kind: 'forum_reply',
    title: `Nouvelle réponse dans ${quote(thread.title)}`,
    body: author ? `${author} : ${excerpt}` : excerpt,
    target: { type: 'thread', id: String(thread.id), postId: postId ? String(postId) : null },
  });
}

module.exports = {
  fireAndForget,
  plainExcerpt,
  taskContextLine,
  notifyTaskProposed,
  notifyTaskSelfAssigned,
  notifyTaskGroupAssigned,
  notifyTaskDone,
  notifyTaskStatusChange,
  notifyTaskDeleted,
  notifyContextComment,
  notifyPlaceMessageStatus,
  notifyForumReply,
  PLACE_STATUS_LABELS,
};
