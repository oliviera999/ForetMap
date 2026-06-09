import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

import { api, API, getAuthToken, AccountDeletedError } from '../services/api';
import { daysUntil } from '../utils/badges';
import { getRoleTerms } from '../utils/n3-terminology';
import { useDialogA11y } from '../hooks/useDialogA11y';
import { useOverlayHistoryBack } from '../hooks/useOverlayHistoryBack';
import { useHelp } from '../hooks/useHelp';

import { HelpPanel } from './HelpPanel';

import { HELP_PANELS, resolveRoleText } from '../constants/help';
import { getContentText } from '../utils/content';
import { TutorialPreviewModal, tutorialPreviewPayload, tutorialPreviewCanEmbed } from './TutorialPreviewModal';
import { fetchTutorialReadIds } from './TutorialReadAcknowledge';
import { DialogShell } from './DialogShell';

import { isStudentAssignedToTask } from '../utils/task-assignments';
import {
  safeLocalStorageGetItem,
  safeLocalStorageSetItem,
} from '../utils/browserStorage.js';
import { TimedToast } from '../shared/components/TimedToast.jsx';
import { isTaskUrgentCategory, TEACHER_STATUS_ACTIONS, TASK_STATUS_FILTER_OPTIONS } from './tasks/taskViewHelpers.js';
import { LogModal, TaskLogsViewer } from './tasks/TaskLogModals.jsx';
import { TaskProjectFormModal } from './tasks/TaskProjectFormModal.jsx';
import { TaskFormModal } from './tasks/TaskFormModal.jsx';
import { TaskTileCard } from './tasks/TaskTileCard.jsx';
import { TaskProjectsBlock } from './tasks/TaskProjectsBlock.jsx';
import {
  getAvailableSlots,
  isStudentAlreadyAssignedToTask,
} from '../utils/taskComputations.js';

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
  projectStatusLabel,
  normalizeProjectUiStatus,
  taskHasLocation,
  tutorialPickerLocationIds,
  tutorialPickerHasLocation,
  tutorialPickerLinkedToSameMap,
  dedupeTutorialsByIdForTasks,
  tutorialRefsFromTasksAtLocationFilter,
} from '../utils/taskListHelpers.js';
import { fileToDataUrl } from '../utils/fileToDataUrl.js';
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
  const [importFile, setImportFile] = useState(null);
  const [importDryRun, setImportDryRun] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState(null);
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
  const helpTasks = HELP_PANELS.tasks;
  const helpGroupFilters = HELP_PANELS.groupFilters;
  const helpHintPrefix = getContentText(publicSettings, 'help.hint_prefix', 'Astuce :');
  const helpPanelTitlePrefix = getContentText(publicSettings, 'help.panel_title_prefix', '💡');
  const helpPanelCloseCta = getContentText(publicSettings, 'help.panel_close_cta', 'Fermer');
  const helpPanelDismissCta = getContentText(publicSettings, 'help.panel_dismiss_cta', 'Ne plus afficher');
  const tasksQuickTip = getContentText(
    publicSettings,
    'help.tasks_quick_tip',
    'Filtre d abord par carte ou groupe, puis traite les retours en attente.'
  );
  const tooltipText = (entry) => resolveRoleText(entry, isTeacher);
  const [quickTutoLinkId, setQuickTutoLinkId] = useState('');
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

  const mapLabelById = (mapId) => {
    if (!mapId) return 'Globale';
    const map = maps.find(m => m.id === mapId);
    return map ? map.label : mapId;
  };

  const taskEffectiveMapId = (task) => task.map_id_resolved || task.map_id || task.zone_map_id || task.marker_map_id || null;

  const tasksForLocationPicker = useMemo(() => tasks.filter((t) => {
    const taskMapId = taskEffectiveMapId(t);
    if (filterMap === 'active' && taskMapId !== activeMapId && taskMapId != null) return false;
    if (filterMap !== 'active' && filterMap !== 'all' && taskMapId !== filterMap && taskMapId != null) return false;
    return true;
  }), [tasks, filterMap, activeMapId]);

  const withLoad = async (id, fn) => {
    setLoading(l => ({ ...l, [id]: true }));
    try { await fn(); await onRefresh(); }
    catch (e) {
      if (e instanceof AccountDeletedError) onForceLogout();
      else setToast('Oups : ' + formatTaskActionError(e.message));
    }
    setLoading(l => ({ ...l, [id]: false }));
  };

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
      const targetIdsWithoutDragged = tasks
        .filter((task) => String(task.id) !== dragTaskId && String(task.project_id || '').trim() === targetProjectId)
        .map((task) => String(task.id));
      let insertAt = targetIdsWithoutDragged.length;
      if (beforeTaskId) {
        const idx = targetIdsWithoutDragged.indexOf(beforeTaskId);
        if (idx >= 0) insertAt = idx;
      }
      const orderedTaskIds = [
        ...targetIdsWithoutDragged.slice(0, insertAt),
        dragTaskId,
        ...targetIdsWithoutDragged.slice(insertAt),
      ];
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
  const teacherMarkCollectiveAssignmentDone = (task, assignment) => {
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
  };

  const linkTutorialAtFocus = (tutorialId) => withLoad(`tuto-link-${tutorialId}`, async () => {
    const tu = (tutorials || []).find((x) => Number(x.id) === Number(tutorialId));
    if (!tu || !filterZone) return;
    const { zoneIds: zi, markerIds: mi } = tutorialPickerLocationIds(tu);
    const [kind, rawId] = String(filterZone).split(':');
    let zoneIds = [...zi];
    let markerIds = [...mi];
    if (kind === 'zone' && rawId) {
      zoneIds = [...new Set([...zi.map(String), String(rawId).trim()])];
    } else if (kind === 'marker' && rawId) {
      markerIds = [...new Set([...mi.map(String), String(rawId).trim()])];
    }
    await api(`/api/tutorials/${tutorialId}`, 'PUT', { zone_ids: zoneIds, marker_ids: markerIds });
    setQuickTutoLinkId('');
    setToast('Tutoriel lié à ce lieu ✓');
  });

  const unlinkTutorialAtFocus = (tuRow) => withLoad(`tuto-unlink-${tuRow.id}`, async () => {
    if (!filterZone) return;
    const { zoneIds: zi, markerIds: mi } = tutorialPickerLocationIds(tuRow);
    const [kind, rawId] = String(filterZone).split(':');
    let zoneIds = [...zi];
    let markerIds = [...mi];
    if (kind === 'zone' && rawId) {
      zoneIds = zi.filter((id) => String(id) !== String(rawId));
    } else if (kind === 'marker' && rawId) {
      markerIds = mi.filter((id) => String(id) !== String(rawId));
    }
    await api(`/api/tutorials/${tuRow.id}`, 'PUT', { zone_ids: zoneIds, marker_ids: markerIds });
    setToast('Tutoriel dissocié de ce lieu ✓');
  });

  const assign = t => withLoad(t.id + 'assign', async () => {
    await api(`/api/tasks/${t.id}/assign`, 'POST', {
      firstName: student.first_name, lastName: student.last_name, studentId: student.id
    });
    setToast('C’est noté, tu t’en occupes — merci ! 🌱');
  });

  const assignGroupToTask = (task) => {
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
  };

  const unassign = t => {
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
  };

  const setTaskStatus = (task, nextStatus) => withLoad(`${task.id}status${nextStatus}`, async () => {
    if (nextStatus === 'validated') {
      await api(`/api/tasks/${task.id}/validate`, 'POST');
    } else {
      await api(`/api/tasks/${task.id}`, 'PUT', { status: nextStatus });
    }
    setToast(`C’est noté : statut « ${TEACHER_STATUS_ACTIONS.find((s) => s.value === nextStatus)?.label || nextStatus} ».`);
  });

  const deleteTask = t => {
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
  };

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

  const downloadImportTemplate = async (format) => {
    try {
      const token = getAuthToken();
      const headers = new Headers();
      if (token) headers.set('Authorization', 'Bearer ' + token);
      const res = await fetch(`${API}/api/tasks/import/template?format=${encodeURIComponent(format)}`, { headers });
      if (!res.ok) throw new Error('Téléchargement impossible');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = format === 'xlsx'
        ? 'foretmap-modele-taches-projets.xlsx'
        : 'foretmap-modele-taches-projets.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setToast('Zut, le modèle ne part pas : ' + (e.message || 'inconnue'));
    }
  };

  const runImportTasksProjects = async () => {
    if (!importFile) {
      setToast('Choisis d’abord un fichier CSV ou XLSX, stp.');
      return;
    }
    setImporting(true);
    setImportReport(null);
    try {
      const fileDataBase64 = await fileToDataUrl(importFile);
      const result = await api('/api/tasks/import', 'POST', {
        fileName: importFile.name,
        fileDataBase64,
        dryRun: importDryRun,
      });
      setImportReport(result?.report || null);
      if (importDryRun) {
        setToast('Simulation terminée — regarde le rapport ci-dessous ✓');
      } else {
        const createdProjects = Number(result?.report?.totals?.created_projects || 0);
        const createdTasks = Number(result?.report?.totals?.created_tasks || 0);
        setToast(`Import OK : ${createdProjects} projet(s), ${createdTasks} tâche(s) — la forêt grossit !`);
        await onRefresh();
      }
    } catch (e) {
      setToast('Import bloqué : ' + (e.message || 'inconnue'));
    } finally {
      setImporting(false);
    }
  };

  const applyFilters = list => list.filter(t => {
    const taskMapId = taskEffectiveMapId(t);
    if (filterMap === 'active' && taskMapId !== activeMapId && taskMapId != null) return false;
    if (filterMap !== 'active' && filterMap !== 'all' && taskMapId !== filterMap && taskMapId != null) return false;
    if (filterText && !t.title.toLowerCase().includes(filterText.toLowerCase()) &&
      !(t.description || '').toLowerCase().includes(filterText.toLowerCase())) return false;
    if (filterZone && !taskHasLocation(t, filterZone)) return false;
    if (filterStatus) {
      const eff = taskEffectiveStatus(t);
      let matches = eff === filterStatus;
      if (filterStatus === 'validated') {
        matches = eff === 'validated' || eff === 'project_validated';
      } else if (filterStatus === 'on_hold') {
        matches = eff === 'on_hold';
      } else if (filterStatus === 'project_completed') {
        matches = eff === 'project_completed';
      } else if (filterStatus === 'project_validated') {
        matches = eff === 'project_validated';
      }
      if (!matches) return false;
    }
    if (filterProject && t.project_id !== filterProject) return false;
    if (filterGroupId && String(t.group_id || '') !== String(filterGroupId)) return false;
    if (filterUrgentCategory === 'urgent' && !isTaskUrgentCategory(t)) return false;
    if (filterUrgentCategory === 'non_urgent' && isTaskUrgentCategory(t)) return false;
    return true;
  });

  const visibleProjects = taskProjects
    .filter((p) => {
      if (filterMap === 'all') return true;
      if (filterMap === 'active') return p.map_id === activeMapId;
      return p.map_id === filterMap;
    })
    .slice()
    .sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'fr'));
  const activeProjects = visibleProjects.filter((p) => normalizeProjectUiStatus(p.status) !== 'validated');
  const validatedProjects = visibleProjects.filter((p) => normalizeProjectUiStatus(p.status) === 'validated');
  const allFiltered = applyFilters(tasks);
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
  const available = regularFiltered.filter(t => taskEffectiveStatus(t) === 'available');
  const inProgress = regularFiltered.filter(t => taskEffectiveStatus(t) === 'in_progress');
  const done = regularFiltered.filter(t => taskEffectiveStatus(t) === 'done');
  const validated = regularFiltered.filter(t => taskEffectiveStatus(t) === 'validated');
  const proposed = regularFiltered.filter(t => taskEffectiveStatus(t) === 'proposed');
  const onHold = regularFiltered.filter((t) => taskEffectiveStatus(t) === 'on_hold');
  const projectCompletedTasks = regularFiltered.filter((t) => taskEffectiveStatus(t) === 'project_completed');
  const projectValidatedTasks = regularFiltered.filter((t) => taskEffectiveStatus(t) === 'project_validated');
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

  const urgentTasks = !isTeacher ? regularFiltered.filter(t => {
    const effective = taskEffectiveStatus(t);
    if (effective === 'validated' || effective === 'done' || effective === 'on_hold' || effective === 'project_completed' || effective === 'project_validated') return false;
    const d = daysUntil(t.due_date);
    return d !== null && d <= 3 && d >= -2;
  }).sort(compareTasksByImportanceThenDueDate) : [];

  const usedZoneIds = new Set();
  const usedMarkerIds = new Set();
  for (const t of tasksForLocationPicker) {
    (t.zone_ids || []).forEach((id) => usedZoneIds.add(id));
    if (t.zone_id) usedZoneIds.add(t.zone_id);
    (t.marker_ids || []).forEach((id) => usedMarkerIds.add(id));
    if (t.marker_id) usedMarkerIds.add(t.marker_id);
  }
  if (tutorialsModuleEnabled) {
    for (const tu of tutorials || []) {
      if (!isTeacher && tu.is_active === false) continue;
      for (const zid of tu.zone_ids || []) {
        const z = zones.find((zz) => String(zz.id) === String(zid));
        if (!z) continue;
        if (filterMap === 'active' && z.map_id !== activeMapId) continue;
        if (filterMap !== 'active' && filterMap !== 'all' && z.map_id !== filterMap) continue;
        usedZoneIds.add(zid);
      }
      for (const mid of tu.marker_ids || []) {
        const m = markers.find((mm) => String(mm.id) === String(mid));
        if (!m) continue;
        if (filterMap === 'active' && m.map_id !== activeMapId) continue;
        if (filterMap !== 'active' && filterMap !== 'all' && m.map_id !== filterMap) continue;
        usedMarkerIds.add(mid);
      }
    }
  }
  const usedZones = [...usedZoneIds];
  const usedMarkers = [...usedMarkerIds];

  const focusMapIdForTutorials = useMemo(() => {
    if (!filterZone || !tutorialsModuleEnabled) return null;
    const [kind, rawId] = String(filterZone).split(':');
    if (kind === 'zone' && rawId) {
      return zones.find((z) => String(z.id) === String(rawId))?.map_id ?? activeMapId;
    }
    if (kind === 'marker' && rawId) {
      return markers.find((m) => String(m.id) === String(rawId))?.map_id ?? activeMapId;
    }
    return zones.find((z) => String(z.id) === String(filterZone))?.map_id ?? activeMapId;
  }, [filterZone, zones, markers, tutorialsModuleEnabled, activeMapId]);

  const linkedTutorialsAtFocus = useMemo(() => {
    if (!filterZone || !tutorialsModuleEnabled) return [];
    const fromLocation = (tutorials || []).filter((tu) => tutorialPickerHasLocation(tu, filterZone));
    const fromTasks = tutorialRefsFromTasksAtLocationFilter(filterZone, tasks, tutorials || []);
    const merged = dedupeTutorialsByIdForTasks([...fromLocation, ...fromTasks]);
    if (isTeacher) return merged;
    return merged.filter((tu) => tu.is_active !== false);
  }, [filterZone, tutorials, tutorialsModuleEnabled, isTeacher, tasks]);

  const assignableTutorialsAtFocus = useMemo(() => {
    if (!filterZone || !isTeacher || !tutorialsModuleEnabled || !focusMapIdForTutorials) return [];
    return (tutorials || []).filter((tu) => (
      tu.is_active !== false
      && !tutorialPickerHasLocation(tu, filterZone)
      && tutorialPickerLinkedToSameMap(tu, focusMapIdForTutorials)
    ));
  }, [filterZone, tutorials, isTeacher, tutorialsModuleEnabled, focusMapIdForTutorials]);
  const sectionListClass = viewMode === 'tiles'
    ? 'tasks-grid'
    : (viewMode === 'condensed' ? 'tasks-condensed' : 'tasks-list');
  /** Inscriptions à ajouter / retirer (liste n3beurs chargée côté n3boss) pour l’affectation rapide. */
  const teacherQuickAssignDelta = (task, selectedIds) => {
    const idSet = new Set((selectedIds || []).map(String));
    const toAdd = teacherStudents.filter(
      (s) => idSet.has(String(s.id)) && !isStudentAlreadyAssignedToTask(task, s)
    );
    const toRemove = teacherStudents.filter(
      (s) => !idSet.has(String(s.id)) && isStudentAlreadyAssignedToTask(task, s)
    );
    return { toAdd, toRemove };
  };
  const teacherQuickAssignCanApply = (task, selectedIds) => {
    if (!isTeacher || !task) return false;
    const { toAdd, toRemove } = teacherQuickAssignDelta(task, selectedIds);
    if (toAdd.length === 0 && toRemove.length === 0) return false;
    const te = taskEffectiveStatus(task);
    if (te === 'on_hold' || te === 'project_completed' || te === 'project_validated') return false;
    if (toRemove.length > 0 && (task.status === 'done' || task.status === 'validated')) return false;
    if (toAdd.length > 0) {
      if (task.status === 'proposed' || task.status === 'done' || task.status === 'validated') return false;
      const slotsAfterRemovals = getAvailableSlots(task) + toRemove.length;
      if (toAdd.length > slotsAfterRemovals) return false;
    }
    return true;
  };
  const quickAssignHint = (task, selectedIds) => {
    if (!task) return "Cette tâche n’est pas dispo ici";
    const te = taskEffectiveStatus(task);
    if (te === 'on_hold') return "Patience : tâche ou projet en pause";
    if (te === 'project_completed') return "Projet terminé : inscriptions fermées";
    if (te === 'project_validated') return "Projet validé : inscriptions fermées";
    const { toAdd, toRemove } = teacherQuickAssignDelta(task, selectedIds);
    if (toAdd.length === 0 && toRemove.length === 0) return "Coche ou décoche des n3beurs pour ajuster l’équipe sur la mission";
    if (toRemove.length > 0 && (task.status === 'done' || task.status === 'validated')) {
      return "Mission déjà bouclée : on ne retire plus les inscrits";
    }
    if (toAdd.length > 0) {
      if (task.status === 'proposed') return "Idée encore en discussion : inscriptions pas encore ouvertes";
      if (task.status === 'done' || task.status === 'validated') return "C’est déjà plié pour celle-ci";
      const slotsAfterRemovals = getAvailableSlots(task) + toRemove.length;
      if (toAdd.length > slotsAfterRemovals) {
        return `Pas assez de places (max. ${slotsAfterRemovals} après retrait${toRemove.length > 1 ? 's' : ''})`;
      }
    }
    const parts = [];
    if (toRemove.length > 0) parts.push(`Retirer ${toRemove.length} n3beur${toRemove.length > 1 ? 's' : ''}`);
    if (toAdd.length > 0) parts.push(`Inscrire ${toAdd.length} n3beur${toAdd.length > 1 ? 's' : ''}`);
    return parts.join(' · ');
  };
  const runTeacherQuickAssign = (task, selectedIds) => withLoad(`${task.id}assign_teacher_quick`, async () => {
    const { toAdd, toRemove } = teacherQuickAssignDelta(task, selectedIds);
    if (toAdd.length === 0 && toRemove.length === 0) {
      setToast('Rien à faire : tout était déjà comme prévu.');
      return;
    }
    let removeOk = 0;
    let removeFail = 0;
    let firstRemoveError = '';
    for (const targetStudent of toRemove) {
      try {
        await api(`/api/tasks/${task.id}/unassign`, 'POST', {
          firstName: targetStudent.first_name,
          lastName: targetStudent.last_name,
          studentId: targetStudent.id,
        });
        removeOk += 1;
      } catch (e) {
        removeFail += 1;
        if (!firstRemoveError) firstRemoveError = e.message || 'Erreur inconnue';
      }
    }
    let slotsRemaining = getAvailableSlots(task) + removeOk;
    let addOk = 0;
    let addFail = 0;
    let firstAddError = '';
    for (const targetStudent of toAdd) {
      if (slotsRemaining <= 0) break;
      try {
        await api(`/api/tasks/${task.id}/assign`, 'POST', {
          firstName: targetStudent.first_name,
          lastName: targetStudent.last_name,
          studentId: targetStudent.id,
        });
        addOk += 1;
        slotsRemaining -= 1;
      } catch (e) {
        addFail += 1;
        if (!firstAddError) firstAddError = e.message || 'Erreur inconnue';
        if (String(e.message || '').toLowerCase().includes('plus de place')) break;
      }
    }
    const bits = [];
    if (removeOk > 0) bits.push(`${removeOk} retrait${removeOk > 1 ? 's' : ''}`);
    if (addOk > 0) bits.push(`${addOk} inscription${addOk > 1 ? 's' : ''}`);
    const errBits = [];
    if (removeFail > 0) errBits.push(`${removeFail} retrait${removeFail > 1 ? 's' : ''}`);
    if (addFail > 0) errBits.push(`${addFail} inscription${addFail > 1 ? 's' : ''}`);
    if (bits.length > 0 && errBits.length > 0) {
      setToast(`${bits.join(', ')} — échec : ${errBits.join(', ')}${firstRemoveError || firstAddError ? ` (${firstRemoveError || firstAddError})` : ''}`);
    } else if (bits.length > 0) {
      setToast(`${bits.join(', ')} sur « ${task.title} »`);
    } else if (firstRemoveError || firstAddError) {
      setToast(`Aucune mise à jour : ${firstRemoveError || firstAddError}`);
    } else {
      setToast('Aucun changement appliqué — déjà à jour.');
    }
    setQuickAssignTaskId(null);
    setQuickAssignStudentIds([]);
  });
  const taskTileProps = {
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
    onOpenBiodiversityFromTaskName: (name) => {
      if (typeof onOpenPlantCatalogPreview !== 'function') return;
      const p = (plants || []).find((x) => String(x?.name || '').trim() === String(name || '').trim());
      if (p) onOpenPlantCatalogPreview(p.id);
      else setToast('Pas de fiche « Biodiversité » pour ce nom. Un prof peut compléter le catalogue.');
    },
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

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h2 className="section-title">✅ Tâches</h2>
        {isTeacher && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {isHelpEnabled && (
              <HelpPanel
                sectionId="tasks"
                title={helpTasks.title}
                entries={helpTasks.items}
                isTeacher={isTeacher}
                isPulsing={pulseUnseenPanels && !hasSeenSection('tasks')}
                panelTitlePrefix={helpPanelTitlePrefix}
                closeButtonText={helpPanelCloseCta}
                dismissButtonText={helpPanelDismissCta}
                onMarkSeen={markSectionSeen}
                onOpen={trackPanelOpen}
                onDismiss={trackPanelDismiss}
              />
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => { setEditProject(null); setShowProjectForm(true); }}
            >
              + Projet
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                setNewTaskDefaultProjectId(null);
                setEditTask(null);
                setDuplicateTask(null);
                setShowForm(true);
              }}
            >
              + Nouvelle tâche
            </button>
          </div>
        )}
        {!isTeacher && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {isHelpEnabled && (
              <HelpPanel
                sectionId="tasks"
                title={helpTasks.title}
                entries={helpTasks.items}
                isTeacher={isTeacher}
                isPulsing={pulseUnseenPanels && !hasSeenSection('tasks')}
                panelTitlePrefix={helpPanelTitlePrefix}
                closeButtonText={helpPanelCloseCta}
                dismissButtonText={helpPanelDismissCta}
                onMarkSeen={markSectionSeen}
                onOpen={trackPanelOpen}
                onDismiss={trackPanelDismiss}
              />
            )}
            {canSelfAssignTasks && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setNewTaskDefaultProjectId(null); setShowProposalForm(true); }}>+ Proposer</button>
            )}
          </div>
        )}
      </div>
      <p className="section-sub">{isTeacher ? 'Piloter les missions, valider les retours et traiter les idées du terrain' : (canSelfAssignTasks ? "Choisis une mission ou propose la tienne, tout le monde peut la lire. Il faut t'inscrire seulement au moment où tu commences la mission pour de vrai." : 'Tu consultes la liste en lecture seule')}</p>
      {isHelpEnabled && showContextHints && tasksQuickTip ? (
        <p className="section-sub" style={{ marginTop: 6 }}>
          <strong>{helpHintPrefix}</strong> {tasksQuickTip}
        </p>
      ) : null}
      {!isTeacher && student && Number(student.taskEnrollment?.maxActiveAssignments) > 0 && (
        <p
          className="section-sub"
          style={{
            marginTop: 6,
            padding: '8px 12px',
            borderRadius: 10,
            background: student.taskEnrollment?.atLimit ? '#fef3c7' : '#f0fdf4',
            color: student.taskEnrollment?.atLimit ? '#92400e' : '#166534',
            fontSize: '.88rem',
            lineHeight: 1.45,
          }}
        >
          {student.taskEnrollment?.atLimit
            ? `Tu es déjà sur le paquet max de missions en cours (${student.taskEnrollment.currentActiveAssignments}/${student.taskEnrollment.maxActiveAssignments}, pas encore validées) : libère une place ou attends qu’une mission soit cochée côté n3boss.`
            : `Missions actives pour toi : ${student.taskEnrollment.currentActiveAssignments}/${student.taskEnrollment.maxActiveAssignments} (en attente de validation n3boss, toutes cartes).`}
        </p>
      )}
      {isTeacher && (
        <details className="plant-more" style={{ marginBottom: 10 }}>
          <summary>Import tâches/projets (CSV / XLSX)</summary>
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            <p style={{ margin: 0, fontSize: '.85rem', color: '#6b7280' }}>
              Le fichier peut contenir des lignes de type <strong>project</strong> et <strong>task</strong>.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => downloadImportTemplate('csv')} disabled={importing}>
                📄 Modèle CSV
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => downloadImportTemplate('xlsx')} disabled={importing}>
                📗 Modèle XLSX
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <input
                type="file"
                accept=".csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                onChange={(e) => {
                  setImportFile(e.target.files?.[0] || null);
                  setImportReport(null);
                }}
              />
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.85rem', color: '#374151' }}>
                <input
                  type="checkbox"
                  checked={importDryRun}
                  onChange={(e) => setImportDryRun(e.target.checked)}
                />
                Simulation (sans création)
              </label>
              <button className="btn btn-primary btn-sm" onClick={runImportTasksProjects} disabled={importing}>
                {importing ? 'Import...' : 'Importer'}
              </button>
            </div>
            {importFile && (
              <p style={{ margin: 0, fontSize: '.8rem', color: '#6b7280' }}>
                Fichier sélectionné: <strong>{importFile.name}</strong>
              </p>
            )}
            {importReport && (
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: '.85rem', color: '#1f2937', marginBottom: 4 }}>
                  Reçues: <strong>{importReport?.totals?.received || 0}</strong> ·
                  Valides: <strong>{importReport?.totals?.valid || 0}</strong> ·
                  Projets créés: <strong>{importReport?.totals?.created_projects || 0}</strong> ·
                  Tâches créées: <strong>{importReport?.totals?.created_tasks || 0}</strong> ·
                  Déjà existants: <strong>{importReport?.totals?.skipped_existing || 0}</strong> ·
                  Invalides: <strong>{importReport?.totals?.skipped_invalid || 0}</strong>
                </div>
                {Array.isArray(importReport?.errors) && importReport.errors.length > 0 && (
                  <div style={{ maxHeight: 120, overflow: 'auto', fontSize: '.8rem', color: '#991b1b' }}>
                    {importReport.errors.slice(0, 15).map((item, idx) => (
                      <div key={`${item.row}-${item.field}-${idx}`}>
                        Ligne {item.row} ({item.field}): {item.error}
                      </div>
                    ))}
                    {importReport.errors.length > 15 && (
                      <div>... {importReport.errors.length - 15} erreur(s) supplémentaire(s)</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </details>
      )}

      <div className="task-filters">
        <div className="tasks-view-switch" role="group" aria-label="Mode d'affichage des tâches">
          <button
            className={`btn btn-sm ${viewMode === 'tiles' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setViewMode('tiles')}
            type="button"
          >
            🧩 Tuiles
          </button>
          <button
            className={`btn btn-sm ${viewMode === 'list' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setViewMode('list')}
            type="button"
          >
            📄 Liste
          </button>
          <button
            className={`btn btn-sm ${viewMode === 'condensed' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setViewMode('condensed')}
            type="button"
          >
            📋 Condensé
          </button>
        </div>
        <select value={filterMap} onChange={e => setFilterMap(e.target.value)}>
          <option value="active">Carte active ({mapLabelById(activeMapId)})</option>
          <option value="all">Toutes cartes</option>
          {maps.map(mp => <option key={mp.id} value={mp.id}>{mp.label}</option>)}
        </select>
        <input value={filterText} onChange={e => setFilterText(e.target.value)}
          placeholder="🔍 Rechercher une tâche..." />
        <select
          value={filterZone}
          onChange={(e) => {
            const v = e.target.value;
            setFilterZone(v);
            if (!v) {
              onMapLocationFocusChange?.(null);
            } else {
              const colon = v.indexOf(':');
              if (colon > 0) {
                const k = v.slice(0, colon);
                const idPart = v.slice(colon + 1);
                if ((k === 'zone' || k === 'marker') && idPart) {
                  onMapLocationFocusChange?.({ kind: k, id: idPart });
                } else {
                  onMapLocationFocusChange?.(null);
                }
              } else {
                onMapLocationFocusChange?.(null);
              }
            }
          }}
        >
          <option value="">Toutes les zones</option>
          {usedZones.map(zId => {
            const z = zones.find(zz => zz.id === zId);
            return <option key={`zone:${zId}`} value={`zone:${zId}`}>{z ? z.name : zId}</option>;
          })}
          {usedMarkers.length > 0 && <option value="" disabled>-- Repères --</option>}
          {usedMarkers.map((mId) => {
            const marker = markers.find((mm) => mm.id === mId);
            const markerLabel = marker ? `${marker.emoji ? `${marker.emoji} ` : '📍 '}${marker.label}` : `📍 ${mId}`;
            return <option key={`marker:${mId}`} value={`marker:${mId}`}>{markerLabel}</option>;
          })}
        </select>
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)}>
          <option value="">Tous les projets</option>
          {taskProjects
            .filter((p) => {
              if (filterMap === 'all') return true;
              if (filterMap === 'active') return p.map_id === activeMapId;
              return p.map_id === filterMap;
            })
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}{projectStatusLabel(p.status)}
              </option>
            ))}
        </select>
        {isTeacher && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <select value={filterGroupId} onChange={(e) => setFilterGroupId(e.target.value)} aria-label="Filtrer les tâches par groupe">
              <option value="">Tous les groupes</option>
              {groupOptions.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            {isHelpEnabled && (
              <HelpPanel
                sectionId="tasks-group-filter"
                title={helpGroupFilters.title}
                entries={helpGroupFilters.items}
                isTeacher={isTeacher}
                isPulsing={pulseUnseenPanels && !hasSeenSection('tasks-group-filter')}
                panelTitlePrefix={helpPanelTitlePrefix}
                closeButtonText={helpPanelCloseCta}
                dismissButtonText={helpPanelDismissCta}
                onMarkSeen={markSectionSeen}
                onOpen={trackPanelOpen}
                onDismiss={trackPanelDismiss}
              />
            )}
          </div>
        )}
        <select
          value={filterUrgentCategory}
          onChange={(e) => setFilterUrgentCategory(e.target.value)}
          aria-label="Filtrer par catégorie urgent"
        >
          <option value="">Toutes les catégories</option>
          <option value="urgent">Urgent ! uniquement</option>
          <option value="non_urgent">Hors urgent</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => {
            setFilterStatus(e.target.value);
            setHasTouchedStatusFilter(true);
          }}
        >
          <option value="">Tous les statuts</option>
          {TASK_STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {filterZone && tutorialsModuleEnabled && (
        <div className="tasks-section" style={{ marginTop: 14, marginBottom: 8 }}>
          <div className="tasks-section-title">📘 Tutoriels pour ce lieu</div>
          {isTeacher && (
            <>
              <div style={{ marginTop: 8 }}>
                {linkedTutorialsAtFocus.length === 0 ? (
                  <p style={{ color: '#999', fontSize: '.85rem', margin: 0 }}>Aucun tutoriel lié à ce lieu.</p>
                ) : (
                  linkedTutorialsAtFocus.map((tu) => (
                    <div key={tu.id} className="history-item" style={{ alignItems: 'center' }}>
                      <span>{tu.title}{tu.is_active === false ? ' (archivé)' : ''}</span>
                      {tutorialPickerHasLocation(tu, filterZone) ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={!!loading[`tuto-unlink-${tu.id}`]}
                          onClick={() => unlinkTutorialAtFocus(tu)}
                        >
                          Délier
                        </button>
                      ) : (
                        <span style={{ fontSize: '.72rem', color: '#64748b', flexShrink: 0 }}>via mission</span>
                      )}
                    </div>
                  ))
                )}
              </div>
              <div className="field" style={{ marginTop: 12 }}>
                <label htmlFor="tasks-view-tuto-link">Lier un tutoriel existant</label>
                <select
                  id="tasks-view-tuto-link"
                  value={quickTutoLinkId}
                  onChange={(e) => setQuickTutoLinkId(e.target.value)}
                >
                  <option value="">— Choisir un tutoriel —</option>
                  {assignableTutorialsAtFocus.map((tu) => (
                    <option key={tu.id} value={String(tu.id)}>{tu.title}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                style={{ marginTop: 8 }}
                disabled={!quickTutoLinkId || !!loading[`tuto-link-${quickTutoLinkId}`]}
                onClick={() => linkTutorialAtFocus(quickTutoLinkId)}
              >
                🔗 Lier le tutoriel
              </button>
            </>
          )}
          {!isTeacher && (
            <div style={{ marginTop: 8, display: 'grid', gap: 12 }}>
              {linkedTutorialsAtFocus.length === 0 ? (
                <p style={{ color: '#999', fontSize: '.85rem', margin: 0 }}>Aucun tutoriel lié à ce lieu.</p>
              ) : (
                linkedTutorialsAtFocus.map((tu) => {
                  const [fk, fid] = String(filterZone).split(':');
                  const otherZones = (tu.zones_linked || []).filter((z) => !(fk === 'zone' && String(z.id) === String(fid)));
                  const otherMarkers = (tu.markers_linked || []).filter((mk) => !(fk === 'marker' && String(mk.id) === String(fid)));
                  return (
                    <div
                      key={tu.id}
                      style={{
                        border: '1px solid rgba(0,0,0,.08)',
                        borderRadius: 10,
                        padding: '12px 14px',
                        background: 'var(--parchment)',
                      }}
                    >
                      <div style={{ fontWeight: 700, color: 'var(--forest)' }}>{tu.title}</div>
                      {tu.summary && (
                        <p style={{ margin: '8px 0 0', fontSize: '.82rem', color: '#555', lineHeight: 1.45 }}>{tu.summary}</p>
                      )}
                      {otherZones.length > 0 && (
                        <p style={{ margin: '10px 0 0', fontSize: '.76rem', color: '#64748b' }}>
                          <strong>Autres zones</strong> : {otherZones.map((z) => z.name).join(', ')}
                        </p>
                      )}
                      {otherMarkers.length > 0 && (
                        <p style={{ margin: '6px 0 0', fontSize: '.76rem', color: '#64748b' }}>
                          <strong>Repères</strong> : {otherMarkers.map((m) => `${m.emoji ? `${m.emoji} ` : ''}${m.label}`).join(', ')}
                        </p>
                      )}
                      {tutorialPreviewCanEmbed(tu) ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          style={{ marginTop: 10 }}
                          onClick={() => openTasksTutorialPreview(tu)}
                        >
                          📖 Consulter
                        </button>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
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

      {urgentCategoryTasks.length > 0 && (
        <div className="tasks-section">
          <div className="tasks-section-title">🚨 Urgent ! ({urgentCategoryTasks.length})</div>
          <div className={sectionListClass}>{urgentCategoryTasks.map((t, idx) => <TaskTileCard key={t.id} {...taskTileProps} t={t} index={idx} />)}</div>
        </div>
      )}

      {!isTeacher && myTasks.length > 0 && (
        <div className="tasks-section">
          <div className="tasks-section-title">🧩 Mes tâches</div>
          <div className={sectionListClass}>{myTasks.map((t, idx) => <TaskTileCard key={t.id} {...taskTileProps} t={t} index={idx} />)}</div>
        </div>
      )}

      {isTeacher ? (
        <>
          {inProgress.length > 0 && (
            <div className="tasks-section">
              <div className="tasks-section-title">⚙️ En cours</div>
              <div className={sectionListClass}>{inProgress.map((t, idx) => <TaskTileCard key={t.id} {...taskTileProps} t={t} index={idx} />)}</div>
            </div>
          )}
          {available.length > 0 && (
            <div className="tasks-section">
              <div className="tasks-section-title">🔥 À faire</div>
              <div className={sectionListClass}>{available.map((t, idx) => <TaskTileCard key={t.id} {...taskTileProps} t={t} index={idx} />)}</div>
            </div>
          )}
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
          {proposed.length > 0 && (
            <div className="tasks-section">
              <div className="tasks-section-title">💡 Propositions {roleTerms.studentPlural} ({proposed.length})</div>
              <div className={sectionListClass}>{proposed.map((t, idx) => <TaskTileCard key={t.id} {...taskTileProps} t={t} index={idx} />)}</div>
            </div>
          )}
          {done.length > 0 && (
            <div className="tasks-section">
              <div className="tasks-section-title">⏳ En attente de validation ({done.length})</div>
              <div className={sectionListClass}>{done.map((t, idx) => <TaskTileCard key={t.id} {...taskTileProps} t={t} index={idx} />)}</div>
            </div>
          )}
          {onHold.length > 0 && (
            <div className="tasks-section">
              <div className="tasks-section-title">⏸️ En attente ({onHold.length})</div>
              <div className={sectionListClass}>{onHold.map((t, idx) => <TaskTileCard key={t.id} {...taskTileProps} t={t} index={idx} />)}</div>
            </div>
          )}
          {validated.length > 0 && (
            <div className="tasks-section">
              <div className="tasks-section-title">✅ Validées</div>
              <div className={sectionListClass}>{validated.map((t, idx) => <TaskTileCard key={t.id} {...taskTileProps} t={t} index={idx} />)}</div>
            </div>
          )}
        </>
      ) : (
        <>
          {showStudentFilteredResults ? (
            <>
              <div className="tasks-section">
                <div className="tasks-section-title">
                  🔎 Résultats filtrés ({regularFiltered.length})
                </div>
                <div className={sectionListClass}>{regularFiltered.map((t, idx) => <TaskTileCard key={t.id} {...taskTileProps} t={t} index={idx} />)}</div>
              </div>
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
              {inProgressNotMine.length > 0 && (
              <div className="tasks-section">
                <div className="tasks-section-title">⚙️ En cours (déjà prises)</div>
                <div className={sectionListClass}>{inProgressNotMine.map((t, idx) => <TaskTileCard key={t.id} {...taskTileProps} t={t} index={idx} />)}</div>
              </div>
              )}
              {availableNotMine.length > 0 && (
            <div className="tasks-section">
              <div className="tasks-section-title">🔥 Tâches à faire</div>
              <div className={sectionListClass}>{availableNotMine.map((t, idx) => <TaskTileCard key={t.id} {...taskTileProps} t={t} index={idx} />)}</div>
            </div>
          )}
              {myProposals.length > 0 && (
              <div className="tasks-section">
                <div className="tasks-section-title">💡 Mes propositions ({myProposals.length})</div>
                <div className={sectionListClass}>{myProposals.map((t, idx) => <TaskTileCard key={t.id} {...taskTileProps} t={t} index={idx} />)}</div>
              </div>
              )}
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
              {doneNotMine.length > 0 && (
              <div className="tasks-section">
                <div className="tasks-section-title">⏳ En attente de validation</div>
                <div className={sectionListClass}>{doneNotMine.map((t, idx) => <TaskTileCard key={t.id} {...taskTileProps} t={t} index={idx} />)}</div>
              </div>
              )}
              {onHoldNotMine.length > 0 && (
              <div className="tasks-section">
                <div className="tasks-section-title">⏸️ En attente</div>
                <div className={sectionListClass}>{onHoldNotMine.map((t, idx) => <TaskTileCard key={t.id} {...taskTileProps} t={t} index={idx} />)}</div>
              </div>
              )}
              {recentlyValidatedForStudent.length > 0 && (
              <div className="tasks-section">
                <div className="tasks-section-title">✅ Récemment validées</div>
                <div className={sectionListClass}>{recentlyValidatedForStudent.map((t, idx) => <TaskTileCard key={t.id} {...taskTileProps} t={t} index={idx} />)}</div>
              </div>
              )}
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
