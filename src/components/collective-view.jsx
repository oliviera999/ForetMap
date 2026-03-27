import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api';
import { getRoleTerms } from '../utils/n3-terminology';
import { ContextComments } from './context-comments';

const MOBILE_BREAKPOINT = 768;

function taskMapId(task) {
  return task?.map_id_resolved || task?.map_id || task?.zone_map_id || task?.marker_map_id || null;
}

function canAssignOnTask(task, isSessionActive) {
  if (!isSessionActive) return false;
  if (!task) return false;
  if (task.status === 'validated' || task.status === 'done' || task.status === 'proposed') return false;
  const required = Math.max(1, Number(task.required_students || 1));
  const apiCount = Number(task.assigned_count);
  const assigned = Number.isFinite(apiCount) && apiCount >= 0
    ? apiCount
    : (Array.isArray(task.assignments) ? task.assignments.length : 0);
  return assigned < required;
}

function canUnassignOnTask(task) {
  if (!task) return false;
  return task.status !== 'validated' && task.status !== 'done';
}

function statusLabel(status) {
  if (status === 'available') return 'Disponible';
  if (status === 'in_progress') return 'En cours';
  if (status === 'done') return 'À valider';
  if (status === 'validated') return 'Validée';
  if (status === 'proposed') return 'Proposée';
  return status || 'Inconnu';
}

function sortByName(a, b) {
  const na = `${a?.first_name || ''} ${a?.last_name || ''}`.trim().toLowerCase();
  const nb = `${b?.first_name || ''} ${b?.last_name || ''}`.trim().toLowerCase();
  return na.localeCompare(nb, 'fr');
}

function CollectiveView({
  tasks = [],
  maps = [],
  taskProjects = [],
  activeMapId = 'foret',
  onRefresh,
  canManageSession = false,
  isWideLayout = false,
  isN3Affiliated = false,
}) {
  const roleTerms = getRoleTerms(isN3Affiliated);
  const [isMobileWidth, setIsMobileWidth] = useState(() => window.innerWidth < MOBILE_BREAKPOINT);
  const [students, setStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [loadingSession, setLoadingSession] = useState(false);
  const [loadingContextTasks, setLoadingContextTasks] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mutatingAssignments, setMutatingAssignments] = useState(false);
  const [toast, setToast] = useState('');
  const [query, setQuery] = useState('');
  const [contextType, setContextType] = useState('map');
  const [contextId, setContextId] = useState(activeMapId || 'foret');
  const [contextTasksSource, setContextTasksSource] = useState(() => (Array.isArray(tasks) ? tasks : []));
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [taskToAddId, setTaskToAddId] = useState('');
  const [studentToAddId, setStudentToAddId] = useState('');
  const [dragStudentId, setDragStudentId] = useState('');
  const [bulkStudentIds, setBulkStudentIds] = useState([]);
  const [bulkTaskIds, setBulkTaskIds] = useState([]);
  const [newTaskCandidates, setNewTaskCandidates] = useState([]);
  const [newStudentCandidates, setNewStudentCandidates] = useState([]);
  const [sessionState, setSessionState] = useState({
    session: { is_active: 0 },
    absent_student_ids: [],
    selected_task_ids: [],
    selected_student_ids: [],
  });
  const knownContextTaskIdsRef = useRef(new Set());
  const knownStudentIdsRef = useRef(new Set());
  const contextPromptPrimedRef = useRef(false);
  const studentsPromptPrimedRef = useRef(false);

  const projectById = useMemo(() => {
    const m = new Map();
    (taskProjects || []).forEach((p) => m.set(p.id, p));
    return m;
  }, [taskProjects]);

  const mapById = useMemo(() => {
    const m = new Map();
    (maps || []).forEach((map) => m.set(map.id, map));
    return m;
  }, [maps]);

  const contextOptions = useMemo(() => {
    if (contextType === 'project') {
      return (taskProjects || []).map((p) => ({ id: p.id, label: p.title }));
    }
    return (maps || []).map((m) => ({ id: m.id, label: m.label }));
  }, [contextType, maps, taskProjects]);

  useEffect(() => {
    const onResize = () => setIsMobileWidth(window.innerWidth < MOBILE_BREAKPOINT);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    setContextId((prev) => {
      if (contextType === 'map') return prev || activeMapId || contextOptions[0]?.id || '';
      return contextOptions.some((o) => o.id === prev) ? prev : (contextOptions[0]?.id || '');
    });
  }, [contextType, contextOptions, activeMapId]);

  useEffect(() => {
    setNewTaskCandidates([]);
    setNewStudentCandidates([]);
    setBulkStudentIds([]);
    setBulkTaskIds([]);
    knownContextTaskIdsRef.current = new Set();
    knownStudentIdsRef.current = new Set();
    contextPromptPrimedRef.current = false;
    studentsPromptPrimedRef.current = false;
  }, [contextType, contextId]);

  const loadStudents = useCallback(async () => {
    setLoadingStudents(true);
    try {
      const rows = await api('/api/stats/all');
      const list = Array.isArray(rows) ? rows.slice().sort(sortByName) : [];
      setStudents(list);
    } catch (err) {
      setToast(`Erreur chargement ${roleTerms.studentPlural} : ${err.message}`);
    } finally {
      setLoadingStudents(false);
    }
  }, [roleTerms.studentPlural]);

  const loadContextTasks = useCallback(async () => {
    if (!contextId || !canManageSession) {
      setContextTasksSource([]);
      return;
    }
    setLoadingContextTasks(true);
    try {
      const qs = new URLSearchParams();
      if (contextType === 'project') qs.set('project_id', contextId);
      else qs.set('map_id', contextId);
      const rows = await api(`/api/tasks?${qs.toString()}`);
      setContextTasksSource(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setContextTasksSource(Array.isArray(tasks) ? tasks : []);
      setToast(`Erreur chargement tâches contexte : ${err.message}`);
    } finally {
      setLoadingContextTasks(false);
    }
  }, [canManageSession, contextId, contextType, tasks]);

  const loadSession = useCallback(async () => {
    if (!contextId || !canManageSession) return;
    setLoadingSession(true);
    try {
      const qs = new URLSearchParams({ contextType, contextId });
      const data = await api(`/api/collective/session?${qs.toString()}`);
      setSessionState(data || {
        session: { is_active: 0 },
        absent_student_ids: [],
        selected_task_ids: [],
        selected_student_ids: [],
      });
    } catch (err) {
      setToast(`Erreur session collectif : ${err.message}`);
    } finally {
      setLoadingSession(false);
    }
  }, [canManageSession, contextId, contextType]);

  const getExpectedVersion = useCallback(() => {
    const version = Number(sessionState?.session?.version);
    return Number.isInteger(version) && version >= 0 ? version : 0;
  }, [sessionState]);

  const handleSessionConflict = useCallback(async (err) => {
    if (err?.status !== 409) return false;
    const current = err?.body?.current;
    if (current && current.session) {
      setSessionState(current);
    } else {
      await loadSession();
    }
    setToast('Session modifiée ailleurs, état rechargé. Recommence l’action.');
    return true;
  }, [loadSession]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    const onRealtime = (e) => {
      const domain = e?.detail?.domain;
      if (domain === 'students') {
        loadStudents();
        loadSession();
        return;
      }
      if (domain === 'collective') {
        loadSession();
        return;
      }
      if (domain === 'tasks' || domain === 'garden') {
        loadSession();
      }
    };
    window.addEventListener('foretmap_realtime', onRealtime);
    return () => window.removeEventListener('foretmap_realtime', onRealtime);
  }, [loadSession, loadStudents]);

  useEffect(() => {
    loadContextTasks();
  }, [loadContextTasks]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  const absentSet = useMemo(() => new Set(sessionState?.absent_student_ids || []), [sessionState]);
  const selectedTaskSet = useMemo(() => new Set(sessionState?.selected_task_ids || []), [sessionState]);
  const selectedStudentSet = useMemo(() => new Set(sessionState?.selected_student_ids || []), [sessionState]);
  const bulkStudentSet = useMemo(() => new Set(bulkStudentIds), [bulkStudentIds]);
  const bulkTaskSet = useMemo(() => new Set(bulkTaskIds), [bulkTaskIds]);
  const contextMapId = useMemo(() => {
    if (contextType === 'map') return contextId || activeMapId;
    const project = projectById.get(contextId);
    return project?.map_id || activeMapId;
  }, [activeMapId, contextId, contextType, projectById]);
  const contextMap = mapById.get(contextMapId) || null;

  const contextTasks = useMemo(() => {
    const list = Array.isArray(contextTasksSource) ? contextTasksSource : [];
    const filtered = list.filter((t) => {
      if (contextType === 'project') return t.project_id === contextId;
      const tMap = taskMapId(t);
      return tMap === contextId || tMap == null;
    });
    const order = { available: 0, in_progress: 1, done: 2, proposed: 3, validated: 4 };
    return filtered.slice().sort((a, b) => {
      const da = order[a.status] ?? 9;
      const db = order[b.status] ?? 9;
      if (da !== db) return da - db;
      return String(a.title || '').localeCompare(String(b.title || ''), 'fr');
    });
  }, [contextId, contextType, contextTasksSource]);
  const visibleTasks = useMemo(
    () => contextTasks.filter((t) => selectedTaskSet.has(t.id)),
    [contextTasks, selectedTaskSet]
  );
  const availableContextTasks = useMemo(
    () => contextTasks.filter((t) => !selectedTaskSet.has(t.id)),
    [contextTasks, selectedTaskSet]
  );

  const selectedStudents = useMemo(
    () => students.filter((s) => selectedStudentSet.has(s.id)).sort(sortByName),
    [students, selectedStudentSet]
  );
  const availableStudents = useMemo(
    () => students.filter((s) => !selectedStudentSet.has(s.id)).sort(sortByName),
    [students, selectedStudentSet]
  );
  const visibleSelectedStudents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return selectedStudents.filter((s) => {
      if (!q) return true;
      const label = `${s.first_name || ''} ${s.last_name || ''}`.toLowerCase();
      const pseudo = String(s.pseudo || '').toLowerCase();
      return label.includes(q) || pseudo.includes(q);
    });
  }, [query, selectedStudents]);
  const presentStudents = visibleSelectedStudents.filter((s) => !absentSet.has(s.id));
  const absentStudents = visibleSelectedStudents.filter((s) => absentSet.has(s.id));
  const selectedStudent = students.find((s) => s.id === selectedStudentId) || null;
  const allVisibleStudentIds = useMemo(
    () => visibleSelectedStudents.map((s) => s.id),
    [visibleSelectedStudents]
  );
  const allContextTaskIds = useMemo(
    () => contextTasks.map((t) => t.id),
    [contextTasks]
  );
  const allSessionTaskIds = useMemo(
    () => visibleTasks.map((t) => t.id),
    [visibleTasks]
  );

  useEffect(() => {
    const validIds = new Set(allVisibleStudentIds);
    setBulkStudentIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [allVisibleStudentIds]);

  useEffect(() => {
    const validIds = new Set(allContextTaskIds);
    setBulkTaskIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [allContextTaskIds]);

  const toggleBulkStudent = useCallback((studentId) => {
    if (!studentId) return;
    setBulkStudentIds((prev) => (
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId]
    ));
  }, []);

  const toggleBulkTask = useCallback((taskId) => {
    if (!taskId) return;
    setBulkTaskIds((prev) => (
      prev.includes(taskId)
        ? prev.filter((id) => id !== taskId)
        : [...prev, taskId]
    ));
  }, []);

  const selectAllVisibleStudents = useCallback(() => setBulkStudentIds(allVisibleStudentIds), [allVisibleStudentIds]);
  const clearBulkStudents = useCallback(() => setBulkStudentIds([]), []);
  const selectAllContextTasks = useCallback(() => setBulkTaskIds(allContextTaskIds), [allContextTaskIds]);
  const selectAllSessionTasks = useCallback(() => setBulkTaskIds(allSessionTaskIds), [allSessionTaskIds]);
  const clearBulkTasks = useCallback(() => setBulkTaskIds([]), []);

  const toggleSessionActive = async () => {
    if (!canManageSession || !contextId) return;
    setSaving(true);
    try {
      const data = await api('/api/collective/session', 'PUT', {
        contextType,
        contextId,
        isActive: !sessionState?.session?.is_active,
        expectedVersion: getExpectedVersion(),
      });
      setSessionState(data);
      setToast(data?.session?.is_active ? 'Vue collectif activée' : 'Vue collectif désactivée');
    } catch (err) {
      if (await handleSessionConflict(err)) return;
      setToast(`Erreur activation : ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const resetSession = async () => {
    if (!canManageSession || !contextId) return;
    setSaving(true);
    try {
      const data = await api('/api/collective/session/reset', 'POST', {
        contextType,
        contextId,
        expectedVersion: getExpectedVersion(),
      });
      setSessionState(data);
      setToast('Session collectif réinitialisée');
    } catch (err) {
      if (await handleSessionConflict(err)) return;
      setToast(`Erreur reset : ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const setStudentAbsent = async (studentId, absent) => {
    if (!canManageSession || !contextId || !studentId) return;
    setSaving(true);
    try {
      const data = await api('/api/collective/session/attendance', 'PUT', {
        contextType,
        contextId,
        studentId,
        absent,
        expectedVersion: getExpectedVersion(),
      });
      setSessionState(data);
      setToast(absent ? `${roleTerms.studentSingular} masqué(e) (absent)` : `${roleTerms.studentSingular} réintégré(e)`);
    } catch (err) {
      if (await handleSessionConflict(err)) return;
      setToast(`Erreur présence : ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const setTaskSelected = async (taskId, selected) => {
    if (!canManageSession || !contextId || !taskId) return;
    setSaving(true);
    try {
      const data = await api('/api/collective/session/tasks', 'PUT', {
        contextType,
        contextId,
        taskId,
        selected,
        expectedVersion: getExpectedVersion(),
      });
      setSessionState(data);
      setToast(selected ? 'Tâche ajoutée à la session' : 'Tâche retirée de la session');
    } catch (err) {
      if (await handleSessionConflict(err)) return;
      setToast(`Erreur sélection tâche : ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const setSessionStudentSelected = async (studentId, selected) => {
    if (!canManageSession || !contextId || !studentId) return;
    setSaving(true);
    try {
      const data = await api('/api/collective/session/students', 'PUT', {
        contextType,
        contextId,
        studentId,
        selected,
        expectedVersion: getExpectedVersion(),
      });
      setSessionState(data);
      setToast(selected ? `${roleTerms.studentSingular} ajouté(e) à la session` : `${roleTerms.studentSingular} retiré(e) de la session`);
    } catch (err) {
      if (await handleSessionConflict(err)) return;
      setToast(`Erreur sélection ${roleTerms.studentSingular} : ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const executeSequentialBulk = useCallback(async ({
    ids,
    endpoint,
    buildBody,
  }) => {
    let expectedVersion = getExpectedVersion();
    let nextState = null;
    let applied = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        nextState = await api(endpoint, 'PUT', {
          contextType,
          contextId,
          ...buildBody(id),
          expectedVersion,
        });
        expectedVersion = Number(nextState?.session?.version || expectedVersion);
        applied += 1;
      } catch (err) {
        if (await handleSessionConflict(err)) {
          return { conflicted: true, nextState, applied, failed };
        }
        failed += 1;
      }
    }
    return { conflicted: false, nextState, applied, failed };
  }, [contextId, contextType, getExpectedVersion, handleSessionConflict]);

  const applyBulkChange = useCallback(async ({
    ids,
    bulkEndpoint,
    bulkBody,
    fallbackEndpoint,
    fallbackBodyBuilder,
    doneLabel,
    clearSelection,
  }) => {
    if (!canManageSession || !contextId || ids.length === 0) return;
    setSaving(true);
    try {
      let data = null;
      let applied = 0;
      let failed = 0;
      let skipped = 0;
      try {
        data = await api(bulkEndpoint, 'PUT', {
          contextType,
          contextId,
          ...bulkBody,
          expectedVersion: getExpectedVersion(),
        });
        applied = Array.isArray(data?.bulk?.applied) ? data.bulk.applied.length : ids.length;
        failed = Array.isArray(data?.bulk?.invalid) ? data.bulk.invalid.length : 0;
        skipped = Array.isArray(data?.bulk?.not_selected) ? data.bulk.not_selected.length : 0;
      } catch (err) {
        const fallbackAllowed = (err?.status === 404 || err?.status === 405) && !err?.body?.error;
        if (!fallbackAllowed) throw err;
        const sequential = await executeSequentialBulk({
          ids,
          endpoint: fallbackEndpoint,
          buildBody: fallbackBodyBuilder,
        });
        if (sequential.conflicted) return;
        data = sequential.nextState;
        applied = sequential.applied;
        failed = sequential.failed;
      }
      if (data) setSessionState(data);
      const parts = [`${applied} ${doneLabel}`];
      if (skipped > 0) parts.push(`${skipped} ignoré(s)`);
      if (failed > 0) parts.push(`${failed} échec(s)`);
      setToast(parts.join(' - '));
      clearSelection?.();
    } catch (err) {
      if (await handleSessionConflict(err)) return;
      setToast(`Erreur action de masse : ${err.message}`);
    } finally {
      setSaving(false);
    }
  }, [
    canManageSession,
    contextId,
    contextType,
    executeSequentialBulk,
    getExpectedVersion,
    handleSessionConflict,
  ]);

  const bulkSetStudentsAbsent = async (absent) => {
    const ids = bulkStudentIds.filter((id) => selectedStudentSet.has(id));
    await applyBulkChange({
      ids,
      bulkEndpoint: '/api/collective/session/attendance/bulk',
      bulkBody: { studentIds: ids, absent },
      fallbackEndpoint: '/api/collective/session/attendance',
      fallbackBodyBuilder: (studentId) => ({ studentId, absent }),
      doneLabel: absent ? 'marqué(s) absent(s)' : 'réintégré(s)',
      clearSelection: clearBulkStudents,
    });
  };

  const bulkSetStudentsSelected = async (selected) => {
    const ids = bulkStudentIds;
    await applyBulkChange({
      ids,
      bulkEndpoint: '/api/collective/session/students/bulk',
      bulkBody: { studentIds: ids, selected },
      fallbackEndpoint: '/api/collective/session/students',
      fallbackBodyBuilder: (studentId) => ({ studentId, selected }),
      doneLabel: selected ? 'ajouté(s) à la session' : 'retiré(s) de la session',
      clearSelection: clearBulkStudents,
    });
  };

  const bulkSetTasksSelected = async (selected) => {
    const ids = bulkTaskIds;
    await applyBulkChange({
      ids,
      bulkEndpoint: '/api/collective/session/tasks/bulk',
      bulkBody: { taskIds: ids, selected },
      fallbackEndpoint: '/api/collective/session/tasks',
      fallbackBodyBuilder: (taskId) => ({ taskId, selected }),
      doneLabel: selected ? 'tâche(s) ajoutée(s)' : 'tâche(s) retirée(s)',
      clearSelection: clearBulkTasks,
    });
  };

  const assignStudentToTask = async (task, student) => {
    if (!task || !student || mutatingAssignments || saving) return;
    const isSessionActive = !!sessionState?.session?.is_active;
    if (!canAssignOnTask(task, isSessionActive)) {
      setToast('Cette tâche ne peut pas recevoir de nouvelle inscription.');
      return;
    }
    setMutatingAssignments(true);
    try {
      await api(`/api/tasks/${task.id}/assign`, 'POST', {
        firstName: student.first_name,
        lastName: student.last_name,
        studentId: student.id,
      });
      await onRefresh?.();
      await loadContextTasks();
      setToast(`${student.first_name} inscrit à "${task.title}"`);
    } catch (err) {
      setToast(`Erreur assignation : ${err.message}`);
    } finally {
      setMutatingAssignments(false);
    }
  };

  const unassignStudentFromTask = async (task, assignment) => {
    if (!task || !assignment || mutatingAssignments || saving) return;
    if (!canUnassignOnTask(task)) {
      setToast(`Impossible de retirer un(e) ${roleTerms.studentSingular} d’une tâche terminée/validée.`);
      return;
    }
    setMutatingAssignments(true);
    try {
      await api(`/api/tasks/${task.id}/unassign`, 'POST', {
        firstName: assignment.student_first_name,
        lastName: assignment.student_last_name,
        studentId: assignment.student_id || null,
      });
      await onRefresh?.();
      await loadContextTasks();
      setToast(`${assignment.student_first_name} retiré de "${task.title}"`);
    } catch (err) {
      setToast(`Erreur retrait : ${err.message}`);
    } finally {
      setMutatingAssignments(false);
    }
  };

  const onDropStudent = async (task, evt) => {
    evt.preventDefault();
    const droppedId = evt.dataTransfer?.getData('text/plain') || dragStudentId;
    setDragStudentId('');
    const student = students.find((s) => s.id === droppedId);
    if (!student) return;
    await assignStudentToTask(task, student);
  };

  useEffect(() => {
    const current = new Set(contextTasks.map((t) => t.id));
    if (!contextPromptPrimedRef.current) {
      knownContextTaskIdsRef.current = current;
      contextPromptPrimedRef.current = true;
      return;
    }
    const isSessionActive = !!sessionState?.session?.is_active;
    if (!isSessionActive) {
      setNewTaskCandidates([]);
      knownContextTaskIdsRef.current = current;
      return;
    }
    const newcomers = [...current].filter((id) => !knownContextTaskIdsRef.current.has(id) && !selectedTaskSet.has(id));
    if (newcomers.length) {
      setNewTaskCandidates((prev) => [...new Set([...prev, ...newcomers])]);
    }
    knownContextTaskIdsRef.current = current;
  }, [contextTasks, selectedTaskSet, sessionState?.session?.is_active]);

  useEffect(() => {
    const current = new Set(contextTasks.map((t) => t.id));
    setNewTaskCandidates((prev) => prev.filter((id) => current.has(id) && !selectedTaskSet.has(id)));
  }, [contextTasks, selectedTaskSet]);

  useEffect(() => {
    const current = new Set(students.map((s) => s.id));
    if (!studentsPromptPrimedRef.current) {
      knownStudentIdsRef.current = current;
      studentsPromptPrimedRef.current = true;
      return;
    }
    const isSessionActive = !!sessionState?.session?.is_active;
    if (!isSessionActive) {
      setNewStudentCandidates([]);
      knownStudentIdsRef.current = current;
      return;
    }
    const newcomers = [...current].filter((id) => !knownStudentIdsRef.current.has(id) && !selectedStudentSet.has(id));
    if (newcomers.length) {
      setNewStudentCandidates((prev) => [...new Set([...prev, ...newcomers])]);
    }
    knownStudentIdsRef.current = current;
  }, [students, selectedStudentSet, sessionState?.session?.is_active]);

  useEffect(() => {
    const current = new Set(students.map((s) => s.id));
    setNewStudentCandidates((prev) => prev.filter((id) => current.has(id) && !selectedStudentSet.has(id)));
  }, [students, selectedStudentSet]);

  const pushDetectedTasks = async () => {
    if (!canManageSession || !contextId || newTaskCandidates.length === 0) return;
    setSaving(true);
    try {
      let nextState = null;
      let expectedVersion = getExpectedVersion();
      for (const taskId of newTaskCandidates) {
        nextState = await api('/api/collective/session/tasks', 'PUT', {
          contextType,
          contextId,
          taskId,
          selected: true,
          expectedVersion,
        });
        expectedVersion = Number(nextState?.session?.version || expectedVersion);
      }
      if (nextState) setSessionState(nextState);
      setToast(`${newTaskCandidates.length} nouvelle(s) tâche(s) ajoutée(s) à la session`);
      setNewTaskCandidates([]);
    } catch (err) {
      if (await handleSessionConflict(err)) return;
      setToast(`Erreur sélection tâche : ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const pushDetectedStudents = async () => {
    if (!canManageSession || !contextId || newStudentCandidates.length === 0) return;
    setSaving(true);
    try {
      let nextState = null;
      let expectedVersion = getExpectedVersion();
      for (const studentId of newStudentCandidates) {
        nextState = await api('/api/collective/session/students', 'PUT', {
          contextType,
          contextId,
          studentId,
          selected: true,
          expectedVersion,
        });
        expectedVersion = Number(nextState?.session?.version || expectedVersion);
      }
      if (nextState) setSessionState(nextState);
      setToast(`${newStudentCandidates.length} nouvel(le)(s) ${roleTerms.studentPlural} ajouté(e)(s) à la session`);
      setNewStudentCandidates([]);
    } catch (err) {
      if (await handleSessionConflict(err)) return;
      setToast(`Erreur sélection ${roleTerms.studentSingular} : ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (isMobileWidth) {
    return (
      <div className="empty">
        <p>La vue collectif est disponible sur tablette ou ordinateur.</p>
      </div>
    );
  }

  return (
    <div className={`collective-view ${isWideLayout ? 'collective-view--wide' : ''}`}>
      <div className="collective-toolbar">
        <div className="collective-toolbar-group">
          <label>Contexte</label>
          <div className="row">
            <select value={contextType} onChange={(e) => setContextType(e.target.value)}>
              <option value="map">Carte</option>
              <option value="project">Projet</option>
            </select>
            <select value={contextId} onChange={(e) => setContextId(e.target.value)} disabled={!contextOptions.length}>
              {contextOptions.length === 0 && <option value="">Aucun élément</option>}
              {contextOptions.map((opt) => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
            </select>
          </div>
        </div>

        <div className="collective-toolbar-group collective-actions">
          <button className="btn btn-primary btn-sm" onClick={toggleSessionActive} disabled={saving || loadingSession || !canManageSession || !contextId}>
            {sessionState?.session?.is_active ? '⏸️ Désactiver' : '▶️ Activer'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={resetSession} disabled={saving || !canManageSession || !contextId}>
            Réinitialiser
          </button>
          <span className={`collective-status ${sessionState?.session?.is_active ? 'on' : 'off'}`}>
            {sessionState?.session?.is_active ? 'Session active' : 'Session inactive'}
          </span>
        </div>
      </div>

      <div className="collective-toolbar collective-selector-bar">
        <div className="collective-toolbar-group">
          <label>Ajouter une tâche à la session</label>
          <div className="row">
            <select value={taskToAddId} onChange={(e) => setTaskToAddId(e.target.value)}>
              <option value="">Choisir une tâche…</option>
              {availableContextTasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
            <button className="btn btn-secondary btn-sm" disabled={!taskToAddId || saving} onClick={() => {
              setTaskSelected(taskToAddId, true);
              setTaskToAddId('');
            }}>
              Pousser
            </button>
          </div>
        </div>

        <div className="collective-toolbar-group">
          <label>Ajouter un(e) {roleTerms.studentSingular} à la session</label>
          <div className="row">
            <select value={studentToAddId} onChange={(e) => setStudentToAddId(e.target.value)}>
              <option value="">Choisir un(e) {roleTerms.studentSingular}…</option>
              {availableStudents.map((s) => (
                <option key={s.id} value={s.id}>{`${s.first_name || ''} ${s.last_name || ''}`.trim()}</option>
              ))}
            </select>
            <button className="btn btn-secondary btn-sm" disabled={!studentToAddId || saving} onClick={() => {
              setSessionStudentSelected(studentToAddId, true);
              setStudentToAddId('');
            }}>
              Pousser
            </button>
          </div>
        </div>
      </div>

      {(newTaskCandidates.length > 0 || newStudentCandidates.length > 0) && sessionState?.session?.is_active ? (
        <div className="collective-toolbar collective-new-items">
          {newTaskCandidates.length > 0 && (
            <div className="collective-new-item">
              <span>{newTaskCandidates.length} nouvelle(s) tâche(s) détectée(s).</span>
              <button className="btn btn-secondary btn-sm" disabled={saving} onClick={pushDetectedTasks}>Ajouter</button>
              <button className="btn btn-ghost btn-sm" disabled={saving} onClick={() => setNewTaskCandidates([])}>Ignorer</button>
            </div>
          )}
          {newStudentCandidates.length > 0 && (
            <div className="collective-new-item">
              <span>{newStudentCandidates.length} nouveau/nouvelle {roleTerms.studentSingular} détecté(e).</span>
              <button className="btn btn-secondary btn-sm" disabled={saving} onClick={pushDetectedStudents}>Ajouter</button>
              <button className="btn btn-ghost btn-sm" disabled={saving} onClick={() => setNewStudentCandidates([])}>Ignorer</button>
            </div>
          )}
        </div>
      ) : null}

      {contextType === 'project' && contextId && (
        <div className="collective-toolbar">
          <ContextComments
            contextType="project"
            contextId={contextId}
            title="Commentaires du projet"
            placeholder="Partager une consigne pour ce projet..."
          />
        </div>
      )}

      <div className="collective-toolbar collective-bulk-bar" role="region" aria-label="Actions groupées">
        <div className="collective-toolbar-group">
          <label>{roleTerms.studentPlural.charAt(0).toUpperCase() + roleTerms.studentPlural.slice(1)} sélectionné(e)s : {bulkStudentIds.length}</label>
          <div className="row collective-bulk-actions">
            <button className="btn btn-ghost btn-sm" onClick={selectAllVisibleStudents} disabled={saving || allVisibleStudentIds.length === 0}>
              Tout (filtre)
            </button>
            <button className="btn btn-ghost btn-sm" onClick={clearBulkStudents} disabled={saving || bulkStudentIds.length === 0 || !canManageSession}>
              Aucun
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => bulkSetStudentsAbsent(true)} disabled={saving || bulkStudentIds.length === 0 || !canManageSession}>
              Absent
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => bulkSetStudentsAbsent(false)} disabled={saving || bulkStudentIds.length === 0 || !canManageSession}>
              Présent
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => bulkSetStudentsSelected(false)} disabled={saving || bulkStudentIds.length === 0 || !canManageSession}>
              Retirer session
            </button>
          </div>
        </div>
        <div className="collective-toolbar-group">
          <label>Tâches sélectionnées : {bulkTaskIds.length}</label>
          <div className="row collective-bulk-actions">
            <button className="btn btn-ghost btn-sm" onClick={selectAllContextTasks} disabled={saving || allContextTaskIds.length === 0 || !canManageSession}>
              Tout contexte
            </button>
            <button className="btn btn-ghost btn-sm" onClick={selectAllSessionTasks} disabled={saving || allSessionTaskIds.length === 0 || !canManageSession}>
              Tout session
            </button>
            <button className="btn btn-ghost btn-sm" onClick={clearBulkTasks} disabled={saving || bulkTaskIds.length === 0 || !canManageSession}>
              Aucun
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => bulkSetTasksSelected(true)} disabled={saving || bulkTaskIds.length === 0 || !canManageSession}>
              Ajouter session
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => bulkSetTasksSelected(false)} disabled={saving || bulkTaskIds.length === 0 || !canManageSession}>
              Retirer session
            </button>
          </div>
        </div>
      </div>

      <div className="collective-grid">
        <section className="collective-panel">
          <h3>Carte</h3>
          {contextMap ? (
            <div className="collective-map-stage">
              <img className="collective-map-img" src={contextMap.map_image_url} alt={`Carte ${contextMap.label}`} />
            </div>
          ) : (
            <div className="empty"><p>Carte introuvable pour ce contexte.</p></div>
          )}
          <p className="collective-help">
            Contexte actif: {contextType === 'map' ? 'Carte' : 'Projet'} - {contextOptions.find((o) => o.id === contextId)?.label || 'non défini'}
          </p>
        </section>

        <section className="collective-panel">
          <div className="collective-panel-head">
            <h3>Tâches du contexte ({contextTasks.length})</h3>
            {selectedStudent && (
              <span className="collective-selected">{roleTerms.studentSingular.charAt(0).toUpperCase() + roleTerms.studentSingular.slice(1)} sélectionné(e): {selectedStudent.first_name} {selectedStudent.last_name}</span>
            )}
          </div>
          <div className="collective-scroll">
            {loadingContextTasks && <p className="collective-muted">Chargement des tâches du contexte...</p>}
            {contextTasks.map((t) => {
              const apiCount = Number(t.assigned_count);
              const assigned = Number.isFinite(apiCount) && apiCount >= 0
                ? apiCount
                : (Array.isArray(t.assignments) ? t.assignments.length : 0);
              const slots = Math.max(0, Number(t.required_students || 1) - assigned);
              const isSessionActive = !!sessionState?.session?.is_active;
              const isInSession = selectedTaskSet.has(t.id);
              const canAssign = isInSession && canAssignOnTask(t, isSessionActive);
              const canUnassign = canUnassignOnTask(t);
              return (
                <article
                  key={t.id}
                  className={`collective-task-card ${canAssign ? '' : 'blocked'} ${isInSession ? '' : 'collective-task-card--out'}`}
                  onDragOver={(evt) => { if (canAssign) evt.preventDefault(); }}
                  onDrop={(evt) => { if (canAssign) onDropStudent(t, evt); }}
                >
                  <div className="collective-task-top">
                    <label className="collective-checkline">
                      <input
                        type="checkbox"
                        checked={bulkTaskSet.has(t.id)}
                        onChange={() => toggleBulkTask(t.id)}
                        aria-label={`Sélectionner la tâche ${t.title}`}
                      />
                      <strong>{t.title}</strong>
                    </label>
                    <div className="collective-task-top-right">
                      <span className={`collective-status-dot ${isInSession ? 'on' : 'off'}`}>
                        {isInSession ? 'Dans session' : 'Hors session'}
                      </span>
                      <span className="task-chip">{statusLabel(t.status)}</span>
                    </div>
                  </div>
                  <p className="collective-task-meta">{assigned}/{t.required_students || 1} inscrits - {slots} place(s) restante(s)</p>
                  <div className="assignees">
                    {(t.assignments || []).map((a, idx) => (
                      <span key={`${a.student_first_name}-${a.student_last_name}-${idx}`} className="assignee-tag collective-assignee">
                        {a.student_first_name} {a.student_last_name}
                        <button
                          className="collective-remove"
                          title="Retirer de la tâche"
                          disabled={!canUnassign || mutatingAssignments || saving}
                          onClick={() => unassignStudentFromTask(t, a)}
                        >×</button>
                      </span>
                    ))}
                    {(t.assignments || []).length === 0 && <span className="collective-muted">Aucun(e) {roleTerms.studentSingular} inscrit(e)</span>}
                  </div>
                  <div className="collective-task-actions">
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={!selectedStudent || !canAssign || mutatingAssignments || saving || !isInSession}
                      onClick={() => assignStudentToTask(t, selectedStudent)}
                    >
                      Inscrire le/la {roleTerms.studentSingular} sélectionné(e)
                    </button>
                    <span className="collective-drop-tip">
                      {canAssign ? `Dépose un(e) ${roleTerms.studentSingular} ici` : 'Inscription bloquée pour cette tâche'}
                    </span>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={saving || mutatingAssignments}
                      onClick={() => setTaskSelected(t.id, !isInSession)}
                    >
                      {isInSession ? 'Retirer de la session' : 'Ajouter à la session'}
                    </button>
                  </div>
                </article>
              );
            })}
            {contextTasks.length === 0 && <div className="empty"><p>Aucune tâche dans ce contexte.</p></div>}
          </div>
        </section>

        <section className="collective-panel">
          <div className="collective-panel-head">
            <h3>{roleTerms.studentPlural.charAt(0).toUpperCase() + roleTerms.studentPlural.slice(1)} ({students.length})</h3>
          </div>
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Rechercher un(e) ${roleTerms.studentSingular}...`}
          />
          {loadingStudents ? (
            <p className="collective-muted">Chargement des {roleTerms.studentPlural}...</p>
          ) : (
            <>
              <h4 className="collective-subtitle">Présents ({presentStudents.length})</h4>
              <div className="collective-scroll collective-students">
                {presentStudents.map((s) => (
                  <div
                    key={s.id}
                    className={`collective-student ${selectedStudentId === s.id ? 'selected' : ''}`}
                    draggable
                    onDragStart={(evt) => {
                      evt.dataTransfer.setData('text/plain', s.id);
                      setDragStudentId(s.id);
                    }}
                  >
                    <label className="collective-checkline">
                      <input
                        type="checkbox"
                        checked={bulkStudentSet.has(s.id)}
                        onChange={() => toggleBulkStudent(s.id)}
                        aria-label={`Sélectionner ${s.first_name} ${s.last_name}`}
                      />
                      <div className="collective-student-name">
                        {s.first_name} {s.last_name}
                        {s.pseudo ? ` (${s.pseudo})` : ''}
                      </div>
                    </label>
                    <div className="collective-student-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => setSelectedStudentId(s.id)}>Sélectionner</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setStudentAbsent(s.id, true)} disabled={saving}>Absent</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setSessionStudentSelected(s.id, false)} disabled={saving}>Retirer</button>
                    </div>
                  </div>
                ))}
                {presentStudents.length === 0 && <p className="collective-muted">Aucun(e) {roleTerms.studentSingular} présent(e) dans le filtre.</p>}
              </div>

              <h4 className="collective-subtitle">Absents ({absentStudents.length})</h4>
              <div className="collective-scroll collective-students collective-absent-list">
                {absentStudents.map((s) => (
                  <div key={s.id} className="collective-student absent">
                    <label className="collective-checkline">
                      <input
                        type="checkbox"
                        checked={bulkStudentSet.has(s.id)}
                        onChange={() => toggleBulkStudent(s.id)}
                        aria-label={`Sélectionner ${s.first_name} ${s.last_name}`}
                      />
                      <div className="collective-student-name">{s.first_name} {s.last_name}</div>
                    </label>
                    <div className="collective-student-actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => setStudentAbsent(s.id, false)} disabled={saving}>
                        Réintégrer
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setSessionStudentSelected(s.id, false)} disabled={saving}>Retirer</button>
                    </div>
                  </div>
                ))}
                {absentStudents.length === 0 && <p className="collective-muted">Aucun absent marqué.</p>}
              </div>
            </>
          )}
        </section>
      </div>

      {toast && <div className="collective-toast">{toast}</div>}
    </div>
  );
}

export { CollectiveView };
