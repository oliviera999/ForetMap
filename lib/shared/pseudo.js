'use strict';

/**
 * Règles communes du pseudo utilisateur (ForetMap + G&L).
 * Aligné sur `users.pseudo` VARCHAR(50) et les usernames Moodle / scolaire
 * (points, tirets, underscores, plus, lettres accentuées).
 */

const PSEUDO_MIN_LEN = 3;
const PSEUDO_MAX_LEN = 50;

/** Lettres (Unicode), chiffres, et . _ - + — pas d’espace ni de @ (confusion e-mail). */
const PSEUDO_RE = /^[\p{L}\p{N}._+-]{3,50}$/u;

const PSEUDO_INVALID_MSG =
  'Pseudo invalide (3-50 caractères : lettres — y compris accentuées —, chiffres, . _ - +)';

function isValidPseudo(value) {
  return typeof value === 'string' && PSEUDO_RE.test(value);
}

/**
 * Dérive un candidat de pseudo depuis un username Moodle ou un libellé libre :
 * conserve `.` `_` `-` `+`, retire le reste (espaces, ponctuation), borne la longueur.
 */
function sanitizePseudoBase(value, maxLength = PSEUDO_MAX_LEN) {
  const limit = Number.isFinite(maxLength) && maxLength > 0 ? maxLength : PSEUDO_MAX_LEN;
  const cleaned = String(value || '')
    .normalize('NFC')
    .trim()
    .replace(/[^\p{L}\p{N}._+-]+/gu, '')
    .slice(0, limit);
  return cleaned;
}

module.exports = {
  PSEUDO_MIN_LEN,
  PSEUDO_MAX_LEN,
  PSEUDO_RE,
  PSEUDO_INVALID_MSG,
  isValidPseudo,
  sanitizePseudoBase,
};
