// Helpers purs d'affichage des rattachements « groupes » et du profil RBAC d'un compte
// (administration Profils & utilisateurs — liste des comptes et fiche utilisateur).

import { GROUP_KIND_LABELS } from './profilesRoleForm.js';

/** Libellés des rôles dans un groupe (`group_members.role_in_group`). */
export const GROUP_MEMBER_ROLE_LABELS = Object.freeze({
  manager: 'Responsable',
  member: 'Membre',
});

/**
 * Normalise la liste `groups[]` renvoyée par `/api/rbac/users*` en entrées prêtes à afficher.
 * Tolère l'absence du champ (API plus ancienne) et les clés partielles.
 * @param {unknown} rawGroups
 * @returns {Array<{ id: string, name: string, kind: string, kindLabel: string, roleInGroup: string, roleLabel: string, isActive: boolean, isManager: boolean }>}
 */
export function normalizeUserGroups(rawGroups) {
  if (!Array.isArray(rawGroups)) return [];
  const seen = new Set();
  const out = [];
  for (const g of rawGroups) {
    if (!g || typeof g !== 'object') continue;
    const id = String(g.id ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const kind = String(g.kind ?? '')
      .trim()
      .toLowerCase();
    const roleInGroup = String(g.role_in_group ?? g.roleInGroup ?? 'member')
      .trim()
      .toLowerCase();
    const isManager = roleInGroup === 'manager';
    out.push({
      id,
      name: String(g.name ?? '').trim() || String(g.slug ?? '').trim() || id,
      kind,
      kindLabel: GROUP_KIND_LABELS[kind] || kind,
      roleInGroup: isManager ? 'manager' : 'member',
      roleLabel: GROUP_MEMBER_ROLE_LABELS[isManager ? 'manager' : 'member'],
      isActive: g.is_active == null ? true : Boolean(g.is_active),
      isManager,
    });
  }
  return out;
}

/**
 * Libellé court du profil (rôle principal) d'un compte, avec repli sur le slug.
 * @param {object} user ligne `/api/rbac/users` ou fiche détaillée
 * @returns {string} libellé, ou '' si aucun profil attribué
 */
export function userRoleLabel(user) {
  const display = String(user?.role_display_name ?? user?.roleDisplayName ?? '').trim();
  if (display) return display;
  return String(user?.role_slug ?? user?.roleSlug ?? '').trim();
}

/** Libellé lisible du type de compte. */
export function userTypeLabel(userType) {
  const t = String(userType || '')
    .trim()
    .toLowerCase();
  if (t === 'student') return 'Élève';
  if (t === 'teacher') return 'Enseignant';
  return t;
}

/**
 * Résumé textuel des groupes pour un `title`/`aria-label` (liste compacte).
 * @param {Array} groups sortie de `normalizeUserGroups`
 */
export function summarizeUserGroups(groups) {
  if (!Array.isArray(groups) || groups.length === 0) return 'Aucun groupe';
  return groups.map((g) => (g.isManager ? `${g.name} (${g.roleLabel})` : g.name)).join(', ');
}
