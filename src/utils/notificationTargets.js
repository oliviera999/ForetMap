import { NOTIFICATION_CATEGORY, NOTIFICATION_LEVEL } from '../constants/notifications.js';

/**
 * Notifications serveur (`GET /api/notifications`) → éléments du centre de notifications,
 * et libellé d'action lisible pour chaque cible (« Voir la tâche », « Voir le lieu et ses
 * messages »…). Fonctions pures, testées dans `tests-ui/utils/notificationTargets.test.js`.
 */

const KIND_META = {
  task_proposed: [NOTIFICATION_LEVEL.IMPORTANT, NOTIFICATION_CATEGORY.PROPOSALS],
  task_done: [NOTIFICATION_LEVEL.IMPORTANT, NOTIFICATION_CATEGORY.VALIDATIONS],
  task_assigned_self: [NOTIFICATION_LEVEL.INFO, NOTIFICATION_CATEGORY.TASKS],
  task_assigned_group: [NOTIFICATION_LEVEL.INFO, NOTIFICATION_CATEGORY.TASKS],
  task_validated: [NOTIFICATION_LEVEL.INFO, NOTIFICATION_CATEGORY.TASKS],
  task_reopened: [NOTIFICATION_LEVEL.IMPORTANT, NOTIFICATION_CATEGORY.TASKS],
  task_proposal_accepted: [NOTIFICATION_LEVEL.INFO, NOTIFICATION_CATEGORY.TASKS],
  task_proposal_rejected: [NOTIFICATION_LEVEL.INFO, NOTIFICATION_CATEGORY.TASKS],
  task_deleted: [NOTIFICATION_LEVEL.INFO, NOTIFICATION_CATEGORY.TASKS],
  task_comment: [NOTIFICATION_LEVEL.INFO, NOTIFICATION_CATEGORY.MESSAGES],
  place_message: [NOTIFICATION_LEVEL.INFO, NOTIFICATION_CATEGORY.MESSAGES],
  place_message_status: [NOTIFICATION_LEVEL.INFO, NOTIFICATION_CATEGORY.MESSAGES],
  forum_reply: [NOTIFICATION_LEVEL.INFO, NOTIFICATION_CATEGORY.MESSAGES],
  task_deadline_soon: [NOTIFICATION_LEVEL.IMPORTANT, NOTIFICATION_CATEGORY.DEADLINES],
  task_overdue: [NOTIFICATION_LEVEL.CRITICAL, NOTIFICATION_CATEGORY.DEADLINES],
};

export const SERVER_NOTIFICATION_ID_PREFIX = 'srv-';

export function isServerNotificationId(id) {
  return String(id || '').startsWith(SERVER_NOTIFICATION_ID_PREFIX);
}

export function serverIdFromNotificationId(id) {
  return isServerNotificationId(id) ? String(id).slice(SERVER_NOTIFICATION_ID_PREFIX.length) : null;
}

/** Ligne renvoyée par l'API → élément du centre (même forme que les avis locaux). */
export function notificationFromServer(row) {
  const [level, category] = KIND_META[row?.kind] || [
    NOTIFICATION_LEVEL.INFO,
    NOTIFICATION_CATEGORY.TASKS,
  ];
  const id = `${SERVER_NOTIFICATION_ID_PREFIX}${row?.id}`;
  return {
    id,
    key: id,
    source: 'server',
    serverId: row?.id,
    kind: row?.kind || null,
    level,
    category,
    title: String(row?.title || ''),
    message: String(row?.body || ''),
    target: row?.target || null,
    action: null,
    read: !!row?.read,
    createdAt: row?.created_at || new Date().toISOString(),
  };
}

/** Libellé d'action d'une cible (bouton ou lien de la notification). */
export function targetActionLabel(target) {
  if (!target?.type) return '';
  if (target.type === 'task') {
    if (target.filter === 'to_validate')
      return target.id ? 'Voir la tâche à valider' : 'Voir les tâches à valider';
    if (target.filter === 'overdue')
      return target.id ? 'Voir la tâche en retard' : 'Voir les tâches en retard';
    return target.id ? 'Voir la tâche' : 'Voir mes tâches';
  }
  if (target.type === 'place') return 'Voir le lieu et ses messages';
  if (target.type === 'thread') return target.postId ? 'Voir la réponse' : 'Ouvrir le sujet';
  if (target.type === 'settings') return 'Ouvrir les réglages';
  return '';
}

/** La notification mène-t-elle quelque part (clic sur l'avis) ? */
export function isNotificationActionable(item) {
  if (!item) return false;
  if (item.target?.type) return true;
  const action = item.action || {};
  return !!(action.target?.type || action.tab || action.type);
}

/** Libellé d'action affiché sur l'avis ou dans le bandeau critique. */
export function notificationActionLabel(item) {
  if (!item) return '';
  const fromTarget = targetActionLabel(item.target || item.action?.target);
  if (fromTarget) return fromTarget;
  if (item.action?.label) return String(item.action.label);
  if (item.action?.type === 'retryStudentValidation') return 'Réessayer';
  if (item.action?.tab) return 'Ouvrir';
  return '';
}

/** Tri par date décroissante (les plus récentes en tête), sans muter l'entrée. */
export function sortNotificationsByDateDesc(list) {
  return (Array.isArray(list) ? list : []).slice().sort((a, b) => {
    const ta = Date.parse(a?.createdAt || '') || 0;
    const tb = Date.parse(b?.createdAt || '') || 0;
    return tb - ta;
  });
}
