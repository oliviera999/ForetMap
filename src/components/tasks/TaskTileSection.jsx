import React from 'react';

import { TaskTileCard } from './TaskTileCard.jsx';

/**
 * Section de tuiles de tâches (titre + grille/liste) — extraite de `tasks-views.jsx` (O6).
 *
 * Ne rend rien quand la liste est vide, sauf si `showWhenEmpty` (section « Résultats
 * filtrés » côté n3beur, qui affiche son compteur même à zéro).
 *
 * `taskTileProps` est l'objet mémoïsé construit par `TasksView` (O2) : il est étalé tel
 * quel sur chaque `TaskTileCard` (React.memo), la mémoïsation des tuiles reste effective.
 * S'il contient `getTaskTileVolatileProps` (P1), ce getter n'est pas étalé sur les cartes :
 * il dérive par tuile les props volatiles (`loading`, affectation rapide, drag), si bien
 * qu'un changement de `loading[42…]` ne re-réconcilie que la tuile 42.
 */
export function TaskTileSection({
  title,
  tasks,
  sectionListClass,
  taskTileProps,
  showWhenEmpty = false,
}) {
  const { getTaskTileVolatileProps, ...cardProps } = taskTileProps || {};
  const list = Array.isArray(tasks) ? tasks : [];
  if (list.length === 0 && !showWhenEmpty) return null;
  return (
    <div className="tasks-section">
      <div className="tasks-section-title">{title}</div>
      <div className={sectionListClass}>
        {list.map((t, idx) => (
          <TaskTileCard
            key={t.id}
            {...cardProps}
            {...(getTaskTileVolatileProps ? getTaskTileVolatileProps(t) : null)}
            t={t}
            index={idx}
          />
        ))}
      </div>
    </div>
  );
}
