import React from 'react';
import { TaskTileSection } from './tasks/TaskTileSection.jsx';
import { TaskProjectsBlock } from './tasks/TaskProjectsBlock.jsx';

/**
 * Sections par défaut de la vue Tâches côté élève — extrait de `tasks-views.jsx` (O6).
 *
 * Rend, dans l'ordre, les sections « En cours (déjà prises) », « Tâches à faire »,
 * « Mes propositions », le bloc des projets actifs, puis « En attente de validation »,
 * « En attente » et « Récemment validées ». Affiché lorsque l'élève n'a pas de filtres
 * actifs. Présentation pure : ne fait que composer `TaskTileSection` et
 * `TaskProjectsBlock`. DOM/classes/textes strictement inchangés.
 *
 * @param {object} props
 * @param {Array} props.inProgressNotMine tâches en cours déjà prises par d'autres
 * @param {Array} props.availableNotMine tâches à faire (hors les miennes)
 * @param {Array} props.myProposals propositions de l'élève
 * @param {Array} props.doneNotMine tâches en attente de validation (hors les miennes)
 * @param {Array} props.onHoldNotMine tâches en attente (hors les miennes)
 * @param {Array} props.recentlyValidatedForStudent tâches récemment validées de l'élève
 * @param {Array} props.activeProjects projets actifs à afficher dans le bloc projets
 * @param {string} props.sectionListClass classe CSS de la liste selon le mode d'affichage
 * @param {object} props.taskTileProps props communes passées à chaque `TaskTileSection`
 * @param {object} props.taskProjectsBlockProps props communes du `TaskProjectsBlock`
 */
export function TasksStudentSections({
  inProgressNotMine,
  availableNotMine,
  myProposals,
  doneNotMine,
  onHoldNotMine,
  recentlyValidatedForStudent,
  activeProjects,
  sectionListClass,
  taskTileProps,
  taskProjectsBlockProps,
}) {
  return (
    <>
      <TaskTileSection
        title="⚙️ En cours (déjà prises)"
        tasks={inProgressNotMine}
        sectionListClass={sectionListClass}
        taskTileProps={taskTileProps}
      />
      <TaskTileSection
        title="🔥 Tâches à faire"
        tasks={availableNotMine}
        sectionListClass={sectionListClass}
        taskTileProps={taskTileProps}
      />
      <TaskTileSection
        title={`💡 Mes propositions (${myProposals.length})`}
        tasks={myProposals}
        sectionListClass={sectionListClass}
        taskTileProps={taskTileProps}
      />
      <TaskProjectsBlock {...taskProjectsBlockProps} visibleProjects={activeProjects} />
      <TaskTileSection
        title="⏳ En attente de validation"
        tasks={doneNotMine}
        sectionListClass={sectionListClass}
        taskTileProps={taskTileProps}
      />
      <TaskTileSection
        title="⏸️ En attente"
        tasks={onHoldNotMine}
        sectionListClass={sectionListClass}
        taskTileProps={taskTileProps}
      />
      <TaskTileSection
        title="✅ Récemment validées"
        tasks={recentlyValidatedForStudent}
        sectionListClass={sectionListClass}
        taskTileProps={taskTileProps}
      />
    </>
  );
}
