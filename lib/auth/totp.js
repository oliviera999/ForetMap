'use strict';

/**
 * Mots de passe à usage unique fondés sur le temps — TOTP (RFC 6238), implémentés avec le
 * seul `node:crypto` (aucune dépendance).
 *
 * - HOTP (RFC 4226 § 5.3) : `Truncate(HMAC-SHA-1(K, C))`, troncature dynamique puis modulo
 *   10^chiffres ;
 * - TOTP (RFC 6238 § 4) : `C = floor(t / 30)`, 6 chiffres, HMAC-SHA-1 — les paramètres par
 *   défaut de toutes les applications d'authentification (Google Authenticator, FreeOTP,
 *   Aegis, 2FAS, Microsoft Authenticator…) ;
 * - fenêtre de tolérance ±1 pas (dérive d'horloge de ±30 s) ;
 * - anti-rejeu : `afterStep` refuse tout code d'un pas déjà consommé (le pas accepté est
 *   mémorisé en base par `lib/auth/totpStore.js`) ;
 * - comparaison en temps constant (`crypto.timingSafeEqual`) sur chaque candidat, sans sortie
 *   anticipée.
 *
 * Références : RFC 4226 (HOTP), RFC 6238 (TOTP), RFC 4648 (Base32) ; format d'URI
 * « Key Uri Format » publié par le projet Google Authenticator
 * (https://github.com/google/google-authenticator/wiki/Key-Uri-Format).
 */

const crypto = require('node:crypto');

const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1;
const TOTP_SECRET_BYTES = 20;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Base32 RFC 4648, sans bourrage. */
function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buffer) {
    value = ((value << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Décode du Base32 RFC 4648 (casse, espaces et bourrage tolérés). Lève si invalide. */
function base32Decode(input) {
  const clean = String(input ?? '')
    .toUpperCase()
    .replace(/[\s=]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error('Caractère Base32 invalide');
    value = ((value << 5) | index) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/**
 * HOTP (RFC 4226).
 * @param {Buffer} secret
 * @param {number} counter
 * @param {number} [digits]
 */
function hotp(secret, counter, digits = TOTP_DIGITS) {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(Math.floor(counter)));
  const hmac = crypto.createHmac('sha1', secret).update(message).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** Pas de temps TOTP pour un instant donné (millisecondes epoch). */
function timeStep(nowMs = Date.now(), period = TOTP_PERIOD_SECONDS) {
  return Math.floor(nowMs / 1000 / period);
}

/** Code TOTP à un instant donné. */
function totpAt(
  secret,
  nowMs = Date.now(),
  { digits = TOTP_DIGITS, period = TOTP_PERIOD_SECONDS } = {},
) {
  return hotp(secret, timeStep(nowMs, period), digits);
}

/** Code saisi → 6 chiffres (espaces et tiret tolérés), ou `null`. */
function normalizeTotpCode(input) {
  const value = String(input ?? '').replace(/[\s-]/g, '');
  return /^\d{6}$/.test(value) ? value : null;
}

/**
 * Vérifie un code TOTP.
 * @param {Buffer} secret
 * @param {string} code
 * @param {{ nowMs?: number, window?: number, afterStep?: number|null }} [options]
 * @returns {{ ok: true, step: number } | { ok: false, reason: 'format'|'invalid'|'replay', step?: number }}
 */
function verifyTotp(secret, code, { nowMs = Date.now(), window = TOTP_WINDOW, afterStep } = {}) {
  const normalized = normalizeTotpCode(code);
  if (!normalized) return { ok: false, reason: 'format' };
  const submitted = Buffer.from(normalized, 'utf8');
  const current = timeStep(nowMs);
  let matched = null;
  for (let delta = -window; delta <= window; delta += 1) {
    const step = current + delta;
    if (step < 0) continue;
    const expected = Buffer.from(hotp(secret, step), 'utf8');
    // Pas de sortie anticipée : chaque candidat est comparé, en temps constant.
    if (crypto.timingSafeEqual(expected, submitted) && (matched === null || step > matched)) {
      matched = step;
    }
  }
  if (matched === null) return { ok: false, reason: 'invalid' };
  if (afterStep != null && Number.isFinite(Number(afterStep)) && matched <= Number(afterStep)) {
    return { ok: false, reason: 'replay', step: matched };
  }
  return { ok: true, step: matched };
}

/** Secret de 160 bits (taille recommandée par RFC 4226 § 4). */
function generateTotpSecret() {
  return crypto.randomBytes(TOTP_SECRET_BYTES);
}

/**
 * URI `otpauth://` lue par les applications d'authentification (QR code ou saisie).
 * @param {{ secret: Buffer, issuer: string, accountName: string }} params
 */
function buildOtpauthUri({ secret, issuer, accountName }) {
  const cleanIssuer = String(issuer || '').trim() || 'Application';
  const cleanAccount = String(accountName || '').trim() || 'compte';
  const label = `${encodeURIComponent(cleanIssuer)}:${encodeURIComponent(cleanAccount)}`;
  const params = new URLSearchParams({
    secret: base32Encode(secret),
    issuer: cleanIssuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  // URLSearchParams code l'espace en « + » : les applications attendent « %20 ».
  return `otpauth://totp/${label}?${params.toString().replace(/\+/g, '%20')}`;
}

module.exports = {
  TOTP_PERIOD_SECONDS,
  TOTP_DIGITS,
  TOTP_WINDOW,
  TOTP_SECRET_BYTES,
  base32Encode,
  base32Decode,
  hotp,
  timeStep,
  totpAt,
  normalizeTotpCode,
  verifyTotp,
  generateTotpSecret,
  buildOtpauthUri,
};
