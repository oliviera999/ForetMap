'use strict';

/**
 * URL signées à durée limitée pour les médias d'élèves servis sous `/uploads`
 * (constat RG4 de `docs/AUDIT_SECURITE_RGPD_2026-09-30.md`).
 *
 * Problème : un `<img src>` n'envoie pas le jeton `Authorization`. Les familles privées
 * « historiques » (`observations/`, `task-logs/`, `user-journal/`) passent donc par une route
 * API et un `fetch` + `blob:` côté client (`src/services/authedImageCache.js`) — un mécanisme
 * taillé pour quelques illustrations d'un carnet, pas pour des listes d'avatars ou des fils de
 * forum de plusieurs dizaines d'images. Pour ces familles-là, le serveur **signe l'URL au
 * moment où il la sérialise** dans une réponse API ; la garde `/uploads`
 * (`createPrivateUploadsGuard`) n'accepte que les URL portant une signature valide et non
 * expirée. Le front n'a rien à changer tant qu'il affiche l'URL fournie par l'API.
 *
 * Inspiration (citée, aucun code repris) :
 *  - URL présignées Amazon S3 (« Query string request authentication », Signature V4 :
 *    signature HMAC-SHA256 du chemin et d'une échéance, passée en paramètres de requête) —
 *    https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html ;
 *  - « Signed URLs » de Google Cloud CDN (`Expires` + `Signature` HMAC, clé côté serveur) —
 *    https://cloud.google.com/cdn/docs/using-signed-urls .
 *
 * Contrat :
 *  - `?exp=<secondes epoch>&sig=<base64url HMAC-SHA256 tronqué à 128 bits>` ;
 *  - message signé : `v1\n<radical du chemin>\n<exp>` — le **radical** est le chemin sans son
 *    extension ni le suffixe `.thumb.jpg`, pour que la vignette serveur (`tasks/x.thumb.jpg`,
 *    dérivée côté client par `uploadThumbUrl`) soit couverte par la signature de l'original ;
 *  - clé dérivée de `JWT_SECRET` (HMAC sur une étiquette dédiée) : aucune nouvelle variable
 *    d'environnement, et une signature d'URL ne peut pas servir de signature de jeton ;
 *  - échéance **arrondie** à l'heure supérieure (`BUCKET_SECONDS`) : la même image garde la
 *    même URL pendant une heure, le cache du navigateur et du service worker reste efficace ;
 *  - durée de vie : `FORETMAP_UPLOADS_SIGNED_URL_TTL_SECONDS` (défaut 6 h, bornée à 5 min–7 j).
 *
 * La signature **est** l'autorisation : elle n'est émise que par une route API qui a déjà
 * appliqué le contrôle d'accès de la ressource (fil de forum, tâche, carnet G&L…). Une URL
 * signée qui fuit reste lisible jusqu'à son échéance, comme une URL présignée S3.
 */

const crypto = require('crypto');
const { SIGNED_UPLOAD_PREFIXES } = require('./uploadsPrivatePaths');

const SIGNATURE_VERSION = 'v1';
const DEFAULT_TTL_SECONDS = 6 * 60 * 60;
const MIN_TTL_SECONDS = 5 * 60;
const MAX_TTL_SECONDS = 7 * 24 * 60 * 60;
/** Granularité de l'échéance : une URL reste identique pendant une heure. */
const BUCKET_SECONDS = 60 * 60;
/** Longueur de la signature (base64url de 16 octets, soit 128 bits). */
const SIGNATURE_BYTES = 16;

function signedUploadTtlSeconds() {
  const raw = parseInt(process.env.FORETMAP_UPLOADS_SIGNED_URL_TTL_SECONDS, 10);
  if (!Number.isFinite(raw)) return DEFAULT_TTL_SECONDS;
  return Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, raw));
}

/**
 * Secret racine : même règle que `middleware/requireTeacher.js` (repli de développement hors
 * production). Lu à chaque appel pour rester testable ; `null` en production sans secret.
 */
function rootSecret() {
  const fromEnv = String(process.env.JWT_SECRET || '').trim();
  if (fromEnv) return fromEnv;
  return process.env.NODE_ENV === 'production' ? null : 'dev-secret-change-in-production';
}

/** Clés dérivées, par étiquette : recalculées seulement si le secret racine change. */
const derivedKeys = new Map();

/**
 * Clé HMAC dérivée de `JWT_SECRET` pour une **étiquette** donnée. Une étiquette par usage
 * (médias `/uploads`, avatars par défaut…) : une signature émise pour l'un ne vaut jamais
 * pour l'autre, ni comme signature de jeton. `null` en production sans secret.
 * @param {string} label
 * @returns {Buffer|null}
 */
function deriveUrlSigningKey(label) {
  const secret = rootSecret();
  if (!secret) return null;
  const cached = derivedKeys.get(label);
  if (cached && cached.secret === secret) return cached.key;
  const key = crypto.createHmac('sha256', secret).update(String(label)).digest();
  derivedKeys.set(label, { secret, key });
  return key;
}

function signingKey() {
  return deriveUrlSigningKey('foretmap:uploads-signed-url:v1');
}

/**
 * Chemin relatif canonique (segments décodés, casse conservée), ou `null` si suspect.
 * Même normalisation que `normalizeUploadPathSegments`, mais sans passage en minuscules :
 * la signature porte sur le fichier exact.
 */
function canonicalUploadRelativePath(rawPath) {
  let raw = rawPath == null ? '' : String(rawPath);
  const q = raw.search(/[?#]/);
  if (q >= 0) raw = raw.slice(0, q);
  try {
    raw = decodeURIComponent(raw);
  } catch (_) {
    return null;
  }
  const segments = [];
  for (const part of raw.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..' || part.includes('\0')) return null;
    segments.push(part);
  }
  return segments.length ? segments.join('/') : null;
}

/** Vrai si le chemin relève d'une famille lisible par URL signée. */
function isSignedUploadRelativePath(canonicalPath) {
  if (!canonicalPath) return false;
  const first = String(canonicalPath).split('/')[0].toLowerCase();
  return SIGNED_UPLOAD_PREFIXES.includes(first);
}

/** `tasks/x.thumb.jpg` et `tasks/x.png` → `tasks/x` (radical commun original / vignette). */
function signatureStem(canonicalPath) {
  return String(canonicalPath)
    .replace(/\.thumb\.jpe?g$/i, '')
    .replace(/\.[a-z0-9]{1,8}$/i, '');
}

function computeSignature(canonicalPath, exp) {
  const key = signingKey();
  if (!key) return null;
  return crypto
    .createHmac('sha256', key)
    .update(`${SIGNATURE_VERSION}\n${signatureStem(canonicalPath)}\n${exp}`)
    .digest()
    .subarray(0, SIGNATURE_BYTES)
    .toString('base64url');
}

/** Échéance arrondie à l'heure supérieure : `now + TTL` ≤ exp < `now + TTL + 1 h`. */
function signedUploadExpiry(nowMs = Date.now()) {
  const target = Math.floor(nowMs / 1000) + signedUploadTtlSeconds();
  return Math.ceil(target / BUCKET_SECONDS) * BUCKET_SECONDS;
}

/**
 * Chemin relatif (`students/12/avatar-1.jpg`) → même chemin suivi de `?exp=…&sig=…` s'il
 * relève d'une famille signée ; inchangé sinon (familles publiques, valeur vide). Une
 * signature déjà présente est remplacée (valeur relue d'un cache, d'un corps renvoyé…).
 * @param {string|null|undefined} relativePath
 * @param {{ now?: number }} [options]
 * @returns {string|null|undefined}
 */
function signUploadRelativePath(relativePath, { now = Date.now() } = {}) {
  if (relativePath == null) return relativePath;
  const raw = String(relativePath).trim();
  if (!raw) return relativePath;
  const bare = stripSignatureQuery(raw).replace(/^\/+/, '');
  const canonical = canonicalUploadRelativePath(bare);
  if (!canonical || !isSignedUploadRelativePath(canonical)) return relativePath;
  const exp = signedUploadExpiry(now);
  const sig = computeSignature(canonical, exp);
  if (!sig) return bare;
  return `${bare}${bare.includes('?') ? '&' : '?'}exp=${exp}&sig=${sig}`;
}

/**
 * URL `/uploads/…` → URL signée (familles signées) ; toute autre URL est rendue telle quelle.
 * @param {string|null|undefined} url
 * @param {{ now?: number }} [options]
 */
function signUploadUrl(url, options = {}) {
  if (url == null) return url;
  const s = String(url).trim();
  const m = /^\/uploads\/(.+)$/.exec(s);
  if (!m) return url;
  const signed = signUploadRelativePath(m[1], options);
  return signed === m[1] ? url : `/uploads/${signed}`;
}

/** Retire `exp` / `sig` d'une URL ou d'un chemin (clé de cache, contenu réenregistré). */
function stripSignatureQuery(value) {
  const s = String(value ?? '');
  const q = s.indexOf('?');
  if (q < 0) return s;
  const base = s.slice(0, q);
  const kept = s
    .slice(q + 1)
    .split('&')
    .filter((part) => part && !/^(exp|sig)=/i.test(part));
  return kept.length ? `${base}?${kept.join('&')}` : base;
}

/**
 * Vérifie une requête `/uploads/<chemin>?exp=…&sig=…`.
 * @param {string} urlPath chemin relatif au montage `/uploads` (`req.path`)
 * @param {object} query `req.query`
 * @param {{ now?: number }} [options]
 * @returns {boolean}
 */
function verifySignedUploadRequest(urlPath, query, { now = Date.now() } = {}) {
  const canonical = canonicalUploadRelativePath(urlPath);
  if (!canonical || !isSignedUploadRelativePath(canonical)) return false;
  const expRaw = query?.exp;
  const sigRaw = query?.sig;
  if (typeof expRaw !== 'string' || typeof sigRaw !== 'string') return false;
  if (!/^\d{1,12}$/.test(expRaw) || !/^[A-Za-z0-9_-]{1,64}$/.test(sigRaw)) return false;
  const exp = Number(expRaw);
  const nowSeconds = Math.floor(now / 1000);
  if (exp <= nowSeconds) return false;
  // Échéance au-delà de ce que le serveur émet aujourd'hui (TTL réduit depuis) : refusée.
  if (exp > nowSeconds + signedUploadTtlSeconds() + BUCKET_SECONDS) return false;
  const expected = computeSignature(canonical, exp);
  if (!expected) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(sigRaw);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Signe, dans un texte libre (Markdown / HTML d'un carnet), les URL `/uploads/<préfixe>/…`
 * d'un **seul** préfixe autorisé (ex. `gl-player-journal/12`). Borné à ce préfixe : un texte
 * qui citerait l'URL d'un autre élève ne doit jamais en obtenir une signature.
 * @param {string} text
 * @param {string} allowedPrefix préfixe relatif, sans `/uploads/` ni `/` final
 */
function signUploadUrlsInText(text, allowedPrefix, options = {}) {
  const s = text == null ? '' : String(text);
  const prefix = String(allowedPrefix || '').replace(/^\/+|\/+$/g, '');
  if (!s || !prefix || !s.includes('/uploads/')) return s;
  const re = new RegExp(
    `/uploads/(${escapeRegExp(prefix)}/[A-Za-z0-9._~%/-]+)(\\?exp=\\d+&(?:amp;)?sig=[A-Za-z0-9_-]+)?`,
    'g',
  );
  return s.replace(re, (whole, rel) => {
    if (rel.includes('..')) return whole;
    return `/uploads/${signUploadRelativePath(rel, options)}`;
  });
}

/** Retire les signatures des URL `/uploads/…` d'un texte avant enregistrement. */
function stripUploadSignaturesInText(text) {
  const s = text == null ? '' : String(text);
  if (!s.includes('/uploads/')) return s;
  return s.replace(
    /(\/uploads\/[A-Za-z0-9._~%/-]+)\?exp=\d+&(?:amp;)?sig=[A-Za-z0-9_-]+/g,
    (_whole, url) => url,
  );
}

module.exports = {
  DEFAULT_TTL_SECONDS,
  BUCKET_SECONDS,
  deriveUrlSigningKey,
  signedUploadTtlSeconds,
  signedUploadExpiry,
  canonicalUploadRelativePath,
  isSignedUploadRelativePath,
  signUploadRelativePath,
  signUploadUrl,
  stripSignatureQuery,
  verifySignedUploadRequest,
  signUploadUrlsInText,
  stripUploadSignaturesInText,
};
