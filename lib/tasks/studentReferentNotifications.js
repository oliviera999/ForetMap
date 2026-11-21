'use strict';

/**
 * Notifications des élèves référents automatiques (lot 7), émises par le moteur
 * (`lib/tasks/studentReferents.js`) après une application réussie — jamais par le clonage :
 * un lien recopié d'une occurrence à l'autre n'est pas un nouvel octroi.
 *
 *  - `task_referent_granted` : à l'élève, une fois par série (clé anti-doublon par série) ;
 *  - `task_referent_granted_manager` : aux comptes qui détiennent `tasks.manage`, si
 *    `tasks.student_referent_notify_managers` est vrai ;
 *  - `task_referent_removed_manager` : retrait automatique, aux mêmes comptes (l'élève n'est
 *    pas prévenu), sous le même réglage.
 *
 * Les trois sont rangés dans la catégorie « tâches » des préférences de notification
 * (`src/utils/notificationTargets.js`) : désactivables comme les autres avis de tâches.
 */

const { queryAll } = require('../../database');
const {
  notifyUsers,
  truncate,
  shortPersonName,
  listUserIdsWithPermission,
} = require('../notifications');

const KINDS = Object.freeze({
  GRANTED: 'task_referent_granted',
  GRANTED_MANAGER: 'task_referent_granted_manager',
  REMOVED_MANAGER: 'task_referent_removed_manager',
});

const REMOVAL_LABELS = Object.freeze({
  not_eligible: 'plus dans le groupe de l’année ou compte inactif',
  below_threshold: 'seuil d’occurrences validées non atteint',
  veto: 'retiré par un gestionnaire',
  inactivity: 'série non réalisée depuis longtemps',
});

function quote(title) {
  return `« ${truncate(title || 'Sans titre', 80)} »`;
}

function seriesTarget(plan, seriesId) {
  const taskId = plan.series?.[seriesId]?.taskIds?.[0];
  return taskId ? { type: 'task', id: String(taskId) } : null;
}

async function loadShortNames(userIds) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const rows = await queryAll(
    `SELECT id, first_name, last_name, display_name, pseudo FROM users WHERE id IN (${ids
      .map(() => '?')
      .join(',')})`,
    ids,
  );
  return new Map(
    rows.map((r) => [
      String(r.id),
      shortPersonName(r.first_name, r.last_name) || String(r.display_name || r.pseudo || '').trim(),
    ]),
  );
}

/**
 * @param {{ plan: object, added: Array, removed: Array, notifyManagers: boolean }} input
 */
async function notifyStudentReferentChanges({ plan, added = [], removed = [], notifyManagers }) {
  if (!added.length && !removed.length) return { sent: 0 };
  const titleOf = (sid) => plan.series?.[sid]?.title || '';
  const names = notifyManagers
    ? await loadShortNames([...added, ...removed].map((e) => e.userId))
    : new Map();
  const managers = notifyManagers ? await listUserIdsWithPermission('tasks.manage') : [];
  let sent = 0;
  for (const a of added) {
    const res = await notifyUsers({
      userIds: [a.userId],
      kind: KINDS.GRANTED,
      title: `Tu es désormais référent·e de la tâche ${quote(titleOf(a.seriesId))}`,
      body: `Tu l’as réalisée ${a.count} fois : les autres n3beurs peuvent te demander comment s’y prendre.`,
      target: seriesTarget(plan, a.seriesId),
      dedupeKey: `${KINDS.GRANTED}:${a.seriesId}`,
    });
    sent += res.inserted;
    if (managers.length) {
      const who = names.get(a.userId) || 'Un n3beur';
      const mres = await notifyUsers({
        userIds: managers.filter((id) => id !== a.userId),
        kind: KINDS.GRANTED_MANAGER,
        title: `${who} devient référent·e de ${quote(titleOf(a.seriesId))}`,
        body: `${a.count} occurrences validées de cette série (référent automatique).`,
        target: seriesTarget(plan, a.seriesId),
        dedupeKey: `${KINDS.GRANTED_MANAGER}:${a.seriesId}:${a.userId}`,
      });
      sent += mres.inserted;
    }
  }
  if (managers.length) {
    for (const r of removed) {
      const who = names.get(r.userId) || 'Un n3beur';
      const res = await notifyUsers({
        userIds: managers.filter((id) => id !== r.userId),
        kind: KINDS.REMOVED_MANAGER,
        title: `${who} n’est plus référent·e de ${quote(titleOf(r.seriesId))}`,
        body: `Retrait automatique : ${REMOVAL_LABELS[r.reason] || 'règle non remplie'}.`,
        target: seriesTarget(plan, r.seriesId),
      });
      sent += res.inserted;
    }
  }
  return { sent };
}

module.exports = { KINDS, notifyStudentReferentChanges };
