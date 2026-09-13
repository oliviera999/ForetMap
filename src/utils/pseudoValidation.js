/**
 * Miroir front de `lib/shared/pseudo.js` (même règle, pas d’import CJS côté Vite).
 */

export const PSEUDO_MIN_LEN = 3;
export const PSEUDO_MAX_LEN = 50;

/** Lettres (Unicode), chiffres, et . _ - + — pas d’espace ni de @. */
export const PSEUDO_RE = /^[\p{L}\p{N}._+-]{3,50}$/u;

export const PSEUDO_INVALID_MSG =
  'Pseudo invalide (3-50 caractères : lettres — y compris accentuées —, chiffres, . _ - +)';

export function isValidPseudo(value) {
  return typeof value === 'string' && PSEUDO_RE.test(value);
}
