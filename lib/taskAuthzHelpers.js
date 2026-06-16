'use strict';

/**
 * Contrôles d'accès purs de `routes/tasks.js` (O10) : décisions calculées uniquement
 * depuis le payload auth déjà hydraté. Aucune I/O directe, aucun accès req/res/DB.
 */

const { hasPermission } = require('../middleware/requireTeacher');
const { normalizeTaskStatusForRead } = require('./taskStatusRecalc');

function canReadAllAssignments(auth) {
  const perms = Array.isArray(auth?.permissions) ? auth.permissions : [];
  return (
    perms.includes('tasks.manage') ||
    perms.includes('tasks.validate') ||
    perms.includes('stats.read.all') ||
    perms.includes('stats.read.group')
  );
}

function canManageTasks(auth) {
  return hasPermission(auth, 'tasks.manage', true);
}

function canValidateTasks(auth) {
  return hasPermission(auth, 'tasks.validate', true);
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
    const perms = Array.isArray(auth?.permissions) ? auth.permissions : [];
    const elev = Array.isArray(auth?.elevatedPermissions) ? auth.elevatedPermissions : [];
    if (elev.includes('tasks.validate') && !perms.includes('tasks.validate')) {
      return { ok: false, status: 403, error: 'Élévation PIN requise' };
    }
    return { ok: false, status: 403, error: 'Permission insuffisante' };
  }
  if (canManageTasks(auth)) return { ok: true };
  const perms = Array.isArray(auth?.permissions) ? auth.permissions : [];
  const elev = Array.isArray(auth?.elevatedPermissions) ? auth.elevatedPermissions : [];
  if (elev.includes('tasks.manage') && !perms.includes('tasks.manage')) {
    return { ok: false, status: 403, error: 'Élévation PIN requise' };
  }
  return { ok: false, status: 403, error: 'Permission insuffisante' };
}

/** Actions « pour le compte d’un n3beur » (assign / done / unassign) : aligné sur la lecture des assignations (GET liste). */
function canRunTeacherStyleTaskStudentAction(auth) {
  if (!auth) return false;
  if (canManageTasks(auth)) return true;
  const perms = Array.isArray(auth.permissions) ? auth.permissions : [];
  return perms.includes('tasks.validate');
}

function isVisitorRole(auth) {
  return String(auth?.roleSlug || '').toLowerCase() === 'visiteur';
}

module.exports = {
  canReadAllAssignments,
  canManageTasks,
  canValidateTasks,
  assertCanTeacherSetTaskStatus,
  canRunTeacherStyleTaskStudentAction,
  isVisitorRole,
};
