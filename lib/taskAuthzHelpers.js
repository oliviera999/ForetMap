'use strict';

/**
 * Contrôles d'accès purs de `routes/tasks.js` (O10) : décisions calculées uniquement
 * depuis le payload auth déjà hydraté. Aucune I/O directe, aucun accès req/res/DB.
 */

const { hasPermission } = require('../middleware/requireTeacher');
const { normalizeTaskStatusForRead } = require('./taskStatusRecalc');
const { isVisitorRole } = require('./shared/visitorRoles');

function canReadAllAssignments(auth) {
  const perms = Array.isArray(auth?.permissions) ? auth.permissions : [];
  return (
    perms.includes('tasks.manage') ||
    perms.includes('tasks.validate') ||
    perms.includes('stats.read.all') ||
    perms.includes('stats.read.group')
  );
}

/**
 * Lecture **sans filtre de périmètre** des inscriptions et journaux (audit du 19/11/2026, T3) :
 * réservée aux permissions globales. `stats.read.group` (prof de classe) lit aussi les
 * inscriptions, mais bornées à ses groupes (`getScopedStudentIds`) — `canReadAllAssignments`
 * reste vrai pour lui et ne doit donc pas servir seul de garde « tout voir ».
 */
function canReadAllAssignmentsUnscoped(auth) {
  const perms = Array.isArray(auth?.permissions) ? auth.permissions : [];
  return (
    perms.includes('tasks.manage') ||
    perms.includes('tasks.validate') ||
    perms.includes('stats.read.all')
  );
}

function canManageTasks(auth) {
  return hasPermission(auth, 'tasks.manage');
}

function canValidateTasks(auth) {
  return hasPermission(auth, 'tasks.validate');
}

/**
 * Contrôle changement de statut tâche (PUT ou logique partagée avec POST validate).
 * @returns {{ ok: true } | { ok: false, status: number, error: string }}
 */
function assertCanTeacherSetTaskStatus(auth, targetStatus) {
  const status = normalizeTaskStatusForRead(targetStatus);
  if (!status) {
    return { ok: false, status: 400, error: 'Statut invalide' };
  }
  if (status === 'validated') {
    if (canValidateTasks(auth)) return { ok: true };
    return { ok: false, status: 403, error: 'Permission insuffisante' };
  }
  if (canManageTasks(auth)) return { ok: true };
  return { ok: false, status: 403, error: 'Permission insuffisante' };
}

/** Actions « pour le compte d’un n3beur » (assign / done / unassign) : aligné sur la lecture des assignations (GET liste). */
function canRunTeacherStyleTaskStudentAction(auth) {
  if (!auth) return false;
  if (canManageTasks(auth)) return true;
  const perms = Array.isArray(auth.permissions) ? auth.permissions : [];
  return perms.includes('tasks.validate');
}

module.exports = {
  canReadAllAssignments,
  canReadAllAssignmentsUnscoped,
  canManageTasks,
  canValidateTasks,
  assertCanTeacherSetTaskStatus,
  canRunTeacherStyleTaskStudentAction,
  isVisitorRole,
};
