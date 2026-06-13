// Logique pure du panneau admin des joueurs GL (GLPlayersPanel).
// Normalisation / affichage des joueurs et des classes ; aucune dépendance React.

/**
 * Convertit une valeur (0/1, "0"/"1", booléen) en booléen.
 */
export function toBool(value) {
  return !!Number(value);
}

/**
 * Indexe les classes par identifiant numérique.
 * @param {Array<{id: number|string}>} classes
 * @returns {Map<number, object>}
 */
export function buildClassesById(classes) {
  const next = new Map();
  for (const cls of classes || []) next.set(Number(cls.id), cls);
  return next;
}

/**
 * Libellé de classe d'un joueur : nom indexé, repli sur class_name, sinon tiret.
 */
export function playerClassName(player, classesById) {
  return classesById?.get(Number(player?.class_id))?.name || player?.class_name || '—';
}

/**
 * Nom affiché d'un joueur : « Prénom Nom » nettoyé, repli sur tiret.
 */
export function playerDisplayName(player) {
  return `${player?.first_name || ''} ${player?.last_name || ''}`.trim() || '—';
}
