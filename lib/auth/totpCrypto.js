'use strict';

/**
 * Chiffrement au repos des secrets de double authentification (TOTP).
 *
 * Le secret partagé avec l'application d'authentification ne doit jamais être lisible en
 * base : une copie de la base (sauvegarde, export, accès en lecture) ne doit pas suffire à
 * générer les codes d'un administrateur. Il est donc chiffré en **AES-256-GCM** (`node:crypto`)
 * avec une clé **dédiée**, `TOTP_ENCRYPTION_KEY`, distincte de `JWT_SECRET` : la fuite de
 * l'un ne doit pas entraîner celle de l'autre.
 *
 * - IV aléatoire de 12 octets, tag d'authentification de 16 octets ;
 * - données associées (AAD) = `foretmap:totp:v1:<user_id>` : un chiffré recopié sur la ligne
 *   d'un autre compte ne se déchiffre pas ;
 * - format texte `v1.<iv>.<chiffré>.<tag>` (base64url), stocké avec l'**identifiant de clé**
 *   (`secret_key_id`) : 12 caractères hexadécimaux d'un HMAC de la clé, qui ne révèle rien
 *   d'elle mais permet de retrouver la bonne clé pendant une rotation.
 *
 * Rotation : la nouvelle clé dans `TOTP_ENCRYPTION_KEY`, l'ancienne (ou plusieurs, séparées
 * par des virgules) dans `TOTP_ENCRYPTION_KEY_PREVIOUS`. Le déchiffrement choisit la clé par
 * son identifiant ; `node scripts/totp-admin.js rotate-key` rechiffre ensuite toutes les
 * lignes avec la clé courante, après quoi l'ancienne peut être retirée.
 *
 * Les variables d'environnement sont relues à chaque appel (paramètre `env`, par défaut
 * `process.env`) : rien n'est figé au chargement du module.
 */

const crypto = require('node:crypto');

const FORMAT_VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const KEY_ID_LABEL = 'foretmap:totp-key-id:v1';

/** Erreur typée : `code` = TOTP_KEY_MISSING | TOTP_KEY_UNKNOWN | TOTP_DECRYPT_FAILED. */
class TotpCryptoError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'TotpCryptoError';
    this.code = code;
  }
}

/** Matériau de clé : 64 caractères hexadécimaux, ou base64 / base64url de 32 octets. */
function parseKeyMaterial(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  if (/^[0-9a-fA-F]{64}$/.test(value)) return Buffer.from(value, 'hex');
  if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) {
    const decoded = Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    if (decoded.length === KEY_BYTES) return decoded;
  }
  return null;
}

function keyIdOf(key) {
  return crypto.createHmac('sha256', key).update(KEY_ID_LABEL).digest('hex').slice(0, 12);
}

/**
 * Trousseau courant : clé de chiffrement (courante) et clés acceptées au déchiffrement.
 * @param {NodeJS.ProcessEnv|object} [env]
 */
function loadKeyring(env = process.env) {
  const rawCurrent = String(env?.TOTP_ENCRYPTION_KEY ?? '').trim();
  const currentKey = parseKeyMaterial(rawCurrent);
  const byId = new Map();
  let current = null;
  if (currentKey) {
    current = { id: keyIdOf(currentKey), key: currentKey };
    byId.set(current.id, currentKey);
  }
  for (const raw of String(env?.TOTP_ENCRYPTION_KEY_PREVIOUS ?? '').split(',')) {
    const key = parseKeyMaterial(raw);
    if (!key) continue;
    const id = keyIdOf(key);
    if (!byId.has(id)) byId.set(id, key);
  }
  let status = 'ok';
  if (!rawCurrent) status = 'missing';
  else if (!currentKey) status = 'invalid';
  return { status, current, byId };
}

/**
 * État de la clé, pour l'exploitation et les écrans (jamais la clé elle-même).
 * @returns {{ status: 'ok'|'missing'|'invalid', keyId: string|null, previousKeys: number, sameAsJwtSecret: boolean }}
 */
function describeTotpKeyStatus(env = process.env) {
  const ring = loadKeyring(env);
  const jwtSecret = String(env?.JWT_SECRET ?? '').trim();
  const rawCurrent = String(env?.TOTP_ENCRYPTION_KEY ?? '').trim();
  return {
    status: ring.status,
    keyId: ring.current?.id ?? null,
    previousKeys: Math.max(0, ring.byId.size - (ring.current ? 1 : 0)),
    sameAsJwtSecret: !!rawCurrent && !!jwtSecret && rawCurrent === jwtSecret,
  };
}

function isTotpKeyConfigured(env = process.env) {
  return loadKeyring(env).status === 'ok';
}

function aadFor(userId) {
  return Buffer.from(`foretmap:totp:${FORMAT_VERSION}:${String(userId ?? '')}`, 'utf8');
}

/**
 * Chiffre un secret TOTP (octets bruts) pour un compte.
 * @param {Buffer} secret
 * @param {string} userId
 * @returns {{ ciphertext: string, keyId: string }}
 */
function encryptTotpSecret(secret, userId, env = process.env) {
  const ring = loadKeyring(env);
  if (!ring.current) {
    throw new TotpCryptoError(
      'TOTP_KEY_MISSING',
      'Clé de chiffrement de la double authentification absente ou invalide (TOTP_ENCRYPTION_KEY)',
    );
  }
  if (!Buffer.isBuffer(secret) || secret.length === 0) {
    throw new TypeError('Secret TOTP attendu sous forme de Buffer non vide');
  }
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', ring.current.key, iv, {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(aadFor(userId));
  const encrypted = Buffer.concat([cipher.update(secret), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: [
      FORMAT_VERSION,
      iv.toString('base64url'),
      encrypted.toString('base64url'),
      tag.toString('base64url'),
    ].join('.'),
    keyId: ring.current.id,
  };
}

/**
 * Déchiffre un secret TOTP. Lève `TotpCryptoError` (clé inconnue, chiffré altéré ou recopié
 * depuis un autre compte).
 * @param {{ ciphertext: string, keyId: string }} sealed
 * @param {string} userId
 * @returns {Buffer}
 */
function decryptTotpSecret(sealed, userId, env = process.env) {
  const ring = loadKeyring(env);
  const keyId = String(sealed?.keyId ?? '').trim();
  const key = ring.byId.get(keyId);
  if (!key) {
    throw new TotpCryptoError(
      ring.byId.size === 0 ? 'TOTP_KEY_MISSING' : 'TOTP_KEY_UNKNOWN',
      'Clé de chiffrement de ce secret indisponible',
    );
  }
  const parts = String(sealed?.ciphertext ?? '').split('.');
  if (parts.length !== 4 || parts[0] !== FORMAT_VERSION) {
    throw new TotpCryptoError('TOTP_DECRYPT_FAILED', 'Format de secret chiffré inconnu');
  }
  try {
    const iv = Buffer.from(parts[1], 'base64url');
    const encrypted = Buffer.from(parts[2], 'base64url');
    const tag = Buffer.from(parts[3], 'base64url');
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error('longueurs');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(aadFor(userId));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  } catch (_) {
    throw new TotpCryptoError('TOTP_DECRYPT_FAILED', 'Secret chiffré illisible');
  }
}

/** Vrai si le chiffré n'est pas sous la clé courante (rotation en cours). */
function needsReencryption(sealed, env = process.env) {
  const ring = loadKeyring(env);
  return !!ring.current && String(sealed?.keyId ?? '') !== ring.current.id;
}

/** Déchiffre puis rechiffre sous la clé courante. */
function reencryptTotpSecret(sealed, userId, env = process.env) {
  const secret = decryptTotpSecret(sealed, userId, env);
  try {
    return encryptTotpSecret(secret, userId, env);
  } finally {
    secret.fill(0);
  }
}

/** Base32 RFC 4648 (sans bourrage) — exposé pour les tests de non-fuite. */
function base32Of(buffer) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}

module.exports = {
  TotpCryptoError,
  describeTotpKeyStatus,
  isTotpKeyConfigured,
  encryptTotpSecret,
  decryptTotpSecret,
  needsReencryption,
  reencryptTotpSecret,
  __test: { parseKeyMaterial, keyIdOf, base32Of },
};
