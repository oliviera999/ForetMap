/**
 * Neutralisation des formules dans une cellule CSV — miroir front de `lib/shared/csvCell.js`
 * (audit sécurité du 30/09/2026, AP3 ; garder la même règle).
 *
 * Préfixe d'une apostrophe toute cellule qui commence par `=`, `+`, `-`, `@`, tabulation ou
 * retour chariot. Source : OWASP — CSV Injection,
 * https://owasp.org/www-community/attacks/CSV_Injection
 */

const FORMULA_TRIGGER_RE = /^[=+\-@\t\r]/;

/**
 * @param {unknown} value
 * @returns {string}
 */
export function neutralizeCsvFormula(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  const s = String(value ?? '');
  return FORMULA_TRIGGER_RE.test(s) ? `'${s}` : s;
}
