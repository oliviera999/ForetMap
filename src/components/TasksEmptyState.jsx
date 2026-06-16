import React from 'react';

/**
 * État vide de la vue Tâches (O6, extrait de `tasks-views.jsx`).
 *
 * Affiche le placeholder « 🌿 Rien à faire… » lorsqu'aucune tâche n'est visible.
 * Ne rend rien dès qu'il reste au moins une tâche. DOM/classes/textes inchangés.
 *
 * @param {object} props
 * @param {number} [props.count] nombre de tâches filtrées visibles ; 0 → affiche l'état vide
 */
export function TasksEmptyState({ count = 0 }) {
  if (count !== 0) return null;
  return (
    <div className="empty">
      <div className="empty-icon">🌿</div>
      <p>Rien à faire ici pour l’instant — reviens plus tard ou change tes filtres.</p>
    </div>
  );
}
