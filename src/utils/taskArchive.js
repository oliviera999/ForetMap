/**
 * Helpers purs d'archivage (soft-delete) des tâches et projets de tâches.
 *
 * Une entité est « archivée » quand son `archived_at` est renseigné (non nul/non vide).
 * Les listes globales partagées (DataContext) restent volontairement ACTIVES uniquement :
 * les archives sont isolées dans des états dédiés, consommés par le seul écran Tâches
 * (badge + filtre « Archivés »), pour ne pas polluer la carte, les modales ni les compteurs.
 */

/** Une tâche/un projet est-il archivé ? (tolérant : Date, chaîne ISO, null). */
export function isArchived(entity) {
  const v = entity?.archived_at;
  return v != null && v !== '';
}

/** Sépare une liste en `{ active, archived }` selon `archived_at`. */
export function partitionByArchived(list) {
  const active = [];
  const archived = [];
  for (const item of Array.isArray(list) ? list : []) {
    if (isArchived(item)) archived.push(item);
    else active.push(item);
  }
  return { active, archived };
}
