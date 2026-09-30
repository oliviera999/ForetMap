'use strict';

/**
 * Cellules CSV sûres pour un tableur (audit sécurité du 30/09/2026, AP3).
 *
 * Injection de formules : une cellule qui commence par `=`, `+`, `-`, `@`, tabulation ou
 * retour chariot est interprétée comme une formule par Excel / LibreOffice / Sheets
 * (`=HYPERLINK(…)`, DDE…). Le vecteur anonyme était l'en-tête `User-Agent` exporté dans les
 * événements de sécurité ; le vecteur élève, le prénom / nom libres repris dans l'export des
 * statistiques.
 *
 * Parade recommandée par OWASP : préfixer la cellule d'une apostrophe, qui force le texte.
 * Source : OWASP — CSV Injection, https://owasp.org/www-community/attacks/CSV_Injection
 *
 * Les nombres produits par le code (`typeof value === 'number'`, ex. un compteur négatif)
 * ne sont pas préfixés : ils ne viennent pas d'une saisie. Miroir front :
 * `src/shared/utils/csvCell.js` (garder la même règle).
 */

const FORMULA_TRIGGER_RE = /^[=+\-@\t\r]/;

/**
 * Valeur texte neutralisée (apostrophe devant un déclencheur de formule).
 * @param {unknown} value
 * @returns {string}
 */
function neutralizeCsvFormula(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  const s = String(value ?? '');
  return FORMULA_TRIGGER_RE.test(s) ? `'${s}` : s;
}

/**
 * Cellule CSV (séparateur `;`) : neutralisation des formules, puis guillemets si la valeur
 * contient `;`, `"`, un saut de ligne ou un retour chariot.
 * @param {unknown} value
 * @returns {string}
 */
function csvCell(value) {
  const s = neutralizeCsvFormula(value);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

module.exports = { FORMULA_TRIGGER_RE, neutralizeCsvFormula, csvCell };
