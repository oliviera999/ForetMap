/**
 * Statut « n3beur » d'un profil RBAC — noyau partagé front (`src/`) / back (`lib/shared/`).
 *
 * Un compte est n3beur quand son **profil effectif** est un palier n3beur, que celui-ci ait
 * été attribué à la main (admin des profils) ou conféré par un groupe dont le profil par
 * défaut est un palier `eleve_*` (cf. `lib/effectiveRole.js`, « le plus élevé l'emporte »).
 *
 * Ne sont donc **pas** n3beurs : l'encadrement (`admin`, `prof`, `prof_classe`), les profils
 * en lecture seule (`visiteur`, `personnel`) et les profils du sous-produit GL (`gl_*`),
 * même lorsqu'ils sont portés par un compte `user_type = 'student'` ou membre d'une classe.
 */

/** Profils système qui ne sont jamais des paliers n3beur (encadrement + lecture seule). */
export const NON_N3BEUR_SYSTEM_ROLE_SLUGS = Object.freeze([
  'admin',
  'prof',
  'prof_classe',
  'visiteur',
  'personnel',
]);

/**
 * Profils « type visiteur » : ceux qu'un rattachement à un groupe n3beur promeut (le profil
 * du groupe est plus élevé). Conservés pour les affichages qui distinguent un compte en
 * attente d'un compte déjà n3beur.
 */
export const GROUP_PROMOTABLE_ROLE_SLUGS = Object.freeze(['visiteur', 'personnel']);

/** Rang plancher de l'encadrement : un palier n3beur reste strictement en dessous. */
export const N3BEUR_RANK_EXCLUSIVE_MAX = 400;

/** Préfixe des profils du sous-produit Gnomes & Licornes (isolés de ForetMap). */
const GL_ROLE_SLUG_PREFIX = 'gl_';

export function normalizeRoleSlug(slug) {
  return String(slug || '')
    .trim()
    .toLowerCase();
}

/** Palier n3beur système : `eleve_novice`, `eleve_avance`, `eleve_chevronne`. */
export function isEleveRoleSlug(slug) {
  return normalizeRoleSlug(slug).startsWith('eleve_');
}

/** Profil du sous-produit Gnomes & Licornes (`gl_*`) : jamais attribuable depuis ForetMap. */
export function isGlRoleSlug(slug) {
  return normalizeRoleSlug(slug).startsWith(GL_ROLE_SLUG_PREFIX);
}

/** Profil système d'encadrement ou de lecture seule (jamais un palier n3beur). */
export function isSystemStaffRoleSlug(slug) {
  return NON_N3BEUR_SYSTEM_ROLE_SLUGS.includes(normalizeRoleSlug(slug));
}

/**
 * Profil par défaut d'un compte qui n'en a aucun : le moins puissant de son type. Un
 * enseignant créé sans profil (ou dont le profil a été retiré) est **prof de classe**, jamais
 * n3boss ; un élève est visiteur (docs/AUDIT_COMPTES_DROITS_GROUPES_2026-09-18.md, CDG-40/46).
 */
export const DEFAULT_ROLE_SLUG_BY_USER_TYPE = Object.freeze({
  teacher: 'prof_classe',
  student: 'visiteur',
});

export function defaultRoleSlugForUserType(userType) {
  const key = String(userType || '')
    .trim()
    .toLowerCase();
  return DEFAULT_ROLE_SLUG_BY_USER_TYPE[key] || DEFAULT_ROLE_SLUG_BY_USER_TYPE.student;
}

/**
 * « Vue globale » sur les comptes et les groupes : l'administrateur et tout profil de rang
 * n3boss ou plus (`rank >= 400`). Le prof de classe (350) reste borné à ses groupes. La
 * règle vit ici, et non dans une permission de statistiques (CDG-10).
 */
export function hasGlobalScopeByRole({ slug, rank } = {}) {
  if (normalizeRoleSlug(slug) === 'admin') return true;
  const r = Number(rank);
  return Number.isFinite(r) && r >= N3BEUR_RANK_EXCLUSIVE_MAX;
}

/**
 * Vrai si le profil est un palier n3beur. Accepte une ligne `roles` (`{ slug, rank }`), une
 * ligne utilisateur (`{ role_slug, role_rank }` / `{ primary_role_slug }`) ou un simple slug.
 *
 * Les profils personnalisés (créés par un admin) comptent comme paliers n3beur dès lors que
 * leur rang est fini et strictement inférieur à celui de l'encadrement — même règle que
 * l'admin des profils (`isN3beurTierConfigurableProfile`). Sans rang exploitable, seul le
 * préfixe `eleve_` qualifie : mieux vaut masquer un profil exotique qu'exposer un visiteur.
 */
export function isN3beurRole(role) {
  if (!role) return false;
  const raw = typeof role === 'string' ? { slug: role } : role;
  const slug = normalizeRoleSlug(raw.slug ?? raw.role_slug ?? raw.primary_role_slug);
  if (!slug) return false;
  if (NON_N3BEUR_SYSTEM_ROLE_SLUGS.includes(slug)) return false;
  if (slug.startsWith(GL_ROLE_SLUG_PREFIX)) return false;
  if (isEleveRoleSlug(slug)) return true;
  const rank = Number(raw.rank ?? raw.role_rank ?? raw.primary_role_rank);
  return Number.isFinite(rank) && rank >= 0 && rank < N3BEUR_RANK_EXCLUSIVE_MAX;
}

/**
 * Vrai si l'appartenance à un groupe n3beur suffit à conférer le statut, le profil en base
 * n'ayant pas encore été resynchronisé (compte importé, membre ajouté hors connexion…).
 */
export function isGroupPromotableRoleSlug(slug) {
  const normalized = normalizeRoleSlug(slug);
  return normalized === '' || GROUP_PROMOTABLE_ROLE_SLUGS.includes(normalized);
}

/**
 * Statut n3beur d'un compte : profil n3beur, ou profil encore promotible (visiteur /
 * personnel / absent) porté par un membre d'au moins un groupe n3beur actif.
 * @param {{ role?: object|string|null, inN3beurGroup?: boolean }} account
 */
export function isN3beurAccount({ role = null, inN3beurGroup = false } = {}) {
  if (isN3beurRole(role)) return true;
  if (!inN3beurGroup) return false;
  const slug = typeof role === 'string' ? role : (role?.slug ?? role?.role_slug ?? null);
  return isGroupPromotableRoleSlug(slug);
}
