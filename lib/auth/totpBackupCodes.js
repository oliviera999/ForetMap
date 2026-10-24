'use strict';

/**
 * Codes de secours de la double authentification.
 *
 * Dix codes à usage unique, remis **une seule fois** (activation, régénération), pour se
 * connecter sans le téléphone. Chacun fait 10 caractères tirés uniformément
 * (`crypto.randomInt`) d'un alphabet de 31 symboles sans caractère ambigu à la lecture
 * (pas de `0`/`o`, `1`/`l`/`i`) : environ 49 bits, hors de portée d'un essai en ligne borné
 * par le limiteur. Affichés `xxxxx-xxxxx` ; la saisie ignore la casse, les espaces et les
 * tirets.
 *
 * Stockage : **hachage bcrypt** (facteur 10, convention du dépôt pour les secrets
 * d'authentification), jamais le code lui-même — une copie de la base ne livre aucun code.
 */

const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');

const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_LENGTH = 10;
const BACKUP_CODE_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
const BCRYPT_ROUNDS = 10;
const VALID_RE = new RegExp(`^[${BACKUP_CODE_ALPHABET}]{${BACKUP_CODE_LENGTH}}$`);

function randomCode() {
  let raw = '';
  for (let i = 0; i < BACKUP_CODE_LENGTH; i += 1) {
    raw += BACKUP_CODE_ALPHABET[crypto.randomInt(BACKUP_CODE_ALPHABET.length)];
  }
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

/** Lot de codes distincts, au format affiché `xxxxx-xxxxx`. */
function generateBackupCodes(count = BACKUP_CODE_COUNT) {
  const codes = new Set();
  while (codes.size < count) codes.add(randomCode());
  return [...codes];
}

/** Saisie → forme canonique (10 caractères minuscules), ou `null` si impossible. */
function normalizeBackupCode(input) {
  const value = String(input ?? '')
    .toLowerCase()
    .replace(/[\s-]/g, '');
  return VALID_RE.test(value) ? value : null;
}

async function hashBackupCode(code) {
  const normalized = normalizeBackupCode(code);
  if (!normalized) throw new Error('Code de secours invalide');
  return bcrypt.hash(normalized, BCRYPT_ROUNDS);
}

async function backupCodeMatches(input, hash) {
  const normalized = normalizeBackupCode(input);
  if (!normalized || !hash) return false;
  return bcrypt.compare(normalized, String(hash));
}

module.exports = {
  BACKUP_CODE_COUNT,
  BACKUP_CODE_ALPHABET,
  generateBackupCodes,
  normalizeBackupCode,
  hashBackupCode,
  backupCodeMatches,
};
