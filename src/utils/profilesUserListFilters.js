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
 * Clé stable d'un compte dans la liste (`user_type` + `id`). Les identifiants sont uniques par
 * type, pas globalement : la clé composite évite qu'un élève et un enseignant se confondent
 * dans une sélection ou une map d'état par ligne.
 * @param {{ user_type?: string, id?: string|number }} user
 */
export function profilesUserKey(user) {
  return `${String(user?.user_type ?? '')}:${String(user?.id ?? '')}`;
}

/**
 * Tris disponibles sur la liste des comptes (P6 de l'audit UX). Le serveur renvoie un ordre
 * unique (type puis nom) : les questions courantes — « qui n'a pas de profil ? », « qui n'est
 * dans aucun groupe ? », « qui vient d'être créé ? » — n'avaient aucune réponse directe.
 */
export const PROFILES_SORTS = Object.freeze([
  { value: 'default', label: 'Type puis nom (défaut)' },
  { value: 'name', label: 'Nom (A→Z)' },
  { value: 'role', label: 'Profil' },
  { value: 'no-role', label: 'Sans profil d’abord' },
  { value: 'no-group', label: 'Sans groupe d’abord' },
]);

const PROFILES_SORT_VALUES = new Set(PROFILES_SORTS.map((s) => s.value));

/** Normalise une valeur de tri mémorisée ou lue dans l'URL. */
export function normalizeProfilesSort(raw) {
  const v = String(raw || '').trim();
  return PROFILES_SORT_VALUES.has(v) ? v : 'default';
}

function byName(a, b) {
  return String(a?.display_name || '').localeCompare(String(b?.display_name || ''), 'fr');
}

function groupCount(u) {
  return Array.isArray(u?.groups) ? u.groups.length : 0;
}

/**
 * Trie une liste de comptes sans muter l'entrée. Le tri secondaire est toujours le nom,
 * pour que deux rendus successifs donnent le même ordre.
 * @param {object[]} users
 * @param {string} sort valeur de `PROFILES_SORTS`
 */
export function sortProfilesUsers(users = [], sort = 'default') {
  const list = Array.isArray(users) ? [...users] : [];
  switch (normalizeProfilesSort(sort)) {
    case 'name':
      return list.sort(byName);
    case 'role':
      return list.sort((a, b) => {
        const ra = String(a?.role_display_name || a?.role_slug || '');
        const rb = String(b?.role_display_name || b?.role_slug || '');
        // Les comptes sans profil ferment la marche plutôt que d'ouvrir sur une chaîne vide.
        if (!ra !== !rb) return ra ? -1 : 1;
        const cmp = ra.localeCompare(rb, 'fr');
        return cmp !== 0 ? cmp : byName(a, b);
      });
    case 'no-role':
      return list.sort((a, b) => {
        const aEmpty = !a?.role_id;
        const bEmpty = !b?.role_id;
        if (aEmpty !== bEmpty) return aEmpty ? -1 : 1;
        return byName(a, b);
      });
    case 'no-group':
      return list.sort((a, b) => {
        const diff = groupCount(a) - groupCount(b);
        return diff !== 0 ? diff : byName(a, b);
      });
    default:
      return list.sort((a, b) => {
        const ta = String(a?.user_type || '');
        const tb = String(b?.user_type || '');
        const cmp = ta.localeCompare(tb);
        return cmp !== 0 ? cmp : byName(a, b);
      });
  }
}

/** Filtres portés par l'URL (P7) — clé de requête ↔ clé d'état. */
const ACCOUNTS_FILTER_KEYS = Object.freeze({
  q: 'query',
  profil: 'roleId',
  type: 'userType',
  groupe: 'groupId',
  tri: 'sort',
});

export const EMPTY_ACCOUNTS_FILTERS = Object.freeze({
  query: '',
  roleId: '',
  userType: '',
  groupId: '',
  sort: 'default',
});

/**
 * Lit les filtres depuis une query string (`location.search`). Porter les filtres dans l'URL
 * règle d'un coup la persistance (un rechargement ne les perd plus) et le partage d'une vue
 * filtrée à un collègue.
 * @param {string} search
 */
export function parseAccountsFilters(search) {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  const out = { ...EMPTY_ACCOUNTS_FILTERS };
  for (const [param, key] of Object.entries(ACCOUNTS_FILTER_KEYS)) {
    const raw = params.get(param);
    if (raw == null) continue;
    out[key] = key === 'sort' ? normalizeProfilesSort(raw) : String(raw);
  }
  return out;
}

/**
 * Sérialise les filtres en query string, en omettant les valeurs par défaut pour garder une
 * URL propre. Renvoie '' quand aucun filtre n'est actif.
 * @param {object} filters
 */
export function serializeAccountsFilters(filters = {}) {
  const params = new URLSearchParams();
  for (const [param, key] of Object.entries(ACCOUNTS_FILTER_KEYS)) {
    const value = filters[key];
    if (value == null) continue;
    const str = String(value).trim();
    if (!str || str === EMPTY_ACCOUNTS_FILTERS[key]) continue;
    params.set(param, str);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/** Vrai si au moins un filtre est actif (pour proposer « Effacer les filtres », P8). */
export function hasActiveAccountsFilters(filters = {}) {
  // Une clé absente vaut sa valeur par défaut : un objet partiel n'est pas « filtré ».
  return Object.keys(EMPTY_ACCOUNTS_FILTERS).some(
    (key) => String(filters[key] ?? EMPTY_ACCOUNTS_FILTERS[key]) !== EMPTY_ACCOUNTS_FILTERS[key],
  );
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
/**
 * P16 de l'audit UX — onglet d'arrivée. Le sous-onglet visité est mémorisé, mais la **première**
 * visite ouvrait sur `Profils`, c'est-à-dire la configuration RBAC : une tâche rare, alors que
 * l'usage quotidien est la gestion des comptes.
 */
export const DEFAULT_PROFILES_SUB_TAB = 'comptes';

/**
 * Sous-onglet d'arrivée (ou demandé), borné aux capacités de l'acteur.
 *
 * - **Profils** (définition des rôles) : `admin.roles.manage` seule (`canEditRoleDefinition`) ;
 * - **Comptes** : lister les comptes (`canListAccounts` = attribution des profils ou gestion
 *   des groupes) ou gérer les élèves ;
 * - **Groupes** : gérer ou simplement lire les groupes — c'est l'onglet « Classe » du prof
 *   de classe ;
 * - **Imports & exports** : gestion des élèves, import de groupes ou gestion des profils.
 *
 * `canManageProfiles` reste accepté pour compatibilité : il vaut « Profils » quand
 * `canEditRoleDefinition` n'est pas fourni, et ouvre Comptes / Groupes comme avant.
 *
 * @param {unknown} raw
 * @param {{ canManageProfiles?: boolean, canEditRoleDefinition?: boolean,
 *   canListAccounts?: boolean, canManageStudents?: boolean, canManageGroups?: boolean,
 *   canReadGroups?: boolean, canImportGroups?: boolean }} caps
 */
export function resolveProfilesSubTab(raw, caps = {}) {
  const value = String(raw || '')
    .trim()
    .toLowerCase();
  const {
    canManageProfiles = false,
    canEditRoleDefinition = canManageProfiles,
    canListAccounts = canManageProfiles,
    canManageStudents = false,
    canManageGroups = canManageProfiles,
    canReadGroups = false,
    canImportGroups = false,
  } = caps;
  const showProfiles = canEditRoleDefinition;
  const showAccounts = canListAccounts || canManageProfiles || canManageStudents;
  const showGroups = canManageGroups || canReadGroups || canManageProfiles;
  const showImports = canManageStudents || canImportGroups || canManageProfiles;
  const anyCap = showProfiles || showAccounts || showGroups || showImports;
  // Avant le chargement des droits, conserver la préférence mémorisée.
  if (!anyCap) {
    if (value && PROFILES_SUB_TABS.includes(value)) return value;
    return DEFAULT_PROFILES_SUB_TAB;
  }
  const allowed = new Set();
  if (showProfiles) allowed.add('profils');
  if (showAccounts) allowed.add('comptes');
  if (showGroups) allowed.add('groupes');
  if (showImports) allowed.add('imports');
  if (value && allowed.has(value) && PROFILES_SUB_TABS.includes(value)) return value;
  if (allowed.has('comptes')) return 'comptes';
  if (allowed.has('profils')) return 'profils';
  if (allowed.has('groupes')) return 'groupes';
  if (allowed.has('imports')) return 'imports';
  return DEFAULT_PROFILES_SUB_TAB;
}
