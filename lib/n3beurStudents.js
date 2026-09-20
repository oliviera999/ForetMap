const { queryAll, queryOne } = require('../database');
const { isN3beurRole } = require('./shared/n3beurRolesCore');

/**
 * Sélection des comptes **n3beurs** (élèves au sens métier) parmi les comptes
 * `user_type = 'student'`.
 *
 * Un compte `student` n'est pas forcément un n3beur : son profil effectif peut être
 * `visiteur`, `personnel`, `prof_classe` ou un profil GL. Ces comptes n'ont aucune permission
 * de tâche et n'ont donc rien à faire dans les listes d'affectation de la gestion des tâches.
 *
 * Le statut se lit sur le **profil effectif** (`user_roles.is_primary`), recalculé par
 * `lib/effectiveRole.js` à chaque rattachement ou attribution : plus besoin de deviner
 * l'appartenance à un « groupe n3beur » à côté du profil.
 */

const N3BEUR_STUDENT_SELECT = `SELECT u.id, u.first_name, u.last_name, u.pseudo, u.avatar_path,
            r.slug AS role_slug, r.display_name AS role_display_name, r.rank AS role_rank
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.user_type = 'student' AND ur.is_primary = 1
       LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.user_type = 'student' AND u.is_active = 1`;

function rowIsN3beur(row) {
  if (!row) return false;
  return isN3beurRole({ slug: row.role_slug, rank: row.role_rank });
}

/**
 * Comptes n3beurs actifs, éventuellement restreints à un lot d'identifiants.
 * @param {string[]|null} studentIds `null` = tous les comptes actifs ; `[]` = aucun.
 * @returns {Promise<Array<object>>} lignes `users` + profil principal, filtrées n3beur.
 */
async function listN3beurStudents(studentIds = null) {
  let sql = N3BEUR_STUDENT_SELECT;
  const params = [];
  if (Array.isArray(studentIds)) {
    const ids = [...new Set(studentIds.map((v) => String(v || '').trim()).filter(Boolean))];
    if (ids.length === 0) return [];
    sql += ` AND u.id IN (${ids.map(() => '?').join(',')})`;
    params.push(...ids);
  }
  const rows = await queryAll(sql, params);
  return rows.filter(rowIsN3beur);
}

/** Sous-ensemble n3beur d'une liste d'identifiants (ordre d'entrée non garanti). */
async function filterN3beurStudentIds(studentIds) {
  const rows = await listN3beurStudents(studentIds);
  return rows.map((row) => String(row.id));
}

/** Vrai si le compte existe, est actif et a le statut n3beur. */
async function isN3beurStudentId(studentId) {
  const id = String(studentId || '').trim();
  if (!id) return false;
  const row = await queryOne(`${N3BEUR_STUDENT_SELECT} AND u.id = ? LIMIT 1`, [id]);
  return rowIsN3beur(row);
}

module.exports = {
  listN3beurStudents,
  filterN3beurStudentIds,
  isN3beurStudentId,
};
