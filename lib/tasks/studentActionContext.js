// Contexte d'action « élève » mutualisé pour le cluster tasks (assign/done/unassign/proposals).
// Sécurité F1 : l'identité élève est TOUJOURS dérivée du JWT ; un studentId fourni par le
// client n'est accepté que s'il correspond au token, ou si l'acteur est un prof habilité
// agissant dans son périmètre de groupe.
// Les noms (first/last) servent aussi de clé d'appariement SQL pour les lignes héritées
// (`student_id IS NULL`, cf. lib/tasks/assignmentIdentityMatch.js) : ils doivent donc venir
// de la base, pas du corps client — sinon un n3beur peut se désinscrire d'une ligne
// héritée, ou la « terminer », en envoyant le nom d'un tiers (audit B1 2026-07).
const { queryOne } = require('../../database');
const { ensurePrimaryRole, buildAuthzPayload, setPrimaryRole } = require('../rbac');
const { syncStudentRoleFromGroups, resolveDefaultRoleForStudent } = require('../groupRole');
const { canAccessStudentId } = require('../groupScope');
const { parseOptionalAuth } = require('./taskQueries');
const { normalizeOptionalId, trimName } = require('../taskRouteHelpers');
const { canRunTeacherStyleTaskStudentAction } = require('../taskAuthzHelpers');

/**
 * Noms d'action : la fiche `users` fait foi ; le corps client n'est qu'un repli pour les
 * comptes historiques sans `first_name` / `last_name`. Exporté pour les tests unitaires.
 */
function resolveActionNames(student, providedFirstName, providedLastName) {
  return {
    firstName: trimName(student?.first_name) || trimName(providedFirstName),
    lastName: trimName(student?.last_name) || trimName(providedLastName),
  };
}

async function ensureStudentPermission({ studentId, permissionKey }) {
  await syncStudentRoleFromGroups(studentId);
  await ensurePrimaryRole('student', studentId, 'eleve_novice');
  let base = await buildAuthzPayload('student', studentId);
  if (!base) return { ok: false, error: 'Profil introuvable' };
  if (!base.permissions.includes(permissionKey)) {
    const resolved = await resolveDefaultRoleForStudent(studentId);
    if (resolved?.roleId && resolved.source === 'group') {
      await setPrimaryRole('student', studentId, resolved.roleId);
      base = await buildAuthzPayload('student', studentId);
      if (!base) return { ok: false, error: 'Profil introuvable' };
    }
  }
  if (base.permissions.includes(permissionKey)) return { ok: true };
  return { ok: false, error: 'Permission insuffisante' };
}

async function resolveStudentActionContext(req, payload = {}, permissionKey) {
  const auth = await parseOptionalAuth(req);
  const providedStudentId = normalizeOptionalId(payload?.studentId);
  const providedFirstName = trimName(payload?.firstName);
  const providedLastName = trimName(payload?.lastName);
  const isTeacherAction = canRunTeacherStyleTaskStudentAction(auth);

  const byId = async (studentId) =>
    queryOne(
      "SELECT id, first_name, last_name FROM users WHERE user_type = 'student' AND id = ? LIMIT 1",
      [studentId],
    );

  const pickNames = (student) => resolveActionNames(student, providedFirstName, providedLastName);

  if (providedStudentId) {
    const student = await byId(providedStudentId);
    if (!student) return { errorStatus: 401, error: 'Compte supprimé', deleted: true };
    if (!isTeacherAction) {
      if (!(
        auth?.userType === 'student' && String(auth?.userId || '') === String(providedStudentId)
      )) {
        return { errorStatus: 403, error: 'Session n3beur requise' };
      }
      const permission = await ensureStudentPermission({
        studentId: providedStudentId,
        permissionKey,
      });
      if (!permission.ok) return { errorStatus: 403, error: permission.error };
    }
    if (isTeacherAction) {
      const allowed = await canAccessStudentId(auth, providedStudentId);
      if (!allowed) return { errorStatus: 403, error: 'n3beur hors périmètre de groupe' };
    }
    const names = pickNames(student);
    if (!names.firstName || !names.lastName) return { errorStatus: 400, error: 'Nom requis' };
    return {
      auth,
      studentId: String(providedStudentId),
      firstName: names.firstName,
      lastName: names.lastName,
      actorUserType: isTeacherAction ? auth?.userType || null : 'student',
      actorUserId: isTeacherAction ? auth?.userId || null : String(providedStudentId),
    };
  }

  if (auth?.userType === 'student' && auth?.userId) {
    const student = await byId(auth.userId);
    if (!student) return { errorStatus: 401, error: 'Compte supprimé', deleted: true };
    const permission = await ensureStudentPermission({
      studentId: auth.userId,
      permissionKey,
    });
    if (!permission.ok) return { errorStatus: 403, error: permission.error };
    const names = pickNames(student);
    if (!names.firstName || !names.lastName) return { errorStatus: 400, error: 'Nom requis' };
    return {
      auth,
      studentId: String(auth.userId),
      firstName: names.firstName,
      lastName: names.lastName,
      actorUserType: 'student',
      actorUserId: String(auth.userId),
    };
  }

  if (isTeacherAction && providedFirstName && providedLastName && !providedStudentId) {
    return {
      errorStatus: 400,
      error: 'Identifiant n3beur requis (studentId obligatoire pour une action prof)',
    };
  }

  return { errorStatus: 400, error: 'Identifiant n3beur requis' };
}

module.exports = { ensureStudentPermission, resolveStudentActionContext, resolveActionNames };
