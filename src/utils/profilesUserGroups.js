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

/**
 * Profils dont l'attribution demande une confirmation explicite (P3 de l'audit UX).
 * Le sélecteur de la liste enregistre au changement : sans garde, un clic de travers accorde
 * des droits d'administration en silence, et il n'y a pas d'annulation.
 */
export const SENSITIVE_ROLE_SLUGS = Object.freeze(['admin', 'prof']);

/**
 * Vrai si passer un compte à ce profil — ou l'en retirer — doit être confirmé.
 * @param {{ slug?: string, role_slug?: string }|string|null} role profil visé ou son slug
 */
export function isSensitiveRole(role) {
  const slug = String(typeof role === 'string' ? role : (role?.slug ?? role?.role_slug ?? ''))
    .trim()
    .toLowerCase();
  return SENSITIVE_ROLE_SLUGS.includes(slug);
}

/** Libellés des origines de compte (`users.auth_provider`). */
const AUTH_PROVIDER_LABELS = Object.freeze({
  local: 'Inscription ou création locale',
  google: 'Google',
  moodle: 'Moodle',
  lti: 'Moodle (LTI)',
});

/** Formate une date ISO en date courte fr-FR ; chaîne vide si absente ou illisible. */
export function formatAccountDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Métadonnées de support d'un compte (P13) : état, origine, création, dernière visite.
 * Renvoie uniquement les entrées renseignées — une fiche ne doit pas afficher de ligne vide.
 * @param {object} user fiche détaillée (`GET /api/rbac/users/:type/:id`)
 * @returns {Array<{ label: string, value: string, tone?: 'warn' }>}
 */
export function accountMetaEntries(user) {
  if (!user || typeof user !== 'object') return [];
  const out = [];
  if (user.is_active === false) {
    out.push({ label: 'État', value: 'Compte désactivé', tone: 'warn' });
  } else if (user.is_active === true) {
    out.push({ label: 'État', value: 'Compte actif' });
  }
  const provider = String(user.auth_provider || '').trim();
  if (provider) {
    out.push({ label: 'Origine', value: AUTH_PROVIDER_LABELS[provider.toLowerCase()] || provider });
  }
  const created = formatAccountDate(user.created_at);
  if (created) out.push({ label: 'Créé le', value: created });
  const seen = formatAccountDate(user.last_seen);
  if (seen) out.push({ label: 'Dernière visite', value: seen });
  return out;
}
