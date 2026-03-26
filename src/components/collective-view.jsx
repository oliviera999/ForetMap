import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';

const MOBILE_BREAKPOINT = 768;

function taskMapId(task) {
  return task?.map_id_resolved || task?.map_id || task?.zone_map_id || task?.marker_map_id || null;
}

function canAssignOnTask(task, isSessionActive) {
  if (!isSessionActive) return false;
  if (!task) return false;
  if (task.status === 'validated' || task.status === 'done' || task.status === 'proposed') return false;
  const required = Math.max(1, Number(task.required_students || 1));
  const assigned = Array.isArray(task.assignments) ? task.assignments.length : 0;
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
}) {
  const [isMobileWidth, setIsMobileWidth] = useState(() => window.innerWidth < MOBILE_BREAKPOINT);
  const [students, setStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [loadingSession, setLoadingSession] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [query, setQuery] = useState('');
  const [contextType, setContextType] = useState('map');
  const [contextId, setContextId] = useState(activeMapId || 'foret');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [dragStudentId, setDragStudentId] = useState('');
  const [sessionState, setSessionState] = useState({
    session: { is_active: 0 },
    absent_student_ids: [],
  });

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

  const loadStudents = useCallback(async () => {
    setLoadingStudents(true);
    try {
      const rows = await api('/api/stats/all');
      const list = Array.isArray(rows) ? rows.slice().sort(sortByName) : [];
      setStudents(list);
    } catch (err) {
      setToast(`Erreur chargement élèves : ${err.message}`);
    } finally {
      setLoadingStudents(false);
    }
  }, []);

  const loadSession = useCallback(async () => {
    if (!contextId || !canManageSession) return;
    setLoadingSession(true);
    try {
      const qs = new URLSearchParams({ contextType, contextId });
      const data = await api(`/api/collective/session?${qs.toString()}`);
      setSessionState(data || { session: { is_active: 0 }, absent_student_ids: [] });
    } catch (err) {
      setToast(`Erreur session collectif : ${err.message}`);
    } finally {
      setLoadingSession(false);
    }
  }, [canManageSession, contextId, contextType]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  const absentSet = useMemo(() => new Set(sessionState?.absent_student_ids || []), [sessionState]);
  const contextMapId = useMemo(() => {
    if (contextType === 'map') return contextId || activeMapId;
    const project = projectById.get(contextId);
    return project?.map_id || activeMapId;
  }, [activeMapId, contextId, contextType, projectById]);
  const contextMap = mapById.get(contextMapId) || null;

  const visibleTasks = useMemo(() => {
    const list = Array.isArray(tasks) ? tasks : [];
    const filtered = list.filter((t) => {
      if (contextType === 'project') return t.project_id === contextId;
      const tMap = taskMapId(t);
      return tMap === contextId || tMap == null;
    });
    const order = { available: 0, in_progress: 1, done: 2, proposed: 3, validated: 4 };
    return filtered.sort((a, b) => {
      const da = order[a.status] ?? 9;
      const db = order[b.status] ?? 9;
      if (da !== db) return da - db;
      return String(a.title || '').localeCompare(String(b.title || ''), 'fr');
    });
  }, [contextId, contextType, tasks]);

  const filteredStudents = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = students.filter((s) => {
      if (!q) return true;
      const label = `${s.first_name || ''} ${s.last_name || ''}`.toLowerCase();
      const pseudo = String(s.pseudo || '').toLowerCase();
      return label.includes(q) || pseudo.includes(q);
    });
    return list;
  }, [query, students]);

  const presentStudents = filteredStudents.filter((s) => !absentSet.has(s.id));
  const absentStudents = filteredStudents.filter((s) => absentSet.has(s.id));
  const selectedStudent = students.find((s) => s.id === selectedStudentId) || null;

  const toggleSessionActive = async () => {
    if (!canManageSession || !contextId) return;
    setSaving(true);
    try {
      const data = await api('/api/collective/session', 'PUT', {
        contextType,
        contextId,
        isActive: !sessionState?.session?.is_active,
      });
      setSessionState(data);
      setToast(data?.session?.is_active ? 'Vue collectif activée' : 'Vue collectif désactivée');
    } catch (err) {
      setToast(`Erreur activation : ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const resetSession = async () => {
    if (!canManageSession || !contextId) return;
    setSaving(true);
    try {
      const data = await api('/api/collective/session/reset', 'POST', { contextType, contextId });
      setSessionState(data);
      setToast('Session collectif réinitialisée');
    } catch (err) {
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
      });
      setSessionState(data);
      setToast(absent ? 'Élève masqué (absent)' : 'Élève réintégré');
    } catch (err) {
      setToast(`Erreur présence : ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const assignStudentToTask = async (task, student) => {
    if (!task || !student) return;
    const isSessionActive = !!sessionState?.session?.is_active;
    if (!canAssignOnTask(task, isSessionActive)) {
      setToast('Cette tâche ne peut pas recevoir de nouvelle inscription.');
      return;
    }
    try {
      await api(`/api/tasks/${task.id}/assign`, 'POST', {
        firstName: student.first_name,
        lastName: student.last_name,
      });
      await onRefresh?.();
      setToast(`${student.first_name} inscrit à "${task.title}"`);
    } catch (err) {
      setToast(`Erreur assignation : ${err.message}`);
    }
  };

  const unassignStudentFromTask = async (task, assignment) => {
    if (!task || !assignment) return;
    if (!canUnassignOnTask(task)) {
      setToast('Impossible de retirer un élève d’une tâche terminée/validée.');
      return;
    }
    try {
      await api(`/api/tasks/${task.id}/unassign`, 'POST', {
        firstName: assignment.student_first_name,
        lastName: assignment.student_last_name,
      });
      await onRefresh?.();
      setToast(`${assignment.student_first_name} retiré de "${task.title}"`);
    } catch (err) {
      setToast(`Erreur retrait : ${err.message}`);
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

  if (isMobileWidth) {
    return (
      <div className="empty">
        <p>La vue collectif est disponible sur tablette ou ordinateur.</p>
      </div>
    );
  }

  return (
    <div className="collective-view">
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
            <h3>Tâches ({visibleTasks.length})</h3>
            {selectedStudent && (
              <span className="collective-selected">Élève sélectionné: {selectedStudent.first_name} {selectedStudent.last_name}</span>
            )}
          </div>
          <div className="collective-scroll">
            {visibleTasks.map((t) => {
              const assigned = Array.isArray(t.assignments) ? t.assignments.length : 0;
              const slots = Math.max(0, Number(t.required_students || 1) - assigned);
              const isSessionActive = !!sessionState?.session?.is_active;
              const canAssign = canAssignOnTask(t, isSessionActive);
              const canUnassign = canUnassignOnTask(t);
              return (
                <article
                  key={t.id}
                  className={`collective-task-card ${canAssign ? '' : 'blocked'}`}
                  onDragOver={(evt) => { if (canAssign) evt.preventDefault(); }}
                  onDrop={(evt) => { if (canAssign) onDropStudent(t, evt); }}
                >
                  <div className="collective-task-top">
                    <strong>{t.title}</strong>
                    <span className="task-chip">{statusLabel(t.status)}</span>
                  </div>
                  <p className="collective-task-meta">{assigned}/{t.required_students || 1} inscrits - {slots} place(s) restante(s)</p>
                  <div className="assignees">
                    {(t.assignments || []).map((a, idx) => (
                      <span key={`${a.student_first_name}-${a.student_last_name}-${idx}`} className="assignee-tag collective-assignee">
                        {a.student_first_name} {a.student_last_name}
                        <button
                          className="collective-remove"
                          title="Retirer de la tâche"
                          disabled={!canUnassign}
                          onClick={() => unassignStudentFromTask(t, a)}
                        >×</button>
                      </span>
                    ))}
                    {(t.assignments || []).length === 0 && <span className="collective-muted">Aucun élève inscrit</span>}
                  </div>
                  <div className="collective-task-actions">
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={!selectedStudent || !canAssign}
                      onClick={() => assignStudentToTask(t, selectedStudent)}
                    >
                      Inscrire l'élève sélectionné
                    </button>
                    <span className="collective-drop-tip">
                      {canAssign ? 'Dépose un élève ici' : 'Inscription bloquée pour cette tâche'}
                    </span>
                  </div>
                </article>
              );
            })}
            {visibleTasks.length === 0 && <div className="empty"><p>Aucune tâche dans ce contexte.</p></div>}
          </div>
        </section>

        <section className="collective-panel">
          <div className="collective-panel-head">
            <h3>Élèves ({students.length})</h3>
          </div>
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un élève..."
          />
          {loadingStudents ? (
            <p className="collective-muted">Chargement des élèves...</p>
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
                    <div className="collective-student-name">
                      {s.first_name} {s.last_name}
                      {s.pseudo ? ` (${s.pseudo})` : ''}
                    </div>
                    <div className="collective-student-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => setSelectedStudentId(s.id)}>Sélectionner</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setStudentAbsent(s.id, true)} disabled={saving}>Absent</button>
                    </div>
                  </div>
                ))}
                {presentStudents.length === 0 && <p className="collective-muted">Aucun élève présent dans le filtre.</p>}
              </div>

              <h4 className="collective-subtitle">Absents ({absentStudents.length})</h4>
              <div className="collective-scroll collective-students collective-absent-list">
                {absentStudents.map((s) => (
                  <div key={s.id} className="collective-student absent">
                    <div className="collective-student-name">{s.first_name} {s.last_name}</div>
                    <button className="btn btn-secondary btn-sm" onClick={() => setStudentAbsent(s.id, false)} disabled={saving}>
                      Réintégrer
                    </button>
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
