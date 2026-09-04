/**
 * Noyau du centre de notifications — module pur partagé (lot 7 du plan de convergence,
 * `docs/AUDIT_CONVERGENCE_APPS_2026-09.md` §6).
 *
 * ForetMap avait un centre complet (catégories, niveaux, dates relatives) et Gnomes &
 * Licornes une liste minimale : ni date lisible, ni niveau, ni regroupement. Plutôt que de
 * transplanter un composant conçu pour les catégories et les rôles de ForetMap, on partage ce
 * qui est réellement commun — la mise en forme des dates, les niveaux et le regroupement — et
 * chaque produit garde son rendu et ses catégories.
 */

/** Niveaux d'importance, communs aux deux produits. */
export const NOTIFICATION_LEVELS = Object.freeze(['info', 'important', 'critical']);

/** Classe CSS d'un niveau (`info` par défaut : une notification sans niveau n'alarme pas). */
export function notificationLevelClass(level) {
  const value = String(level || '').toLowerCase();
  return NOTIFICATION_LEVELS.includes(value) && value !== 'info' ? value : 'info';
}

/**
 * Date relative en français : « à l'instant », « il y a 5 min », « il y a 3 h », puis la date
 * courte. Accepte une chaîne ISO ou un horodatage en millisecondes.
 *
 * @param {string|number|Date} value
 * @param {number} [now] horloge (tests).
 * @returns {string} chaîne vide si la date est illisible.
 */
export function formatNotificationDateFr(value, now = Date.now()) {
  const ts =
    value instanceof Date
      ? value.getTime()
      : typeof value === 'number'
        ? value
        : Date.parse(String(value || ''));
  if (!Number.isFinite(ts)) return '';
  const diffMs = now - ts;
  if (diffMs < 0) return 'à l’instant';
  if (diffMs < 60 * 1000) return 'à l’instant';
  if (diffMs < 60 * 60 * 1000) return `il y a ${Math.floor(diffMs / (60 * 1000))} min`;
  if (diffMs < 24 * 60 * 60 * 1000) return `il y a ${Math.floor(diffMs / (60 * 60 * 1000))} h`;
  return new Date(ts).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Regroupe des notifications par catégorie, en conservant l'ordre d'arrivée dans chaque
 * groupe et en classant les groupes par nombre de non-lues puis par libellé.
 *
 * @param {Array<{ category?: string, read?: boolean }>} items
 * @param {Record<string, string>} [labels] libellés par catégorie (défaut : la clé brute).
 * @returns {Array<{ category: string, label: string, items: Array<object>, unread: number }>}
 */
export function groupNotificationsByCategory(items, labels = {}) {
  const groups = new Map();
  for (const item of items || []) {
    const category = String(item?.category || 'autre');
    if (!groups.has(category)) {
      groups.set(category, { category, label: labels[category] || category, items: [], unread: 0 });
    }
    const group = groups.get(category);
    group.items.push(item);
    if (!item?.read) group.unread += 1;
  }
  const collator = new Intl.Collator('fr-FR', { sensitivity: 'base' });
  return [...groups.values()].sort(
    (a, b) => b.unread - a.unread || collator.compare(a.label, b.label),
  );
}

/** Nombre de notifications non lues. */
export function countUnreadNotifications(items) {
  return (items || []).reduce((acc, item) => acc + (item?.read ? 0 : 1), 0);
}
