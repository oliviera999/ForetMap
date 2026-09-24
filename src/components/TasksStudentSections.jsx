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
 * Sections par défaut de la vue Tâches côté élève — extrait de `tasks-views.jsx` (O6).
 *
 * Rend, dans l'ordre, les sections « En cours (déjà prises) », « Tâches à faire »,
 * « Mes propositions », le bloc des projets actifs, puis « En attente de validation »,
 * « En attente » et « Récemment validées ». Avec `validationFirst` (rôle autorisé à
 * valider les tâches), « En attente de validation » passe en tête. Affiché lorsque
 * l'élève n'a pas de filtres actifs. Présentation pure : ne fait que composer
 * `TaskTileSection` et `TaskProjectsBlock`.
 *
 * @param {object} props
 * @param {Array} props.inProgressNotMine tâches en cours déjà prises par d'autres
 * @param {Array} props.availableNotMine tâches à faire (hors les miennes)
 * @param {Array} props.myProposals propositions de l'élève
 * @param {Array} props.doneNotMine tâches en attente de validation (hors les miennes)
 * @param {Array} props.onHoldNotMine tâches en attente (hors les miennes)
 * @param {Array} props.recentlyValidatedForStudent tâches récemment validées de l'élève
 * @param {Array} props.activeProjects projets actifs à afficher dans le bloc projets
 * @param {boolean} [props.validationFirst] affiche « En attente de validation » en premier
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
  validationFirst = false,
  sectionListClass,
  taskTileProps,
  taskProjectsBlockProps,
}) {
  const awaitingValidationSection = (
    <TaskTileSection
      title={
        <>
          <IconHourglass size={16} /> En attente de validation
        </>
      }
      tasks={doneNotMine}
      sectionListClass={sectionListClass}
      taskTileProps={taskTileProps}
    />
  );
  return (
    <>
      {validationFirst && awaitingValidationSection}
      <TaskTileSection
        title={
          <>
            <IconSettings size={16} /> En cours (déjà prises)
          </>
        }
        tasks={inProgressNotMine}
        sectionListClass={sectionListClass}
        taskTileProps={taskTileProps}
      />
      <TaskTileSection
        title={
          <>
            <IconFlame size={16} /> Tâches à faire
          </>
        }
        tasks={availableNotMine}
        sectionListClass={sectionListClass}
        taskTileProps={taskTileProps}
      />
      <TaskTileSection
        title={
          <>
            <IconIdea size={16} /> {`Mes propositions (${myProposals.length})`}
          </>
        }
        tasks={myProposals}
        sectionListClass={sectionListClass}
        taskTileProps={taskTileProps}
      />
      <TaskProjectsBlock {...taskProjectsBlockProps} visibleProjects={activeProjects} />
      {!validationFirst && awaitingValidationSection}
      <TaskTileSection
        title={
          <>
            <IconPause size={16} /> En attente
          </>
        }
        tasks={onHoldNotMine}
        sectionListClass={sectionListClass}
        taskTileProps={taskTileProps}
      />
      <TaskTileSection
        title={
          <>
            <IconCheck size={16} /> Récemment validées
          </>
        }
        tasks={recentlyValidatedForStudent}
        sectionListClass={sectionListClass}
        taskTileProps={taskTileProps}
      />
    </>
  );
}
