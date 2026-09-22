'use strict';

/**
 * Surface de lecture d'une requête — **noyau pur** (aucune I/O, aucun accès Express, aucun
 * réglage lu). Lot A du plan de correction de `docs/AUDIT_SECURITE_2026-09-22.md` §7.
 *
 * Le défaut corrigé ici est celui du constat S3 : jusqu'à présent la surface d'affichage —
 * donc la politique de visibilité des lieux — était déclarée par l'appelant, via
 * `?surface=`. Un client qui omettait le paramètre n'était filtré par **aucune** surface
 * (S2), et un client qui en demandait une autre obtenait celle-là. La surface redevient ici
 * une **décision du serveur**, prise à partir du produit résolu par host
 * (`lib/productResolver.js`) et de l'état d'authentification :
 *
 * | Produit (host)                     | Lecteur        | Surface  |
 * | ---------------------------------- | -------------- | -------- |
 * | `plan` (planlyautey)               | quel qu'il soit| `plan`   |
 * | `staff` (proflyautey, stafflyautey)| quel qu'il soit| `staff`  |
 * | `foret` / `gl` / défaut            | authentifié    | `map`    |
 * | `foret` / `gl` / défaut            | anonyme        | `visit`  |
 *
 * Le produit seul ne suffit pas pour `foret` : ce host sert **à la fois** la carte de travail
 * (compte élève ou personnel) et la Visite publique. C'est l'état d'authentification qui les
 * sépare — et c'est bien un fait constaté par le serveur, pas une déclaration du client.
 *
 * `?surface=` ne disparaît pas : il devient **restrictif seulement**. Voir
 * `resolveSurfaceFilters` ci-dessous.
 */

/** Surfaces connues, ordre canonique de `lib/locationSurfaces.js`. */
const SURFACES = Object.freeze(['map', 'visit', 'plan', 'staff']);

/**
 * Produits dont le host détermine à lui seul la surface. `foret` en est volontairement
 * absent (voir l'en-tête) ; `gl` aussi — G&L a sa propre API sous `/api/gl/*`, et une
 * requête G&L qui atteindrait une route de lieux n'a aucune raison d'être élargie.
 */
const SURFACE_BY_PRODUCT = Object.freeze({ plan: 'plan', staff: 'staff' });

/**
 * Surfaces dont la lecture n'est **jamais** ouverte : elles exigent un laissez-passer
 * (code du plan) ou un compte (plan des personnels). Une surface absente de cette liste
 * n'est pas pour autant publique — elle est simplement gardée ailleurs (`map` l'est par le
 * périmètre de groupe du compte).
 */
const GUARDED_SURFACES = Object.freeze(['plan', 'staff']);

/** Chaîne quelconque → surface connue, ou `''`. */
function normalizeSurface(value) {
  const surface = String(value ?? '')
    .trim()
    .toLowerCase();
  return SURFACES.includes(surface) ? surface : '';
}

/**
 * Surface d'une requête, décidée par le serveur.
 *
 * @param {object} options
 * @param {string} options.productId Produit résolu par host (`lib/products.js`).
 * @param {boolean} [options.authenticated=false] Le lecteur porte-t-il une session valide ?
 * @returns {'map'|'visit'|'plan'|'staff'}
 */
function resolveRequestSurface({ productId, authenticated = false } = {}) {
  const product = String(productId ?? '')
    .trim()
    .toLowerCase();
  return SURFACE_BY_PRODUCT[product] || (authenticated ? 'map' : 'visit');
}

/** La lecture de cette surface exige-t-elle un laissez-passer ou un compte ? */
function isGuardedSurface(surface) {
  return GUARDED_SURFACES.includes(normalizeSurface(surface));
}

/**
 * Surfaces à appliquer au filtrage d'une réponse — **intersection, jamais union**.
 *
 * Un lieu n'est renvoyé que s'il est visible sur **toutes** les surfaces retournées ici.
 * C'est ce qui rend `?surface=` inoffensif : il ne peut que rétrécir la réponse. Demander
 * `?surface=staff` depuis le plan public exige désormais que le lieu soit visible sur
 * `plan` **et** sur `staff` — soit strictement moins que `plan` seul, jamais plus.
 *
 * `unfiltered` est l'exception de gestion : un gestionnaire de lieux qui travaille sur le
 * produit ForêtMap doit voir les lieux **masqués** pour pouvoir les éditer (l'onglet
 * « Lieux » appelle `/api/zones` sans `?surface=`). Sa demande explicite reste honorée, et
 * il ne gagne aucune visibilité d'audience au passage : `filterLocationsForViewer` continue
 * de trancher ligne à ligne.
 *
 * @param {object} options
 * @param {string} options.surface Surface décidée par le serveur.
 * @param {unknown} [options.requested] Valeur de `?surface=` (ignorée si inconnue).
 * @param {boolean} [options.unfiltered=false] Lecteur en situation de gestion.
 * @returns {string[]} surfaces à vérifier, sans doublon ; vide = aucun filtrage.
 */
function resolveSurfaceFilters({ surface, requested, unfiltered = false } = {}) {
  const asked = normalizeSurface(requested);
  if (unfiltered) return asked ? [asked] : [];
  const base = normalizeSurface(surface);
  const filters = [];
  if (base) filters.push(base);
  if (asked && asked !== base) filters.push(asked);
  return filters;
}

module.exports = {
  SURFACES,
  SURFACE_BY_PRODUCT,
  GUARDED_SURFACES,
  normalizeSurface,
  resolveRequestSurface,
  isGuardedSurface,
  resolveSurfaceFilters,
};
