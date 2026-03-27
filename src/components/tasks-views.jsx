import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { api, API, getAuthToken, AccountDeletedError } from '../services/api';
import { taskStatusIndicator, daysUntil, dueDateChip } from '../utils/badges';
import { getRoleTerms } from '../utils/n3-terminology';
import { useDialogA11y } from '../hooks/useDialogA11y';
import { useHelp } from '../hooks/useHelp';
import { Tooltip } from './Tooltip';
import { HelpPanel } from './HelpPanel';
import { ContextComments } from './context-comments';
import { HELP_PANELS, HELP_TOOLTIPS, resolveRoleText } from '../constants/help';

function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2400); return () => clearTimeout(t); }, []);
  return <div className="toast" role="status" aria-live="polite" aria-atomic="true">{msg}</div>;
}

function Lightbox({ src, caption, onClose }) {
  const el = React.useMemo(() => document.createElement('div'), []);
  const dialogRef = useDialogA11y(onClose);
  useEffect(() => {
    document.body.appendChild(el);
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.removeChild(el);
      document.body.style.overflow = '';
    };
  }, [el]);

  const content = (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.93)', zIndex: 99999,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 20 }}
      onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Aperçu image"
        tabIndex={-1}
        style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
        onClick={(e) => e.stopPropagation()}
      >
      <img src={src} onClick={e => e.stopPropagation()}
        style={{ maxWidth: '95vw', maxHeight: '85vh', borderRadius: 10,
          objectFit: 'contain', boxShadow: '0 8px 40px rgba(0,0,0,.5)',
          animation: 'popIn .25s var(--spring,cubic-bezier(.34,1.56,.64,1))' }}
        alt={caption || ''} />
      {caption && (
        <p style={{ color: 'rgba(255,255,255,.8)', marginTop: 12, fontSize: '.9rem',
          maxWidth: '80vw', textAlign: 'center' }}>{caption}</p>
      )}
      <button
        style={{ position: 'absolute', top: 16, right: 16,
          background: 'rgba(255,255,255,.15)', backdropFilter: 'blur(4px)',
          border: 'none', color: 'white', borderRadius: '50%',
          width: 40, height: 40, fontSize: '1.1rem', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        aria-label="Fermer l'aperçu"
        onClick={onClose}>✕</button>
      </div>
    </div>
  );

  return createPortal(content, el);
}

const var_alert = 'var(--alert)';

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Lecture du fichier impossible'));
    reader.readAsDataURL(file);
  });
}

function initialLocationIds(editTask, keyMulti, keySingle) {
  if (!editTask) return [];
  const multi = editTask[keyMulti];
  if (Array.isArray(multi) && multi.length) {
    return [...new Set(multi.map((id) => String(id || '').trim()).filter(Boolean))];
  }
  const one = editTask[keySingle];
  return one ? [String(one).trim()].filter(Boolean) : [];
}

function normalizeTutorialIds(ids) {
  if (!Array.isArray(ids)) return [];
  const unique = new Set();
  for (const raw of ids) {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) continue;
    unique.add(n);
  }
  return [...unique];
}

function TaskFormModal({
  zones,
  markers = [],
  maps = [],
  taskProjects = [],
  tutorials = [],
  students = [],
  activeMapId = 'foret',
  onClose,
  onSave,
  editTask,
  isDuplicate = false,
  isProposal = false,
  enableInitialAssignment = false,
  roleTerms = null,
}) {
  const dialogRef = useDialogA11y(onClose);
  const terms = roleTerms || getRoleTerms(false);
  const initialMapId = editTask
    ? (editTask.map_id_resolved || editTask.map_id || editTask.zone_map_id || editTask.marker_map_id || null)
    : activeMapId;
  const [form, setForm] = useState(editTask ? {
    title: isDuplicate ? `${editTask.title} (copie)` : editTask.title, description: editTask.description || '',
    map_id: initialMapId || '',
    zone_ids: initialLocationIds(editTask, 'zone_ids', 'zone_id'),
    marker_ids: initialLocationIds(editTask, 'marker_ids', 'marker_id'),
    tutorial_ids: normalizeTutorialIds(initialLocationIds(editTask, 'tutorial_ids', 'tutorial_id')),
    project_id: editTask.project_id || '',
    due_date: editTask.due_date || '',
    required_students: editTask.required_students || 1,
    recurrence: editTask.recurrence || '',
    assign_student_id: ''
  } : {
    title: '', description: '', map_id: initialMapId || '',
    zone_ids: [], marker_ids: [], tutorial_ids: [],
    project_id: '',
    due_date: '', required_students: 1, recurrence: '',
    assign_student_id: ''
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [tutorialSearch, setTutorialSearch] = useState('');

  const set = k => e => {
    const value = e.target.value;
    if (k === 'map_id') {
      setForm(f => {
        const next = { ...f, map_id: value };
        const selectedProject = taskProjects.find((p) => p.id === f.project_id);
        if (selectedProject && value && selectedProject.map_id !== value) {
          next.project_id = '';
        }
        if (value) {
          next.zone_ids = f.zone_ids.filter((id) => (
            zones.find((z) => String(z.id || '').trim() === String(id || '').trim())?.map_id === value
          ));
          next.marker_ids = f.marker_ids.filter((id) => (
            markers.find((m) => String(m.id || '').trim() === String(id || '').trim())?.map_id === value
          ));
        }
        return next;
      });
      return;
    }
    if (k === 'project_id') {
      setForm(f => {
        const next = { ...f, project_id: value };
        const selectedProject = taskProjects.find((p) => p.id === value);
        if (!selectedProject) return next;
        next.map_id = selectedProject.map_id;
        next.zone_ids = f.zone_ids.filter((id) => (
          zones.find((z) => String(z.id || '').trim() === String(id || '').trim())?.map_id === selectedProject.map_id
        ));
        next.marker_ids = f.marker_ids.filter((id) => (
          markers.find((m) => String(m.id || '').trim() === String(id || '').trim())?.map_id === selectedProject.map_id
        ));
        return next;
      });
      return;
    }
    setForm(f => ({ ...f, [k]: value }));
  };

  const toggleZoneId = (zoneId) => {
    const normalizedZoneId = String(zoneId || '').trim();
    if (!normalizedZoneId) return;
    setForm(f => {
      const has = f.zone_ids.includes(normalizedZoneId);
      const zoneIds = has
        ? f.zone_ids.filter((id) => id !== normalizedZoneId)
        : [...f.zone_ids, normalizedZoneId];
      const z = zones.find((zz) => String(zz.id || '').trim() === normalizedZoneId);
      return { ...f, zone_ids: zoneIds, map_id: z?.map_id && !f.map_id ? z.map_id : f.map_id };
    });
  };

  const toggleMarkerId = (markerId) => {
    const normalizedMarkerId = String(markerId || '').trim();
    if (!normalizedMarkerId) return;
    setForm(f => {
      const has = f.marker_ids.includes(normalizedMarkerId);
      const marker_ids = has
        ? f.marker_ids.filter((id) => id !== normalizedMarkerId)
        : [...f.marker_ids, normalizedMarkerId];
      const mk = markers.find((m) => String(m.id || '').trim() === normalizedMarkerId);
      return { ...f, marker_ids, map_id: mk?.map_id && !f.map_id ? mk.map_id : f.map_id };
    });
  };

  const toggleTutorialId = (tutorialId) => {
    const id = Number.parseInt(tutorialId, 10);
    if (!Number.isFinite(id) || id <= 0) return;
    setForm(f => {
      const tutorialIds = normalizeTutorialIds(f.tutorial_ids);
      const has = tutorialIds.includes(id);
      return {
        ...f,
        tutorial_ids: has ? tutorialIds.filter((x) => x !== id) : [...tutorialIds, id],
      };
    });
  };

  const submit = async () => {
    if (!form.title.trim()) return setErr('Le titre est requis');
    const mapFromLinks = () => {
      for (const id of form.zone_ids) {
        const z = zones.find((zz) => String(zz.id || '').trim() === String(id || '').trim());
        if (z?.map_id) return z.map_id;
      }
      for (const id of form.marker_ids) {
        const m = markers.find((mm) => String(mm.id || '').trim() === String(id || '').trim());
        if (m?.map_id) return m.map_id;
      }
      return form.map_id || null;
    };
    const payload = {
      title: form.title.trim(),
      description: form.description || '',
      map_id: form.map_id || null,
      zone_ids: [...new Set(form.zone_ids.map((id) => String(id || '').trim()).filter(Boolean))],
      marker_ids: [...new Set(form.marker_ids.map((id) => String(id || '').trim()).filter(Boolean))],
      tutorial_ids: normalizedTutorialIds,
      project_id: form.project_id || null,
      due_date: form.due_date || null,
      required_students: form.required_students,
      recurrence: form.recurrence || null,
      assign_student_id: form.assign_student_id || null,
    };
    if (!payload.map_id && (payload.zone_ids.length || payload.marker_ids.length)) {
      payload.map_id = mapFromLinks();
    }
    setSaving(true);
    try { await onSave(payload); onClose(); }
    catch (e) { setErr(e.message); setSaving(false); }
  };

  const selectableZones = zones.filter(z => !z.special && (!form.map_id || z.map_id === form.map_id));
  const selectableMarkers = markers.filter(m => !form.map_id || m.map_id === form.map_id);
  const selectableProjects = taskProjects.filter((p) => !form.map_id || p.map_id === form.map_id);
  const normalizedTutorialIds = useMemo(
    () => normalizeTutorialIds(form.tutorial_ids),
    [form.tutorial_ids]
  );
  const searchableTutorials = useMemo(
    () => [...tutorials].sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'fr')),
    [tutorials]
  );
  const filteredTutorials = useMemo(() => {
    const q = tutorialSearch.trim().toLowerCase();
    if (!q) return searchableTutorials;
    return searchableTutorials.filter((t) => String(t.title || '').toLowerCase().includes(q));
  }, [searchableTutorials, tutorialSearch]);

  const pickListStyle = {
    maxHeight: 168, overflowY: 'auto', border: '1px solid rgba(0,0,0,.08)', borderRadius: 10,
    padding: '6px 8px', background: 'var(--parchment, #faf8f3)',
  };
  const pickRow = { display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer' };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        className="modal fade-in"
        role="dialog"
        aria-modal="true"
        aria-label={isDuplicate ? 'Dupliquer la tâche' : editTask ? 'Modifier la tâche' : isProposal ? 'Proposer une tâche' : 'Nouvelle tâche'}
        tabIndex={-1}
      >
        <button className="modal-close" aria-label="Fermer la fenêtre" onClick={onClose}>✕</button>
        <h3>{isDuplicate ? 'Dupliquer la tâche' : editTask ? 'Modifier la tâche' : isProposal ? 'Proposer une tâche' : 'Nouvelle tâche'}</h3>
        {err && <p style={{ color: var_alert, marginBottom: 12, fontSize: '.85rem' }}>{err}</p>}
        <div className="field"><label>Titre *</label><input value={form.title} onChange={set('title')} placeholder="Ex: Arroser les tomates" /></div>
        <div className="field"><label>Description</label><textarea value={form.description} onChange={set('description')} rows={2} placeholder="Instructions détaillées..." /></div>
        <div className="row">
          <div className="field"><label>Carte</label>
            <select value={form.map_id} onChange={set('map_id')}>
              <option value="">🌐 Globale (toutes cartes)</option>
              {maps.map(mp => <option key={mp.id} value={mp.id}>{mp.label}</option>)}
            </select>
          </div>
        </div>
        {!isProposal && (
          <div className="field"><label>Projet (optionnel)</label>
            <select value={form.project_id} onChange={set('project_id')}>
              <option value="">Aucun projet</option>
              {selectableProjects.map((p) => <option key={p.id} value={p.id}>📁 {p.title}</option>)}
            </select>
          </div>
        )}
        <div className="field"><label>Zones (plusieurs possibles)</label>
          <div style={pickListStyle}>
            {selectableZones.length === 0
              ? <p style={{ fontSize: '.82rem', color: '#888', margin: 8 }}>Aucune zone pour cette carte.</p>
              : selectableZones.map(z => (
                <label key={z.id} style={pickRow}>
                  <input
                    type="checkbox"
                    checked={form.zone_ids.includes(String(z.id || '').trim())}
                    onChange={() => toggleZoneId(z.id)}
                  />
                  <span style={{ fontSize: '.88rem' }}>{z.name}{z.current_plant ? ` — ${z.current_plant}` : ''}</span>
                </label>
              ))}
          </div>
        </div>
        <div className="field"><label>Repères (plusieurs possibles)</label>
          <div style={pickListStyle}>
            {selectableMarkers.length === 0
              ? <p style={{ fontSize: '.82rem', color: '#888', margin: 8 }}>Aucun repère pour cette carte.</p>
              : selectableMarkers.map(m => (
                <label key={m.id} style={pickRow}>
                  <input
                    type="checkbox"
                    checked={form.marker_ids.includes(String(m.id || '').trim())}
                    onChange={() => toggleMarkerId(m.id)}
                  />
                  <span style={{ fontSize: '.88rem' }}>{m.emoji ? `${m.emoji} ` : ''}{m.label}</span>
                </label>
              ))}
          </div>
        </div>
        {!isProposal && (
          <div className="field"><label>Tutoriels associés (optionnel)</label>
            {tutorials.length > 0 && (
              <div style={{ display: 'grid', gap: 8, marginBottom: 8 }}>
                <input
                  value={tutorialSearch}
                  onChange={(e) => setTutorialSearch(e.target.value)}
                  placeholder="🔍 Rechercher un tutoriel..."
                />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '.8rem', color: '#666' }}>
                    {normalizedTutorialIds.length} sélectionné{normalizedTutorialIds.length > 1 ? 's' : ''}
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setForm((f) => ({ ...f, tutorial_ids: normalizeTutorialIds(tutorials.map((t) => t.id)) }))}
                    >
                      Tout sélectionner
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setForm((f) => ({ ...f, tutorial_ids: [] }))}
                    >
                      Effacer
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div style={pickListStyle}>
              {tutorials.length === 0
                ? <p style={{ fontSize: '.82rem', color: '#888', margin: 8 }}>Aucun tutoriel disponible.</p>
                : filteredTutorials.length === 0
                  ? <p style={{ fontSize: '.82rem', color: '#888', margin: 8 }}>Aucun tutoriel trouvé.</p>
                  : filteredTutorials.map(t => (
                  <label key={t.id} style={pickRow}>
                    <input
                      type="checkbox"
                      checked={normalizedTutorialIds.includes(Number.parseInt(t.id, 10))}
                      onChange={() => toggleTutorialId(t.id)}
                    />
                    <span style={{ fontSize: '.88rem' }}>📘 {t.title}</span>
                  </label>
                ))}
            </div>
          </div>
        )}
        <div className="row">
          <div className="field"><label>{terms.studentPlural.charAt(0).toUpperCase() + terms.studentPlural.slice(1)} requis</label>
            <input type="number" min="1" max="10" value={form.required_students} onChange={set('required_students')} />
          </div>
          <div className="field"><label>Date limite</label><input type="date" value={form.due_date} onChange={set('due_date')} /></div>
        </div>
        {enableInitialAssignment && !isProposal && !editTask && !isDuplicate && (
          <div className="field">
            <label>Attribuer dès la création (optionnel)</label>
            <select value={form.assign_student_id} onChange={set('assign_student_id')}>
              <option value="">Aucune attribution initiale</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{`${s.first_name || ''} ${s.last_name || ''}`.trim()}</option>
              ))}
            </select>
          </div>
        )}
        {!isProposal && (
          <div className="row">
            <div className="field"><label>Récurrence</label>
              <select value={form.recurrence || ''} onChange={set('recurrence')}>
                <option value="">Aucune (unique)</option>
                <option value="weekly">Hebdomadaire</option>
                <option value="biweekly">Toutes les 2 semaines</option>
                <option value="monthly">Mensuelle</option>
              </select>
            </div>
          </div>
        )}
        <button className="btn btn-primary btn-full" onClick={submit} disabled={saving}>
          {saving ? 'Sauvegarde...' : isDuplicate ? 'Créer la copie' : editTask ? 'Modifier' : isProposal ? 'Envoyer la proposition' : 'Créer la tâche'}
        </button>
      </div>
    </div>
  );
}

function TaskProjectFormModal({ maps = [], activeMapId = 'foret', onClose, onSave }) {
  const dialogRef = useDialogA11y(onClose);
  const [form, setForm] = useState({
    title: '',
    description: '',
    map_id: activeMapId || (maps[0]?.id || 'foret'),
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!form.title.trim()) return setErr('Le titre est requis');
    if (!form.map_id) return setErr('La carte est requise');
    setSaving(true);
    try {
      await onSave({
        title: form.title.trim(),
        description: form.description.trim() || null,
        map_id: form.map_id,
      });
      onClose();
    } catch (e) {
      setErr(e.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        className="modal fade-in"
        role="dialog"
        aria-modal="true"
        aria-label="Nouveau projet"
        tabIndex={-1}
      >
        <button className="modal-close" aria-label="Fermer la fenêtre" onClick={onClose}>✕</button>
        <h3>Nouveau projet</h3>
        {err && <p style={{ color: var_alert, marginBottom: 12, fontSize: '.85rem' }}>{err}</p>}
        <div className="field"><label>Titre *</label><input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Ex: Préparer la serre de printemps" /></div>
        <div className="field"><label>Description</label><textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} placeholder="Objectif du projet..." /></div>
        <div className="field"><label>Carte</label>
          <select value={form.map_id} onChange={(e) => setForm((f) => ({ ...f, map_id: e.target.value }))}>
            {maps.map((mp) => <option key={mp.id} value={mp.id}>{mp.label}</option>)}
          </select>
        </div>
        <button className="btn btn-primary btn-full" onClick={submit} disabled={saving}>
          {saving ? 'Création...' : 'Créer le projet'}
        </button>
      </div>
    </div>
  );
}

function taskHasZone(t, zoneId) {
  if (!zoneId) return true;
  const normalizedZoneId = String(zoneId || '').trim();
  if (!normalizedZoneId) return true;
  if ((t.zone_ids || []).some((id) => String(id || '').trim() === normalizedZoneId)) return true;
  return String(t.zone_id || '').trim() === normalizedZoneId;
}

function taskHasMarker(t, markerId) {
  if (!markerId) return true;
  const normalizedMarkerId = String(markerId || '').trim();
  if (!normalizedMarkerId) return true;
  if ((t.marker_ids || []).some((id) => String(id || '').trim() === normalizedMarkerId)) return true;
  return String(t.marker_id || '').trim() === normalizedMarkerId;
}

function taskHasLocation(t, locationFilterValue) {
  if (!locationFilterValue) return true;
  const [kind, rawId] = String(locationFilterValue).split(':');
  if (!rawId) return taskHasZone(t, locationFilterValue);
  if (kind === 'zone') return taskHasZone(t, rawId);
  if (kind === 'marker') return taskHasMarker(t, rawId);
  return true;
}

function proposalMetaFromDescription(description) {
  const raw = String(description || '');
  if (!raw) return { proposer: '', cleanedDescription: '' };
  const match = raw.match(/(?:^|\n)Proposition élève:\s*(.+)\s*$/m);
  const proposer = match?.[1]?.trim() || '';
  const cleanedDescription = raw
    .replace(/(?:^|\n)Proposition élève:\s*.+\s*$/m, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { proposer, cleanedDescription };
}

function formatAssigneeName(assignee, student, canViewIdentity = true) {
  const firstName = String(assignee?.student_first_name || '').trim();
  const lastName = String(assignee?.student_last_name || '').trim();
  if (!canViewIdentity) {
    const isCurrentStudent = !!student
      && (
        String(assignee?.student_id || '') === String(student?.id || '')
        || (
          firstName.toLowerCase() === String(student?.first_name || '').trim().toLowerCase()
          && lastName.toLowerCase() === String(student?.last_name || '').trim().toLowerCase()
        )
      );
    return { fullName: isCurrentStudent ? 'Toi' : 'Participant', isCurrentStudent };
  }
  const fullName = `${firstName} ${lastName}`.trim() || 'Élève';
  const isCurrentStudent = !!student
    && firstName.toLowerCase() === String(student.first_name || '').trim().toLowerCase()
    && lastName.toLowerCase() === String(student.last_name || '').trim().toLowerCase();
  return { fullName, isCurrentStudent };
}

function getAssignedCount(task) {
  const fromApi = Number(task?.assigned_count);
  if (Number.isFinite(fromApi) && fromApi >= 0) return fromApi;
  return Array.isArray(task?.assignments) ? task.assignments.length : 0;
}

function getAvailableSlots(task) {
  const required = Math.max(1, Number(task?.required_students || 1));
  return Math.max(0, required - getAssignedCount(task));
}

const TEACHER_STATUS_ACTIONS = [
  { value: 'available', label: 'À faire', icon: '🟢' },
  { value: 'in_progress', label: 'En cours', icon: '🟡' },
  { value: 'done', label: 'Terminée', icon: '✅' },
  { value: 'validated', label: 'Validée', icon: '✔️' },
  { value: 'proposed', label: 'Proposée', icon: '💡' },
];
const TASK_STATUS_FILTER_OPTIONS = [
  { value: 'available', label: 'À faire' },
  { value: 'in_progress', label: 'En cours' },
  { value: 'done', label: 'Terminée' },
  { value: 'validated', label: 'Validée' },
  { value: 'proposed', label: 'Proposée' },
];

function TasksView({ tasks, taskProjects = [], zones, markers = [], maps = [], tutorials = [], activeMapId = 'foret', isTeacher, student, canSelfAssignTasks = true, canViewOtherUsersIdentity = true, onRefresh, onForceLogout, isN3Affiliated = false, publicSettings = null }) {
  const roleTerms = getRoleTerms(isN3Affiliated);
  const [showForm, setShowForm] = useState(false);
  const [showProjectForm, setShowProjectForm] = useState(false);
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
  const [filterMap, setFilterMap] = useState('active');
  const [filterProject, setFilterProject] = useState('');
  const [viewMode, setViewMode] = useState(() => {
    try {
      const saved = localStorage.getItem('foretmap:tasks:viewMode');
      return saved === 'list' ? 'list' : 'tiles';
    } catch {
      return 'tiles';
    }
  });
  const [importFile, setImportFile] = useState(null);
  const [importDryRun, setImportDryRun] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState(null);
  const [teacherStudents, setTeacherStudents] = useState([]);
  const [selectedTeacherStudentId, setSelectedTeacherStudentId] = useState('');
  const [loadingTeacherStudents, setLoadingTeacherStudents] = useState(false);
  const confirmDialogRef = useDialogA11y(() => setConfirmTask(null));
  const { isHelpEnabled, hasSeenSection, markSectionSeen, trackPanelOpen, trackPanelDismiss } = useHelp({ publicSettings, isTeacher });
  const helpTasks = HELP_PANELS.tasks;
  const tooltipText = (entry) => resolveRoleText(entry, isTeacher);

  useEffect(() => {
    setFilterMap('active');
  }, [activeMapId]);
  useEffect(() => {
    try {
      localStorage.setItem('foretmap:tasks:viewMode', viewMode);
    } catch {
      // Ignore localStorage errors (mode privé, permissions, etc.)
    }
  }, [viewMode]);
  useEffect(() => {
    if (!isTeacher) return;
    let cancelled = false;
    const loadTeacherStudents = async () => {
      setLoadingTeacherStudents(true);
      try {
        const rows = await api('/api/stats/all');
        if (cancelled) return;
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
        if (!cancelled) setToast('Impossible de charger la liste des élèves : ' + e.message);
      } finally {
        if (!cancelled) setLoadingTeacherStudents(false);
      }
    };
    loadTeacherStudents();
    return () => {
      cancelled = true;
    };
  }, [isTeacher]);

  const mapLabelById = (mapId) => {
    if (!mapId) return 'Globale';
    const map = maps.find(m => m.id === mapId);
    return map ? map.label : mapId;
  };

  const taskEffectiveMapId = (task) => task.map_id_resolved || task.map_id || task.zone_map_id || task.marker_map_id || null;

  const withLoad = async (id, fn) => {
    setLoading(l => ({ ...l, [id]: true }));
    try { await fn(); await onRefresh(); }
    catch (e) {
      if (e instanceof AccountDeletedError) onForceLogout();
      else setToast('Erreur : ' + e.message);
    }
    setLoading(l => ({ ...l, [id]: false }));
  };

  const assign = t => withLoad(t.id + 'assign', async () => {
    await api(`/api/tasks/${t.id}/assign`, 'POST', {
      firstName: student.first_name, lastName: student.last_name, studentId: student.id
    });
    setToast('Tâche prise en charge ! ✓');
  });

  const unassign = t => {
    setConfirmTask({
      task: t,
      label: `Te retirer de "${t.title}" ?`,
      action: async () => {
        await withLoad(t.id + 'unassign', async () => {
          await api(`/api/tasks/${t.id}/unassign`, 'POST', {
            firstName: student.first_name, lastName: student.last_name, studentId: student.id
          });
          setToast('Tu t\'es retiré de la tâche.');
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
    setToast(`Statut mis à jour : ${TEACHER_STATUS_ACTIONS.find((s) => s.value === nextStatus)?.label || nextStatus}`);
  });

  const deleteTask = t => {
    setConfirmTask({
      task: t,
      label: `Supprimer "${t.title}" ?`,
      action: async () => {
        await withLoad(t.id + 'del', async () => {
          await api(`/api/tasks/${t.id}`, 'DELETE');
          setToast('Tâche supprimée');
        });
      }
    });
  };

  const saveTask = async form => {
    const { assign_student_id: assignStudentId, ...taskPayload } = form || {};
    if (editTask && !duplicateTask) {
      await api(`/api/tasks/${editTask.id}`, 'PUT', taskPayload);
      await onRefresh();
      return;
    }
    const created = await api('/api/tasks', 'POST', taskPayload);
    if (assignStudentId && created?.id) {
      const assignee = teacherStudents.find((s) => s.id === assignStudentId);
      if (assignee) {
        await api(`/api/tasks/${created.id}/assign`, 'POST', {
          firstName: assignee.first_name,
          lastName: assignee.last_name,
          studentId: assignee.id,
        });
        setToast(`Tâche créée et ${assignee.first_name} inscrit(e) ✓`);
      }
    }
    await onRefresh();
  };

  const proposeTask = async form => {
    await api('/api/tasks/proposals', 'POST', {
      ...form,
      firstName: student.first_name,
      lastName: student.last_name,
      studentId: student.id,
    });
    setToast(`Proposition envoyée au ${roleTerms.teacherSingular} ✓`);
    await onRefresh();
  };

  const createProject = async form => {
    await api('/api/task-projects', 'POST', form);
    setToast('Projet créé ✓');
    await onRefresh();
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
      setToast('Erreur modèle : ' + (e.message || 'inconnue'));
    }
  };

  const runImportTasksProjects = async () => {
    if (!importFile) {
      setToast('Choisis un fichier CSV ou XLSX.');
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
        setToast('Simulation import terminée ✓');
      } else {
        const createdProjects = Number(result?.report?.totals?.created_projects || 0);
        const createdTasks = Number(result?.report?.totals?.created_tasks || 0);
        setToast(`Import terminé : ${createdProjects} projet(s), ${createdTasks} tâche(s)`);
        await onRefresh();
      }
    } catch (e) {
      setToast('Erreur import : ' + (e.message || 'inconnue'));
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
    if (filterStatus && t.status !== filterStatus) return false;
    if (filterProject && t.project_id !== filterProject) return false;
    return true;
  });

  const allFiltered = applyFilters(tasks);
  const myTasks = allFiltered.filter(t => student && t.status !== 'validated' && t.assignments?.some(
    a => a.student_first_name === student.first_name && a.student_last_name === student.last_name
  ));
  const available = allFiltered.filter(t => t.status === 'available');
  const inProgress = allFiltered.filter(t => t.status === 'in_progress');
  const done = allFiltered.filter(t => t.status === 'done');
  const validated = allFiltered.filter(t => t.status === 'validated');
  const proposed = allFiltered.filter(t => t.status === 'proposed');
  const showStudentFilteredResults = !isTeacher && !!filterStatus;
  const availableNotMine = useMemo(
    () => available.filter((t) => !myTasks.some((m) => m.id === t.id)),
    [available, myTasks]
  );
  const recentlyValidatedForStudent = useMemo(
    () => allFiltered.filter((t) => t.status === 'validated' && t.assignments?.some(
      (a) => a.student_first_name === student?.first_name && a.student_last_name === student?.last_name
    )),
    [allFiltered, student?.first_name, student?.last_name]
  );

  const urgentTasks = !isTeacher ? allFiltered.filter(t => {
    if (t.status === 'validated' || t.status === 'done') return false;
    const d = daysUntil(t.due_date);
    return d !== null && d <= 3 && d >= -2;
  }).sort((a, b) => daysUntil(a.due_date) - daysUntil(b.due_date)) : [];

  const usedZoneIds = new Set();
  const usedMarkerIds = new Set();
  for (const t of allFiltered) {
    (t.zone_ids || []).forEach((id) => usedZoneIds.add(id));
    if (t.zone_id) usedZoneIds.add(t.zone_id);
    (t.marker_ids || []).forEach((id) => usedMarkerIds.add(id));
    if (t.marker_id) usedMarkerIds.add(t.marker_id);
  }
  const usedZones = [...usedZoneIds];
  const usedMarkers = [...usedMarkerIds];
  const sectionListClass = viewMode === 'tiles' ? 'tasks-grid' : 'tasks-list';
  const selectedTeacherStudent = useMemo(
    () => teacherStudents.find((s) => s.id === selectedTeacherStudentId) || null,
    [teacherStudents, selectedTeacherStudentId]
  );
  const canTeacherAssignOnTask = (task) => {
    if (!isTeacher || !selectedTeacherStudent) return false;
    if (!task || task.status === 'validated' || task.status === 'done' || task.status === 'proposed') return false;
    if (getAvailableSlots(task) <= 0) return false;
    return !(task.assignments || []).some((a) => (
      String(a.student_id || '') === String(selectedTeacherStudent.id || '')
      || (
        String(a.student_first_name || '').trim().toLowerCase() === String(selectedTeacherStudent.first_name || '').trim().toLowerCase()
        && String(a.student_last_name || '').trim().toLowerCase() === String(selectedTeacherStudent.last_name || '').trim().toLowerCase()
      )
    ));
  };
  const quickAssignHint = (task) => {
    if (!selectedTeacherStudent) return "Choisis d'abord un élève cible";
    if (!task) return "Tâche indisponible";
    if (task.status === 'proposed') return "Impossible d'affecter une tâche proposée";
    if (task.status === 'done' || task.status === 'validated') return "Tâche déjà terminée";
    if (getAvailableSlots(task) <= 0) return "Aucune place restante";
    if ((task.assignments || []).some((a) => (
      String(a.student_id || '') === String(selectedTeacherStudent.id || '')
      || (
        String(a.student_first_name || '').trim().toLowerCase() === String(selectedTeacherStudent.first_name || '').trim().toLowerCase()
        && String(a.student_last_name || '').trim().toLowerCase() === String(selectedTeacherStudent.last_name || '').trim().toLowerCase()
      )
    ))) return "Élève déjà inscrit sur cette tâche";
    return `Inscrire ${selectedTeacherStudent.first_name} ${selectedTeacherStudent.last_name}`;
  };
  const runTeacherQuickAssign = (task) => withLoad(`${task.id}assign_teacher_quick`, async () => {
    await api(`/api/tasks/${task.id}/assign`, 'POST', {
      firstName: selectedTeacherStudent.first_name,
      lastName: selectedTeacherStudent.last_name,
      studentId: selectedTeacherStudent.id,
    });
    setToast(`${selectedTeacherStudent.first_name} inscrit(e) à "${task.title}"`);
  });

  const TaskCard = ({ t, index = 0 }) => {
    const isMine = myTasks.some(m => m.id === t.id);
    const slots = getAvailableSlots(t);
    const proposalMeta = proposalMetaFromDescription(t.description);
    const cardDescription = t.status === 'proposed' ? proposalMeta.cleanedDescription : (t.description || '');
    const assignees = Array.isArray(t.assignments) ? t.assignments : [];
    const assigneeLabels = assignees.map((a) => formatAssigneeName(a, student, isTeacher || canViewOtherUsersIdentity));
    const canQuickAssign = canTeacherAssignOnTask(t);
    const quickAssignBusy = !!loading[`${t.id}assign_teacher_quick`];
    const quickAssignTitle = quickAssignHint(t);
    return (
      <div
        className={`task-card ${viewMode === 'tiles' ? 'task-card--tile' : ''} fade-in ${isMine ? 'mine' : ''} ${t.status === 'validated' ? 'done' : ''} ${t.status === 'proposed' ? 'proposed' : ''}`}
        style={{ animationDelay: `${Math.min(index * 60, 360)}ms`, cursor: canQuickAssign ? 'pointer' : undefined }}
        title={canQuickAssign ? quickAssignTitle : ''}
        onClick={(e) => {
          if (!canQuickAssign) return;
          if (e.target.closest('button, input, select, textarea, a, label')) return;
          runTeacherQuickAssign(t);
        }}
      >
        <div className="task-top">
          <div className="task-title-row">
            {taskStatusIndicator(t.status, isN3Affiliated)}
            <div className="task-title">{t.title}</div>
          </div>
        </div>
        <div className="task-meta">
          <span className="task-chip">{taskEffectiveMapId(t) ? `🗺️ ${mapLabelById(taskEffectiveMapId(t))}` : '🌐 Globale'}</span>
          {(t.zones_linked || []).map((z) => (
            <span key={z.id} className="task-chip">🌿 {z.name}</span>
          ))}
          {!((t.zones_linked || []).length) && t.zone_name && <span className="task-chip">🌿 {t.zone_name}</span>}
          {(t.markers_linked || []).map((m) => (
            <span key={m.id} className="task-chip">📍 {m.label}</span>
          ))}
          {!((t.markers_linked || []).length) && t.marker_label && <span className="task-chip">📍 {t.marker_label}</span>}
          {(t.tutorials_linked || []).map((tu) => (
            <span key={tu.id} className="task-chip">📘 {tu.title}</span>
          ))}
          {t.project_title && <span className="task-chip">📁 {t.project_title}</span>}
          {isTeacher && t.status === 'proposed' && proposalMeta.proposer && (
            <span className="task-chip proposal">🙋 Proposée par {proposalMeta.proposer}</span>
          )}
          {dueDateChip(t.due_date)}
          {!isTeacher && <span className="task-chip">👤 {t.required_students} {t.required_students > 1 ? roleTerms.studentPlural : roleTerms.studentSingular}</span>}
          {t.recurrence && <span className="task-chip">🔄 {t.recurrence === 'weekly' ? 'Hebdo' : t.recurrence === 'biweekly' ? 'Bi-hebdo' : t.recurrence === 'monthly' ? 'Mensuel' : t.recurrence}</span>}
        </div>
        <div className="task-assignees-overview">
          <span className="task-assignees-title">👥 Inscrits</span>
          <span className="task-assignees-list">
            {assigneeLabels.length > 0
              ? assigneeLabels.map((item, idx) => (
                <span key={`${item.fullName}-${idx}`} className={`task-assignee-inline ${item.isCurrentStudent ? 'me' : ''}`}>
                  {item.isCurrentStudent && item.fullName.toLowerCase() !== 'toi' ? `${item.fullName} (toi)` : item.fullName}
                </span>
              ))
              : <span className="task-assignee-inline empty">Personne pour le moment</span>}
          </span>
        </div>
        {cardDescription && <div className="task-desc">{cardDescription}</div>}
        {assignees.length > 0 && (
          <div className="assignees">
            {assignees.map((a, i) => {
              const item = formatAssigneeName(a, student, isTeacher || canViewOtherUsersIdentity);
              return (
                <span key={`${a.student_first_name}-${a.student_last_name}-${i}`} className={`assignee-tag ${item.isCurrentStudent ? 'me' : ''}`}>
                  {item.isCurrentStudent && item.fullName.toLowerCase() !== 'toi' ? `${item.fullName} (toi)` : item.fullName}
                </span>
              );
            })}
          </div>
        )}
        {slots > 0 && t.status !== 'validated' && (
          <div className="slots">{slots} place{slots > 1 ? 's' : ''} restante{slots > 1 ? 's' : ''}</div>
        )}
        <div className="task-actions">
          {!isTeacher && canSelfAssignTasks && !isMine && slots > 0 && t.status !== 'validated' && (
            <button className="btn btn-primary btn-sm" disabled={loading[t.id + 'assign']} onClick={() => assign(t)}>
              {loading[t.id + 'assign'] ? '...' : '✋ Je m\'en occupe'}
            </button>
          )}
          {!isTeacher && canSelfAssignTasks && isMine && (t.status === 'in_progress' || t.status === 'available') && (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => setLogTask(t)}>
                ✅ Marquer terminée
              </button>
              <button className="btn btn-ghost btn-sm" disabled={loading[t.id + 'unassign']}
                onClick={() => unassign(t)}
                title="Me retirer de cette tâche">
                {loading[t.id + 'unassign'] ? '...' : '↩️ Me retirer'}
              </button>
            </>
          )}
          {isTeacher && (
            <button
              className={`btn btn-sm ${canQuickAssign ? 'btn-primary' : 'btn-ghost'}`}
              disabled={!canQuickAssign || quickAssignBusy}
              onClick={() => runTeacherQuickAssign(t)}
              title={quickAssignTitle}
            >
              {quickAssignBusy ? '...' : '⚡ Affectation rapide'}
            </button>
          )}
          {isTeacher && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {TEACHER_STATUS_ACTIONS.map((opt) => {
                const isCurrent = t.status === opt.value;
                const isBusy = !!loading[`${t.id}status${opt.value}`];
                return (
                  <button
                    key={opt.value}
                    className={`btn btn-sm ${isCurrent ? 'btn-primary' : 'btn-ghost'}`}
                    disabled={isCurrent || isBusy}
                    onClick={() => setTaskStatus(t, opt.value)}
                    title={isCurrent ? `Statut actuel: ${opt.label}` : `Passer en ${opt.label.toLowerCase()}`}
                  >
                    {isBusy ? '...' : `${opt.icon} ${opt.label}`}
                  </button>
                );
              })}
            </div>
          )}
          {isTeacher && (t.status === 'done' || t.status === 'validated') && (
            <button className="btn btn-ghost btn-sm" onClick={() => setLogsTask(t)}>📋 Rapports</button>
          )}
          {isTeacher && (
            <>
              <Tooltip text={tooltipText(HELP_TOOLTIPS.tasks.edit)}>
                <button className="btn btn-ghost btn-sm" aria-label="Modifier la tâche" onClick={() => { setEditTask(t); setDuplicateTask(null); setShowForm(true); }}>✏️</button>
              </Tooltip>
              <Tooltip text={tooltipText(HELP_TOOLTIPS.tasks.duplicate)}>
                <button
                  className="btn btn-ghost btn-sm"
                  aria-label="Dupliquer la tâche"
                  onClick={() => { setDuplicateTask(t); setEditTask(null); setShowForm(true); }}
                >
                  📄
                </button>
              </Tooltip>
              <Tooltip text={tooltipText(HELP_TOOLTIPS.tasks.delete)}>
                <button className="btn btn-danger btn-sm" aria-label="Supprimer la tâche" disabled={loading[t.id + 'del']} onClick={() => deleteTask(t)}>🗑️</button>
              </Tooltip>
            </>
          )}
        </div>
        <ContextComments
          contextType="task"
          contextId={t.id}
          title="Commentaires de la tâche"
          placeholder="Partager une info utile sur cette tâche..."
        />
      </div>
    );
  };

  return (
    <div>
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
      {(showForm || editTask || duplicateTask || showProposalForm) && (
        <TaskFormModal
          zones={zones}
          markers={markers}
          maps={maps}
          taskProjects={taskProjects}
          tutorials={tutorials}
          students={teacherStudents}
          activeMapId={activeMapId}
          editTask={editTask || duplicateTask}
          isDuplicate={!!duplicateTask}
          isProposal={showProposalForm && !isTeacher}
          enableInitialAssignment={isTeacher}
          roleTerms={roleTerms}
          onClose={() => { setShowForm(false); setEditTask(null); setDuplicateTask(null); setShowProposalForm(false); }}
          onSave={showProposalForm && !isTeacher ? proposeTask : saveTask}
        />
      )}
      {showProjectForm && (
        <TaskProjectFormModal
          maps={maps}
          activeMapId={activeMapId}
          onClose={() => setShowProjectForm(false)}
          onSave={createProject}
        />
      )}
      {logTask && (
        <LogModal task={logTask} student={student}
          onClose={() => setLogTask(null)}
          onDone={async () => { await onRefresh(); setToast('Rapport envoyé ✓'); }}
          onForceLogout={onForceLogout}
        />
      )}
      {logsTask && <TaskLogsViewer task={logsTask} onClose={() => setLogsTask(null)} />}

      {confirmTask && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmTask(null)}>
          <div
            ref={confirmDialogRef}
            className="log-modal fade-in"
            style={{ paddingBottom: 'calc(20px + var(--safe-bottom))' }}
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Confirmation d'action"
            tabIndex={-1}
          >
            <h3 style={{ marginBottom: 8 }}>Confirmation</h3>
            <p style={{ fontSize: '.95rem', color: '#444', marginBottom: 20, lineHeight: 1.5 }}>{confirmTask.label}</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-danger" style={{ flex: 1 }} onClick={async () => {
                const a = confirmTask.action; setConfirmTask(null); await a();
              }}>Confirmer</button>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setConfirmTask(null)}>Annuler</button>
            </div>
          </div>
        </div>
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
                isPulsing={!hasSeenSection('tasks')}
                onMarkSeen={markSectionSeen}
                onOpen={trackPanelOpen}
                onDismiss={trackPanelDismiss}
              />
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => setShowProjectForm(true)}>+ Projet</button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>+ Nouvelle tâche</button>
            <select
              value={selectedTeacherStudentId}
              onChange={(e) => setSelectedTeacherStudentId(e.target.value)}
              disabled={loadingTeacherStudents}
              style={{ minWidth: 220 }}
              title="Élève cible pour attribution rapide"
            >
              <option value="">{loadingTeacherStudents ? 'Chargement élèves...' : 'Affectation rapide : choisir un élève'}</option>
              {teacherStudents.map((s) => (
                <option key={s.id} value={s.id}>{`${s.first_name || ''} ${s.last_name || ''}`.trim()}</option>
              ))}
            </select>
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
                isPulsing={!hasSeenSection('tasks')}
                onMarkSeen={markSectionSeen}
                onOpen={trackPanelOpen}
                onDismiss={trackPanelDismiss}
              />
            )}
            {canSelfAssignTasks && (
              <button className="btn btn-ghost btn-sm" onClick={() => setShowProposalForm(true)}>+ Proposer</button>
            )}
          </div>
        )}
      </div>
      <p className="section-sub">{isTeacher ? 'Gérer, valider et traiter les propositions' : (canSelfAssignTasks ? 'Prends en charge une tâche ou propose-en une nouvelle' : 'Consultation en lecture seule')}</p>
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
        </div>
        <select value={filterMap} onChange={e => setFilterMap(e.target.value)}>
          <option value="active">Carte active ({mapLabelById(activeMapId)})</option>
          <option value="all">Toutes cartes</option>
          {maps.map(mp => <option key={mp.id} value={mp.id}>{mp.label}</option>)}
        </select>
        <input value={filterText} onChange={e => setFilterText(e.target.value)}
          placeholder="🔍 Rechercher une tâche..." />
        <select value={filterZone} onChange={e => setFilterZone(e.target.value)}>
          <option value="">Toutes les zones</option>
          {usedZones.map(zId => {
            const z = zones.find(zz => zz.id === zId);
            return <option key={`zone:${zId}`} value={`zone:${zId}`}>🌿 {z ? z.name : zId}</option>;
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
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Tous les statuts</option>
          {TASK_STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

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

      {!isTeacher && myTasks.length > 0 && (
        <div className="tasks-section">
          <div className="tasks-section-title">Mes tâches</div>
          <div className={sectionListClass}>{myTasks.map((t, idx) => <TaskCard key={t.id} t={t} index={idx} />)}</div>
        </div>
      )}

      {isTeacher ? (
        <>
          {proposed.length > 0 && (
            <div className="tasks-section">
              <div className="tasks-section-title">Propositions {roleTerms.studentPlural} ({proposed.length})</div>
              <div className={sectionListClass}>{proposed.map((t, idx) => <TaskCard key={t.id} t={t} index={idx} />)}</div>
            </div>
          )}
          {done.length > 0 && (
            <div className="tasks-section">
              <div className="tasks-section-title">En attente de validation ({done.length})</div>
              <div className={sectionListClass}>{done.map((t, idx) => <TaskCard key={t.id} t={t} index={idx} />)}</div>
            </div>
          )}
          {inProgress.length > 0 && (
            <div className="tasks-section">
              <div className="tasks-section-title">En cours</div>
              <div className={sectionListClass}>{inProgress.map((t, idx) => <TaskCard key={t.id} t={t} index={idx} />)}</div>
            </div>
          )}
          {available.length > 0 && (
            <div className="tasks-section">
              <div className="tasks-section-title">À faire</div>
              <div className={sectionListClass}>{available.map((t, idx) => <TaskCard key={t.id} t={t} index={idx} />)}</div>
            </div>
          )}
          {validated.length > 0 && (
            <div className="tasks-section">
              <div className="tasks-section-title">Validées</div>
              <div className={sectionListClass}>{validated.map((t, idx) => <TaskCard key={t.id} t={t} index={idx} />)}</div>
            </div>
          )}
        </>
      ) : (
        <>
          {showStudentFilteredResults ? (
            <div className="tasks-section">
              <div className="tasks-section-title">
                Résultats filtrés ({allFiltered.length})
              </div>
              <div className={sectionListClass}>{allFiltered.map((t, idx) => <TaskCard key={t.id} t={t} index={idx} />)}</div>
            </div>
          ) : (
            <>
              {availableNotMine.length > 0 && (
            <div className="tasks-section">
              <div className="tasks-section-title">Tâches à faire</div>
              <div className={sectionListClass}>{availableNotMine.map((t, idx) => <TaskCard key={t.id} t={t} index={idx} />)}</div>
            </div>
          )}
              {recentlyValidatedForStudent.length > 0 && (
              <div className="tasks-section">
                <div className="tasks-section-title">Récemment validées ✓</div>
                <div className={sectionListClass}>{recentlyValidatedForStudent.map((t, idx) => <TaskCard key={t.id} t={t} index={idx} />)}</div>
              </div>
              )}
            </>
          )}
        </>
      )}

      {allFiltered.length === 0 && (
        <div className="empty"><div className="empty-icon">🌿</div><p>Aucune tâche pour le moment</p></div>
      )}
    </div>
  );
}

function LogModal({ task, student, onClose, onDone, onForceLogout }) {
  const dialogRef = useDialogA11y(onClose);
  const [comment, setComment] = useState('');
  const [imageData, setImageData] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const inputRef = useRef();

  const handleFile = e => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) return setErr('Image trop lourde (max 15MB)');

    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1200;
        let w = img.width, h = img.height;
        if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
        else if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL('image/jpeg', 0.72);
        setImageData(compressed);
        setPreview(compressed);
        setErr('');
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    setSaving(true);
    try {
      await api(`/api/tasks/${task.id}/done`, 'POST', {
        comment, imageData,
        firstName: student.first_name, lastName: student.last_name,
        studentId: student.id
      });
      onDone();
      onClose();
    } catch (e) {
      if (e instanceof AccountDeletedError) {
        onForceLogout?.();
        return;
      }
      setErr(e.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        className="log-modal fade-in"
        role="dialog"
        aria-modal="true"
        aria-label="Rapport de tâche"
        tabIndex={-1}
      >
        <button className="modal-close" aria-label="Fermer la fenêtre" onClick={onClose}>✕</button>
        <h3>📋 Rapport de tâche</h3>
        <p style={{ fontSize: '.85rem', color: '#777', marginBottom: 16 }}>
          <strong>{task.title}</strong> — laisse un commentaire ou une photo avant de valider
        </p>
        {err && <p style={{ color: 'var(--alert)', fontSize: '.82rem', marginBottom: 8 }}>{err}</p>}

        <div className="field">
          <label>Commentaire (optionnel)</label>
          <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3}
            placeholder="Comment ça s'est passé ? Des observations sur l'être vivant ?" />
        </div>

        <div className="field">
          <label>Photo (optionnel)</label>
          {!preview ? (
            <div className="img-upload-area" onClick={() => inputRef.current.click()}>
              <div style={{ fontSize: '2rem', marginBottom: 6 }}>📷</div>
              <div style={{ fontSize: '.85rem', color: '#888' }}>Touche pour prendre ou choisir une photo</div>
              <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={handleFile} />
            </div>
          ) : (
            <div className="img-preview-wrap">
              <img src={preview} className="img-preview" alt="preview" />
              <button className="img-remove" onClick={() => { setImageData(null); setPreview(null); }}>✕</button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={submit} disabled={saving}>
            {saving ? 'Envoi...' : '✅ Marquer comme terminée'}
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
        </div>
      </div>
    </div>
  );
}

function TaskLogsViewer({ task, onClose }) {
  const dialogRef = useDialogA11y(onClose);
  const [logs, setLogs] = useState([]);
  const [big, setBig] = useState(null);
  const [toast, setToast] = useState(null);

  const loadLogs = () => {
    api(`/api/tasks/${task.id}/logs`).then(setLogs).catch(err => {
      console.error('[ForetMap] logs tâche', err);
      setLogs([]);
    });
  };

  useEffect(() => { loadLogs(); }, [task.id]);

  const deleteLog = async (logId) => {
    try {
      await api(`/api/tasks/${task.id}/logs/${logId}`, 'DELETE');
      setToast('Rapport supprimé');
      loadLogs();
    } catch (e) { setToast('Erreur : ' + e.message); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      {big && <Lightbox src={big} caption="" onClose={() => setBig(null)} />}
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
      <div
        ref={dialogRef}
        className="log-modal fade-in"
        role="dialog"
        aria-modal="true"
        aria-label={`Rapports de la tâche ${task.title}`}
        tabIndex={-1}
      >
        <button className="modal-close" aria-label="Fermer la fenêtre" onClick={onClose}>✕</button>
        <h3>📋 Rapports — {task.title}</h3>
        {logs.length === 0
          ? <div className="empty"><div className="empty-icon">📭</div><p>Aucun rapport pour cette tâche</p></div>
          : logs.map(l => (
            <div key={l.id} className="log-entry fade-in">
              <div className="log-entry-header">
                <span className="log-entry-author">{l.student_first_name} {l.student_last_name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{new Date(l.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  <button className="btn btn-danger btn-sm" style={{ padding: '4px 8px', minHeight: 'auto', fontSize: '.72rem' }}
                    onClick={() => { if (confirm('Supprimer ce rapport ?')) deleteLog(l.id); }}
                    title="Supprimer ce rapport">🗑️</button>
                </div>
              </div>
              {l.comment && <div className="log-comment">{l.comment}</div>}
              {l.image_url && (
                <img src={l.image_url} className="log-image" alt="rapport" onClick={() => setBig(l.image_url)} />
              )}
            </div>
          ))
        }
      </div>
    </div>
  );
}

export { TaskFormModal, TasksView, LogModal, TaskLogsViewer };
