/**
 * Date et heure en français (jour/mois/année + heure:minute).
 * Utilisé pour les fils de commentaires, forum et rapports de tâche.
 */
export function formatDateTimeFr(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
