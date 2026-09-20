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
 * @returns {Promise<Map<string, Array<object>>>} map `userId → groupes`, triés par nom.
 */
async function fetchGroupsByUserId(userIds, visibility = {}) {
  const ids = [...new Set((userIds || []).map((v) => String(v ?? '').trim()).filter(Boolean))];
  if (ids.length === 0) return new Map();
  const { bypass = false, scopeGroupIds = new Set() } = visibility;
  if (!bypass && scopeGroupIds.size === 0) return new Map();

  const rows = await queryAll(
    `SELECT gm.user_id,
            g.id AS group_id, g.name, g.slug, g.kind, g.is_active,
            g.default_role_id, g.force_default_role,
            r.slug AS default_role_slug, r.display_name AS default_role_display_name
       FROM group_members gm
       INNER JOIN \`groups\` g ON g.id = gm.group_id
       LEFT JOIN roles r ON r.id = g.default_role_id
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
      default_role_id: row.default_role_id ?? null,
      default_role_slug: row.default_role_slug ?? null,
      default_role_display_name: row.default_role_display_name ?? null,
      force_default_role: Number(row.force_default_role) === 1,
    });
  }
  for (const list of byUser.values()) {
    list.sort((a, b) => String(a.name).localeCompare(String(b.name), 'fr'));
  }
  return byUser;
}

module.exports = {
  resolveGroupVisibility,
  fetchGroupsByUserId,
};
