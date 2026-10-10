'use strict';

/**
 * Avatars par défaut (compte sans photo), **générés par le serveur** de l'application.
 *
 * ## Origine du dessin (citation et licences)
 *
 * - Bibliothèque **DiceBear** (Florian Körner, licence MIT) — https://github.com/dicebear/dicebear ,
 *   https://www.dicebear.com . Paquets `@dicebear/core` et `@dicebear/adventurer-neutral`,
 *   épinglés en **9.4.3** : c'est la génération servie jusqu'ici par l'API publique « 9.x »,
 *   donc le même dessin pour la même graine (vérifié octet pour octet, cf. tests). Changer de
 *   version peut changer les visages : à faire en connaissance de cause.
 * - Style **« Adventurer Neutral »** de **Lisa Wischofsky**, adapté par DiceBear, sous licence
 *   **CC BY 4.0** — https://www.figma.com/community/file/1184595184137881796 ,
 *   https://creativecommons.org/licenses/by/4.0/ . L'attribution est affichée dans l'application
 *   (« À propos », profil) et figure dans les métadonnées de chaque SVG produit.
 *
 * ## Ce qui ne circule plus
 *
 * Le navigateur chargeait `api.dicebear.com/…/svg?seed=<pseudo ou prénom-nom>` : un service
 * tiers recevait le nom, l'adresse IP et le navigateur à chaque affichage. Désormais :
 * - la **graine** est calculée ici, à partir de la ligne `users` (même règle que l'ancien
 *   client : pseudo, sinon « prénom-nom », sinon identifiant) ; elle ne figure dans **aucune
 *   URL** — ni vers un tiers, ni vers l'application — et pas davantage dans le SVG ;
 * - l'URL est `/api/users/<id>/default-avatar?exp=…&sig=…` : **signée** comme les photos
 *   d'élèves (`lib/uploadsSignedUrls.js`, même durée de vie, même arrondi horaire), mais avec
 *   une clé dérivée propre. La signature n'est émise que par une route API qui expose déjà ce
 *   compte (`toPublicUserRow`, statistiques, `GET /api/auth/me`) : l'avatar reste visible de
 *   ceux qui voyaient le compte, et de personne d'autre ;
 * - la signature couvre aussi la **graine** : changer de pseudo change l'URL (le cache du
 *   navigateur ne ressert pas l'ancien visage) et invalide l'ancienne.
 *
 * ## Cache
 *
 * Rendu mis en cache en mémoire, borné (`AVATAR_CACHE_MAX_ENTRIES` entrées, clé = empreinte
 * de la graine, pas la graine elle-même) ; côté HTTP, `Cache-Control: private, max-age=3600`
 * (durée de vie d'une même URL) et `ETag` (empreinte du SVG).
 */

const crypto = require('crypto');
const {
  BUCKET_SECONDS,
  deriveUrlSigningKey,
  signedUploadExpiry,
  signedUploadTtlSeconds,
} = require('./uploadsSignedUrls');
const { createMemoryTtlCache } = require('./memoryTtlCache');

/** Graine de repli (compte sans pseudo, sans nom ni identifiant) — celle de l'ancien client. */
const FALLBACK_SEED = 'foretmap';
/** Options DiceBear de l'ancien appel (`…/svg?seed=…&radius=50`). */
const AVATAR_OPTIONS = Object.freeze({ radius: 50 });
/** Chemin public de la route (montée sous `/api/users`). */
const DEFAULT_AVATAR_ROUTE_PREFIX = '/api/users/';
const DEFAULT_AVATAR_ROUTE_SUFFIX = '/default-avatar';

const SIGNATURE_VERSION = 'v1';
const SIGNATURE_BYTES = 16;
const SIGNING_LABEL = 'foretmap:default-avatar-url:v1';

const AVATAR_CACHE_MAX_ENTRIES = 500;
const AVATAR_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const svgCache = createMemoryTtlCache({
  ttlMs: AVATAR_CACHE_TTL_MS,
  maxEntries: AVATAR_CACHE_MAX_ENTRIES,
});

/**
 * Graine d'un compte : pseudo, sinon « prénom-nom », sinon identifiant. Règle **identique** à
 * l'ancien `studentSeed` du client (`src/utils/avatar.js`), condition du « même visage ».
 * @param {{ id?: unknown, pseudo?: unknown, first_name?: unknown, last_name?: unknown }|null} user
 * @returns {string}
 */
function defaultAvatarSeed(user) {
  if (!user || typeof user !== 'object') return FALLBACK_SEED;
  const seed =
    user.pseudo ||
    [user.first_name, user.last_name].filter(Boolean).join('-') ||
    user.id ||
    FALLBACK_SEED;
  return String(seed);
}

/** La ligne porte-t-elle tout ce qui fait la graine ? (sinon l'URL ne serait pas vérifiable) */
function hasSeedFields(row) {
  return (
    !!row &&
    typeof row === 'object' &&
    'pseudo' in row &&
    'first_name' in row &&
    'last_name' in row &&
    row.id != null &&
    String(row.id).trim() !== ''
  );
}

function computeSignature(userId, exp, seed) {
  const key = deriveUrlSigningKey(SIGNING_LABEL);
  if (!key) return null;
  return crypto
    .createHmac('sha256', key)
    .update(`${SIGNATURE_VERSION}\n${userId}\n${exp}\n${seed}`)
    .digest()
    .subarray(0, SIGNATURE_BYTES)
    .toString('base64url');
}

/**
 * URL signée de l'avatar par défaut d'un compte, ou `null` si la ligne ne permet pas de la
 * calculer (champs de la graine absents, secret indisponible).
 * @param {object|null|undefined} row Ligne `users` (au moins id, pseudo, first_name, last_name).
 * @param {{ now?: number }} [options]
 * @returns {string|null}
 */
function defaultAvatarUrlFor(row, { now = Date.now() } = {}) {
  if (!hasSeedFields(row)) return null;
  const id = String(row.id);
  const exp = signedUploadExpiry(now);
  const sig = computeSignature(id, exp, defaultAvatarSeed(row));
  if (!sig) return null;
  return `${DEFAULT_AVATAR_ROUTE_PREFIX}${encodeURIComponent(id)}${DEFAULT_AVATAR_ROUTE_SUFFIX}?exp=${exp}&sig=${sig}`;
}

/**
 * Contrôle de forme et d'échéance, **sans base** : écarte d'emblée une requête forgée avant
 * toute lecture SQL.
 * @param {object} query `req.query`
 * @param {{ now?: number }} [options]
 * @returns {{ exp: number, sig: string }|null}
 */
function parseDefaultAvatarQuery(query, { now = Date.now() } = {}) {
  const expRaw = query?.exp;
  const sigRaw = query?.sig;
  if (typeof expRaw !== 'string' || typeof sigRaw !== 'string') return null;
  if (!/^\d{1,12}$/.test(expRaw) || !/^[A-Za-z0-9_-]{1,64}$/.test(sigRaw)) return null;
  const exp = Number(expRaw);
  const nowSeconds = Math.floor(now / 1000);
  if (exp <= nowSeconds) return null;
  // Échéance au-delà de ce que le serveur émet aujourd'hui (durée réduite depuis) : refusée.
  if (exp > nowSeconds + signedUploadTtlSeconds() + BUCKET_SECONDS) return null;
  return { exp, sig: sigRaw };
}

/**
 * Vérifie la signature d'une requête pour l'identifiant demandé et la graine **actuelle**.
 * @param {string} userId identifiant tel qu'il figure dans l'URL
 * @param {{ exp: number, sig: string }} parsed résultat de `parseDefaultAvatarQuery`
 * @param {string} seed graine recalculée depuis la base
 * @returns {boolean}
 */
function verifyDefaultAvatarSignature(userId, parsed, seed) {
  if (!parsed) return false;
  const expected = computeSignature(String(userId), parsed.exp, seed);
  if (!expected) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(parsed.sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// --- Rendu ---------------------------------------------------------------------------------

let dicebearPromise = null;

/** DiceBear est publié en ESM seul : import dynamique, chargé une fois. */
function loadDiceBear() {
  if (!dicebearPromise) {
    dicebearPromise = Promise.all([
      import('@dicebear/core'),
      import('@dicebear/adventurer-neutral'),
    ]).then(([core, style]) => ({ createAvatar: core.createAvatar, style }));
    // Échec (paquet absent après un déploiement incomplet) : on retentera à la requête suivante.
    dicebearPromise.catch(() => {
      dicebearPromise = null;
    });
  }
  return dicebearPromise;
}

/**
 * Garde-fou : le SVG est servi sur notre origine. DiceBear ne produit que des formes
 * (`svg`, `g`, `path`, `rect`, `mask`, métadonnées) ; tout élément actif, gestionnaire
 * d'événement ou référence externe est refusé plutôt que servi.
 */
const UNSAFE_SVG_PATTERNS = Object.freeze([
  /<\s*(script|foreignObject|iframe|object|embed|image|style|a|set|animate\w*)\b/i,
  /\son[a-z]+\s*=/i,
  /javascript:/i,
  /\bhref\s*=\s*["']\s*(?!#)/i,
  /url\(\s*["']?\s*(?!#)/i,
]);

function isSafeAvatarSvg(svg) {
  const s = String(svg || '');
  if (!/^<svg[\s>]/.test(s)) return false;
  return !UNSAFE_SVG_PATTERNS.some((re) => re.test(s));
}

function sha256(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('base64url');
}

/**
 * SVG de l'avatar par défaut pour une graine, avec son `ETag`. Mis en cache (borné).
 * @param {string} seed
 * @returns {Promise<{ svg: string, etag: string }>}
 */
async function renderDefaultAvatarSvg(seed) {
  const key = sha256(`${SIGNATURE_VERSION}:${seed}`);
  const cached = svgCache.get(key);
  if (cached) return cached;
  const { createAvatar, style } = await loadDiceBear();
  const svg = createAvatar(style, { ...AVATAR_OPTIONS, seed: String(seed) }).toString();
  if (!isSafeAvatarSvg(svg)) {
    throw new Error('SVG d’avatar refusé par le garde-fou');
  }
  const entry = Object.freeze({ svg, etag: `"da-${sha256(svg).slice(0, 22)}"` });
  svgCache.set(key, entry);
  return entry;
}

/** Vide le cache de rendu (tests). */
function clearDefaultAvatarCache() {
  svgCache.clear();
}

module.exports = {
  FALLBACK_SEED,
  AVATAR_OPTIONS,
  AVATAR_CACHE_MAX_ENTRIES,
  DEFAULT_AVATAR_ROUTE_PREFIX,
  DEFAULT_AVATAR_ROUTE_SUFFIX,
  defaultAvatarSeed,
  defaultAvatarUrlFor,
  parseDefaultAvatarQuery,
  verifyDefaultAvatarSignature,
  isSafeAvatarSvg,
  renderDefaultAvatarSvg,
  clearDefaultAvatarCache,
};
