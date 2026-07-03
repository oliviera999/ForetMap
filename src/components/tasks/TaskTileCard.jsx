import React, { useState, useEffect } from 'react';
import { withAppBase } from '../../services/api';
import { taskStatusIndicator, taskRequiresReferentBriefingBeforeStart } from '../../utils/badges';
import { taskEffectiveStatus } from '../../utils/taskListHelpers.js';
import {
  getAssignedCount,
  getAvailableSlots,
  getCompletionMode,
  getAssigneesDoneCount,
  isStudentAlreadyAssignedToTask,
  proposalMetaFromDescription,
} from '../../utils/taskComputations.js';
import {
  taskLivingBeingEmoji,
  formatAssigneeName,
  teacherCollectiveAssigneeLoadKey,
  toQuickAssignStudentId,
} from '../../utils/taskDisplayHelpers.js';
import { teacherStatusActionDisabled } from '../../utils/taskActionErrors.js';
import { TEACHER_STATUS_ACTIONS } from './taskViewHelpers.js';
import { TaskTileMeta } from './TaskTileMeta.jsx';
import { assignmentMatchesStudent, isStudentAssignedToTask } from '../../utils/task-assignments';
import { ContextComments } from '../context-comments';
import { MarkdownContent } from '../MarkdownContent.jsx';
import { Tooltip } from '../Tooltip';
import { tutorialPreviewCanEmbed } from '../TutorialPreviewModal';
import { ImageLightbox } from '../../shared/components/ImageLightbox.jsx';

function Lightbox({ src, caption, onClose }) {
  return <ImageLightbox src={src} caption={caption} onClose={onClose} useOverlayHistory />;
}

function TaskTileCardImpl({
  t,
  index = 0,
  viewMode,
  isN3Affiliated,
  student,
  plants = [],
  isTeacher,
  canViewOtherUsersIdentity,
  canEnrollNewTask,
  canSelfAssignTasks,
  canParticipateContextComments,
  contextCommentsEnabled,
  roleTerms,
  loading,
  quickAssignTaskId,
  quickAssignStudentIds,
  teacherStudents,
  loadingTeacherStudents,
  quickAssignUserEditedRef,
  teacherQuickAssignDelta,
  teacherQuickAssignCanApply,
  quickAssignHint,
  assign,
  assignGroupToTask,
  groupOptions = [],
  unassign,
  setLogTask,
  setLogsTask,
  setTaskStatus,
  deleteTask,
  setEditTask,
  setDuplicateTask,
  setShowForm,
  setShowProposalForm,
  setNewTaskDefaultProjectId,
  setQuickAssignTaskId,
  setQuickAssignStudentIds,
  runTeacherQuickAssign,
  teacherMarkCollectiveAssignmentDone,
  teacherStatusActions = TEACHER_STATUS_ACTIONS,
  teacherTaskPerms = null,
  tooltipText,
  openTasksTutorialPreview,
  onOpenBiodiversityFromTaskName,
  enableTaskDrag = false,
  onTaskDragStart = null,
  onTaskDragEnd = null,
  draggingTaskId = null,
}) {
  const [coverLightbox, setCoverLightbox] = useState(null);
  const [condensedExpanded, setCondensedExpanded] = useState(false);
  const isCondensed = viewMode === 'condensed';
  const showTaskDetails = !isCondensed || condensedExpanded;

  useEffect(() => {
    if (!isCondensed) setCondensedExpanded(false);
  }, [isCondensed]);

  const effectiveStatus = taskEffectiveStatus(t);
  const isMine = !!(student && isStudentAssignedToTask(t, student));
  const canEditOwnProposal =
    !isTeacher &&
    t.status === 'proposed' &&
    student &&
    String(t.proposed_by_student_id || '') === String(student.id || '');
  const slots = getAvailableSlots(t);
  const proposalMeta = proposalMetaFromDescription(t.description);
  const cardDescription =
    t.status === 'proposed' ? proposalMeta.cleanedDescription : t.description || '';
  const assignees = Array.isArray(t.assignments) ? t.assignments : [];
  const completionMode = getCompletionMode(t);
  const isCollectiveCompletion = completionMode === 'all_assignees_done';
  const doneCount = getAssigneesDoneCount(t);
  const totalCount = getAssignedCount(t);
  const mineAssignment = assignees.find((a) => assignmentMatchesStudent(a, student)) || null;
  const hasCompletedOwnAssignment = !!(isCollectiveCompletion && mineAssignment?.done_at);
  const isQuickAssignOpen = quickAssignTaskId === t.id;
  const quickAssignDelta = isQuickAssignOpen
    ? teacherQuickAssignDelta(t, quickAssignStudentIds)
    : { toAdd: [], toRemove: [] };
  const quickAssignSlotsAfterRemovals = isQuickAssignOpen
    ? getAvailableSlots(t) + quickAssignDelta.toRemove.length
    : getAvailableSlots(t);
  const canQuickAssign = isQuickAssignOpen && teacherQuickAssignCanApply(t, quickAssignStudentIds);
  const quickAssignBusy = !!loading[`${t.id}assign_teacher_quick`];
  const quickAssignTitle = isQuickAssignOpen ? quickAssignHint(t, quickAssignStudentIds) : '';
  const referentBriefing = taskRequiresReferentBriefingBeforeStart(t);
  const referentsLinked = t.referents_linked || [];
  const coverSrc = t.image_url ? withAppBase(t.image_url) : null;
  const toggleCondensedHead = () => {
    setCondensedExpanded((prev) => {
      const next = !prev;
      if (!next && quickAssignTaskId === t.id) {
        quickAssignUserEditedRef.current = false;
        setQuickAssignTaskId(null);
        setQuickAssignStudentIds([]);
      }
      return next;
    });
  };
  const TopTag = isCondensed ? 'button' : 'div';
  const topTagProps = isCondensed
    ? {
        type: 'button',
        className: 'task-top task-top--condensed-toggle',
        onClick: toggleCondensedHead,
        'aria-expanded': condensedExpanded,
        'aria-label': condensedExpanded
          ? `Réduire les détails : ${t.title}`
          : `Afficher les détails : ${t.title}`,
      }
    : { className: 'task-top' };
  const isTaskDraggingThis = !!draggingTaskId && String(draggingTaskId) === String(t.id || '');
  return (
    <div
      className={`task-card ${viewMode === 'tiles' ? 'task-card--tile' : ''}${isCondensed ? ` task-card--condensed${condensedExpanded ? ' task-card--condensed-open' : ''}` : ''} fade-in ${isMine ? 'mine' : ''} ${effectiveStatus === 'validated' ? 'done' : ''} ${effectiveStatus === 'proposed' ? 'proposed' : ''} ${isTaskDraggingThis ? 'task-card--dragging' : ''}`}
      style={{ animationDelay: `${Math.min(index * 60, 360)}ms` }}
      draggable={enableTaskDrag}
      onDragStart={(event) => {
        if (!enableTaskDrag) return;
        event.dataTransfer.effectAllowed = 'move';
        try {
          event.dataTransfer.setData('text/plain', String(t.id || ''));
        } catch (_) {
          // dataTransfer peut être restreint selon le navigateur.
        }
        onTaskDragStart?.(t);
      }}
      onDragEnd={() => {
        if (enableTaskDrag) onTaskDragEnd?.();
      }}
    >
      {coverLightbox && (
        <Lightbox src={coverLightbox} caption="" onClose={() => setCoverLightbox(null)} />
      )}
      <TopTag {...topTagProps}>
        <div className="task-title-row">
          {taskStatusIndicator(effectiveStatus, isN3Affiliated)}
          <div className="task-title">{t.title}</div>
          {isCondensed && (
            <span className="task-condensed-chevron" aria-hidden>
              {condensedExpanded ? '▼' : '▶'}
            </span>
          )}
        </div>
      </TopTag>
      {showTaskDetails && (
        <>
          <TaskTileMeta
            t={t}
            isTeacher={isTeacher}
            roleTerms={roleTerms}
            proposalMeta={proposalMeta}
            completionMode={completionMode}
            isCollectiveCompletion={isCollectiveCompletion}
            doneCount={doneCount}
            totalCount={totalCount}
          />
          {coverSrc && (
            <button
              type="button"
              className="task-card-cover-btn"
              onClick={() => setCoverLightbox(coverSrc)}
              aria-label="Agrandir la photo de la tâche"
            >
              <img
                src={coverSrc}
                className="task-card-cover"
                alt=""
                loading={index < 3 ? 'eager' : 'lazy'}
                decoding="async"
              />
            </button>
          )}
          {cardDescription && (
            <MarkdownContent className="task-desc">{cardDescription}</MarkdownContent>
          )}
          {((Array.isArray(t.living_beings_list) ? t.living_beings_list : []).length > 0 ||
            (t.tutorials_linked || []).length > 0) && (
            <div
              className="task-meta task-meta--after-desc"
              style={!cardDescription && coverSrc ? { marginTop: 10 } : undefined}
            >
              {(Array.isArray(t.living_beings_list) ? t.living_beings_list : []).map((name) => (
                <button
                  type="button"
                  key={`lb-${t.id}-${name}`}
                  className="task-chip living-being-catalog-chip"
                  aria-label={`Ouvrir la fiche biodiversité : ${name}`}
                  onClick={() => onOpenBiodiversityFromTaskName?.(name)}
                >
                  {taskLivingBeingEmoji(plants, name)} {name}
                </button>
              ))}
              {(t.tutorials_linked || []).map((tu) =>
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
          )}
          {referentsLinked.length > 0 && (
            <div
              className="task-desc"
              style={{
                marginTop: 8,
                borderLeft: '3px solid var(--leaf, #22c55e)',
                paddingLeft: 10,
                lineHeight: 1.5,
              }}
            >
              {referentBriefing ? (
                <>
                  <strong>Avant de commencer</strong>, se référer aux référents :{' '}
                </>
              ) : (
                <>
                  <strong>En cas de questions</strong>, s&apos;adresser à{' '}
                </>
              )}
              {referentsLinked.map((ref, i) => (
                <React.Fragment key={ref.id}>
                  {i > 0 ? ', ' : ''}
                  <span title={ref.role_slug ? String(ref.role_slug) : undefined}>{ref.label}</span>
                </React.Fragment>
              ))}
              .
            </div>
          )}
          {referentsLinked.length === 0 && referentBriefing && (
            <div
              className="task-desc"
              style={{
                marginTop: 8,
                borderLeft: '3px solid #dc2626',
                paddingLeft: 10,
                lineHeight: 1.5,
                color: '#7f1d1d',
              }}
            >
              <strong>Avant de commencer</strong> : cette tâche est indiquée comme compliquée ou
              dangereuse. Demande l&apos;accord et les consignes à l&apos;équipe pédagogique (aucun
              référent n&apos;est renseigné sur cette fiche).
            </div>
          )}
          {effectiveStatus === 'on_hold' && (
            <div
              className="task-desc"
              style={{ marginTop: 8, borderLeft: '3px solid #f59e0b', paddingLeft: 10 }}
            >
              {isTeacher
                ? 'Inscription n3beur temporairement bloquée (tâche ou projet en attente). Les commentaires restent ouverts.'
                : 'Inscription temporairement fermée par l’équipe pédagogique. Tu peux quand même laisser un commentaire.'}
            </div>
          )}
          {assignees.length > 0 && (
            <div className="assignees">
              {assignees.map((a, i) => {
                const item = formatAssigneeName(a, student, isTeacher || canViewOtherUsersIdentity);
                const label =
                  item.isCurrentStudent && item.fullName.toLowerCase() !== 'toi'
                    ? `${item.fullName} (toi)`
                    : item.fullName;
                const suffix = isCollectiveCompletion ? (a.done_at ? ' ✓' : ' • en cours') : '';
                const collectiveBusy = !!loading[teacherCollectiveAssigneeLoadKey(t.id, a)];
                const canTeacherMarkThisPart =
                  isTeacher &&
                  isCollectiveCompletion &&
                  !a.done_at &&
                  effectiveStatus !== 'validated';
                if (
                  canTeacherMarkThisPart &&
                  typeof teacherMarkCollectiveAssignmentDone === 'function'
                ) {
                  return (
                    <button
                      key={
                        a.id != null
                          ? `a-${a.id}`
                          : `${a.student_first_name}-${a.student_last_name}-${i}`
                      }
                      type="button"
                      className={`assignee-tag assignee-tag--teacher-mark ${item.isCurrentStudent ? 'me' : ''}`}
                      disabled={collectiveBusy}
                      title="Marquer tout de suite la part de cet élève comme terminée (équivalent à « Marquer terminée » côté n3beur)"
                      onClick={() => teacherMarkCollectiveAssignmentDone(t, a)}
                    >
                      {label}
                      {suffix}
                    </button>
                  );
                }
                return (
                  <span
                    key={
                      a.id != null
                        ? `a-${a.id}`
                        : `${a.student_first_name}-${a.student_last_name}-${i}`
                    }
                    className={`assignee-tag ${item.isCurrentStudent ? 'me' : ''}`}
                  >
                    {label}
                    {suffix}
                  </span>
                );
              })}
            </div>
          )}
          {slots > 0 && effectiveStatus !== 'validated' && (
            <div className="slots">
              {slots} place{slots > 1 ? 's' : ''} restante{slots > 1 ? 's' : ''}
            </div>
          )}
          <div className="task-actions">
            {!isTeacher &&
              canEnrollNewTask &&
              !isMine &&
              slots > 0 &&
              effectiveStatus !== 'validated' &&
              effectiveStatus !== 'on_hold' &&
              effectiveStatus !== 'project_completed' &&
              effectiveStatus !== 'project_validated' && (
                <button
                  className="btn btn-primary btn-sm"
                  disabled={loading[t.id + 'assign']}
                  onClick={() => assign(t)}
                >
                  {loading[t.id + 'assign'] ? '...' : "✋ Je m'en occupe"}
                </button>
              )}
            {!isTeacher &&
              canSelfAssignTasks &&
              isMine &&
              t.status !== 'done' &&
              t.status !== 'validated' &&
              !hasCompletedOwnAssignment && (
                <>
                  <button className="btn btn-secondary btn-sm" onClick={() => setLogTask(t)}>
                    ✅ Marquer terminée
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={loading[t.id + 'unassign']}
                    onClick={() => unassign(t)}
                    title="Me retirer de cette tâche"
                  >
                    {loading[t.id + 'unassign'] ? '...' : '↩️ Me retirer'}
                  </button>
                </>
              )}
            {!isTeacher && hasCompletedOwnAssignment && (
              <span className="task-chip">✅ Ta partie est déjà marquée terminée</span>
            )}
            {isTeacher && (
              <button
                className={`btn btn-sm ${isQuickAssignOpen ? 'btn-primary' : 'btn-ghost'}`}
                disabled={
                  quickAssignBusy ||
                  loadingTeacherStudents ||
                  teacherStudents.length === 0 ||
                  ['on_hold', 'project_completed', 'project_validated'].includes(
                    taskEffectiveStatus(t),
                  )
                }
                onClick={() => {
                  if (isQuickAssignOpen) {
                    quickAssignUserEditedRef.current = false;
                    setQuickAssignTaskId(null);
                    setQuickAssignStudentIds([]);
                    return;
                  }
                  quickAssignUserEditedRef.current = false;
                  setQuickAssignTaskId(t.id);
                  setQuickAssignStudentIds(
                    teacherStudents
                      .filter((s) => isStudentAlreadyAssignedToTask(t, s))
                      .map((s) => toQuickAssignStudentId(s.id)),
                  );
                }}
                title={(() => {
                  const x = taskEffectiveStatus(t);
                  if (x === 'on_hold') return 'Affectation désactivée (en attente)';
                  if (x === 'project_completed') return 'Affectation désactivée (projet terminé)';
                  if (x === 'project_validated') return 'Affectation désactivée (projet validé)';
                  return teacherStudents.length === 0
                    ? 'Aucun n3beur disponible'
                    : 'Afficher la liste des n3beurs';
                })()}
              >
                {quickAssignBusy ? '...' : '⚡ Affectation rapide'}
              </button>
            )}
            {isTeacher && (
              <button
                className="btn btn-ghost btn-sm"
                disabled={
                  !Array.isArray(groupOptions) ||
                  groupOptions.length === 0 ||
                  !!loading[`${t.id}assign-group`] ||
                  ['on_hold', 'project_completed', 'project_validated', 'validated'].includes(
                    taskEffectiveStatus(t),
                  )
                }
                onClick={() => assignGroupToTask?.(t)}
                title="Affecter en masse les membres d’un groupe"
              >
                {loading[`${t.id}assign-group`] ? '...' : '👥 Affecter groupe'}
              </button>
            )}
            {isTeacher && isQuickAssignOpen && (
              <div style={{ display: 'grid', gap: 8, width: '100%' }}>
                {loadingTeacherStudents ? (
                  <p style={{ margin: 0, fontSize: '.82rem', color: '#666' }}>
                    Chargement n3beurs...
                  </p>
                ) : (
                  <>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span style={{ fontSize: '.8rem', color: '#666' }}>
                        {quickAssignStudentIds.length} coché
                        {quickAssignStudentIds.length > 1 ? 's' : ''}
                        {quickAssignDelta.toRemove.length > 0 || quickAssignDelta.toAdd.length > 0
                          ? ` · ${quickAssignDelta.toRemove.length > 0 ? `−${quickAssignDelta.toRemove.length}` : ''}${quickAssignDelta.toRemove.length > 0 && quickAssignDelta.toAdd.length > 0 ? ' ' : ''}${quickAssignDelta.toAdd.length > 0 ? `+${quickAssignDelta.toAdd.length}` : ''}`
                          : ''}
                      </span>
                      <span
                        style={{
                          fontSize: '.8rem',
                          color:
                            quickAssignDelta.toAdd.length > quickAssignSlotsAfterRemovals
                              ? '#b45309'
                              : '#666',
                        }}
                      >
                        {quickAssignDelta.toAdd.length > 0
                          ? `${quickAssignDelta.toAdd.length}/${quickAssignSlotsAfterRemovals} place${quickAssignSlotsAfterRemovals > 1 ? 's' : ''} pour les ajouts`
                          : `${getAvailableSlots(t)} place${getAvailableSlots(t) > 1 ? 's' : ''} libre${getAvailableSlots(t) > 1 ? 's' : ''}`}
                      </span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={quickAssignBusy}
                          onClick={() => {
                            quickAssignUserEditedRef.current = true;
                            setQuickAssignStudentIds(
                              teacherStudents.map((s) => toQuickAssignStudentId(s.id)),
                            );
                          }}
                        >
                          Tout sélectionner
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={quickAssignBusy}
                          onClick={() => {
                            quickAssignUserEditedRef.current = true;
                            setQuickAssignStudentIds([]);
                          }}
                        >
                          Effacer
                        </button>
                      </div>
                    </div>
                    <div
                      style={{
                        maxHeight: 160,
                        overflowY: 'auto',
                        border: '1px solid rgba(0,0,0,.08)',
                        borderRadius: 10,
                        padding: '6px 8px',
                        background: 'var(--parchment, #faf8f3)',
                        textAlign: 'left',
                      }}
                    >
                      {teacherStudents.map((s) => {
                        const fullName = `${s.first_name || ''} ${s.last_name || ''}`.trim();
                        const sid = toQuickAssignStudentId(s.id);
                        const checked = quickAssignStudentIds.includes(sid);
                        return (
                          <label
                            key={sid}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-start',
                              gap: 10,
                              minHeight: 44,
                              width: '100%',
                              cursor: 'pointer',
                              textAlign: 'left',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={quickAssignBusy}
                              onChange={() => {
                                quickAssignUserEditedRef.current = true;
                                setQuickAssignStudentIds((ids) =>
                                  ids.includes(sid)
                                    ? ids.filter((id) => toQuickAssignStudentId(id) !== sid)
                                    : [...ids, sid],
                                );
                              }}
                            />
                            <span style={{ fontSize: '.88rem', textAlign: 'left', flex: 1 }}>
                              {fullName || 'n3beur'}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </>
                )}
                <button
                  className={`btn btn-sm ${canQuickAssign ? 'btn-primary' : 'btn-ghost'}`}
                  disabled={!canQuickAssign || quickAssignBusy || loadingTeacherStudents}
                  onClick={() => runTeacherQuickAssign(t, quickAssignStudentIds)}
                  title={quickAssignTitle}
                >
                  {quickAssignBusy ? '...' : 'Appliquer'}
                </button>
              </div>
            )}
            {isTeacher && teacherStatusActions.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {teacherStatusActions.map((opt) => {
                  const isCurrent = t.status === opt.value;
                  const isBusy = !!loading[`${t.id}status${opt.value}`];
                  const gate = teacherTaskPerms
                    ? teacherStatusActionDisabled(opt.value, teacherTaskPerms)
                    : { disabled: false, title: '' };
                  const disabled = isCurrent || isBusy || gate.disabled;
                  const title =
                    disabled && gate.title
                      ? gate.title
                      : isCurrent
                        ? `Statut actuel: ${opt.label}`
                        : `Passer en ${opt.label.toLowerCase()}`;
                  return (
                    <button
                      key={opt.value}
                      className={`btn btn-sm ${isCurrent ? 'btn-primary' : 'btn-ghost'}`}
                      disabled={disabled}
                      onClick={() => setTaskStatus(t, opt.value)}
                      title={title}
                    >
                      {isBusy ? '...' : `${opt.icon} ${opt.label}`}
                    </button>
                  );
                })}
              </div>
            )}
            {isTeacher && (t.status === 'done' || t.status === 'validated') && (
              <button className="btn btn-ghost btn-sm" onClick={() => setLogsTask(t)}>
                📋 Rapports
              </button>
            )}
            {isTeacher && (
              <>
                <Tooltip text={tooltipText('tasks.edit')}>
                  <button
                    className="btn btn-ghost btn-sm"
                    aria-label="Modifier la tâche"
                    onClick={() => {
                      setNewTaskDefaultProjectId(null);
                      setEditTask(t);
                      setDuplicateTask(null);
                      setShowForm(true);
                    }}
                  >
                    ✏️
                  </button>
                </Tooltip>
                <Tooltip text={tooltipText('tasks.duplicate')}>
                  <button
                    className="btn btn-ghost btn-sm"
                    aria-label="Dupliquer la tâche"
                    onClick={() => {
                      setNewTaskDefaultProjectId(null);
                      setDuplicateTask(t);
                      setEditTask(null);
                      setShowForm(true);
                    }}
                  >
                    📄
                  </button>
                </Tooltip>
                <Tooltip text={tooltipText('tasks.delete')}>
                  <button
                    className="btn btn-danger btn-sm"
                    aria-label="Supprimer la tâche"
                    disabled={loading[t.id + 'del']}
                    onClick={() => deleteTask(t)}
                  >
                    🗑️
                  </button>
                </Tooltip>
              </>
            )}
            {!isTeacher && canEditOwnProposal && (
              <button
                className="btn btn-ghost btn-sm"
                aria-label="Modifier ma proposition"
                onClick={() => {
                  setNewTaskDefaultProjectId(null);
                  setEditTask(t);
                  setDuplicateTask(null);
                  setShowProposalForm(false);
                  setShowForm(true);
                }}
              >
                ✏️ Modifier ma proposition
              </button>
            )}
          </div>
          {contextCommentsEnabled && (
            <ContextComments
              contextType="task"
              contextId={t.id}
              title="Commentaires de la tâche"
              placeholder="Partager une info utile sur cette tâche..."
              canParticipateContextComments={canParticipateContextComments}
            />
          )}
        </>
      )}
    </div>
  );
}

// Tuile de tâche mémoïsée : évite de re-réconcilier chaque tuile à chaque rendu de TasksView
// (polling 60 s / events temps réel). Le gain est plein une fois les handlers passés en props
// stabilisés (useCallback) côté TasksView — voir docs/AUDIT_OPTIMISATION.md (O2).
const TaskTileCard = React.memo(TaskTileCardImpl);

export { TaskTileCard };
