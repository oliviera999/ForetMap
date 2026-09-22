'use strict';

/**
 * Registre des produits servis par le monorepo (lot 1 du plan de convergence,
 * docs/AUDIT_CONVERGENCE_APPS_2026-09.md §5.2).
 *
 * Un produit = une entrée HTML Vite, un ou plusieurs préfixes de host, un dossier d'assets
 * propres sous `public/<dir>/`, un préfixe d'API isolé (le cas échéant), ses chemins
 * d'authentification soumis au limiteur strict, et les noms de ses fichiers PWA générés
 * (`scripts/build-pwa.js`). Tout ce qui, côté serveur, dépendait de « gl » en dur
 * (`productResolver`, `spaFallback`, favicon, en-têtes `no-store`, `/sw.js`,
 * `/manifest.json`, limiteur) lit désormais ce registre : ajouter un produit, c'est ajouter
 * une entrée ici, pas un `if` ailleurs.
 *
 * Le registre ne contient AUCUNE logique d'authentification : l'isolement des sessions
 * reste porté par le claim JWT `product` (`lib/auth/jwtPipeline.js`) et par le préfixe de
 * chemin `/api/gl` (cf. `docs/GL_ARCHITECTURE.md`, « Routage produit »).
 */

const { brandText, joinBrandSegments, getBrand } = require('./brand');

/**
 * Noms affichés : `lib/brand.js`. Les identifiants (`id`, `apiPrefix`, `hostPrefixes`,
 * `htmlEntry`, `assetsDir`, noms de fichiers PWA) restent en dur — ce sont des contrats
 * techniques, pas de l'affichage (cf. l'en-tête de `lib/brand.js`).
 */
const brand = getBrand();

const DEFAULT_PRODUCT_ID = 'foret';

/** @typedef {'foret' | 'gl' | 'plan' | 'staff'} ProductId */

/**
 * @typedef {object} ProductDefinition
 * @property {ProductId} id Identifiant court (claim JWT `product`, header `X-Foretmap-Product`).
 * @property {string} label Nom affiché.
 * @property {string[]} hostPrefixes Préfixes de label de host (`www.` déjà retiré), ex. `gl.`.
 * @property {string} htmlEntry Nom de l'entrée HTML Vite (racine du dépôt et de `dist/`).
 * @property {string} assetsDir Sous-dossier de `public/` (et `dist/`) portant favicon et icônes ; vide pour la racine.
 * @property {ProductId|null} [shareFaviconWith] Si défini, `/favicon.ico` et les balises `<link rel="icon">`
 *   de l'entrée HTML réutilisent l'icône de cet autre produit.
 * @property {string|null} apiPrefix Préfixe d'API isolé (`/api/gl`) ou `null` (API ForetMap par défaut).
 * @property {string[]} authRateLimitPaths Chemins d'authentification soumis au limiteur strict.
 * @property {string} swFile Nom du service worker généré dans `dist/` (`/sw.js` le sert selon le host).
 * @property {string} manifestFile Nom du manifest PWA généré dans `dist/` (`/manifest.json` le sert selon le host).
 * @property {{ name: string, shortName: string, description: string, themeColor: string, backgroundColor: string, startUrl: string }} pwa Métadonnées du manifest.
 */

/** @type {Readonly<Record<ProductId, Readonly<ProductDefinition>>>} */
const PRODUCTS = Object.freeze({
  foret: Object.freeze({
    id: 'foret',
    label: brand.appName,
    hostPrefixes: Object.freeze([]),
    htmlEntry: 'index.vite.html',
    assetsDir: '',
    apiPrefix: null,
    authRateLimitPaths: Object.freeze([
      '/api/auth/login',
      '/api/auth/register',
      '/api/auth/reset-password',
      '/api/auth/forgot-password',
      '/api/auth/teacher/forgot-password',
      '/api/auth/teacher/reset-password',
      '/api/lti/login',
      '/api/lti/launch',
      '/api/lti/session',
    ]),
    swFile: 'sw-foret.js',
    manifestFile: 'manifest-foret.webmanifest',
    pwa: Object.freeze({
      name: joinBrandSegments([brand.appName, brand.orgName]),
      shortName: brand.appShortName,
      description: brandText(
        'Gestion et cartographie de la forêt comestible du {org}',
        'Gestion et cartographie de la forêt comestible',
      ),
      themeColor: '#1a4731',
      backgroundColor: '#f0f4f0',
      startUrl: '/',
    }),
  }),
  gl: Object.freeze({
    id: 'gl',
    label: brand.glName,
    hostPrefixes: Object.freeze(['gl.']),
    htmlEntry: 'gl.html',
    assetsDir: 'gl',
    apiPrefix: '/api/gl',
    // Toute route qui vérifie un mot de passe de compte doit figurer ici (verrouillé par
    // `tests/auth-rate-limit-coverage.test.js`) : `staff/login` en était absent et offrait
    // 1200 essais/min sur les comptes prof/admin ForetMap (audit comptes 2026-09, S1).
    authRateLimitPaths: Object.freeze([
      '/api/gl/auth/login',
      '/api/gl/auth/staff/login',
      '/api/gl/auth/guest',
      '/api/gl/auth/forgot-password',
      '/api/gl/auth/reset-password',
      '/api/gl/auth/link-foretmap',
    ]),
    swFile: 'sw-gl.js',
    manifestFile: 'manifest-gl.webmanifest',
    pwa: Object.freeze({
      name: brand.glName,
      shortName: brand.glShortName,
      description: brandText('Jeu pédagogique {gl} — chapitres, carte du royaume, sorts et QCM'),
      themeColor: '#2b2140',
      backgroundColor: '#f6f1e7',
      startUrl: '/',
    }),
  }),
  plan: Object.freeze({
    id: 'plan',
    label: brandText('Plan {orgShort}', 'Plan'),
    hostPrefixes: Object.freeze(['planlyautey.']),
    htmlEntry: 'plan.html',
    assetsDir: 'plan',
    // Favicon officiel Lycée Lyautey sous public/plan/ — pas de shareFaviconWith.
    apiPrefix: '/api/plan',
    authRateLimitPaths: Object.freeze([]),
    swFile: 'sw-plan.js',
    manifestFile: 'manifest-plan.webmanifest',
    pwa: Object.freeze({
      name: brandText('Plan {orgShort}', 'Plan'),
      shortName: 'Plan',
      description: brandText(
        'Plan du {org} : se repérer dans les lieux avec son smartphone',
        'Plan : se repérer dans les lieux avec son smartphone',
      ),
      themeColor: '#183058',
      backgroundColor: '#eef1f6',
      startUrl: '/',
    }),
  }),
  /**
   * Plan des personnels (`proflyautey.*`, alias `stafflyautey.*`) : même carte et même écran que le Plan Lyautey, mais
   * servi sur la surface `staff` (`lib/locationSurfaces.js`) à un lecteur **identifié** — d'où
   * les lieux retirés du plan public et les compléments confidentiels des fiches.
   *
   * Il partage volontairement le dossier d'icônes du plan public (`assetsDir: 'plan'`) : même
   * établissement, mêmes icônes d'installation (favicon officiel Lycée Lyautey), aucun binaire
   * dupliqué. La distinction d’onglet repose sur la teinte (`theme-color` brun) et le titre ;
   * `public/staff/favicon.svg` est une copie du SVG plan pour le précache du service worker.
   */
  staff: Object.freeze({
    id: 'staff',
    label: 'Plan personnels',
    /**
     * Deux préfixes pour un seul produit : `proflyautey.` (adresse historique) et
     * `stafflyautey.` (adresse retenue pour parler de « personnels » plutôt que de
     * « profs » — le plan sert aussi la vie scolaire, l'intendance et les agents). Les deux
     * mènent au même écran, au même `apiPrefix` et à la même PWA : rien à migrer côté
     * session, et l'ancienne adresse reste valable tant qu'elle est publiée.
     */
    hostPrefixes: Object.freeze(['proflyautey.', 'stafflyautey.']),
    htmlEntry: 'staff.html',
    assetsDir: 'plan',
    apiPrefix: '/api/staff-plan',
    // Le code d'accès est un secret court : il doit tomber sous le limiteur strict, au même
    // titre qu'un mot de passe (verrouillé par `tests/auth-rate-limit-coverage.test.js`).
    authRateLimitPaths: Object.freeze(['/api/staff-plan/access']),
    swFile: 'sw-staff.js',
    manifestFile: 'manifest-staff.webmanifest',
    pwa: Object.freeze({
      name: brandText('Plan personnels — {orgShort}', 'Plan personnels'),
      shortName: 'Plan perso.',
      description: brandText(
        'Plan du {org} réservé aux personnels : lieux et consignes internes',
        'Plan réservé aux personnels : lieux et consignes internes',
      ),
      themeColor: '#5a3a12',
      backgroundColor: '#f6f2ea',
      startUrl: '/',
    }),
  }),
});

const PRODUCT_IDS = Object.freeze(Object.keys(PRODUCTS));

/** @param {unknown} value @returns {value is ProductId} */
function isProductId(value) {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PRODUCTS, value);
}

/** @param {unknown} value @returns {ProductId | null} Identifiant normalisé (minuscules, sans espaces) ou `null`. */
function normalizeProductId(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  return isProductId(raw) ? raw : null;
}

/** @param {ProductId} id */
function getProduct(id) {
  const product = PRODUCTS[normalizeProductId(id) || DEFAULT_PRODUCT_ID];
  return product || PRODUCTS[DEFAULT_PRODUCT_ID];
}

/**
 * Produit désigné par un host déjà normalisé (minuscules, sans port, sans `www.`).
 * Premier préfixe correspondant dans l'ordre du registre ; produit par défaut sinon.
 * @param {string} normalizedHost
 * @returns {ProductId}
 */
function resolveProductIdFromHost(normalizedHost) {
  const host = String(normalizedHost || '');
  if (!host) return DEFAULT_PRODUCT_ID;
  for (const id of PRODUCT_IDS) {
    if (PRODUCTS[id].hostPrefixes.some((prefix) => host.startsWith(prefix))) return id;
  }
  return DEFAULT_PRODUCT_ID;
}

/** Tous les chemins d'authentification à soumettre au limiteur strict, tous produits confondus. */
function listAuthRateLimitPaths() {
  return PRODUCT_IDS.flatMap((id) => [...PRODUCTS[id].authRateLimitPaths]);
}

/** Noms de base des entrées HTML (à servir en `no-store`, jamais en cache). */
function listHtmlEntryBasenames() {
  return PRODUCT_IDS.map((id) => PRODUCTS[id].htmlEntry);
}

module.exports = {
  DEFAULT_PRODUCT_ID,
  PRODUCTS,
  PRODUCT_IDS,
  isProductId,
  normalizeProductId,
  getProduct,
  resolveProductIdFromHost,
  listAuthRateLimitPaths,
  listHtmlEntryBasenames,
};
