'use strict';

/**
 * Nom **affiché** d'un lieu du plan, et expression régulière sûre pour le retrouver.
 *
 * Deux écarts entre le nom stocké et le nom lisible à l'écran, tous deux capables de faire
 * échouer un scénario sans qu'aucune régression réelle n'existe :
 *
 * 1. l'emoji saisi en tête du nom (« 📚 CDI ») est désormais séparé du texte
 *    (`docs/AUDIT_PLAN_AFFICHAGE_2026-09.md` B3) : le nom accessible du bouton est « CDI » ;
 * 2. un nom peut contenir des métacaractères d'expression régulière — le plan de production
 *    porte « 📖 L (copie) », qui construisait un groupe non fermé et levait une `SyntaxError`.
 */

/** Emoji de tête suivi d'une espace (séquence ZWJ / sélecteur de variante compris). */
const LEADING_EMOJI =
  /^\p{Extended_Pictographic}[\p{Extended_Pictographic}\u200D\uFE0F\u{1F3FB}-\u{1F3FF}]*\s+/u;

/** Nom tel qu'il apparaît à l'écran (emoji de tête retiré). */
function planDisplayName(rawName) {
  const raw = String(rawName || '').trim();
  return raw.replace(LEADING_EMOJI, '').trim() || raw;
}

/** Expression régulière insensible à la casse ciblant ce lieu, métacaractères échappés. */
function planPlaceNamePattern(rawName, maxChars = 20) {
  const shown = planDisplayName(rawName).slice(0, maxChars);
  return new RegExp(shown.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

/**
 * Terme **tapable** pour retrouver ce lieu : premier mot d'au moins trois lettres, sans emoji
 * ni ponctuation. Taper le nom brut ne convient pas — un nom qui commence par un emoji se
 * normalise en chaîne vide, et la recherche retomberait sur la liste complète.
 */
function planSearchTerm(rawName) {
  const words = planDisplayName(rawName)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^A-Za-z0-9]+/u)
    .filter((word) => word.length >= 3);
  return words[0] || '';
}

module.exports = { planDisplayName, planPlaceNamePattern, planSearchTerm };
