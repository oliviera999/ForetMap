/**
 * Rattachements « groupes » exposés par l'administration des comptes (`/api/rbac/users*`).
 *
 * La fiche utilisateur admin (consultation / édition) doit montrer **le ou les groupes**
 * de la personne à côté de son profil RBAC. Les routes `rbac` n'exposaient jusqu'ici que le
 * rôle primaire : le front devait recroiser `GET /api/groups` (payload lourd, réservé aux
 * comptes qui peuvent lire les groupes) pour deviner l'appartenance.
 *
 * Le périmètre de visibilité reprend celui de `routes/groups.js` : un acteur qui ne peut pas
 * sortir de son périmètre (`canBypassGroupScope`) ne voit que les groupes de son scope.
 */

const { queryAll } = require('../database');
const { canBypassGroupScope, getUserAccessibleGroupIds } = require('./groupScope');

/** Rôles reconnus dans un groupe (cf. migration 079). */
const GROUP_MEMBER_ROLES = Object.freeze(['member', 'manager']);

function normalizeRoleInGroup(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  return GROUP_MEMBER_ROLES.includes(raw) ? raw : 'member';
}

/**
 * Périmètre de lecture des groupes pour l'acteur courant.
 * @param {object} auth `req.auth`
 * @returns {Promise<{ bypass: boolean, scopeGroupIds: Set<string> }>}
 */
async function resolveGroupVisibility(auth) {
  const bypass = canBypassGroupScope(auth);
  if (bypass) return { bypass: true, scopeGroupIds: new Set() };
  const ids = await getUserAccessibleGroupIds(auth, { includeDescendants: true });
  return { bypass: false, scopeGroupIds: new Set(ids.map((id) => String(id))) };
}

/**
 * Charge les rattachements de groupes pour une liste d'utilisateurs.
 *
 * @param {Array<string|number>} userIds identifiants `users.id`
 * @param {{ bypass?: boolean, scopeGroupIds?: Set<string> }} visibility périmètre (cf. `resolveGroupVisibility`)
 * @returns {Promise<Map<string, Array<{ id: string, name: string, slug: string, kind: string, is_active: boolean, role_in_group: string }>>>}
 *   map `userId → groupes`, triés (groupes gérés d'abord, puis par nom).
 */
async function fetchGroupsByUserId(userIds, visibility = {}) {
  const ids = [...new Set((userIds || []).map((v) => String(v ?? '').trim()).filter(Boolean))];
  if (ids.length === 0) return new Map();
  const { bypass = false, scopeGroupIds = new Set() } = visibility;
  if (!bypass && scopeGroupIds.size === 0) return new Map();

  const rows = await queryAll(
    `SELECT gm.user_id, gm.role_in_group,
            g.id AS group_id, g.name, g.slug, g.kind, g.is_active
       FROM group_members gm
       INNER JOIN \`groups\` g ON g.id = gm.group_id
      WHERE gm.user_id IN (${ids.map(() => '?').join(',')})
      ORDER BY g.name ASC, g.id ASC`,
    ids,
  );

  const byUser = new Map();
  for (const row of rows) {
    const groupId = String(row.group_id ?? '').trim();
    if (!groupId) continue;
    if (!bypass && !scopeGroupIds.has(groupId)) continue;
    const userId = String(row.user_id ?? '').trim();
    if (!userId) continue;
    if (!byUser.has(userId)) byUser.set(userId, []);
    byUser.get(userId).push({
      id: groupId,
      name: row.name ?? '',
      slug: row.slug ?? '',
      kind: row.kind ?? '',
      is_active: Number(row.is_active) !== 0,
      role_in_group: normalizeRoleInGroup(row.role_in_group),
    });
  }
  for (const list of byUser.values()) {
    list.sort((a, b) => {
      if (a.role_in_group !== b.role_in_group) return a.role_in_group === 'manager' ? -1 : 1;
      return String(a.name).localeCompare(String(b.name), 'fr');
    });
  }
  return byUser;
}

module.exports = {
  GROUP_MEMBER_ROLES,
  normalizeRoleInGroup,
  resolveGroupVisibility,
  fetchGroupsByUserId,
};
