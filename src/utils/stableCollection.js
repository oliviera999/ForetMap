/**
 * Garde la référence de la collection précédente quand le contenu re-téléchargé
 * est strictement identique (égalité profonde via JSON.stringify — exacte, et
 * sûre y compris pour les champs imbriqués comme les assignments des tâches).
 * Utilisé par le polling global d'App.jsx : sans cela, chaque passe remplaçait
 * tous les tableaux du DataContext et re-rendait l'arbre entier (en contournant
 * les React.memo posés sur les vues), même sans aucun changement.
 */
export function keepPrevIfEqual(prev, next) {
  if (prev === next) return prev;
  if (!Array.isArray(prev) || !Array.isArray(next)) return next;
  if (prev.length !== next.length) return next;
  try {
    return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
  } catch {
    return next;
  }
}
