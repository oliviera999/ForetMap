import { TaskTileCard } from './TaskTileCard.jsx';
import { IconChevronDown, IconChevronUp } from '../../shared/icons.jsx';

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
 *
 * Flèches ↑↓ (prof `tasks.manage`) : réordonnancement global via `onMoveTaskInSection`.
 */
export function TaskTileSection({
  title,
  tasks,
  sectionListClass,
  taskTileProps,
  showWhenEmpty = false,
  canReorderTasks = false,
  onMoveTaskInSection = null,
}) {
  const { getTaskTileVolatileProps, ...cardProps } = taskTileProps || {};
  const list = Array.isArray(tasks) ? tasks : [];
  if (list.length === 0 && !showWhenEmpty) return null;
  const showOrderControls =
    canReorderTasks && list.length > 1 && typeof onMoveTaskInSection === 'function';
  return (
    <div className="tasks-section">
      <div className="tasks-section-title">{title}</div>
      <div className={sectionListClass}>
        {list.map((t, idx) => {
          const canMoveUp = showOrderControls && idx > 0;
          const canMoveDown = showOrderControls && idx < list.length - 1;
          return (
            <div
              key={t.id}
              className={
                showOrderControls
                  ? 'task-project-drop-slot task-project-drop-slot--with-order'
                  : undefined
              }
            >
              {showOrderControls && (
                <div
                  className="task-project-order-controls"
                  role="group"
                  aria-label={`Ordre de « ${t.title} »`}
                >
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm task-project-order-btn"
                    disabled={!canMoveUp}
                    aria-label={`Monter « ${t.title} »`}
                    title="Monter"
                    onClick={() => onMoveTaskInSection(String(t.id), 'up', list)}
                  >
                    <IconChevronUp size={16} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm task-project-order-btn"
                    disabled={!canMoveDown}
                    aria-label={`Descendre « ${t.title} »`}
                    title="Descendre"
                    onClick={() => onMoveTaskInSection(String(t.id), 'down', list)}
                  >
                    <IconChevronDown size={16} />
                  </button>
                </div>
              )}
              <TaskTileCard
                {...cardProps}
                {...(getTaskTileVolatileProps ? getTaskTileVolatileProps(t) : null)}
                t={t}
                index={idx}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
