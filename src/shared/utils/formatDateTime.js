/**
 * Date-heure lisible en français (`toLocaleString('fr-FR')`), chaîne vide si absente ou
 * invalide. Cinq copies identiques coexistaient dans les cartes de carnet ForetMap et G&L
 * (audit du 13/09/2026, §4.3).
 * @param {string|number|Date|null|undefined} value
 */
export function formatDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('fr-FR');
}
