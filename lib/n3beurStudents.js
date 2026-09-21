const { queryAll, queryOne } = require('../database');
const {
  isGroupPromotableRoleSlug,
  isN3beurAccount,
  isN3beurRole,
  normalizeRoleSlug,
} = require('./shared/n3beurRolesCore');

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

/** Vrai si le compte est membre d'au moins un groupe actif dont le profil par défaut est n3beur. */
async function isInN3beurGroup(userId) {
  const rows = await queryAll(
    `SELECT r.slug, r.\`rank\`
       FROM group_members gm
       INNER JOIN \`groups\` g ON g.id = gm.group_id AND g.is_active = 1
       INNER JOIN roles r ON r.id = g.default_role_id
      WHERE gm.user_id = ?`,
    [String(userId)],
  );
  return rows.some((groupRole) => isN3beurRole({ slug: groupRole.slug, rank: groupRole.rank }));
}

/**
 * Profil effectif + appartenance à un groupe n3beur d'un compte **quelconque** (élève ou
 * enseignant) — la lecture que fait la vue « Mes statistiques » pour décider si le compte a
 * une progression n3beur et des tâches (cf. `routes/stats.js`).
 *
 * Le profil effectif tranche seul dans la quasi-totalité des cas ; l'appartenance à un groupe
 * n3beur ne sert que de rattrapage pour un compte encore promotible (visiteur / personnel /
 * sans profil) dont le profil n'a pas encore été resynchronisé — même règle que
 * `isN3beurAccount` (`lib/shared/n3beurRolesCore.js`).
 *
 * @param {string} userId
 * @returns {Promise<{ found: boolean, isN3beur: boolean, roleSlug: string|null,
 *   roleRank: number|null, inN3beurGroup: boolean }>}
 */
async function getAccountN3beurStatus(userId) {
  const id = String(userId || '').trim();
  const absent = {
    found: false,
    isN3beur: false,
    roleSlug: null,
    roleRank: null,
    inN3beurGroup: false,
  };
  if (!id) return absent;
  const row = await queryOne(
    `SELECT u.id, r.slug AS role_slug, r.\`rank\` AS role_rank
       FROM users u
       LEFT JOIN user_roles ur
              ON ur.user_id = u.id AND ur.user_type = u.user_type AND ur.is_primary = 1
       LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.id = ? LIMIT 1`,
    [id],
  );
  if (!row) return absent;
  const roleSlug = row.role_slug ? normalizeRoleSlug(row.role_slug) : null;
  const rankNum = Number(row.role_rank);
  const roleRank = Number.isFinite(rankNum) ? rankNum : null;
  const role = roleSlug ? { slug: roleSlug, rank: roleRank } : null;
  // Le groupe n'est relu que pour un profil encore promotible : un encadrant ou un palier
  // n3beur est tranché par son seul profil effectif (une requête de moins par ouverture).
  const inN3beurGroup = isGroupPromotableRoleSlug(roleSlug) ? await isInN3beurGroup(id) : false;
  return {
    found: true,
    isN3beur: isN3beurAccount({ role, inN3beurGroup }),
    roleSlug,
    roleRank,
    inN3beurGroup,
  };
}

module.exports = {
  listN3beurStudents,
  filterN3beurStudentIds,
  isN3beurStudentId,
  getAccountN3beurStatus,
};
