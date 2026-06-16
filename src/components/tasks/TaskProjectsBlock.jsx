import React from 'react';
import { mapLabelFromMaps, normalizeProjectUiStatus } from '../../utils/taskListHelpers.js';
import { ContextComments } from '../context-comments';
import { MarkdownContent } from '../MarkdownContent.jsx';
import { tutorialPreviewCanEmbed } from '../TutorialPreviewModal';
import { TaskTileCard } from './TaskTileCard.jsx';

function TaskProjectsBlock({
  visibleProjects,
  allFiltered,
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
  loading,
  taskTileProps,
  openTasksTutorialPreview,
  taskDragPayload,
  taskDropHint,
  onProjectTaskDragOver,
  onDropTaskToProject,
}) {
  if (visibleProjects.length <= 0) return null;
  return (
    <div className="tasks-section">
      <div className="tasks-section-title">
        {sectionTitle || `📁 Projets (${visibleProjects.length})`}
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {[...visibleProjects]
          .sort((a, b) => {
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
          })
          .map((p) => {
            const projectTasks = allFiltered.filter(
              (t) => String(t.project_id || '') === String(p.id || ''),
            );
            const projectTasksCount = projectTasks.length;
            const projectStatus = normalizeProjectUiStatus(p.status);
            const loadingActive = !!loading[`${p.id}projectactive`];
            const loadingHold = !!loading[`${p.id}projecton_hold`];
            const loadingValidate = !!loading[`${p.id}projectvalidate`];
            const loadingDuplicate = !!loading[`${p.id}projectduplicate`];
            const loadingDelete = !!loading[`${p.id}projectdelete`];
            const canReceiveTaskDrop = !!(isTeacher && taskDragPayload?.taskId);
            const projectDropId = String(p.id || '');
            const projectCardDropActive =
              canReceiveTaskDrop &&
              taskDropHint?.projectId === projectDropId &&
              !taskDropHint?.beforeTaskId;
            return (
              <div
                key={p.id}
                className={`task-card ${projectCardDropActive ? 'task-card--drop-target' : ''}`}
                style={{ padding: 12 }}
                onDragOver={(event) => {
                  if (!canReceiveTaskDrop) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  onProjectTaskDragOver?.(projectDropId, '');
                }}
                onDrop={(event) => {
                  if (!canReceiveTaskDrop) return;
                  event.preventDefault();
                  onDropTaskToProject?.(projectDropId, '');
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
                  <div>
                    <div className="task-title" style={{ fontSize: '1rem' }}>
                      📁 {p.title}
                    </div>
                    <div className="task-meta" style={{ marginTop: 6 }}>
                      {(p.zones_linked || []).map((z) => (
                        <span key={z.id} className="task-chip">
                          {z.name}
                        </span>
                      ))}
                      {(p.markers_linked || []).map((m) => (
                        <span key={m.id} className="task-chip">
                          📍 {m.label}
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
                            📘 {tu.title}
                          </button>
                        ) : (
                          <span key={tu.id} className="task-chip">
                            📘 {tu.title}
                          </span>
                        ),
                      )}
                    </div>
                    <div style={{ fontSize: '.82rem', color: '#666' }}>
                      {p.map_label || mapLabelFromMaps(p.map_id, maps)} · {projectTasksCount} tâche
                      {projectTasksCount > 1 ? 's' : ''}
                    </div>
                    {!!(p.description || '').trim() && (
                      <MarkdownContent className="task-desc" style={{ marginTop: 8 }}>
                        {String(p.description).trim()}
                      </MarkdownContent>
                    )}
                    {p.status === 'on_hold' && (
                      <div style={{ fontSize: '.82rem', color: '#92400e', marginTop: 4 }}>
                        {isTeacher
                          ? '⏸️ Projet en pause : plus de nouvelles inscriptions n3beurs pour l’instant, les commentaires restent ouverts. Tu peux quand même ajouter des tâches ; elles attendront une réouverture des inscriptions avec le projet.'
                          : '⏸️ Projet en pause : inscriptions fermées pour l’instant, les commentaires restent ouverts.'}
                      </div>
                    )}
                    {p.status === 'completed' && (
                      <div style={{ fontSize: '.82rem', color: '#166534', marginTop: 4 }}>
                        {isTeacher
                          ? 'Toutes les tâches du projet sont terminées ou validées (fin automatique). Tu peux valider le projet, le rouvrir ou ajouter une nouvelle tâche.'
                          : 'Toutes les tâches de ce projet sont terminées ou validées.'}
                      </div>
                    )}
                    {p.status === 'validated' && (
                      <div style={{ fontSize: '.82rem', color: '#166534', marginTop: 4 }}>
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
                        ✏️ Modifier
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={loadingDuplicate}
                        onClick={() => duplicateProject?.(p)}
                        title="Dupliquer le projet et ses tâches (structure uniquement)"
                      >
                        {loadingDuplicate ? '...' : '📄 Dupliquer'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        disabled={loadingDelete}
                        onClick={() => deleteProject?.(p)}
                        title="Supprimer le projet (les tâches sont conservées)"
                      >
                        {loadingDelete ? '...' : '🗑️ Supprimer'}
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
                            {loadingActive ? '...' : 'Rouvrir (actif)'}
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
                            {loadingValidate ? '...' : '✔️ Valider'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            disabled={loadingActive}
                            onClick={() => setProjectStatus(p, 'active')}
                          >
                            {loadingActive ? '...' : 'Rouvrir (actif)'}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className={`btn btn-sm ${projectStatus === 'active' ? 'btn-primary' : 'btn-ghost'}`}
                            disabled={projectStatus === 'active' || loadingActive}
                            onClick={() => setProjectStatus(p, 'active')}
                          >
                            {loadingActive ? '...' : '✅ Actif'}
                          </button>
                          <button
                            className={`btn btn-sm ${projectStatus === 'on_hold' ? 'btn-primary' : 'btn-ghost'}`}
                            disabled={projectStatus === 'on_hold' || loadingHold}
                            onClick={() => setProjectStatus(p, 'on_hold')}
                          >
                            {loadingHold ? '...' : '⏸️ En attente'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            disabled={loadingValidate}
                            onClick={() => validateProject?.(p)}
                            title="Valider le projet (clôture manuelle n3boss)"
                          >
                            {loadingValidate ? '...' : '✔️ Valider'}
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    <span className="task-chip">
                      {projectStatus === 'validated'
                        ? 'Validé'
                        : projectStatus === 'completed'
                          ? 'Terminé'
                          : projectStatus === 'on_hold'
                            ? '⏸️ En attente'
                            : '✅ Actif'}
                    </span>
                  )}
                </div>
                <div style={{ marginTop: 8 }}>
                  {contextCommentsEnabled && (
                    <ContextComments
                      canParticipateContextComments={canParticipateContextComments}
                      contextType="project"
                      contextId={p.id}
                      title="Commentaires du projet"
                      placeholder="Partager une info utile sur ce projet..."
                    />
                  )}
                </div>
                <div style={{ marginTop: 10 }}>
                  {projectTasksCount === 0 ? (
                    <p style={{ fontSize: '.85rem', color: '#666', margin: 0 }}>
                      Aucune tâche liée à ce projet avec les filtres actuels.
                    </p>
                  ) : (
                    <div className={sectionListClass}>
                      {projectTasks.map((t, idx) => (
                        <div
                          key={t.id}
                          className={`task-project-drop-slot ${canReceiveTaskDrop && taskDropHint?.projectId === projectDropId && taskDropHint?.beforeTaskId === String(t.id) ? 'task-project-drop-slot--active' : ''}`}
                          onDragOver={(event) => {
                            if (!canReceiveTaskDrop) return;
                            event.preventDefault();
                            event.stopPropagation();
                            event.dataTransfer.dropEffect = 'move';
                            onProjectTaskDragOver?.(projectDropId, String(t.id));
                          }}
                          onDrop={(event) => {
                            if (!canReceiveTaskDrop) return;
                            event.preventDefault();
                            event.stopPropagation();
                            onDropTaskToProject?.(projectDropId, String(t.id));
                          }}
                        >
                          <TaskTileCard {...taskTileProps} t={t} index={idx} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

export { TaskProjectsBlock };
