// Helpers purs d'affichage des rattachements « groupes » et du profil RBAC d'un compte
// (administration Profils & utilisateurs — liste des comptes et fiche utilisateur).

import { GROUP_KIND_LABELS } from './profilesRoleForm.js';

/**
 * Normalise la liste `groups[]` renvoyée par `/api/rbac/users*` en entrées prêtes à afficher.
 * Tolère l'absence du champ (API plus ancienne) et les clés partielles. Un groupe n'a plus de
 * « responsable » : l'appartenance est la seule relation, le profil vient du groupe lui-même
 * (`default_role_*`, `force_default_role`).
 * @param {unknown} rawGroups
 * @returns {Array<{ id: string, name: string, kind: string, kindLabel: string, isActive: boolean,
 *   defaultRoleLabel: string, forcesDefaultRole: boolean }>}
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
    out.push({
      id,
      name: String(g.name ?? '').trim() || String(g.slug ?? '').trim() || id,
      kind,
      kindLabel: GROUP_KIND_LABELS[kind] || kind,
      isActive: g.is_active == null ? true : Boolean(g.is_active),
      defaultRoleLabel: String(g.default_role_display_name ?? g.default_role_slug ?? '').trim(),
      forcesDefaultRole: Boolean(g.force_default_role),
    });
  }
  return out;
}

/**
 * Libellé court du profil **effectif** (rôle principal) d'un compte, avec repli sur le slug.
 * @param {object} user ligne `/api/rbac/users` ou fiche détaillée
 * @returns {string} libellé, ou '' si aucun profil
 */
export function userRoleLabel(user) {
  const display = String(user?.role_display_name ?? user?.roleDisplayName ?? '').trim();
  if (display) return display;
  return String(user?.role_slug ?? user?.roleSlug ?? '').trim();
}

/**
 * Libellé du profil **attribué** (celui posé sur le compte par un administrateur, un import ou
 * la progression), avec repli sur le slug.
 * @param {object} user ligne `/api/rbac/users` ou fiche détaillée
 * @returns {string} libellé, ou '' si aucun profil attribué
 */
export function userAssignedRoleLabel(user) {
  const display = String(
    user?.assigned_role_display_name ?? user?.assignedRoleDisplayName ?? '',
  ).trim();
  if (display) return display;
  return String(user?.assigned_role_slug ?? user?.assignedRoleSlug ?? '').trim();
}

/**
 * Origine du profil effectif, telle que la fiche détaillée la décrit (`effective_role.source`) :
 * « attribué » (le profil du compte l'emporte), « conféré par le groupe X » (le profil par
 * défaut d'un groupe est plus élevé) ou « imposé par le groupe X » (groupe qui impose son
 * profil). Chaîne vide si la fiche ne porte pas l'information.
 * @param {object} user fiche détaillée (`GET /api/rbac/users/:type/:id`)
 * @returns {string}
 */
export function effectiveRoleOriginLabel(user) {
  const effective = user?.effective_role ?? user?.effectiveRole;
  if (!effective || typeof effective !== 'object') return '';
  const source = String(effective.source || '')
    .trim()
    .toLowerCase();
  const groupName = String(effective.groupName ?? effective.group_name ?? '').trim();
  const groupSuffix = groupName ? ` par le groupe ${groupName}` : ' par un groupe';
  if (source === 'forced') return `imposé${groupSuffix}`;
  if (source === 'group') return `conféré${groupSuffix}`;
  if (source === 'assigned' || source === 'default') return 'attribué';
  return '';
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
  return groups.map((g) => g.name).join(', ');
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
