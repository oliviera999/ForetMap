/**
 * Filtres et pagination client pour la liste d'attribution des comptes
 * (onglet Profils & utilisateurs → Comptes).
 */

export const PROFILES_PAGE_SIZES = [25, 50, 100];
export const DEFAULT_PROFILES_PAGE_SIZE = 25;

/**
 * Construit une map `userId → Set(groupId)` directement depuis les comptes renvoyés par
 * `GET /api/rbac/users` (champ `groups[]`). Évite de recharger `GET /api/groups` — payload
 * lourd (tous les membres + périmètres de tous les groupes) — juste pour filtrer la liste.
 * @param {Array<{ id: string|number, groups?: Array<{ id: string|number }> }>} users
 * @returns {Map<string, Set<string>>}
 */
export function buildUserGroupIdsFromUsers(users = []) {
  const map = new Map();
  for (const u of users) {
    const uid = String(u?.id ?? '').trim();
    if (!uid) continue;
    const groups = Array.isArray(u?.groups) ? u.groups : [];
    if (groups.length === 0) continue;
    const set = map.get(uid) || new Set();
    for (const g of groups) {
      const gid = String(g?.id ?? '').trim();
      if (gid) set.add(gid);
    }
    if (set.size > 0) map.set(uid, set);
  }
  return map;
}

/**
 * Texte de recherche normalisé pour un compte RBAC.
 * @param {object} user
 */
export function userSearchHaystack(user) {
  return [user?.display_name, user?.first_name, user?.last_name, user?.pseudo, user?.email]
    .map((v) => String(v || '').toLowerCase())
    .join(' ');
}

/**
 * Filtre la liste des comptes.
 * @param {object[]} users
 * @param {{
 *   query?: string,
 *   roleId?: string|number|null,
 *   userType?: string|null,
 *   groupId?: string|number|null,
 *   userGroupIdsByUserId?: Map<string, Set<string>>,
 * }} filters
 */
export function filterProfilesUsers(users = [], filters = {}) {
  const query = String(filters.query || '')
    .trim()
    .toLowerCase();
  const roleId =
    filters.roleId != null && String(filters.roleId).trim() !== '' ? String(filters.roleId) : '';
  const userType = String(filters.userType || '')
    .trim()
    .toLowerCase();
  const groupId =
    filters.groupId != null && String(filters.groupId).trim() !== '' ? String(filters.groupId) : '';
  const membership = filters.userGroupIdsByUserId || null;

  return (Array.isArray(users) ? users : []).filter((u) => {
    if (query && !userSearchHaystack(u).includes(query)) return false;
    if (roleId) {
      const rid = u?.role_id != null ? String(u.role_id) : '';
      if (rid !== roleId) return false;
    }
    if (userType) {
      if (String(u?.user_type || '').toLowerCase() !== userType) return false;
    }
    if (groupId) {
      const set = membership?.get(String(u?.id ?? ''));
      if (!set || !set.has(groupId)) return false;
    }
    return true;
  });
}

/**
 * Pagination 1-indexée. Retourne la tranche + métadonnées.
 * @param {unknown[]} items
 * @param {number} page
 * @param {number} pageSize
 */
export function paginateList(items = [], page = 1, pageSize = DEFAULT_PROFILES_PAGE_SIZE) {
  const size = Math.max(1, Number(pageSize) || DEFAULT_PROFILES_PAGE_SIZE);
  const total = Array.isArray(items) ? items.length : 0;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(Math.max(1, Number(page) || 1), pageCount);
  const start = (safePage - 1) * size;
  const slice = total === 0 ? [] : items.slice(start, start + size);
  return {
    items: slice,
    page: safePage,
    pageSize: size,
    pageCount,
    total,
    from: total === 0 ? 0 : start + 1,
    to: total === 0 ? 0 : Math.min(start + size, total),
  };
}

/**
 * Normalise une taille de page mémorisée.
 * @param {unknown} raw
 */
export function normalizePageSize(raw) {
  const n = Number(raw);
  return PROFILES_PAGE_SIZES.includes(n) ? n : DEFAULT_PROFILES_PAGE_SIZE;
}

/** Sous-onglets connus de l'admin profils. */
export const PROFILES_SUB_TABS = ['profils', 'comptes', 'groupes', 'imports'];
export const DEFAULT_PROFILES_SUB_TAB = 'profils';

/**
 * @param {unknown} raw
 * @param {{ canManageProfiles?: boolean, canManageStudents?: boolean, canImportGroups?: boolean }} caps
 */
export function resolveProfilesSubTab(raw, caps = {}) {
  const value = String(raw || '')
    .trim()
    .toLowerCase();
  const { canManageProfiles = false, canManageStudents = false, canImportGroups = false } = caps;
  const anyCap = canManageProfiles || canManageStudents || canImportGroups;
  // Avant le chargement des droits, conserver la préférence mémorisée.
  if (!anyCap) {
    if (value && PROFILES_SUB_TABS.includes(value)) return value;
    return DEFAULT_PROFILES_SUB_TAB;
  }
  const allowed = new Set();
  if (canManageProfiles) {
    allowed.add('profils');
    allowed.add('groupes');
  }
  if (canManageProfiles || canManageStudents) {
    allowed.add('comptes');
  }
  if (canManageStudents || canImportGroups || canManageProfiles) {
    allowed.add('imports');
  }
  if (value && allowed.has(value) && PROFILES_SUB_TABS.includes(value)) return value;
  if (allowed.has('profils')) return 'profils';
  if (allowed.has('comptes')) return 'comptes';
  if (allowed.has('groupes')) return 'groupes';
  if (allowed.has('imports')) return 'imports';
  return DEFAULT_PROFILES_SUB_TAB;
}
