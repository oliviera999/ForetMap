'use strict';

/**
 * Profil par défaut d'un groupe : ce qu'un groupe a le droit de conférer, et ce qu'il **impose**.
 *
 * Extrait de `lib/groupRole.js` (qui le ré-exporte à l'identique) pour que `lib/rbac.js` puisse
 * lire les groupes imposants sans créer le cycle `rbac → groupRole → rbac`. Ce module ne dépend
 * donc que de la base et des noyaux partagés de nommage de profils.
 */

const { queryAll, queryOne } = require('../database');
const { isVisitorLikeSlug } = require('./shared/visitorRoles');
const { isEleveRoleSlug } = require('./shared/n3beurRolesCore');

/**
 * Permissions qu'un profil peut porter tout en restant attribuable automatiquement par un
 * groupe : le socle d'un élève sur les tâches, plus l'accès au Plan du staff. Au-delà,
 * l'attribution reste manuelle — un groupe ne doit jamais pouvoir distribuer un pouvoir
 * d'encadrement à ses membres (gestion de groupes, lecture de statistiques, `teacher.access`…).
 *
 * `staff_plan.access` y figure parce que c'est la seule permission du profil système
 * **Personnel**, et sa raison d'être : sans elle dans cette liste, le compteur ci-dessous
 * écartait `personnel` avant même que `isAllowedGroupDefaultRole` n'atteigne la ligne qui
 * autorise explicitement les profils « type visiteur ». Un groupe « Personnel » ne pouvait
 * donc pas conférer le profil du même nom. C'est un accès d'affichage, pas d'encadrement.
 */
const GROUP_DEFAULT_SAFE_PERMISSION_KEYS = [
  'tasks.propose',
  'tasks.assign_self',
  'tasks.unassign_self',
  'tasks.done_self',
  'staff_plan.access',
];

function isAllowedGroupDefaultRole(row) {
  if (!row) return false;
  const slug = String(row.slug || row.default_role_slug || '')
    .trim()
    .toLowerCase();
  if (!slug || slug === 'admin' || slug === 'prof' || slug.startsWith('gl_')) return false;
  if (Number(row.unsafe_permission_count || 0) > 0) return false;
  if (isVisitorLikeSlug(slug) || isEleveRoleSlug(slug)) return true;
  const rank = Number(row.rank ?? row.default_role_rank);
  return Number.isFinite(rank) && rank >= 0 && rank < 400;
}

/** Fragment SQL comptant les permissions « non sûres » d'un profil (voir la liste ci-dessus). */
const UNSAFE_PERMISSION_COUNT_SQL = `SUM(CASE
        WHEN rp.permission_key IS NOT NULL
         AND rp.permission_key NOT IN (${GROUP_DEFAULT_SAFE_PERMISSION_KEYS.map(() => '?').join(', ')})
        THEN 1 ELSE 0
      END)`;

async function getAllowedGroupDefaultRole(roleId) {
  const normalized = Number(roleId);
  if (!Number.isFinite(normalized) || normalized <= 0) return null;
  const role = await queryOne(
    `SELECT r.id, r.slug, r.display_name, r.rank,
            ${UNSAFE_PERMISSION_COUNT_SQL} AS unsafe_permission_count
       FROM roles r
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
      WHERE r.id = ?
      GROUP BY r.id, r.slug, r.display_name, r.rank
      LIMIT 1`,
    [...GROUP_DEFAULT_SAFE_PERMISSION_KEYS, normalized],
  );
  return isAllowedGroupDefaultRole(role) ? role : null;
}

/**
 * Groupes actifs de l'élève qui **imposent** leur profil (`groups.force_default_role`,
 * migration 265), du profil le plus élevé au plus bas.
 *
 * Deux filtres, alignés sur la résolution ordinaire : le groupe doit porter un profil par
 * défaut (imposer « la règle automatique » n'aurait pas de sens — l'API refuse la
 * combinaison), et ce profil doit rester attribuable automatiquement
 * (`isAllowedGroupDefaultRole`). Un groupe dont le profil par défaut a été rendu dangereux
 * après coup n'impose donc plus rien, au lieu de distribuer ce pouvoir à toute une classe.
 *
 * Le rang départage plusieurs groupes imposants (le plus ouvert l'emporte, comme pour le
 * périmètre de cartes) ; l'identifiant départage les ex æquo, pour rester déterministe.
 *
 * @param {string} userId
 * @returns {Promise<Array<{ groupId: string, groupName: string, roleId: number, roleSlug: string,
 *   roleDisplayName: string|null, rank: number }>>}
 */
async function listForcedRoleGroupsForStudent(userId) {
  const id = String(userId || '').trim();
  if (!id) return [];
  const rows = await queryAll(
    `SELECT g.id AS group_id, g.name AS group_name,
            r.id AS role_id, r.slug AS role_slug, r.display_name AS role_display_name,
            r.\`rank\` AS role_rank,
            ${UNSAFE_PERMISSION_COUNT_SQL} AS unsafe_permission_count
       FROM group_members gm
       INNER JOIN \`groups\` g ON g.id = gm.group_id
       INNER JOIN roles r ON r.id = g.default_role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
      WHERE gm.user_id = ?
        AND gm.user_type = 'student'
        AND g.is_active = 1
        AND g.force_default_role = 1
      GROUP BY g.id, g.name, r.id, r.slug, r.display_name, r.\`rank\`
      ORDER BY r.\`rank\` DESC, g.id ASC`,
    [...GROUP_DEFAULT_SAFE_PERMISSION_KEYS, id],
  );
  return rows
    .filter((row) =>
      isAllowedGroupDefaultRole({
        slug: row.role_slug,
        rank: row.role_rank,
        unsafe_permission_count: row.unsafe_permission_count,
      }),
    )
    .map((row) => ({
      groupId: String(row.group_id),
      groupName: row.group_name,
      roleId: Number(row.role_id),
      roleSlug: String(row.role_slug || '').toLowerCase(),
      roleDisplayName: row.role_display_name ?? null,
      rank: Number(row.role_rank || 0),
    }));
}

/** Le groupe imposant retenu pour cet élève, ou `null` si aucun groupe n'impose son profil. */
async function getForcedRoleGroupForStudent(userId) {
  const groups = await listForcedRoleGroupsForStudent(userId);
  return groups.length ? groups[0] : null;
}

module.exports = {
  GROUP_DEFAULT_SAFE_PERMISSION_KEYS,
  isAllowedGroupDefaultRole,
  getAllowedGroupDefaultRole,
  listForcedRoleGroupsForStudent,
  getForcedRoleGroupForStudent,
};
