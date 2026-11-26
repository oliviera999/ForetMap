import { Fragment, useCallback, useState } from 'react';
import { mapLabelFromMaps, normalizeProjectUiStatus } from '../../utils/taskListHelpers.js';
import { ContextComments } from '../context-comments';
import { MarkdownContent } from '../MarkdownContent.jsx';
import { tutorialPreviewCanEmbed } from '../TutorialPreviewModal';
import { TaskTileCard } from './TaskTileCard.jsx';
import { TaskPhaseTimeline, groupTasksByPhase } from './TaskPhaseTimeline.jsx';
import { projectTypeInfo } from '../../shared/taskTaxonomyCore.js';
import { sameStepBucket } from '../../utils/taskProjectSteps.js';
import { projectColorClass } from '../../utils/projectColors.js';
import {
  IconArchive,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconDelete,
  IconDuplicate,
  IconEdit,
  IconFolder,
  IconMarker,
  IconPause,
  IconTuto,
  IconUnarchive,
} from '../../shared/icons.jsx';

/**
 * Ordre d'affichage des projets dans le bloc : actif < en attente < terminé < validé,
 * puis titre (fr). Exporté pour que `TasksView` trie une seule fois en amont (le tri
 * était refait ici à chaque rendu, et le bloc est rendu jusqu'à 3 fois).
 */
export function compareProjectsForDisplay(a, b) {
  const rank = (status) => {
    if (status === 'active') return 0;
    if (status === 'on_hold') return 1;
    if (status === 'completed') return 2;
    if (status === 'validated') return 3;
    return 4;
  };
  const diff = rank(a.status) - rank(b.status);
  if (diff !== 0) return diff;
  return String(a.title || '').localeCompare(String(b.title || ''), 'fr');
}

const EMPTY_PROJECT_TASKS = Object.freeze([]);

/** Vrai si le dataTransfer porte encore un drag de tâche (`text/plain`), même avant le setState React. */
function dataTransferHasTaskId(dataTransfer) {
  try {
    const types = dataTransfer?.types;
    if (!types) return false;
    if (typeof types.includes === 'function') return types.includes('text/plain');
    if (typeof types.contains === 'function') return types.contains('text/plain');
    return Array.from(types).includes('text/plain');
  } catch {
    return false;
  }
}

function readDraggedTaskId(dataTransfer) {
  try {
    return String(dataTransfer?.getData?.('text/plain') || '').trim();
  } catch {
    return '';
  }
}

function TaskProjectsBlock({
  visibleProjects,
  projectTasksById,
  sectionTitle = null,
  sectionListClass,
  isTeacher,
  maps,
  contextCommentsEnabled,
  canParticipateContextComments,
  setEditProject,
  setShowProjectForm,
  setNewTaskDefaultProjectId,
  setEditTask,
  setDuplicateTask,
  setShowForm,
  setShowProposalForm,
  setProjectStatus,
  validateProject,
  duplicateProject,
  deleteProject,
  archiveProject,
  isArchivedView = false,
  loading,
  taskTileProps,
  openTasksTutorialPreview,
  taskDragPayload,
  taskDropHint,
  onProjectTaskDragOver,
  onDropTaskToProject,
  /** `taskId → { step, sub, parallel }` des projets numérotés (`utils/taskProjectSteps.js`). */
  stepInfoByTaskId = null,
  /** Flèches ↑↓ (tactile, clavier) : réservées à qui peut réordonner (`tasks.manage`). */
  canReorderProjectTasks = false,
  /** `(taskId, projectId, beforeTaskId)` — place la tâche avant `beforeTaskId`. */
  onMoveProjectTask,
  /** `projectId → index de couleur` : la case du projet porte la teinte de ses tâches. */
  projectColorById = null,
}) {
  // Props volatiles dérivées par tuile (P1) : ne pas les étaler sur toutes les cartes.
  const { getTaskTileVolatileProps, ...tileCardProps } = taskTileProps || {};
  /** Projets dépliés : tous repliés à l'ouverture (les tâches restent visibles dans les sections par statut). */
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const toggleProject = useCallback((projectId) => {
    const id = String(projectId || '');
    if (!id) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (visibleProjects.length <= 0) return null;
  return (
    <div className="tasks-section">
      <div className="tasks-section-title">
        {sectionTitle || (
          <>
            <IconFolder size={16} /> Projets ({visibleProjects.length})
          </>
        )}
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {
          /* `visibleProjects` arrive pré-trié (compareProjectsForDisplay) et
             `projectTasksById` pré-groupé — mémoïsés une fois dans TasksView. */
          visibleProjects.map((p) => {
            const projectDropId = String(p.id || '');
            const projectTasks = projectTasksById?.get(projectDropId) ?? EMPTY_PROJECT_TASKS;
            const projectTasksCount = projectTasks.length;
            const projectStatus = normalizeProjectUiStatus(p.status);
            const expanded = expandedIds.has(projectDropId);
            const bodyId = `task-project-body-${projectDropId}`;
            const loadingActive = !!loading[`${p.id}projectactive`];
            const loadingHold = !!loading[`${p.id}projecton_hold`];
            const loadingValidate = !!loading[`${p.id}projectvalidate`];
            const loadingDuplicate = !!loading[`${p.id}projectduplicate`];
            const loadingDelete = !!loading[`${p.id}projectdelete`];
            const loadingArchive = !!loading[`${p.id}projectarchive`];
            const dragPayloadActive = !!(isTeacher && taskDragPayload?.taskId);
            const projectCardDropActive =
              dragPayloadActive &&
              taskDropHint?.projectId === projectDropId &&
              !taskDropHint?.beforeTaskId;
            return (
              <div
                key={p.id}
                className={`task-card task-project-card task-project-card--colored ${projectColorClass(projectColorById, p.id)} ${expanded ? 'task-project-card--expanded' : 'task-project-card--collapsed'} ${projectCardDropActive ? 'task-card--drop-target' : ''}`}
                style={{ padding: 12 }}
                onDragOver={(event) => {
                  // Autoriser le drop dès qu'un drag prof est en cours — y compris avant le
                  // commit React de startTaskDrag (sinon le navigateur refuse le dépôt).
                  if (!isTeacher) return;
                  if (!taskDragPayload?.taskId && !dataTransferHasTaskId(event.dataTransfer)) {
                    return;
                  }
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  onProjectTaskDragOver?.(projectDropId, '');
                }}
                onDrop={(event) => {
                  if (!isTeacher) return;
                  event.preventDefault();
                  onDropTaskToProject?.(projectDropId, '', readDraggedTaskId(event.dataTransfer));
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ minWidth: 0, flex: '1 1 12rem' }}>
                    <button
                      type="button"
                      className="task-project-toggle"
                      onClick={() => toggleProject(p.id)}
                      aria-expanded={expanded}
                      aria-controls={bodyId}
                      title={
                        expanded ? 'Replier les tâches du projet' : 'Afficher les tâches du projet'
                      }
                    >
                      <span className="task-project-chevron" aria-hidden="true">
                        {expanded ? '▾' : '▸'}
                      </span>
                      <span className="task-title" style={{ fontSize: 'var(--text-base)' }}>
                        <IconFolder size={14} /> {p.title}
                      </span>
                    </button>
                    <div className="task-meta" style={{ marginTop: 6 }}>
                      {(p.zones_linked || []).map((z) => (
                        <span key={z.id} className="task-chip">
                          {z.name}
                        </span>
                      ))}
                      {(p.markers_linked || []).map((m) => (
                        <span key={m.id} className="task-chip">
                          <IconMarker size={12} /> {m.label}
                        </span>
                      ))}
                      {(p.tutorials_linked || []).map((tu) =>
                        tutorialPreviewCanEmbed(tu) ? (
                          <button
                            key={tu.id}
                            type="button"
                            className="task-chip task-tutorial-chip"
                            title={`Ouvrir le tutoriel « ${tu.title || ''} »`}
                            onClick={() => openTasksTutorialPreview(tu)}
                          >
                            <IconTuto size={14} /> {tu.title}
                          </button>
                        ) : (
                          <span key={tu.id} className="task-chip">
                            <IconTuto size={14} /> {tu.title}
                          </span>
                        ),
                      )}
                    </div>
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}>
                      {projectTypeInfo(p.project_type) && (
                        <>{projectTypeInfo(p.project_type).label} · </>
                      )}
                      {p.map_label || mapLabelFromMaps(p.map_id, maps)} · {projectTasksCount} tâche
                      {projectTasksCount > 1 ? 's' : ''}
                      {!expanded && projectTasksCount > 0 ? ' · appuyer pour afficher' : ''}
                    </div>
                    <TaskPhaseTimeline tasks={projectTasks} />
                    {expanded && !!(p.description || '').trim() && (
                      <MarkdownContent className="task-desc" style={{ marginTop: 8 }}>
                        {String(p.description).trim()}
                      </MarkdownContent>
                    )}
                    {expanded && p.status === 'on_hold' && (
                      <div
                        style={{
                          fontSize: 'var(--text-sm)',
                          color: 'var(--ink-warning)',
                          marginTop: 4,
                        }}
                      >
                        {isTeacher ? (
                          <>
                            <IconPause size={14} /> Projet en pause : plus de nouvelles inscriptions
                            n3beurs pour l’instant, les commentaires restent ouverts. Tu peux quand
                            même ajouter des tâches ; elles attendront une réouverture des
                            inscriptions avec le projet.
                          </>
                        ) : (
                          <>
                            <IconPause size={14} /> Projet en pause : inscriptions fermées pour
                            l’instant, les commentaires restent ouverts.
                          </>
                        )}
                      </div>
                    )}
                    {expanded && p.status === 'completed' && (
                      <div
                        style={{
                          fontSize: 'var(--text-sm)',
                          color: 'var(--ink-success)',
                          marginTop: 4,
                        }}
                      >
                        {isTeacher
                          ? 'Toutes les tâches du projet sont terminées ou validées (fin automatique). Tu peux valider le projet, le rouvrir ou ajouter une nouvelle tâche.'
                          : 'Toutes les tâches de ce projet sont terminées ou validées.'}
                      </div>
                    )}
                    {expanded && p.status === 'validated' && (
                      <div
                        style={{
                          fontSize: 'var(--text-sm)',
                          color: 'var(--ink-success)',
                          marginTop: 4,
                        }}
                      >
                        {isTeacher
                          ? 'Projet validé manuellement : inscriptions fermées. Tu peux le rouvrir en « Actif » ou « En attente ».'
                          : 'Projet validé par les n3boss : inscriptions fermées.'}
                      </div>
                    )}
                  </div>
                  {isTeacher ? (
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 6,
                        justifyContent: 'flex-end',
                      }}
                    >
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          setEditProject(p);
                          setShowProjectForm(true);
                        }}
                        title="Modifier titre, description, carte, zones, repères et tutoriels"
                      >
                        <IconEdit size={14} /> Modifier
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={loadingDuplicate}
                        onClick={() => duplicateProject?.(p)}
                        title="Dupliquer le projet et ses tâches (structure uniquement)"
                      >
                        {loadingDuplicate ? (
                          '…'
                        ) : (
                          <>
                            <IconDuplicate size={14} /> Dupliquer
                          </>
                        )}
                      </button>
                      {archiveProject &&
                        (isArchivedView ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={loadingArchive}
                            onClick={() => archiveProject(p, false)}
                            title="Désarchiver le projet et ses tâches archivées avec lui"
                          >
                            {loadingArchive ? (
                              '…'
                            ) : (
                              <>
                                <IconUnarchive size={14} /> Désarchiver
                              </>
                            )}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={loadingArchive}
                            onClick={() => archiveProject(p, true)}
                            title="Archiver le projet et ses tâches (masqués des vues actives)"
                          >
                            {loadingArchive ? (
                              '…'
                            ) : (
                              <>
                                <IconArchive size={14} /> Archiver
                              </>
                            )}
                          </button>
                        ))}
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        disabled={loadingDelete}
                        onClick={() => deleteProject?.(p)}
                        title="Supprimer le projet (les tâches sont conservées)"
                      >
                        {loadingDelete ? (
                          '…'
                        ) : (
                          <>
                            <IconDelete size={14} /> Supprimer
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          setNewTaskDefaultProjectId(String(p.id));
                          setEditTask(null);
                          setDuplicateTask(null);
                          setShowProposalForm(false);
                          setShowForm(true);
                        }}
                        title="Créer une tâche liée à ce projet (y compris si le projet est en attente)"
                      >
                        + Tâche
                      </button>
                      {projectStatus === 'validated' ? (
                        <>
                          <span className="task-chip">Validé</span>
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            disabled={loadingActive}
                            onClick={() => setProjectStatus(p, 'active')}
                          >
                            {loadingActive ? '…' : 'Rouvrir (actif)'}
                          </button>
                        </>
                      ) : projectStatus === 'completed' ? (
                        <>
                          <span className="task-chip">Terminé</span>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            disabled={loadingValidate}
                            onClick={() => validateProject?.(p)}
                            title="Valider le projet (clôture manuelle n3boss)"
                          >
                            {loadingValidate ? (
                              '…'
                            ) : (
                              <>
                                <IconCheck size={14} /> Valider
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            disabled={loadingActive}
                            onClick={() => setProjectStatus(p, 'active')}
                          >
                            {loadingActive ? '…' : 'Rouvrir (actif)'}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className={`btn btn-sm ${projectStatus === 'active' ? 'btn-primary' : 'btn-ghost'}`}
                            disabled={projectStatus === 'active' || loadingActive}
                            onClick={() => setProjectStatus(p, 'active')}
                          >
                            {loadingActive ? (
                              '…'
                            ) : (
                              <>
                                <IconCheck size={14} /> Actif
                              </>
                            )}
                          </button>
                          <button
                            className={`btn btn-sm ${projectStatus === 'on_hold' ? 'btn-primary' : 'btn-ghost'}`}
                            disabled={projectStatus === 'on_hold' || loadingHold}
                            onClick={() => setProjectStatus(p, 'on_hold')}
                          >
                            {loadingHold ? (
                              '…'
                            ) : (
                              <>
                                <IconPause size={14} /> En attente
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            disabled={loadingValidate}
                            onClick={() => validateProject?.(p)}
                            title="Valider le projet (clôture manuelle n3boss)"
                          >
                            {loadingValidate ? (
                              '…'
                            ) : (
                              <>
                                <IconCheck size={14} /> Valider
                              </>
                            )}
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    <span className="task-chip">
                      {projectStatus === 'validated' ? (
                        'Validé'
                      ) : projectStatus === 'completed' ? (
                        'Terminé'
                      ) : projectStatus === 'on_hold' ? (
                        <>
                          <IconPause size={14} /> En attente
                        </>
                      ) : (
                        <>
                          <IconCheck size={14} /> Actif
                        </>
                      )}
                    </span>
                  )}
                </div>
                {expanded && (
                  <div id={bodyId}>
                    <div style={{ marginTop: 8 }}>
                      {contextCommentsEnabled && (
                        <ContextComments
                          canParticipateContextComments={canParticipateContextComments}
                          contextType="project"
                          contextId={p.id}
                          title="Commentaires du projet"
                          placeholder="Partager une info utile sur ce projet…"
                        />
                      )}
                    </div>
                    <div style={{ marginTop: 10 }}>
                      {projectTasksCount === 0 ? (
                        <p
                          style={{
                            fontSize: 'var(--text-sm)',
                            color: 'var(--ink-soft)',
                            margin: 0,
                          }}
                        >
                          Aucune tâche liée à ce projet avec les filtres actuels.
                        </p>
                      ) : (
                        <div className={sectionListClass}>
                          {groupTasksByPhase(projectTasks).map((group) => (
                            <Fragment key={`phase-${group.key || 'none'}`}>
                              {group.label && (
                                <h4 className="task-project-phase-heading">{group.label}</h4>
                              )}
                              {group.tasks.map((t, groupIndex) => {
                                /* Voisins dans la liste affichée (même phase) ; une flèche ne
                                   franchit jamais une étape numérotée du titre. */
                                const prevTask = group.tasks[groupIndex - 1];
                                const nextTask = group.tasks[groupIndex + 1];
                                const canMoveUp =
                                  !!prevTask && sameStepBucket(stepInfoByTaskId, t.id, prevTask.id);
                                const canMoveDown =
                                  !!nextTask && sameStepBucket(stepInfoByTaskId, t.id, nextTask.id);
                                const showOrderControls =
                                  isTeacher &&
                                  canReorderProjectTasks &&
                                  !isArchivedView &&
                                  projectTasksCount > 1;
                                return (
                                  <div
                                    key={t.id}
                                    className={`task-project-drop-slot ${showOrderControls ? 'task-project-drop-slot--with-order' : ''} ${dragPayloadActive && taskDropHint?.projectId === projectDropId && taskDropHint?.beforeTaskId === String(t.id) ? 'task-project-drop-slot--active' : ''}`}
                                    onDragOver={(event) => {
                                      if (!isTeacher) return;
                                      if (
                                        !taskDragPayload?.taskId &&
                                        !dataTransferHasTaskId(event.dataTransfer)
                                      ) {
                                        return;
                                      }
                                      event.preventDefault();
                                      event.stopPropagation();
                                      event.dataTransfer.dropEffect = 'move';
                                      onProjectTaskDragOver?.(projectDropId, String(t.id));
                                    }}
                                    onDrop={(event) => {
                                      if (!isTeacher) return;
                                      event.preventDefault();
                                      event.stopPropagation();
                                      onDropTaskToProject?.(
                                        projectDropId,
                                        String(t.id),
                                        readDraggedTaskId(event.dataTransfer),
                                      );
                                    }}
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
                                          onClick={() =>
                                            onMoveProjectTask?.(
                                              String(t.id),
                                              projectDropId,
                                              String(prevTask.id),
                                            )
                                          }
                                        >
                                          <IconChevronUp size={16} />
                                        </button>
                                        <button
                                          type="button"
                                          className="btn btn-ghost btn-sm task-project-order-btn"
                                          disabled={!canMoveDown}
                                          aria-label={`Descendre « ${t.title} »`}
                                          title="Descendre"
                                          onClick={() =>
                                            // Descendre = faire passer la suivante devant.
                                            onMoveProjectTask?.(
                                              String(nextTask.id),
                                              projectDropId,
                                              String(t.id),
                                            )
                                          }
                                        >
                                          <IconChevronDown size={16} />
                                        </button>
                                      </div>
                                    )}
                                    <TaskTileCard
                                      {...tileCardProps}
                                      {...(getTaskTileVolatileProps
                                        ? getTaskTileVolatileProps(t)
                                        : null)}
                                      t={t}
                                      index={projectTasks.indexOf(t)}
                                      insideProjectBlock
                                    />
                                  </div>
                                );
                              })}
                            </Fragment>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        }
      </div>
    </div>
  );
}

export { TaskProjectsBlock };
