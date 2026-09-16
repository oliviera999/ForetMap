/**
 * Statut « n3beur » d'un profil RBAC — noyau partagé front (`src/`) / back (`lib/shared/`).
 *
 * Un compte est n3beur quand son **profil principal** est un palier n3beur, que celui-ci ait
 * été attribué à la main (admin des profils) ou dérivé du rattachement à un groupe n3beur
 * (`grants_n3beur_access` / profil par défaut `eleve_*` — cf. `lib/groupRole.js`, qui
 * synchronise le profil principal à chaque rattachement).
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
 * Profils qu'un rattachement à un groupe n3beur promeut en palier n3beur, et profil absent :
 * ce sont les seuls que `syncStudentRoleFromGroups` (cf. `lib/groupRole.js`) accepte de
 * remplacer. Un profil d'encadrement ou personnalisé est au contraire préservé — le
 * rattachement à une classe ne fait donc pas d'un prof de classe un n3beur.
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
