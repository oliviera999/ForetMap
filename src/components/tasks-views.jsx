import React, { useState, useEffect, useMemo, useCallback } from 'react';

import { api, AccountDeletedError } from '../services/api';
import { getRoleTerms } from '../utils/n3-terminology';
import { useHelp } from '../hooks/useHelp';
import { useQuickAssign } from '../hooks/useQuickAssign';
import { useTaskDragReorder } from '../hooks/useTaskDragReorder';
import { useTaskFilters } from '../hooks/useTaskFilters';
import { useTaskModals } from '../hooks/useTaskModals';
import { useTaskTileVolatileProps } from '../hooks/useTaskTileVolatileProps';
import { useTeacherTaskData } from '../hooks/useTeacherTaskData';
import { useTutorialReadIds } from '../hooks/useTutorialReadIds';

import { resolveHelpChrome, resolveHelpQuickTip, resolveTooltipKey } from '../utils/helpResolve';
import { getContentText } from '../utils/content';
import { TutorialPreviewModal, tutorialPreviewPayload } from './TutorialPreviewModal';
import { TasksEmptyState } from './TasksEmptyState.jsx';
import { TasksTeacherSections } from './TasksTeacherSections.jsx';
import { TasksStudentSections } from './TasksStudentSections.jsx';

import { safeLocalStorageGetItem, safeLocalStorageSetItem } from '../utils/browserStorage.js';
import { TimedToast } from '../shared/components/TimedToast.jsx';
import { TEACHER_STATUS_ACTIONS } from './tasks/taskViewHelpers.js';
import {
  isTaskUrgentCategory,
  applyTaskFilters,
  sortedVisibleProjects,
  partitionTasksByEffectiveStatus,
} from '../utils/taskSectioning.js';
import {
  hasActiveStudentFilters,
  studentOwnProposals,
  studentActiveAssignedTasks,
  excludeTasksById,
  recentlyValidatedAssignedTasks,
} from '../utils/taskStudentSections.js';
import { LogModal, TaskLogsViewer } from './tasks/TaskLogModals.jsx';
import { TaskProjectFormModal } from './tasks/TaskProjectFormModal.jsx';
import { TaskFormModal } from './tasks/TaskFormModal.jsx';
import { TaskTileCard } from './tasks/TaskTileCard.jsx';
import { TaskTileSection } from './tasks/TaskTileSection.jsx';
import { TaskUrgencyBanner } from './tasks/TaskUrgencyBanner.jsx';
import { TaskConfirmDialog } from './tasks/TaskConfirmDialog.jsx';
import { TaskProjectsBlock, compareProjectsForDisplay } from './tasks/TaskProjectsBlock.jsx';
import { TaskImportPanel } from './tasks/TaskImportPanel.jsx';
import { TaskTutorialsAtFocusBlock } from './tasks/TaskTutorialsAtFocusBlock.jsx';
import { TaskFiltersBar } from './tasks/TaskFiltersBar.jsx';
import { TasksViewHeader } from './tasks/TasksViewHeader.jsx';
import {
  prepareTaskSavePayload,
  executeInitialAssignments,
  initialAssignmentsToast,
} from '../utils/taskSaveAssignments.js';
import {
  taskEffectiveMapId,
  taskMapIdMatchesFilter,
  collectUsedLocationIds,
} from '../utils/taskLocationPicker.js';

import { formatTaskActionError, filterTeacherStatusActions } from '../utils/taskActionErrors.js';
import { usePublicSettings } from '../contexts/PublicSettingsContext.jsx';
import { useSession } from '../contexts/SessionContext.jsx';
import { useData } from '../contexts/DataContext.jsx';
import {
  compareTasksByImportanceThenDueDate,
  taskEffectiveStatus,
  normalizeProjectUiStatus,
} from '../utils/taskListHelpers.js';
import { teacherCollectiveAssigneeLoadKey } from '../utils/taskDisplayHelpers.js';

function TasksViewImpl({
  maps = [],
  isTeacher,
  student,
  canSelfAssignTasks = true,
  canEnrollOnTasks,
  canViewOtherUsersIdentity = true,
  onRefresh,
  onForceLogout,
  onTaskFormOverlayOpenChange = null,
  mapLocationFocus = null,
  onMapLocationFocusChange = null,
  onOpenPlantCatalogPreview = null,
  hasPermissionInRole = () => false,
}) {
  const publicSettings = usePublicSettings();
  const { isN3Affiliated = false, canParticipateContextComments = true } = useSession();
  const {
    tasks = [],
    taskProjects = [],
    zones = [],
    markers = [],
    tutorials = [],
    plants = [],
    activeMapId = 'foret',
  } = useData();
  const canEnrollNewTask = canEnrollOnTasks !== undefined ? canEnrollOnTasks : canSelfAssignTasks;
  const roleTerms = getRoleTerms(isN3Affiliated);
  const teacherTaskPerms = useMemo(
    () => ({
      canManageTasks: hasPermissionInRole('tasks.manage'),
      canValidateTasks: hasPermissionInRole('tasks.validate'),
    }),
    [hasPermissionInRole],
  );
  const teacherStatusActions = useMemo(
    () => filterTeacherStatusActions(TEACHER_STATUS_ACTIONS, teacherTaskPerms),
    [teacherTaskPerms],
  );
  const {
    showForm,
    setShowForm,
    showProjectForm,
    setShowProjectForm,
    editProject,
    setEditProject,
    showProposalForm,
    setShowProposalForm,
    editTask,
    setEditTask,
    duplicateTask,
    setDuplicateTask,
    logTask,
    setLogTask,
    logsTask,
    setLogsTask,
    confirmTask,
    setConfirmTask,
  } = useTaskModals(onTaskFormOverlayOpenChange);
  const [loading, setLoading] = useState({});
  const [toast, setToast] = useState(null);
  const {
    filterText,
    setFilterText,
    filterZone,
    setFilterZone,
    filterStatus,
    setFilterStatus,
    hasTouchedStatusFilter,
    setHasTouchedStatusFilter,
    filterMap,
    setFilterMap,
    filterProject,
    setFilterProject,
    filterGroupId,
    setFilterGroupId,
    filterUrgentCategory,
    setFilterUrgentCategory,
  } = useTaskFilters(activeMapId, mapLocationFocus);
  const [viewMode, setViewMode] = useState(() => {
    const saved = safeLocalStorageGetItem('foretmap:tasks:viewMode', 'tiles');
    if (saved === 'list') return 'list';
    if (saved === 'condensed') return 'condensed';
    return 'tiles';
  });
  const { teacherStudents, groupOptions, referentCandidates, loadingTeacherStudents } =
    useTeacherTaskData(isTeacher, filterGroupId, setToast);
  /** Préremplit le sélecteur « Projet » à l’ouverture de « Nouvelle tâche » (y compris projet en attente). */
  const [newTaskDefaultProjectId, setNewTaskDefaultProjectId] = useState(null);
  const {
    isHelpEnabled,
    showContextHints,
    pulseUnseenPanels,
    hasSeenSection,
    markSectionSeen,
    trackPanelOpen,
    trackPanelDismiss,
  } = useHelp({ publicSettings, isTeacher });
  const contextCommentsEnabled = publicSettings?.modules?.context_comments_enabled !== false;
  const tutorialsModuleEnabled = publicSettings?.modules?.tutorials_enabled !== false;
  const helpChrome = resolveHelpChrome(publicSettings);
  const helpHintPrefix = helpChrome.hintPrefix;
  const helpPanelTitlePrefix = helpChrome.panelTitlePrefix;
  const helpPanelCloseCta = helpChrome.panelCloseCta;
  const helpPanelDismissCta = helpChrome.panelDismissCta;
  const tasksQuickTip = resolveHelpQuickTip('tasks', publicSettings);
  const tooltipText = useCallback(
    (path) => resolveTooltipKey(path, publicSettings, isTeacher),
    [isTeacher, publicSettings],
  );
  const [tasksTutorialPreview, setTasksTutorialPreview] = useState(null);
  // Fetch + abonnement `foretmap_session_changed` mutualisés ; clé stable (ids joints)
  // au lieu de la référence `tutorials`, qui refetchait à chaque poll global.
  const { readIds: tasksTutorialReadIds, markRead: markTasksTutorialRead } =
    useTutorialReadIds(tutorials);
  const openTasksTutorialPreview = useCallback((tu) => {
    setTasksTutorialPreview(tutorialPreviewPayload(tu));
  }, []);

  useEffect(() => {
    safeLocalStorageSetItem('foretmap:tasks:viewMode', viewMode);
  }, [viewMode]);
  const tasksForLocationPicker = useMemo(
    () =>
      tasks.filter((t) => taskMapIdMatchesFilter(taskEffectiveMapId(t), filterMap, activeMapId)),
    [tasks, filterMap, activeMapId],
  );

  const withLoad = useCallback(
    async (id, fn) => {
      setLoading((l) => ({ ...l, [id]: true }));
      try {
        await fn();
        await onRefresh();
      } catch (e) {
        if (e instanceof AccountDeletedError) onForceLogout();
        else setToast('Oups : ' + formatTaskActionError(e.message));
      }
      setLoading((l) => ({ ...l, [id]: false }));
    },
    [onRefresh, onForceLogout],
  );

  const {
    taskDragPayload,
    taskDropHint,
    clearTaskDragState,
    startTaskDrag,
    registerProjectDropHint,
    dropTaskToProject,
  } = useTaskDragReorder({ isTeacher, tasks, withLoad, setToast });

  /** Marque `done_at` pour un assigné (tâche en mode collectif) — `POST /api/tasks/:id/done` côté n3boss. */
  const teacherMarkCollectiveAssignmentDone = useCallback(
    (task, assignment) => {
      const who =
        `${assignment?.student_first_name || ''} ${assignment?.student_last_name || ''}`.trim() ||
        'cet élève';
      const loadKey = teacherCollectiveAssigneeLoadKey(task.id, assignment);
      void withLoad(loadKey, async () => {
        const sidRaw = assignment?.student_id ?? assignment?.studentId;
        const body =
          sidRaw != null && String(sidRaw).trim() !== ''
            ? { studentId: String(sidRaw).trim() }
            : {
                firstName: String(assignment.student_first_name || '').trim(),
                lastName: String(assignment.student_last_name || '').trim(),
              };
        if (!body.studentId && (!body.firstName || !body.lastName)) {
          setToast('Impossible de marquer cette inscription : identité incomplète.');
          return;
        }
        await api(`/api/tasks/${task.id}/done`, 'POST', body);
        setToast(
          who !== 'cet élève' ? `Part de ${who} marquée terminée ✓` : 'Part marquée terminée ✓',
        );
      });
    },
    [withLoad],
  );

  const assign = useCallback(
    (t) =>
      withLoad(t.id + 'assign', async () => {
        await api(`/api/tasks/${t.id}/assign`, 'POST', {
          firstName: student.first_name,
          lastName: student.last_name,
          studentId: student.id,
        });
        setToast('C’est noté, tu t’en occupes — merci ! 🌱');
      }),
    [withLoad, student],
  );

  const assignGroupToTask = useCallback(
    (task) => {
      const status = taskEffectiveStatus(task);
      if (['on_hold', 'project_completed', 'project_validated', 'validated'].includes(status)) {
        setToast('Affectation groupe indisponible pour ce statut.');
        return;
      }
      if (!Array.isArray(groupOptions) || groupOptions.length === 0) {
        setToast('Aucun groupe disponible pour une affectation en masse.');
        return;
      }
      const suggested = String(filterGroupId || groupOptions[0]?.id || '').trim();
      const hint = groupOptions
        .slice(0, 12)
        .map((g) => `${g.id} : ${g.name}`)
        .join('\n');
      const raw = window.prompt(
        `ID du groupe à affecter sur « ${task.title} » :\n${hint}`,
        suggested,
      );
      if (raw == null) return;
      const groupId = String(raw).trim();
      if (!groupId) return;
      const groupMatch = groupOptions.find((g) => String(g.id) === groupId);
      void withLoad(`${task.id}assign-group`, async () => {
        await api(`/api/tasks/${task.id}/assign-group`, 'POST', { group_id: groupId });
        setToast(
          groupMatch
            ? `Groupe « ${groupMatch.name} » affecté à la tâche ✓`
            : 'Affectation groupe enregistrée ✓',
        );
      });
    },
    [groupOptions, filterGroupId, withLoad],
  );

  const unassign = useCallback(
    (t) => {
      setConfirmTask({
        task: t,
        label: `Tu lâches la main sur « ${t.title} » ?`,
        action: async () => {
          await withLoad(t.id + 'unassign', async () => {
            await api(`/api/tasks/${t.id}/unassign`, 'POST', {
              firstName: student.first_name,
              lastName: student.last_name,
              studentId: student.id,
            });
            setToast('OK, place libérée pour quelqu’un d’autre — merci d’avoir prévenu.');
          });
        },
      });
    },
    [withLoad, student, setConfirmTask],
  );

  const setTaskStatus = useCallback(
    (task, nextStatus) =>
      withLoad(`${task.id}status${nextStatus}`, async () => {
        if (nextStatus === 'validated') {
          await api(`/api/tasks/${task.id}/validate`, 'POST');
        } else {
          await api(`/api/tasks/${task.id}`, 'PUT', { status: nextStatus });
        }
        setToast(
          `C’est noté : statut « ${TEACHER_STATUS_ACTIONS.find((s) => s.value === nextStatus)?.label || nextStatus} ».`,
        );
      }),
    [withLoad],
  );

  const deleteTask = useCallback(
    (t) => {
      setConfirmTask({
        task: t,
        label: `Supprimer "${t.title}" ?`,
        action: async () => {
          await withLoad(t.id + 'del', async () => {
            await api(`/api/tasks/${t.id}`, 'DELETE');
            setToast('Tâche supprimée — c’est nettoyé.');
          });
        },
      });
    },
    [withLoad, setConfirmTask],
  );

  const saveTask = async (form) => {
    const { taskPayload, assignStudentIds } = prepareTaskSavePayload(form);
    if (editTask && !duplicateTask) {
      await api(`/api/tasks/${editTask.id}`, 'PUT', taskPayload);
      await onRefresh();
      return;
    }
    const created = await api('/api/tasks', 'POST', {
      ...taskPayload,
      ...(isTeacher && filterGroupId && !taskPayload.group_id ? { group_id: filterGroupId } : {}),
    });
    if (assignStudentIds.length > 0 && created?.id) {
      const ok = await executeInitialAssignments(
        api,
        created.id,
        assignStudentIds,
        teacherStudents,
      );
      setToast(initialAssignmentsToast(ok, assignStudentIds, teacherStudents));
    }
    await onRefresh();
  };

  const proposeTask = async (form) => {
    const { referent_user_ids: _referentDrop, ...taskFields } = form || {};
    await api('/api/tasks/proposals', 'POST', {
      ...taskFields,
      firstName: student.first_name,
      lastName: student.last_name,
      studentId: student.id,
    });
    setToast('Envoyé ! Les n3boss peuvent consulter ta proposition. ✓');
    await onRefresh();
  };

  const saveProject = async (form) => {
    if (editProject?.id) {
      await api(`/api/task-projects/${editProject.id}`, 'PUT', form);
      setToast('Projet mis à jour — tout est à jour ✓');
    } else {
      await api('/api/task-projects', 'POST', form);
      setToast('Nouveau projet dans la boîte — bienvenue à lui ✓');
    }
    await onRefresh();
  };

  const setProjectStatus = (project, nextStatus) =>
    withLoad(`${project.id}project${nextStatus}`, async () => {
      await api(`/api/task-projects/${project.id}`, 'PUT', { status: nextStatus });
      setToast(
        `Projet « ${project.title} » : ${nextStatus === 'on_hold' ? 'en pause (inscriptions fermées)' : 'de retour en action'}.`,
      );
    });

  const validateProject = (project) =>
    withLoad(`${project.id}projectvalidate`, async () => {
      await api(`/api/task-projects/${project.id}/validate`, 'POST');
      setToast(`Projet « ${project.title} » validé ✓`);
    });

  const duplicateProject = (project) =>
    withLoad(`${project.id}projectduplicate`, async () => {
      const result = await api(`/api/task-projects/${project.id}/duplicate`, 'POST', {});
      const copied = Number(result?.tasks_copied || 0);
      setToast(
        `Projet dupliqué : ${copied} tâche${copied > 1 ? 's' : ''} recopiée${copied > 1 ? 's' : ''} ✓`,
      );
    });

  const deleteProject = (project) => {
    setConfirmTask({
      task: project,
      label: `Supprimer le projet « ${project.title} » ? Les tâches resteront conservées sans projet.`,
      action: async () => {
        await withLoad(`${project.id}projectdelete`, async () => {
          await api(`/api/task-projects/${project.id}`, 'DELETE');
          setToast(`Projet « ${project.title} » supprimé ✓`);
        });
      },
    });
  };

  // Chaîne mémoïsée : allFiltered/visibleProjects recalculés à chaque rendu
  // invalidaient tous les useMemo en aval (chaque frappe de filtre, chaque toast
  // re-filtrait 8 fois la liste complète avec parsing de dates).
  const visibleProjects = useMemo(
    () => sortedVisibleProjects(taskProjects, filterMap, activeMapId),
    [taskProjects, filterMap, activeMapId],
  );
  // Tri d'affichage des projets calculé une seule fois ici (P2) : TaskProjectsBlock
  // (rendu jusqu'à 3×) re-triait sa liste à chaque rendu.
  const activeProjects = useMemo(
    () =>
      visibleProjects
        .filter((p) => normalizeProjectUiStatus(p.status) !== 'validated')
        .sort(compareProjectsForDisplay),
    [visibleProjects],
  );
  const validatedProjects = useMemo(
    () =>
      visibleProjects
        .filter((p) => normalizeProjectUiStatus(p.status) === 'validated')
        .sort(compareProjectsForDisplay),
    [visibleProjects],
  );
  const allFiltered = useMemo(
    () =>
      applyTaskFilters(tasks, {
        filterMap,
        activeMapId,
        filterText,
        filterZone,
        filterStatus,
        filterProject,
        filterGroupId,
        filterUrgentCategory,
      }),
    [
      tasks,
      filterMap,
      activeMapId,
      filterText,
      filterZone,
      filterStatus,
      filterProject,
      filterGroupId,
      filterUrgentCategory,
    ],
  );
  const urgentCategoryTasks = useMemo(
    () => allFiltered.filter(isTaskUrgentCategory).sort(compareTasksByImportanceThenDueDate),
    [allFiltered],
  );
  const allFilteredWithoutUrgent = useMemo(
    () => allFiltered.filter((t) => !isTaskUrgentCategory(t)),
    [allFiltered],
  );
  // Groupement projet → tâches calculé une seule fois ici (P2) : TaskProjectsBlock
  // refaisait un `filter` de la liste complète pour chaque projet à chaque rendu.
  const projectTasksById = useMemo(() => {
    const byProject = new Map();
    for (const t of allFilteredWithoutUrgent) {
      const projectId = String(t?.project_id || '');
      if (!projectId) continue;
      const bucket = byProject.get(projectId);
      if (bucket) bucket.push(t);
      else byProject.set(projectId, [t]);
    }
    return byProject;
  }, [allFilteredWithoutUrgent]);
  const visibleProjectIds = useMemo(
    () => new Set(visibleProjects.map((p) => String(p.id || ''))),
    [visibleProjects],
  );
  const regularFiltered = useMemo(
    () =>
      allFilteredWithoutUrgent.filter((t) => {
        const projectId = String(t?.project_id || '');
        return !projectId || !visibleProjectIds.has(projectId);
      }),
    [allFilteredWithoutUrgent, visibleProjectIds],
  );
  const myProposals = useMemo(
    () => (isTeacher ? [] : studentOwnProposals(allFiltered, student)),
    [isTeacher, allFiltered, student],
  );
  const myTasks = useMemo(
    () => studentActiveAssignedTasks(regularFiltered, student),
    [regularFiltered, student],
  );
  const { available, inProgress, done, validated, proposed, onHold } = useMemo(
    () => partitionTasksByEffectiveStatus(regularFiltered),
    [regularFiltered],
  );
  const showStudentFilteredResults =
    !isTeacher &&
    hasActiveStudentFilters({
      filterText,
      filterZone,
      filterProject,
      filterStatus,
      filterUrgentCategory,
      hasTouchedStatusFilter,
      filterMap,
    });
  const availableNotMine = useMemo(
    () => excludeTasksById(available, myTasks),
    [available, myTasks],
  );
  const inProgressNotMine = useMemo(
    () => excludeTasksById(inProgress, myTasks),
    [inProgress, myTasks],
  );
  const doneNotMine = useMemo(() => excludeTasksById(done, myTasks), [done, myTasks]);
  const onHoldNotMine = useMemo(() => excludeTasksById(onHold, myTasks), [onHold, myTasks]);
  const recentlyValidatedForStudent = useMemo(
    () => recentlyValidatedAssignedTasks(regularFiltered, student),
    [regularFiltered, student],
  );

  const { usedZones, usedMarkers } = useMemo(
    () =>
      collectUsedLocationIds({
        tasksForLocationPicker,
        tutorials,
        zones,
        markers,
        filterMap,
        activeMapId,
        tutorialsModuleEnabled,
        isTeacher,
      }),
    [
      tasksForLocationPicker,
      tutorials,
      zones,
      markers,
      filterMap,
      activeMapId,
      tutorialsModuleEnabled,
      isTeacher,
    ],
  );

  const sectionListClass =
    viewMode === 'tiles'
      ? 'tasks-grid'
      : viewMode === 'condensed'
        ? 'tasks-condensed'
        : 'tasks-list';
  const {
    quickAssignTaskId,
    setQuickAssignTaskId,
    quickAssignStudentIds,
    setQuickAssignStudentIds,
    quickAssignUserEditedRef,
    teacherQuickAssignDelta,
    teacherQuickAssignCanApply,
    quickAssignHint,
    runTeacherQuickAssign,
  } = useQuickAssign({
    isTeacher,
    tasks,
    teacherStudents,
    loadingTeacherStudents,
    withLoad,
    setToast,
  });

  const onOpenBiodiversityFromTaskName = useCallback(
    (name) => {
      if (typeof onOpenPlantCatalogPreview !== 'function') return;
      const p = (plants || []).find(
        (x) => String(x?.name || '').trim() === String(name || '').trim(),
      );
      if (p) onOpenPlantCatalogPreview(p.id);
      else
        setToast('Pas de fiche « Biodiversité » pour ce nom. Un prof peut compléter le catalogue.');
    },
    [onOpenPlantCatalogPreview, plants, setToast],
  );

  /**
   * Props stables des tuiles (P1) : tout sauf le volatile (`loading`, sélection
   * d'affectation rapide, drag en cours). Ce useMemo n'est donc plus invalidé par
   * `setLoading` à chaque action : un clic sur la tuile 42 ne le recalcule pas.
   */
  const taskTilePropsStable = useMemo(
    () => ({
      viewMode,
      isN3Affiliated,
      student,
      plants,
      isTeacher,
      canViewOtherUsersIdentity,
      canEnrollNewTask,
      canSelfAssignTasks,
      canParticipateContextComments,
      contextCommentsEnabled,
      roleTerms,
      teacherStudents,
      loadingTeacherStudents,
      quickAssignUserEditedRef,
      teacherQuickAssignDelta,
      teacherQuickAssignCanApply,
      quickAssignHint,
      assign,
      assignGroupToTask,
      groupOptions,
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
      teacherStatusActions,
      teacherTaskPerms,
      tooltipText,
      openTasksTutorialPreview,
      enableTaskDrag: isTeacher,
      onTaskDragStart: startTaskDrag,
      onTaskDragEnd: clearTaskDragState,
      onOpenBiodiversityFromTaskName,
    }),
    [
      viewMode,
      isN3Affiliated,
      student,
      plants,
      isTeacher,
      canViewOtherUsersIdentity,
      canEnrollNewTask,
      canSelfAssignTasks,
      canParticipateContextComments,
      contextCommentsEnabled,
      roleTerms,
      teacherStudents,
      loadingTeacherStudents,
      quickAssignUserEditedRef,
      teacherQuickAssignDelta,
      teacherQuickAssignCanApply,
      quickAssignHint,
      assign,
      assignGroupToTask,
      groupOptions,
      unassign,
      setLogTask,
      setLogsTask,
      setTaskStatus,
      deleteTask,
      setEditTask,
      setDuplicateTask,
      setShowForm,
      setShowProposalForm,
      setQuickAssignTaskId,
      setQuickAssignStudentIds,
      runTeacherQuickAssign,
      teacherMarkCollectiveAssignmentDone,
      teacherStatusActions,
      teacherTaskPerms,
      tooltipText,
      openTasksTutorialPreview,
      startTaskDrag,
      clearTaskDragState,
      onOpenBiodiversityFromTaskName,
    ],
  );

  /**
   * Getter par tuile des props volatiles : `TaskTileSection` / `TaskProjectsBlock`
   * l'appellent pour chaque tuile ; seule la tuile dont la tranche `loading[…]`,
   * la sélection d'affectation rapide ou le drag change reçoit de nouvelles
   * références → un changement de `loading[42…]` ne re-réconcilie que la tuile 42.
   */
  const getTaskTileVolatileProps = useTaskTileVolatileProps({
    loading,
    quickAssignTaskId,
    quickAssignStudentIds,
    draggingTaskId: taskDragPayload?.taskId ?? null,
  });

  const taskTileProps = useMemo(
    () => ({ ...taskTilePropsStable, getTaskTileVolatileProps }),
    [taskTilePropsStable, getTaskTileVolatileProps],
  );

  /** Props communes aux quatre rendus de TaskProjectsBlock (projets actifs ×3 + projets validés). */
  const taskProjectsBlockProps = {
    projectTasksById,
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
    onProjectTaskDragOver: registerProjectDropHint,
    onDropTaskToProject: dropTaskToProject,
  };

  return (
    <div className="tasks-view fade-in">
      {toast && <TimedToast msg={toast} onDone={() => setToast(null)} />}
      {tasksTutorialPreview && (
        <TutorialPreviewModal
          tutorial={tasksTutorialPreview}
          onClose={() => setTasksTutorialPreview(null)}
          readAcknowledge={{
            isRead: tasksTutorialReadIds.has(Number(tasksTutorialPreview.id)),
            onAcknowledged: markTasksTutorialRead,
            onForceLogout,
          }}
        />
      )}
      {(showForm || editTask || duplicateTask || showProposalForm) && (
        <TaskFormModal
          key={editTask?.id || duplicateTask?.id || (showProposalForm ? 'proposal' : 'new')}
          zones={zones}
          markers={markers}
          maps={maps}
          taskProjects={taskProjects}
          tutorials={tutorials}
          plants={plants}
          referentCandidates={referentCandidates}
          students={teacherStudents}
          activeMapId={activeMapId}
          editTask={editTask || duplicateTask}
          isDuplicate={!!duplicateTask}
          isProposal={!isTeacher && (showProposalForm || editTask?.status === 'proposed')}
          enableInitialAssignment={isTeacher}
          roleTerms={roleTerms}
          defaultProjectId={!editTask && !duplicateTask ? newTaskDefaultProjectId : null}
          onClose={() => {
            setShowForm(false);
            setEditTask(null);
            setDuplicateTask(null);
            setShowProposalForm(false);
            setNewTaskDefaultProjectId(null);
          }}
          onSave={showProposalForm && !isTeacher ? proposeTask : saveTask}
        />
      )}
      {showProjectForm && (
        <TaskProjectFormModal
          maps={maps}
          zones={zones}
          markers={markers}
          tutorials={tutorials}
          activeMapId={activeMapId}
          editProject={editProject}
          onClose={() => {
            setShowProjectForm(false);
            setEditProject(null);
          }}
          onSave={saveProject}
        />
      )}
      {logTask && (
        <LogModal
          task={logTask}
          student={student}
          onClose={() => setLogTask(null)}
          onDone={async () => {
            await onRefresh();
            setToast('Merci pour le retour — ça aide toute l’équipe ✓');
          }}
          onForceLogout={onForceLogout}
        />
      )}
      {logsTask && <TaskLogsViewer task={logsTask} onClose={() => setLogsTask(null)} />}

      <TaskConfirmDialog confirmTask={confirmTask} onClose={() => setConfirmTask(null)} />

      <TasksViewHeader
        isTeacher={isTeacher}
        canSelfAssignTasks={canSelfAssignTasks}
        student={student}
        isHelpEnabled={isHelpEnabled}
        showContextHints={showContextHints}
        pulseUnseenPanels={pulseUnseenPanels}
        hasSeenSection={hasSeenSection}
        markSectionSeen={markSectionSeen}
        trackPanelOpen={trackPanelOpen}
        trackPanelDismiss={trackPanelDismiss}
        helpPanelTitlePrefix={helpPanelTitlePrefix}
        helpPanelCloseCta={helpPanelCloseCta}
        helpPanelDismissCta={helpPanelDismissCta}
        helpHintPrefix={helpHintPrefix}
        tasksQuickTip={tasksQuickTip}
        setEditProject={setEditProject}
        setShowProjectForm={setShowProjectForm}
        setNewTaskDefaultProjectId={setNewTaskDefaultProjectId}
        setEditTask={setEditTask}
        setDuplicateTask={setDuplicateTask}
        setShowForm={setShowForm}
        setShowProposalForm={setShowProposalForm}
      />
      {isTeacher && <TaskImportPanel setToast={setToast} onRefresh={onRefresh} />}

      <TaskFiltersBar
        viewMode={viewMode}
        setViewMode={setViewMode}
        filterMap={filterMap}
        setFilterMap={setFilterMap}
        maps={maps}
        activeMapId={activeMapId}
        filterText={filterText}
        setFilterText={setFilterText}
        filterZone={filterZone}
        setFilterZone={setFilterZone}
        onMapLocationFocusChange={onMapLocationFocusChange}
        usedZones={usedZones}
        usedMarkers={usedMarkers}
        zones={zones}
        markers={markers}
        filterProject={filterProject}
        setFilterProject={setFilterProject}
        taskProjects={taskProjects}
        isTeacher={isTeacher}
        filterGroupId={filterGroupId}
        setFilterGroupId={setFilterGroupId}
        groupOptions={groupOptions}
        isHelpEnabled={isHelpEnabled}
        pulseUnseenPanels={pulseUnseenPanels}
        hasSeenSection={hasSeenSection}
        markSectionSeen={markSectionSeen}
        trackPanelOpen={trackPanelOpen}
        trackPanelDismiss={trackPanelDismiss}
        helpPanelTitlePrefix={helpPanelTitlePrefix}
        helpPanelCloseCta={helpPanelCloseCta}
        helpPanelDismissCta={helpPanelDismissCta}
        filterUrgentCategory={filterUrgentCategory}
        setFilterUrgentCategory={setFilterUrgentCategory}
        filterStatus={filterStatus}
        setFilterStatus={setFilterStatus}
        setHasTouchedStatusFilter={setHasTouchedStatusFilter}
      />

      {filterZone && tutorialsModuleEnabled && (
        <TaskTutorialsAtFocusBlock
          isTeacher={isTeacher}
          filterZone={filterZone}
          tutorialsModuleEnabled={tutorialsModuleEnabled}
          tutorials={tutorials}
          tasks={tasks}
          zones={zones}
          markers={markers}
          activeMapId={activeMapId}
          loading={loading}
          withLoad={withLoad}
          setToast={setToast}
          openTasksTutorialPreview={openTasksTutorialPreview}
        />
      )}

      <TaskUrgencyBanner isTeacher={isTeacher} tasks={regularFiltered} />

      <TaskTileSection
        title={`🚨 Urgent ! (${urgentCategoryTasks.length})`}
        tasks={urgentCategoryTasks}
        sectionListClass={sectionListClass}
        taskTileProps={taskTileProps}
      />

      {!isTeacher && (
        <TaskTileSection
          title="🧩 Mes tâches"
          tasks={myTasks}
          sectionListClass={sectionListClass}
          taskTileProps={taskTileProps}
        />
      )}

      {isTeacher ? (
        <TasksTeacherSections
          inProgress={inProgress}
          available={available}
          proposed={proposed}
          done={done}
          onHold={onHold}
          validated={validated}
          activeProjects={activeProjects}
          roleTerms={roleTerms}
          sectionListClass={sectionListClass}
          taskTileProps={taskTileProps}
          taskProjectsBlockProps={taskProjectsBlockProps}
        />
      ) : (
        <>
          {showStudentFilteredResults ? (
            <>
              <TaskTileSection
                title={`🔎 Résultats filtrés (${regularFiltered.length})`}
                tasks={regularFiltered}
                sectionListClass={sectionListClass}
                taskTileProps={taskTileProps}
                showWhenEmpty
              />
              <TaskProjectsBlock {...taskProjectsBlockProps} visibleProjects={activeProjects} />
            </>
          ) : (
            <TasksStudentSections
              inProgressNotMine={inProgressNotMine}
              availableNotMine={availableNotMine}
              myProposals={myProposals}
              doneNotMine={doneNotMine}
              onHoldNotMine={onHoldNotMine}
              recentlyValidatedForStudent={recentlyValidatedForStudent}
              activeProjects={activeProjects}
              sectionListClass={sectionListClass}
              taskTileProps={taskTileProps}
              taskProjectsBlockProps={taskProjectsBlockProps}
            />
          )}
        </>
      )}

      <TaskProjectsBlock
        {...taskProjectsBlockProps}
        visibleProjects={validatedProjects}
        sectionTitle={`✅ Projets validés (${validatedProjects.length})`}
      />

      <TasksEmptyState count={allFiltered.length} />
    </div>
  );
}

/** Mémoïsation (comparaison shallow par défaut) : évite le re-render de cette vue lourde
 *  à chaque tick du polling global d'App.jsx quand ses props ne changent pas. */
const TasksView = React.memo(TasksViewImpl);
TasksView.displayName = 'TasksView';

export { TaskFormModal, TasksView, LogModal, TaskLogsViewer, TaskTileCard };
