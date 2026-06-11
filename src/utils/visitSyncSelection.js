/**
 * Sélection d'identifiants pour l'import sélectif carte ↔ visite (VisitSyncPanel).
 */

/** Bascule l'appartenance de `id` dans `list` (ajoute si absent, retire si présent). */
export function toggleIdInList(list, id) {
  const arr = Array.isArray(list) ? list : [];
  return arr.includes(id) ? arr.filter((v) => v !== id) : [...arr, id];
}
