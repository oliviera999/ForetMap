'use strict';

/**
 * Rattachement unitaire d'un compte à un groupe — partagé par l'inscription avec code de
 * classe (routes/auth.js), le rattachement côté prof (routes/groups.js, routes/rbac.js),
 * l'import de fichier (lib/groupImport.js) et le pont Gnomes & Licornes. Idempotent, puis
 * recalcul du profil effectif (`lib/effectiveRole.js`) : le profil par défaut du groupe
 * s'applique s'il est plus élevé que le profil attribué.
 *
 * Rattacher, c'est faire conférer le profil par défaut du groupe : quand un acteur est fourni
 * (`options.actor`, `req.auth`), la garde de rang de `lib/groupDefaultRolePolicy.js` s'applique
 * (hors administrateur, profil par défaut de rang strictement inférieur au sien). Sans acteur
 * (inscription par code de classe, synchronisation, pont G&L), aucune garde d'acteur.
 */
const { queryOne, queryAll, execute } = require('../database');
const { recomputeUserRole } = require('./effectiveRole');
const { checkGroupJoinAllowed } = require('./groupDefaultRolePolicy');
const { actorRank, isAdminActor } = require('./rankGuard');

/**
 * Ajoute un compte (élève ou enseignant) à un groupe actif puis recalcule son profil.
 * @param {string} userId
 * @param {string} groupId
 * @param {{ actor?: object|null }} [options] acteur (`req.auth`) soumis à la garde de rang
 * @returns {Promise<{ok: true, group: object, role: object}|{ok: false, status: number, error: string}>}
 */
async function addUserToGroup(userId, groupId, { actor = null } = {}) {
  const user = await queryOne(
    "SELECT id, user_type FROM users WHERE id = ? AND user_type IN ('student', 'teacher') LIMIT 1",
    [String(userId || '').trim()],
  );
  if (!user) return { ok: false, status: 404, error: 'Compte introuvable' };
  const group = await queryOne(
    `SELECT g.id, g.name, g.default_role_id, g.force_default_role,
            r.\`rank\` AS default_role_rank
       FROM \`groups\` g
       LEFT JOIN roles r ON r.id = g.default_role_id
      WHERE g.id = ? AND g.is_active = 1
      LIMIT 1`,
    [String(groupId || '').trim()],
  );
  if (!group) return { ok: false, status: 404, error: 'Groupe introuvable ou inactif' };
  const allowed = checkGroupJoinAllowed(actor, group);
  if (!allowed.ok) return allowed;
  await execute(
    `INSERT INTO group_members (group_id, user_id, user_type)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE user_type = VALUES(user_type)`,
    [group.id, user.id, user.user_type],
  );
  const role = await recomputeUserRole(user.id);
  return { ok: true, group, role };
}

/** Compatibilité d'appel : n'accepte qu'un compte élève. */
async function addStudentToGroup(userId, groupId, options = {}) {
  const student = await queryOne(
    "SELECT id FROM users WHERE user_type = 'student' AND id = ? LIMIT 1",
    [String(userId || '').trim()],
  );
  if (!student) return { ok: false, status: 404, error: 'Élève introuvable' };
  return addUserToGroup(student.id, groupId, options);
}

/** Retire un compte d'un groupe puis recalcule son profil. */
async function removeUserFromGroup(userId, groupId) {
  const member = await queryOne(
    'SELECT user_type FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1',
    [String(groupId || '').trim(), String(userId || '').trim()],
  );
  if (!member) return { ok: false, status: 404, error: 'Rattachement introuvable' };
  await execute('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', [
    String(groupId).trim(),
    String(userId).trim(),
  ]);
  const role = await recomputeUserRole(userId);
  return { ok: true, role };
}

const REMOVAL_RANK_REFUSED_ERROR =
  'Vous ne pouvez retirer d’un groupe qu’un compte de rang inférieur au vôtre';

/**
 * Comptes qu'un acteur n'a pas le droit de retirer d'un groupe (décision du 19/11/2026) :
 * hors administrateur, on ne retire qu'un compte de rang **strictement inférieur** au sien.
 * Le rang d'un compte est le plus haut de ses profils effectif et attribué. `actor = null`
 * (système) : aucune garde.
 * @param {object|null} actor `req.auth`
 * @param {string[]} userIds comptes retirés
 * @returns {Promise<string[]>} identifiants refusés (vide si tout est permis)
 */
async function findUsersNotRemovableBy(actor, userIds) {
  const ids = [...new Set((userIds || []).map((v) => String(v || '').trim()).filter(Boolean))];
  if (!actor || isAdminActor(actor) || ids.length === 0) return [];
  const rows = await queryAll(
    `SELECT u.id,
            GREATEST(COALESCE(r.\`rank\`, 0), COALESCE(ra.\`rank\`, 0)) AS target_rank
       FROM users u
       LEFT JOIN user_roles ur
         ON ur.user_id = u.id AND ur.user_type = u.user_type AND ur.is_primary = 1
       LEFT JOIN roles r ON r.id = ur.role_id
       LEFT JOIN roles ra ON ra.id = u.assigned_role_id
      WHERE u.id IN (${ids.map(() => '?').join(',')})`,
    ids,
  );
  const limit = actorRank(actor);
  return rows.filter((row) => Number(row.target_rank || 0) >= limit).map((row) => String(row.id));
}

module.exports = {
  addUserToGroup,
  addStudentToGroup,
  removeUserFromGroup,
  findUsersNotRemovableBy,
  REMOVAL_RANK_REFUSED_ERROR,
};
