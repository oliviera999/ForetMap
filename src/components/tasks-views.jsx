import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

import { api, AccountDeletedError } from '../services/api';
import { daysUntil } from '../utils/badges';
import { getRoleTerms } from '../utils/n3-terminology';
import { useDialogA11y } from '../hooks/useDialogA11y';
import { useOverlayHistoryBack } from '../hooks/useOverlayHistoryBack';
import { useHelp } from '../hooks/useHelp';

import { resolveRoleText } from '../constants/help';
import { getContentText } from '../utils/content';
import { TutorialPreviewModal, tutorialPreviewPayload } from './TutorialPreviewModal';
import { fetchTutorialReadIds } from './TutorialReadAcknowledge';
import { DialogShell } from './DialogShell';

import { isStudentAssignedToTask } from '../utils/task-assignments';
import {
  safeLocalStorageGetItem,
  safeLocalStorageSetItem,
} from '../utils/browserStorage.js';
import { TimedToast } from '../shared/components/TimedToast.jsx';
import { TEACHER_STATUS_ACTIONS } from './tasks/taskViewHelpers.js';
import {
  isTaskUrgentCategory,
  applyTaskFilters,
  sortedVisibleProjects,
  partitionTasksByEffectiveStatus,
  studentUrgentDueTasks,
} from '../utils/taskSectioning.js';
import { LogModal, TaskLogsViewer } from './tasks/TaskLogModals.jsx';
import { TaskProjectFormModal } from './tasks/TaskProjectFormModal.jsx';
import { TaskFormModal } from './tasks/TaskFormModal.jsx';
import { TaskTileCard } from './tasks/TaskTileCard.jsx';
import { TaskTileSection } from './tasks/TaskTileSection.jsx';
import { TaskProjectsBlock } from './tasks/TaskProjectsBlock.jsx';
import { TaskImportPanel } from './tasks/TaskImportPanel.jsx';
import { TaskTutorialsAtFocusBlock } from './tasks/TaskTutorialsAtFocusBlock.jsx';
import { TaskFiltersBar } from './tasks/TaskFiltersBar.jsx';
import { TasksViewHeader } from './tasks/TasksViewHeader.jsx';
import { isStudentAlreadyAssignedToTask } from '../utils/taskComputations.js';
import {
  computeQuickAssignDelta,
  canApplyQuickAssign,
  quickAssignHintText,
  executeQuickAssignPlan,
  quickAssignOutcomeToast,
} from '../utils/taskQuickAssign.js';
import { computeReorderedProjectTaskIds } from '../utils/taskDragReorder.js';
import {
  taskEffectiveMapId,
  taskMapIdMatchesFilter,
  collectUsedLocationIds,
} from '../utils/taskLocationPicker.js';

import {
  formatTaskActionError,
  filterTeacherStatusActions,
} from '../utils/taskActionErrors.js';
import { usePublicSettings } from '../contexts/PublicSettingsContext.jsx';
import { useSession } from '../contexts/SessionContext.jsx';
import { useData } from '../contexts/DataContext.jsx';
import {
  compareTasksByImportanceThenDueDate,
  taskEffectiveStatus,
  normalizeProjectUiStatus,
} from '../utils/taskListHelpers.js';
import {
  teacherCollectiveAssigneeLoadKey,
  toQuickAssignStudentId,
} from '../utils/taskDisplayHelpers.js';

function TasksView({
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
  hasPermission = () => false,
  hasPermissionInRole = () => false,
}) {
  const publicSettings = usePublicSettings();
  const { isN3Affiliated = false, canParticipateContextComments = true } = useSession();
  const {
    tasks = [], taskProjects = [], zones = [], markers = [], tutorials = [], plants = [], activeMapId = 'foret',
  } = useData();
  const canEnrollNewTask = canEnrollOnTasks !== undefined ? canEnrollOnTasks : canSelfAssignTasks;
  const roleTerms = getRoleTerms(isN3Affiliated);
  const teacherTaskPerms = useMemo(() => ({
    canManageTasks: hasPermissionInRole('tasks.manage'),
    canValidateTasks: hasPermissionInRole('tasks.validate'),
    hasActiveManage: hasPermission('tasks.manage'),
    hasActiveValidate: hasPermission('tasks.validate'),
  }), [hasPermission, hasPermissionInRole]);
  const teacherStatusActions = useMemo(
    () => filterTeacherStatusActions(TEACHER_STATUS_ACTIONS, teacherTaskPerms),
    [teacherTaskPerms]
  );
  const [showForm, setShowForm] = useState(false);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [editProject, setEditProject] = useState(null);
  const [showProposalForm, setShowProposalForm] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [duplicateTask, setDuplicateTask] = useState(null);
  const [logTask, setLogTask] = useState(null);
  const [logsTask, setLogsTask] = useState(null);
  const [loading, setLoading] = useState({});
  const [toast, setToast] = useState(null);
  const [confirmTask, setConfirmTask] = useState(null);
  const [filterText, setFilterText] = useState('');
  const [filterZone, setFilterZone] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [hasTouchedStatusFilter, setHasTouchedStatusFilter] = useState(false);
  const [filterMap, setFilterMap] = useState('active');
  const [filterProject, setFilterProject] = useState('');
  const [filterGroupId, setFilterGroupId] = useState('');
  /** '' = toutes, 'urgent' = importance absolute uniquement, 'non_urgent' = exclure les urgent */
  const [filterUrgentCategory, setFilterUrgentCategory] = useState('');
  const [viewMode, setViewMode] = useState(() => {
    const saved = safeLocalStorageGetItem('foretmap:tasks:viewMode', 'tiles');
    if (saved === 'list') return 'list';
    if (saved === 'condensed') return 'condensed';
    return 'tiles';
  });
  const [teacherStudents, setTeacherStudents] = useState([]);
  const [groupOptions, setGroupOptions] = useState([]);
  const [referentCandidates, setReferentCandidates] = useState([]);
  const [quickAssignTaskId, setQuickAssignTaskId] = useState(null);
  const [quickAssignStudentIds, setQuickAssignStudentIds] = useState([]);
  const [loadingTeacherStudents, setLoadingTeacherStudents] = useState(false);
  /** True dès que l’utilisateur modifie la sélection (évite d’écraser le préremplissage différé). */
  const quickAssignUserEditedRef = useRef(false);
  /** Préremplit le sélecteur « Projet » à l’ouverture de « Nouvelle tâche » (y compris projet en attente). */
  const [newTaskDefaultProjectId, setNewTaskDefaultProjectId] = useState(null);
  /** Payload de drag & drop actif (prof/admin) pour déplacer / réordonner les tâches dans un projet. */
  const [taskDragPayload, setTaskDragPayload] = useState(null);
  const [taskDropHint, setTaskDropHint] = useState({ projectId: '', beforeTaskId: '' });
  const confirmDialogRef = useDialogA11y(() => setConfirmTask(null));
  useOverlayHistoryBack(!!confirmTask, () => setConfirmTask(null));
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
  const helpHintPrefix = getContentText(publicSettings, 'help.hint_prefix', 'Astuce :');
  const helpPanelTitlePrefix = getContentText(publicSettings, 'help.panel_title_prefix', '💡');
  const helpPanelCloseCta = getContentText(publicSettings, 'help.panel_close_cta', 'Fermer');
  const helpPanelDismissCta = getContentText(publicSettings, 'help.panel_dismiss_cta', 'Ne plus afficher');
  const tasksQuickTip = getContentText(
    publicSettings,
    'help.tasks_quick_tip',
    'Filtre d abord par carte ou groupe, puis traite les retours en attente.'
  );
  const tooltipText = useCallback((entry) => resolveRoleText(entry, isTeacher), [isTeacher]);
  const [tasksTutorialPreview, setTasksTutorialPreview] = useState(null);
  const [tasksTutorialReadIds, setTasksTutorialReadIds] = useState(() => new Set());
  const openTasksTutorialPreview = useCallback((tu) => {
    setTasksTutorialPreview(tutorialPreviewPayload(tu));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const ids = await fetchTutorialReadIds();
      if (!cancelled) setTasksTutorialReadIds(new Set(ids));
    };
    load();
    if (typeof window !== 'undefined') {
      window.addEventListener('foretmap_session_changed', load);
      return () => {
        cancelled = true;
        window.removeEventListener('foretmap_session_changed', load);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [tutorials]);

  const mapLocationFocusKey = mapLocationFocus ? `${mapLocationFocus.kind}:${mapLocationFocus.id}` : '';
  useEffect(() => {
    if (!mapLocationFocusKey) return;
    setFilterZone(mapLocationFocusKey);
  }, [mapLocationFocusKey]);

  useEffect(() => {
    setFilterMap('active');
  }, [activeMapId]);
  useEffect(() => {
    safeLocalStorageSetItem('foretmap:tasks:viewMode', viewMode);
  }, [viewMode]);
  useEffect(() => {
    if (!isTeacher) return;
    api('/api/groups/options')
      .then((payload) => setGroupOptions(Array.isArray(payload?.groups) ? payload.groups : []))
      .catch(() => setGroupOptions([]));
  }, [isTeacher]);

  useEffect(() => {
    if (!isTeacher) return;
    let cancelled = false;
    const loadTeacherStudents = async () => {
      setLoadingTeacherStudents(true);
      try {
        const payload = await api(`/api/stats/all${filterGroupId ? `?group_id=${encodeURIComponent(filterGroupId)}` : ''}`);
        if (cancelled) return;
        const rows = Array.isArray(payload) ? payload : (payload?.students ?? []);
        const list = Array.isArray(rows)
          ? rows.slice().sort((a, b) => (
            `${a?.first_name || ''} ${a?.last_name || ''}`.trim().localeCompare(
              `${b?.first_name || ''} ${b?.last_name || ''}`.trim(),
              'fr'
            )
          ))
          : [];
        setTeacherStudents(list);
      } catch (e) {
        if (!cancelled) setToast('Impossible de charger la liste des n3beurs pour l’instant : ' + e.message);
      } finally {
        if (!cancelled) setLoadingTeacherStudents(false);
      }
    };
    loadTeacherStudents();
    return () => {
      cancelled = true;
    };
  }, [isTeacher, filterGroupId]);

  useEffect(() => {
    if (!isTeacher) return;
    let cancelled = false;
    const loadReferents = async () => {
      try {
        const rows = await api('/api/tasks/referent-candidates');
        if (cancelled) return;
        setReferentCandidates(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setReferentCandidates([]);
      }
    };
    loadReferents();
    return () => {
      cancelled = true;
    };
  }, [isTeacher]);

  useEffect(() => {
    if (!isTeacher || !quickAssignTaskId || loadingTeacherStudents || teacherStudents.length === 0) return;
    if (quickAssignUserEditedRef.current) return;
    const task = tasks.find((x) => String(x.id) === String(quickAssignTaskId));
    if (!task) return;
    const wantIds = teacherStudents
      .filter((s) => isStudentAlreadyAssignedToTask(task, s))
      .map((s) => toQuickAssignStudentId(s.id));
    setQuickAssignStudentIds((prev) => {
      const prevStr = prev.map(toQuickAssignStudentId);
      if (prevStr.length === 0 && wantIds.length > 0) return wantIds;
      return prev;
    });
  }, [isTeacher, quickAssignTaskId, loadingTeacherStudents, teacherStudents, tasks]);

  useEffect(() => {
    if (!onTaskFormOverlayOpenChange) return;
    const open = !!(
      showForm
      || editTask
      || duplicateTask
      || showProposalForm
      || showProjectForm
      || confirmTask
      || logTask
      || logsTask
    );
    onTaskFormOverlayOpenChange(open);
  }, [
    showForm,
    editTask,
    duplicateTask,
    showProposalForm,
    showProjectForm,
    confirmTask,
    logTask,
    logsTask,
    onTaskFormOverlayOpenChange,
  ]);

  useEffect(() => () => {
    onTaskFormOverlayOpenChange?.(false);
  }, [onTaskFormOverlayOpenChange]);

  const tasksForLocationPicker = useMemo(
    () => tasks.filter((t) => taskMapIdMatchesFilter(taskEffectiveMapId(t), filterMap, activeMapId)),
    [tasks, filterMap, activeMapId]
  );

  const withLoad = useCallback(async (id, fn) => {
    setLoading(l => ({ ...l, [id]: true }));
    try { await fn(); await onRefresh(); }
    catch (e) {
      if (e instanceof AccountDeletedError) onForceLogout();
      else setToast('Oups : ' + formatTaskActionError(e.message));
    }
    setLoading(l => ({ ...l, [id]: false }));
  }, [onRefresh, onForceLogout]);

  const clearTaskDragState = useCallback(() => {
    setTaskDragPayload(null);
    setTaskDropHint({ projectId: '', beforeTaskId: '' });
  }, []);

  const startTaskDrag = useCallback((task) => {
    if (!isTeacher || !task?.id) return;
    setTaskDragPayload({
      taskId: String(task.id),
      sourceProjectId: String(task.project_id || '').trim(),
    });
    setTaskDropHint({ projectId: '', beforeTaskId: '' });
  }, [isTeacher]);

  const registerProjectDropHint = useCallback((projectIdRaw, beforeTaskIdRaw = '') => {
    if (!taskDragPayload?.taskId) return;
    const projectId = String(projectIdRaw || '').trim();
    if (!projectId) return;
    setTaskDropHint({
      projectId,
      beforeTaskId: String(beforeTaskIdRaw || '').trim(),
    });
  }, [taskDragPayload?.taskId]);

  const dropTaskToProject = useCallback((targetProjectIdRaw, beforeTaskIdRaw = '') => {
    const dragTaskId = String(taskDragPayload?.taskId || '').trim();
    if (!isTeacher || !dragTaskId) return;
    const targetProjectId = String(targetProjectIdRaw || '').trim();
    if (!targetProjectId) {
      clearTaskDragState();
      return;
    }
    const draggedTask = tasks.find((task) => String(task.id) === dragTaskId);
    if (!draggedTask) {
      clearTaskDragState();
      return;
    }
    const sourceProjectId = String(draggedTask.project_id || '').trim();
    const beforeTaskId = String(beforeTaskIdRaw || '').trim();
    const loadKey = `${dragTaskId}dnd:${targetProjectId}:${beforeTaskId || 'end'}`;
    void withLoad(loadKey, async () => {
      if (sourceProjectId !== targetProjectId) {
        await api(`/api/tasks/${dragTaskId}`, 'PUT', { project_id: targetProjectId });
      }
      const orderedTaskIds = computeReorderedProjectTaskIds(tasks, dragTaskId, targetProjectId, beforeTaskId);
      await api('/api/tasks/reorder-project', 'POST', {
        project_id: targetProjectId,
        task_ids: orderedTaskIds,
      });
      setToast(
        sourceProjectId === targetProjectId
          ? 'Ordre des tâches du projet mis à jour ✓'
          : 'Tâche intégrée au projet et positionnée ✓'
      );
      clearTaskDragState();
    });
  }, [clearTaskDragState, isTeacher, taskDragPayload?.taskId, tasks, withLoad]);

  useEffect(() => {
    if (!taskDragPayload?.taskId) return;
    const stillExists = tasks.some((task) => String(task.id) === String(taskDragPayload.taskId));
    if (!stillExists) clearTaskDragState();
  }, [clearTaskDragState, taskDragPayload, tasks]);

  /** Marque `done_at` pour un assigné (tâche en mode collectif) — `POST /api/tasks/:id/done` côté n3boss. */
  const teacherMarkCollectiveAssignmentDone = useCallback((task, assignment) => {
    const who = `${assignment?.student_first_name || ''} ${assignment?.student_last_name || ''}`.trim() || 'cet élève';
    const loadKey = teacherCollectiveAssigneeLoadKey(task.id, assignment);
    void withLoad(loadKey, async () => {
      const sidRaw = assignment?.student_id ?? assignment?.studentId;
      const body = sidRaw != null && String(sidRaw).trim() !== ''
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
      setToast(who !== 'cet élève' ? `Part de ${who} marquée terminée ✓` : 'Part marquée terminée ✓');
    });
  }, [withLoad]);

  const assign = useCallback(t => withLoad(t.id + 'assign', async () => {
    await api(`/api/tasks/${t.id}/assign`, 'POST', {
      firstName: student.first_name, lastName: student.last_name, studentId: student.id
    });
    setToast('C’est noté, tu t’en occupes — merci ! 🌱');
  }), [withLoad, student]);

  const assignGroupToTask = useCallback((task) => {
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
      suggested
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
          : 'Affectation groupe enregistrée ✓'
      );
    });
  }, [groupOptions, filterGroupId, withLoad]);

  const unassign = useCallback(t => {
    setConfirmTask({
      task: t,
      label: `Tu lâches la main sur « ${t.title} » ?`,
      action: async () => {
        await withLoad(t.id + 'unassign', async () => {
          await api(`/api/tasks/${t.id}/unassign`, 'POST', {
            firstName: student.first_name, lastName: student.last_name, studentId: student.id
          });
          setToast('OK, place libérée pour quelqu’un d’autre — merci d’avoir prévenu.');
        });
      }
    });
  }, [withLoad, student]);

  const setTaskStatus = useCallback((task, nextStatus) => withLoad(`${task.id}status${nextStatus}`, async () => {
    if (nextStatus === 'validated') {
      await api(`/api/tasks/${task.id}/validate`, 'POST');
    } else {
      await api(`/api/tasks/${task.id}`, 'PUT', { status: nextStatus });
    }
    setToast(`C’est noté : statut « ${TEACHER_STATUS_ACTIONS.find((s) => s.value === nextStatus)?.label || nextStatus} ».`);
  }), [withLoad]);

  const deleteTask = useCallback(t => {
    setConfirmTask({
      task: t,
      label: `Supprimer "${t.title}" ?`,
      action: async () => {
        await withLoad(t.id + 'del', async () => {
          await api(`/api/tasks/${t.id}`, 'DELETE');
          setToast('Tâche supprimée — c’est nettoyé.');
        });
      }
    });
  }, [withLoad]);

  const saveTask = async form => {
    const { assign_student_ids: rawAssignIds = [], ...taskPayload } = form || {};
    const assignStudentIds = [...new Set((rawAssignIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
    const minPlaces = assignStudentIds.length;
    if (minPlaces > 0) {
      const cur = Math.max(1, Number.parseInt(taskPayload.required_students, 10) || 1);
      taskPayload.required_students = Math.max(cur, minPlaces);
    }
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
      let ok = 0;
      for (const sid of assignStudentIds) {
        const assignee = teacherStudents.find((s) => String(s.id) === String(sid));
        if (!assignee) continue;
        await api(`/api/tasks/${created.id}/assign`, 'POST', {
          firstName: assignee.first_name,
          lastName: assignee.last_name,
          studentId: assignee.id,
        });
        ok += 1;
      }
      if (ok === 0) {
        setToast('Tâche créée — impossible d’inscrire tout de suite (comptes introuvables dans la liste chargée).');
      } else if (ok === 1) {
        const one = teacherStudents.find((s) => String(s.id) === String(assignStudentIds[0]));
        setToast(`Tâche créée et ${one?.first_name || 'n3beur'} inscrit(e) ✓`);
      } else if (ok < assignStudentIds.length) {
        setToast(`Tâche créée : ${ok} inscription(s) sur ${assignStudentIds.length} — certains comptes manquaient dans la liste.`);
      } else {
        setToast(`Tâche créée : ${ok} n3beur(s) inscrit(s) — bien joué ! ✓`);
      }
    }
    await onRefresh();
  };

  const proposeTask = async form => {
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

  const setProjectStatus = (project, nextStatus) => withLoad(`${project.id}project${nextStatus}`, async () => {
    await api(`/api/task-projects/${project.id}`, 'PUT', { status: nextStatus });
    setToast(`Projet « ${project.title} » : ${nextStatus === 'on_hold' ? 'en pause (inscriptions fermées)' : 'de retour en action'}.`);
  });

  const validateProject = (project) => withLoad(`${project.id}projectvalidate`, async () => {
    await api(`/api/task-projects/${project.id}/validate`, 'POST');
    setToast(`Projet « ${project.title} » validé ✓`);
  });

  const duplicateProject = (project) => withLoad(`${project.id}projectduplicate`, async () => {
    const result = await api(`/api/task-projects/${project.id}/duplicate`, 'POST', {});
    const copied = Number(result?.tasks_copied || 0);
    setToast(`Projet dupliqué : ${copied} tâche${copied > 1 ? 's' : ''} recopiée${copied > 1 ? 's' : ''} ✓`);
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

  const visibleProjects = sortedVisibleProjects(taskProjects, filterMap, activeMapId);
  const activeProjects = visibleProjects.filter((p) => normalizeProjectUiStatus(p.status) !== 'validated');
  const validatedProjects = visibleProjects.filter((p) => normalizeProjectUiStatus(p.status) === 'validated');
  const allFiltered = applyTaskFilters(tasks, {
    filterMap,
    activeMapId,
    filterText,
    filterZone,
    filterStatus,
    filterProject,
    filterGroupId,
    filterUrgentCategory,
  });
  const urgentCategoryTasks = useMemo(
    () => allFiltered.filter(isTaskUrgentCategory).sort(compareTasksByImportanceThenDueDate),
    [allFiltered]
  );
  const allFilteredWithoutUrgent = useMemo(
    () => allFiltered.filter((t) => !isTaskUrgentCategory(t)),
    [allFiltered]
  );
  const visibleProjectIds = useMemo(
    () => new Set(visibleProjects.map((p) => String(p.id || ''))),
    [visibleProjects]
  );
  const isTaskInVisibleProject = (task) => {
    const projectId = String(task?.project_id || '');
    return !!projectId && visibleProjectIds.has(projectId);
  };
  const regularFiltered = useMemo(
    () => allFilteredWithoutUrgent.filter((t) => !isTaskInVisibleProject(t)),
    [allFilteredWithoutUrgent, visibleProjectIds]
  );
  const myProposals = allFiltered.filter((t) => (
    !isTeacher
    && t.status === 'proposed'
    && student
    && String(t.proposed_by_student_id || '') === String(student.id || '')
  ));
  const myTasks = regularFiltered.filter((t) => (
    student
    && taskEffectiveStatus(t) !== 'validated'
    && isStudentAssignedToTask(t, student)
  ));
  const {
    available, inProgress, done, validated, proposed, onHold,
  } = partitionTasksByEffectiveStatus(regularFiltered);
  const hasStudentFilters = !isTeacher && (
    !!filterText
    || !!filterZone
    || !!filterProject
    || !!filterStatus
    || !!filterUrgentCategory
    || hasTouchedStatusFilter
    || filterMap !== 'active'
  );
  const showStudentFilteredResults = !isTeacher && hasStudentFilters;
  const availableNotMine = useMemo(
    () => available.filter((t) => !myTasks.some((m) => m.id === t.id)),
    [available, myTasks]
  );
  const inProgressNotMine = useMemo(
    () => inProgress.filter((t) => !myTasks.some((m) => m.id === t.id)),
    [inProgress, myTasks]
  );
  const doneNotMine = useMemo(
    () => done.filter((t) => !myTasks.some((m) => m.id === t.id)),
    [done, myTasks]
  );
  const onHoldNotMine = useMemo(
    () => onHold.filter((t) => !myTasks.some((m) => m.id === t.id)),
    [onHold, myTasks]
  );
  const recentlyValidatedForStudent = useMemo(
    () => regularFiltered.filter((t) => (
      taskEffectiveStatus(t) === 'validated' && student && isStudentAssignedToTask(t, student)
    )),
    [regularFiltered, student]
  );

  const urgentTasks = !isTeacher ? studentUrgentDueTasks(regularFiltered) : [];

  const { usedZones, usedMarkers } = collectUsedLocationIds({
    tasksForLocationPicker,
    tutorials,
    zones,
    markers,
    filterMap,
    activeMapId,
    tutorialsModuleEnabled,
    isTeacher,
  });

  const sectionListClass = viewMode === 'tiles'
    ? 'tasks-grid'
    : (viewMode === 'condensed' ? 'tasks-condensed' : 'tasks-list');
  /** Inscriptions à ajouter / retirer (liste n3beurs chargée côté n3boss) pour l’affectation rapide. */
  const teacherQuickAssignDelta = useCallback(
    (task, selectedIds) => computeQuickAssignDelta(task, selectedIds, teacherStudents),
    [teacherStudents]
  );
  const teacherQuickAssignCanApply = useCallback(
    (task, selectedIds) => !!isTeacher && canApplyQuickAssign(task, selectedIds, teacherStudents),
    [isTeacher, teacherStudents]
  );
  const quickAssignHint = useCallback(
    (task, selectedIds) => quickAssignHintText(task, selectedIds, teacherStudents),
    [teacherStudents]
  );
  const runTeacherQuickAssign = useCallback((task, selectedIds) => withLoad(`${task.id}assign_teacher_quick`, async () => {
    const { toAdd, toRemove } = teacherQuickAssignDelta(task, selectedIds);
    if (toAdd.length === 0 && toRemove.length === 0) {
      setToast('Rien à faire : tout était déjà comme prévu.');
      return;
    }
    const outcome = await executeQuickAssignPlan(api, task, { toAdd, toRemove });
    setToast(quickAssignOutcomeToast(task, outcome));
    setQuickAssignTaskId(null);
    setQuickAssignStudentIds([]);
  }), [withLoad, teacherQuickAssignDelta]);

  const onOpenBiodiversityFromTaskName = useCallback((name) => {
    if (typeof onOpenPlantCatalogPreview !== 'function') return;
    const p = (plants || []).find((x) => String(x?.name || '').trim() === String(name || '').trim());
    if (p) onOpenPlantCatalogPreview(p.id);
    else setToast('Pas de fiche « Biodiversité » pour ce nom. Un prof peut compléter le catalogue.');
  }, [onOpenPlantCatalogPreview, plants, setToast]);

  const taskTileProps = useMemo(() => ({
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
    onForceLogout,
    enableTaskDrag: isTeacher,
    onTaskDragStart: startTaskDrag,
    onTaskDragEnd: clearTaskDragState,
    draggingTaskId: taskDragPayload?.taskId ?? null,
    onOpenBiodiversityFromTaskName,
  }), [
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
    loading,
    quickAssignTaskId,
    quickAssignStudentIds,
    teacherStudents,
    loadingTeacherStudents,
    teacherQuickAssignDelta,
    teacherQuickAssignCanApply,
    quickAssignHint,
    assign,
    assignGroupToTask,
    groupOptions,
    unassign,
    setTaskStatus,
    deleteTask,
    runTeacherQuickAssign,
    teacherMarkCollectiveAssignmentDone,
    teacherStatusActions,
    teacherTaskPerms,
    tooltipText,
    openTasksTutorialPreview,
    onForceLogout,
    startTaskDrag,
    clearTaskDragState,
    taskDragPayload,
    onOpenBiodiversityFromTaskName,
  ]);

  return (
    <div className="tasks-view fade-in">
      {toast && <TimedToast msg={toast} onDone={() => setToast(null)} />}
      {tasksTutorialPreview && (
        <TutorialPreviewModal
          tutorial={tasksTutorialPreview}
          onClose={() => setTasksTutorialPreview(null)}
          readAcknowledge={{
            isRead: tasksTutorialReadIds.has(Number(tasksTutorialPreview.id)),
            onAcknowledged: (id) => setTasksTutorialReadIds((prev) => new Set([...prev, id])),
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
          isProposal={(!isTeacher) && (showProposalForm || editTask?.status === 'proposed')}
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
          onClose={() => { setShowProjectForm(false); setEditProject(null); }}
          onSave={saveProject}
        />
      )}
      {logTask && (
        <LogModal task={logTask} student={student}
          onClose={() => setLogTask(null)}
          onDone={async () => { await onRefresh(); setToast('Merci pour le retour — ça aide toute l’équipe ✓'); }}
          onForceLogout={onForceLogout}
        />
      )}
      {logsTask && <TaskLogsViewer task={logsTask} onClose={() => setLogsTask(null)} />}

      {confirmTask && (
        <DialogShell
          open={!!confirmTask}
          onClose={() => setConfirmTask(null)}
          overlayClassName="modal-overlay"
          dialogClassName="log-modal fade-in"
          dialogStyle={{ paddingBottom: 'calc(20px + var(--safe-bottom))' }}
          ariaLabel="Confirmation d'action"
          closeOnOverlay
          dialogRef={confirmDialogRef}
        >
            <h3 style={{ marginBottom: 8 }}>Confirmation</h3>
            <p style={{ fontSize: '.95rem', color: '#444', marginBottom: 20, lineHeight: 1.5 }}>{confirmTask.label}</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-danger" style={{ flex: 1 }} onClick={async () => {
                const a = confirmTask.action; setConfirmTask(null); await a();
              }}>Confirmer</button>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setConfirmTask(null)}>Annuler</button>
            </div>
        </DialogShell>
      )}

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

      {!isTeacher && urgentTasks.length > 0 && (
        <div className="urgency-banner">
          <h4>🔥 Échéances proches</h4>
          {urgentTasks.slice(0, 5).map(t => {
            const d = daysUntil(t.due_date);
            const label = d < 0 ? `Retard ${-d}j` : d === 0 ? "Aujourd'hui" : d === 1 ? 'Demain' : `${d} jours`;
            return (
              <div key={t.id} className="urgency-item">
                <span className="urgency-days">{label}</span>
                <span style={{ flex: 1, color: 'var(--forest)', fontWeight: 500 }}>{t.title}</span>
                {(t.zones_linked?.[0]?.name || t.zone_name) && (
                  <span style={{ fontSize: '.76rem', color: '#aaa' }}>{t.zones_linked?.[0]?.name || t.zone_name}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <TaskTileSection
        title={`🚨 Urgent ! (${urgentCategoryTasks.length})`}
        tasks={urgentCategoryTasks}
        sectionListClass={sectionListClass}
        taskTileProps={taskTileProps}
      />

      {!isTeacher && (
        <TaskTileSection title="🧩 Mes tâches" tasks={myTasks} sectionListClass={sectionListClass} taskTileProps={taskTileProps} />
      )}

      {isTeacher ? (
        <>
          <TaskTileSection title="⚙️ En cours" tasks={inProgress} sectionListClass={sectionListClass} taskTileProps={taskTileProps} />
          <TaskTileSection title="🔥 À faire" tasks={available} sectionListClass={sectionListClass} taskTileProps={taskTileProps} />
          <TaskProjectsBlock
            visibleProjects={activeProjects}
            allFiltered={allFilteredWithoutUrgent}
            sectionListClass={sectionListClass}
            isTeacher={isTeacher}
            maps={maps}
            contextCommentsEnabled={contextCommentsEnabled}
            canParticipateContextComments={canParticipateContextComments}
            setEditProject={setEditProject}
            setShowProjectForm={setShowProjectForm}
            setNewTaskDefaultProjectId={setNewTaskDefaultProjectId}
            setEditTask={setEditTask}
            setDuplicateTask={setDuplicateTask}
            setShowForm={setShowForm}
            setShowProposalForm={setShowProposalForm}
            setProjectStatus={setProjectStatus}
            validateProject={validateProject}
            duplicateProject={duplicateProject}
            deleteProject={deleteProject}
            loading={loading}
            taskTileProps={taskTileProps}
            openTasksTutorialPreview={openTasksTutorialPreview}
            taskDragPayload={taskDragPayload}
            taskDropHint={taskDropHint}
            onProjectTaskDragOver={registerProjectDropHint}
            onDropTaskToProject={dropTaskToProject}
          />
          <TaskTileSection
            title={`💡 Propositions ${roleTerms.studentPlural} (${proposed.length})`}
            tasks={proposed}
            sectionListClass={sectionListClass}
            taskTileProps={taskTileProps}
          />
          <TaskTileSection
            title={`⏳ En attente de validation (${done.length})`}
            tasks={done}
            sectionListClass={sectionListClass}
            taskTileProps={taskTileProps}
          />
          <TaskTileSection
            title={`⏸️ En attente (${onHold.length})`}
            tasks={onHold}
            sectionListClass={sectionListClass}
            taskTileProps={taskTileProps}
          />
          <TaskTileSection title="✅ Validées" tasks={validated} sectionListClass={sectionListClass} taskTileProps={taskTileProps} />
        </>
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
              <TaskProjectsBlock
            visibleProjects={activeProjects}
            allFiltered={allFilteredWithoutUrgent}
            sectionListClass={sectionListClass}
            isTeacher={isTeacher}
            maps={maps}
            contextCommentsEnabled={contextCommentsEnabled}
            canParticipateContextComments={canParticipateContextComments}
            setEditProject={setEditProject}
            setShowProjectForm={setShowProjectForm}
            setNewTaskDefaultProjectId={setNewTaskDefaultProjectId}
            setEditTask={setEditTask}
            setDuplicateTask={setDuplicateTask}
            setShowForm={setShowForm}
            setShowProposalForm={setShowProposalForm}
            setProjectStatus={setProjectStatus}
            validateProject={validateProject}
            duplicateProject={duplicateProject}
            deleteProject={deleteProject}
            loading={loading}
            taskTileProps={taskTileProps}
            openTasksTutorialPreview={openTasksTutorialPreview}
            taskDragPayload={taskDragPayload}
            taskDropHint={taskDropHint}
            onProjectTaskDragOver={registerProjectDropHint}
            onDropTaskToProject={dropTaskToProject}
          />
            </>
          ) : (
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
              <TaskProjectsBlock
            visibleProjects={activeProjects}
            allFiltered={allFilteredWithoutUrgent}
            sectionListClass={sectionListClass}
            isTeacher={isTeacher}
            maps={maps}
            contextCommentsEnabled={contextCommentsEnabled}
            canParticipateContextComments={canParticipateContextComments}
            setEditProject={setEditProject}
            setShowProjectForm={setShowProjectForm}
            setNewTaskDefaultProjectId={setNewTaskDefaultProjectId}
            setEditTask={setEditTask}
            setDuplicateTask={setDuplicateTask}
            setShowForm={setShowForm}
            setShowProposalForm={setShowProposalForm}
            setProjectStatus={setProjectStatus}
            validateProject={validateProject}
            duplicateProject={duplicateProject}
            deleteProject={deleteProject}
            loading={loading}
            taskTileProps={taskTileProps}
            openTasksTutorialPreview={openTasksTutorialPreview}
            taskDragPayload={taskDragPayload}
            taskDropHint={taskDropHint}
            onProjectTaskDragOver={registerProjectDropHint}
            onDropTaskToProject={dropTaskToProject}
          />
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
          )}
        </>
      )}

      <TaskProjectsBlock
        visibleProjects={validatedProjects}
        allFiltered={allFilteredWithoutUrgent}
        sectionListClass={sectionListClass}
        isTeacher={isTeacher}
        maps={maps}
        contextCommentsEnabled={contextCommentsEnabled}
        canParticipateContextComments={canParticipateContextComments}
        setEditProject={setEditProject}
        setShowProjectForm={setShowProjectForm}
        setNewTaskDefaultProjectId={setNewTaskDefaultProjectId}
        setEditTask={setEditTask}
        setDuplicateTask={setDuplicateTask}
        setShowForm={setShowForm}
        setShowProposalForm={setShowProposalForm}
        setProjectStatus={setProjectStatus}
        validateProject={validateProject}
        duplicateProject={duplicateProject}
        deleteProject={deleteProject}
        loading={loading}
        taskTileProps={taskTileProps}
        openTasksTutorialPreview={openTasksTutorialPreview}
        taskDragPayload={taskDragPayload}
        taskDropHint={taskDropHint}
        onProjectTaskDragOver={registerProjectDropHint}
        onDropTaskToProject={dropTaskToProject}
        sectionTitle={`✅ Projets validés (${validatedProjects.length})`}
      />

      {allFiltered.length === 0 && (
        <div className="empty"><div className="empty-icon">🌿</div><p>Rien à faire ici pour l’instant — reviens plus tard ou change tes filtres.</p></div>
      )}
    </div>
  );
}

export { TaskFormModal, TasksView, LogModal, TaskLogsViewer, TaskTileCard };
