// Libellés lisibles (français + picto) des **états de jeu d'équipe** d'un feuillet
// du carnet de Sélène — à distinguer du marquage pédagogique personnel « Étudié ».
// Les valeurs techniques (`discovered`, `read`…) ne doivent jamais s'afficher brutes
// à l'élève. Source unique partagée par le carnet et ses tests. Aucune dépendance React.

/**
 * Étiquette d'état de jeu (équipe) : « où en est l'équipe sur ce feuillet ».
 * @param {string|null|undefined} status statut brut (`locked`, `discovered`, `read`, `held`, `effaced`, `revealed`)
 * @returns {{ icon: string, label: string } | null} null si aucun état pertinent à afficher
 */
export function feuilletProgressLabel(status) {
  switch (status) {
    case 'locked':
      return { icon: '🔒', label: 'Non trouvé' };
    case 'discovered':
      return { icon: '🗺️', label: 'Trouvé' };
    case 'read':
      return { icon: '📖', label: 'Lu' };
    case 'held':
      return { icon: '✋', label: 'Tenu' };
    case 'effaced':
      return { icon: '🌫️', label: 'Effacé' };
    case 'revealed':
      return { icon: '👁️', label: 'Révélé' };
    default:
      return null;
  }
}
