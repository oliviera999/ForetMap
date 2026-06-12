/**
 * Helpers purs RBAC de l'admin des profils — extraits de `ProfilesAdminView` (`profiles-views.jsx`, O5/O6).
 *
 * Concentrent la logique délicate (gating de capacités selon permissions/élévation, tri d'affichage
 * des profils aligné sur l'API, profil n3beur configurable, normalisation des champs d'édition de rôle)
 * hors du méga-composant, et la rendent testable. Toutes les fonctions sont pures.
 */

/**
 * Un profil « palier n3beur » configurable (seuils/forum/contexte) : ni admin/prof/visiteur,
 * et soit slug `eleve_*`, soit rang fini < 400. Reproduit la règle serveur.
 */
export function isN3beurTierConfigurableProfile(role) {
  if (!role) return false;
  const slug = String(role.slug || '').trim().toLowerCase();
  if (slug === 'admin' || slug === 'prof' || slug === 'visiteur') return false;
  if (/^eleve_/i.test(String(role.slug || ''))) return true;
  const r = Number(role.rank);
  return Number.isFinite(r) && r < 400;
}

/**
 * Trie une liste de profils comme `GET /api/rbac/profiles` : `display_order` croissant, puis `rank`
 * décroissant, puis `id` croissant. Ne mute pas l'entrée.
 */
export function sortRolesForDisplay(roles) {
  const copy = [...(roles || [])];
  copy.sort((a, b) => {
    const ao = Number(a.display_order) || 0;
    const bo = Number(b.display_order) || 0;
    if (ao !== bo) return ao - bo;
    const ar = Number(a.rank) || 0;
    const br = Number(b.rank) || 0;
    if (ar !== br) return br - ar;
    return Number(a.id) - Number(b.id);
  });
  return copy;
}

/**
 * Dérive les capacités UI de l'admin des profils à partir de l'auth courante.
 * @param {{ authPerms?: string[], authElevated?: boolean, authNativePrivileged?: boolean, authRoleSlug?: string }} auth
 */
export function deriveProfilesCapabilities(auth = {}) {
  const perms = Array.isArray(auth.authPerms) ? auth.authPerms : [];
  const has = (p) => perms.includes(p);
  const effectiveElevated = !!auth.authElevated || !!auth.authNativePrivileged;
  const canExport = has('stats.export') && effectiveElevated;
  const canImport = has('students.import') && effectiveElevated;
  const canDelete = has('students.delete') && effectiveElevated;
  const canCreateUsers = has('users.create') && effectiveElevated;
  const canReadAllStats = has('stats.read.all');
  return {
    canManageProfiles: has('admin.roles.manage') || has('admin.users.assign_roles'),
    canEditRoleDefinition: has('admin.roles.manage'),
    effectiveElevated,
    canExport,
    canImport,
    canDelete,
    canCreateUsers,
    canReadAllStats,
    canDuplicateStudents: canCreateUsers && canReadAllStats,
    isAdmin: String(auth.authRoleSlug || '') === 'admin',
    canManageStudents: canExport || canImport || canDelete || canCreateUsers,
    canDeleteUi: canDelete && canReadAllStats,
  };
}

/**
 * Normalise les champs éditables d'un rôle pour les champs de formulaire (chaînes).
 * `min_done_tasks` absent → '' ; `display_order` absent → '0' ; `max_concurrent_tasks` absent → ''.
 * Renvoie des entiers ≥ 0 (plancher) sous forme de chaîne.
 */
/**
 * Calcule les PATCH `display_order` à envoyer pour déplacer un profil d'un cran dans la liste triée
 * (`direction` = -1 monter / +1 descendre). Renvoie `null` si le déplacement est impossible (profil
 * introuvable ou déjà en bord de liste), sinon la liste `{ id, display_order }` des profils dont
 * l'ordre change réellement (les positions déjà correctes sont omises). Pur, ne mute pas l'entrée.
 */
export function buildRoleReorderPatches(sortedRoles, roleId, direction) {
  const roles = Array.isArray(sortedRoles) ? sortedRoles : [];
  const idx = roles.findIndex((r) => Number(r.id) === Number(roleId));
  if (idx < 0) return null;
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= roles.length) return null;
  const arr = [...roles];
  [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
  const patches = [];
  arr.forEach((r, i) => {
    if (r.id == null) return;
    const prev = roles.find((x) => Number(x.id) === Number(r.id));
    if (Number(prev?.display_order) === i) return;
    patches.push({ id: r.id, display_order: i });
  });
  return patches;
}

/**
 * Parse le champ « plafond d'inscriptions simultanées » d'un profil.
 * Vide → héritage du réglage global (`value: null`) ; sinon entier 0..99 (0 = pas de limite).
 * Renvoie `{ error }` si invalide, sinon `{ value, message }` (message de succès à afficher).
 */
export function parseMaxConcurrentTasksLimit(raw) {
  const trimmed = String(raw || '').trim();
  if (trimmed === '') {
    return {
      value: null,
      message: 'Plafond d’inscriptions : héritage du réglage global (Paramètres n3boss) enregistré',
    };
  }
  const n = parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n < 0 || n > 99) {
    return {
      error: 'Plafond invalide : entier entre 0 et 99 (0 = pas de limite pour ce profil), ou champ vide pour hériter du réglage global',
    };
  }
  return {
    value: n,
    message: n === 0
      ? 'Pas de limite d’inscriptions pour ce profil (0) : enregistré.'
      : `Plafond d’inscriptions simultanées : ${n} tâche(s) non validée(s) — enregistré.`,
  };
}

/**
 * Parse le champ « nombre de tâches validées requis » d'un palier n3beur.
 * Entier ≥ 0 obligatoire (champ vide refusé). Renvoie `{ error }` ou `{ value }`.
 */
export function parseMinDoneTasksThreshold(raw) {
  const str = String(raw || '');
  const parsed = str.trim() === '' ? NaN : parseInt(str, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { error: 'Seuil invalide : indiquez un entier ≥ 0' };
  }
  return { value: parsed };
}

export function normalizeRoleEditFields(role) {
  if (!role) {
    return { emoji: '', minDoneTasks: '', displayOrder: '', maxConcurrentTasks: '' };
  }
  const floorIntStr = (v, fallback) => {
    if (v == null || Number.isNaN(Number(v))) return fallback;
    return String(Math.max(0, Math.floor(Number(v))));
  };
  return {
    emoji: String(role.emoji || ''),
    minDoneTasks: floorIntStr(role.min_done_tasks, ''),
    displayOrder: floorIntStr(role.display_order, '0'),
    maxConcurrentTasks:
      role.max_concurrent_tasks == null || role.max_concurrent_tasks === ''
        ? ''
        : String(Math.max(0, Math.floor(Number(role.max_concurrent_tasks)))),
  };
}
