import { TaskTileSection } from './tasks/TaskTileSection.jsx';
import { TaskProjectsBlock } from './tasks/TaskProjectsBlock.jsx';
import {
  IconCheck,
  IconFlame,
  IconHourglass,
  IconIdea,
  IconPause,
  IconSettings,
} from '../shared/icons.jsx';

/**
 * Sections de la vue Tâches côté n3boss (prof/admin) — extrait de `tasks-views.jsx` (O6).
 *
 * Rend, dans l'ordre, les sections « En cours », « À faire », le bloc des projets
 * actifs, puis « Propositions », « En attente de validation », « En attente » et
 * « Validées ». Présentation pure : ne fait que composer `TaskTileSection` et
 * `TaskProjectsBlock`. DOM/classes/textes strictement inchangés.
 *
 * @param {object} props
 * @param {Array} props.inProgress tâches en cours
 * @param {Array} props.available tâches à faire
 * @param {Array} props.proposed propositions des élèves
 * @param {Array} props.done tâches en attente de validation
 * @param {Array} props.onHold tâches en attente
 * @param {Array} props.validated tâches validées
 * @param {Array} props.activeProjects projets actifs à afficher dans le bloc projets
 * @param {{ studentPlural: string }} props.roleTerms terminologie de rôle (pluriel élève)
 * @param {string} props.sectionListClass classe CSS de la liste selon le mode d'affichage
 * @param {object} props.taskTileProps props communes passées à chaque `TaskTileSection`
 * @param {object} props.taskProjectsBlockProps props communes du `TaskProjectsBlock`
 */
export function TasksTeacherSections({
  inProgress,
  available,
  proposed,
  done,
  onHold,
  validated,
  activeProjects,
  roleTerms,
  sectionListClass,
  taskTileProps,
  taskProjectsBlockProps,
}) {
  return (
    <>
      <TaskTileSection
        title={
          <>
            <IconSettings size={16} /> En cours
          </>
        }
        tasks={inProgress}
        sectionListClass={sectionListClass}
        taskTileProps={taskTileProps}
      />
      <TaskTileSection
        title={
          <>
            <IconFlame size={16} /> À faire
          </>
        }
        tasks={available}
        sectionListClass={sectionListClass}
        taskTileProps={taskTileProps}
      />
      <TaskProjectsBlock {...taskProjectsBlockProps} visibleProjects={activeProjects} />
      <TaskTileSection
        title={
          <>
            <IconIdea size={16} /> {`Propositions ${roleTerms.studentPlural} (${proposed.length})`}
          </>
        }
        tasks={proposed}
        sectionListClass={sectionListClass}
        taskTileProps={taskTileProps}
      />
      <TaskTileSection
        title={
          <>
            <IconHourglass size={16} /> {`En attente de validation (${done.length})`}
          </>
        }
        tasks={done}
        sectionListClass={sectionListClass}
        taskTileProps={taskTileProps}
      />
      <TaskTileSection
        title={
          <>
            <IconPause size={16} /> {`En attente (${onHold.length})`}
          </>
        }
        tasks={onHold}
        sectionListClass={sectionListClass}
        taskTileProps={taskTileProps}
      />
      <TaskTileSection
        title={
          <>
            <IconCheck size={16} /> Validées
          </>
        }
        tasks={validated}
        sectionListClass={sectionListClass}
        taskTileProps={taskTileProps}
      />
    </>
  );
}
