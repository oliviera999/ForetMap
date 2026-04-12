import React, { useState, useEffect, useRef, useMemo, useId, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { api, API, getAuthToken, AccountDeletedError, withAppBase } from '../services/api';
import { compressImage, isLikelyImageFile } from '../utils/image';
import { taskStatusIndicator, daysUntil, dueDateChip, TaskDifficultyAndRiskChips, taskRequiresReferentBriefingBeforeStart } from '../utils/badges';
import { getRoleTerms } from '../utils/n3-terminology';
import { useDialogA11y } from '../hooks/useDialogA11y';
import { useOverlayHistoryBack } from '../hooks/useOverlayHistoryBack';
import { useHelp } from '../hooks/useHelp';
import { Tooltip } from './Tooltip';
import { HelpPanel } from './HelpPanel';
import { ContextComments } from './context-comments';
import { formatDateTimeFr } from '../utils/datetime-fr';
import { HELP_PANELS, HELP_TOOLTIPS, resolveRoleText } from '../constants/help';
import { TutorialPreviewModal, tutorialPreviewPayload, tutorialPreviewCanEmbed } from './TutorialPreviewModal';
import { fetchTutorialReadIds } from './TutorialReadAcknowledge';
import { lockBodyScroll } from '../utils/body-scroll-lock';
import { armNativeFilePickerGuard, disarmNativeFilePickerGuard } from '../utils/overlayHistory';
import { isStudentAssignedToTask } from '../utils/task-assignments';
import { orderedLivingBeingsForForm, nextLivingBeingsFromMultiSelect, formatLivingBeingsListLine } from '../utils/livingBeings';

function zonePickDisplayName(z) {
  const line = formatLivingBeingsListLine(
    orderedLivingBeingsForForm(z.living_beings_list || z.living_beings, z.current_plant),
  );
  return line ? `${z.name} — ${line}` : z.name;
}

function taskLivingBeingEmoji(plants, name) {
  const p = (plants || []).find((x) => x.name === name);
  return p?.emoji || '🌱';
}

const TASK_IMPORTANCE_SORT_WEIGHT = {
  not_important: 1,
  low: 2,
  medium: 3,
  high: 4,
  absolute: 5,
};

/** Même logique que GET /api/tasks : importance explicite d’abord (poids décroissant), puis sans importance, puis date limite. */
function compareTasksByImportanceThenDueDate(a, b) {
  const rawA = String(a?.importance_level || '').trim().toLowerCase();
  const rawB = String(b?.importance_level || '').trim().toLowerCase();
  const tierA = rawA && TASK_IMPORTANCE_SORT_WEIGHT[rawA] != null ? 0 : 1;
  const tierB = rawB && TASK_IMPORTANCE_SORT_WEIGHT[rawB] != null ? 0 : 1;
  if (tierA !== tierB) return tierA - tierB;
  if (tierA === 0) {
    const wA = TASK_IMPORTANCE_SORT_WEIGHT[rawA] || 0;
    const wB = TASK_IMPORTANCE_SORT_WEIGHT[rawB] || 0;
    if (wA !== wB) return wB - wA;
  }
  const da = String(a?.due_date || '');
  const db = String(b?.due_date || '');
  if (da !== db) return da.localeCompare(db);
  return String(a?.id || '').localeCompare(String(b?.id || ''));
}

function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2400); return () => clearTimeout(t); }, []);
  return <div className="toast" role="status" aria-live="polite" aria-atomic="true">{msg}</div>;
}

function taskLogCommentDraftKey(taskId) {
  return `foretmap:taskLogCommentDraft:${String(taskId ?? '')}`;
}

function readTaskLogCommentDraft(taskId) {
  if (typeof window === 'undefined') return '';
  try {
    return String(sessionStorage.getItem(taskLogCommentDraftKey(taskId)) || '');
  } catch {
    return '';
  }
}

function writeTaskLogCommentDraft(taskId, text) {
  if (typeof window === 'undefined') return;
  if (taskId == null || taskId === '') return;
  try {
    const key = taskLogCommentDraftKey(taskId);
    const v = String(text || '');
    if (v.trim()) sessionStorage.setItem(key, v);
    else sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function Lightbox({ src, caption, onClose }) {
  const el = React.useMemo(() => document.createElement('div'), []);
  const dialogRef = useDialogA11y(onClose);
  useOverlayHistoryBack(true, onClose);
  useEffect(() => {
    const releaseBodyScroll = lockBodyScroll();
    document.body.appendChild(el);
    return () => {
      try {
        if (document.body.contains(el)) document.body.removeChild(el);
      } finally {
        releaseBodyScroll();
      }
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

function normalizeDateOnly(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function currentLocalDateOnly() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isBeforeTaskStartDate(task) {
  const startDate = normalizeDateOnly(task?.start_date);
  if (!startDate) return false;
  return startDate > currentLocalDateOnly();
}

function startDateChip(startDate) {
  const normalized = normalizeDateOnly(startDate);
  if (!normalized) return null;
  const parsed = new Date(`${normalized}T00:00:00`);
  const label = Number.isNaN(parsed.getTime())
    ? normalized
    : parsed.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  return <span className="task-chip">🚦 Départ: {label}</span>;
}

function referentCandidateLabel(c) {
  const dn = String(c?.display_name || '').trim();
  if (dn) return dn;
  return `${String(c?.first_name || '').trim()} ${String(c?.last_name || '').trim()}`.trim() || String(c?.id || '');
}

function referentRoleHint(c, terms) {
  const slug = String(c?.primary_role_slug || '').toLowerCase();
  if (c?.user_type === 'teacher') {
    if (slug === 'admin') return 'Admin';
    if (slug === 'prof') return terms?.teacherSingular ? terms.teacherSingular : 'n3boss';
    return 'Équipe';
  }
  return terms?.studentSingular ? terms.studentSingular : 'n3beur';
}

function TaskFormModal({
  zones,
  markers = [],
  maps = [],
  taskProjects = [],
  tutorials = [],
  plants = [],
  referentCandidates = [],
  students = [],
  activeMapId = 'foret',
  onClose,
  onSave,
  editTask,
  isDuplicate = false,
  isProposal = false,
  enableInitialAssignment = false,
  roleTerms = null,
  /** Ouvre une nouvelle tâche avec ce projet déjà choisi (ex. projet en attente). */
  defaultProjectId = null,
}) {
  const dialogRef = useDialogA11y(onClose);
  // Pas de useOverlayHistoryBack ici : le retour caméra / fichier déclenche des popstate qui
  // dépilent l’entrée history de la surcouche et ferment la modale avant le `change` de l’input.
  const terms = roleTerms || getRoleTerms(false);
  const defaultProjectForNew = !editTask && !isProposal && defaultProjectId
    ? taskProjects.find((p) => String(p.id || '').trim() === String(defaultProjectId || '').trim())
    : null;
  const initialMapId = editTask
    ? (editTask.map_id_resolved || editTask.map_id || editTask.zone_map_id || editTask.marker_map_id || null)
    : (defaultProjectForNew?.map_id || activeMapId);
  const [form, setForm] = useState(editTask ? {
    title: isDuplicate ? `${editTask.title} (copie)` : editTask.title, description: editTask.description || '',
    map_id: initialMapId || '',
    zone_ids: initialLocationIds(editTask, 'zone_ids', 'zone_id'),
    marker_ids: initialLocationIds(editTask, 'marker_ids', 'marker_id'),
    tutorial_ids: normalizeTutorialIds(initialLocationIds(editTask, 'tutorial_ids', 'tutorial_id')),
    referent_user_ids: editTask && Array.isArray(editTask.referent_user_ids)
      ? [...new Set(editTask.referent_user_ids.map((id) => String(id || '').trim()).filter(Boolean))]
      : [],
    project_id: editTask.project_id || '',
    start_date: editTask.start_date || '',
    due_date: editTask.due_date || '',
    required_students: editTask.required_students || 1,
    completion_mode: getCompletionMode(editTask),
    danger_level: editTask.danger_level != null && editTask.danger_level !== '' ? editTask.danger_level : '',
    difficulty_level: editTask.difficulty_level != null && editTask.difficulty_level !== '' ? editTask.difficulty_level : '',
    importance_level: editTask.importance_level != null && editTask.importance_level !== '' ? editTask.importance_level : '',
    recurrence: editTask.recurrence || '',
    living_beings: orderedLivingBeingsForForm(editTask.living_beings_list || editTask.living_beings, ''),
    assign_student_ids: []
  } : {
    title: '', description: '', map_id: initialMapId || '',
    zone_ids: [], marker_ids: [], tutorial_ids: [], referent_user_ids: [], living_beings: [],
    project_id: defaultProjectForNew ? String(defaultProjectForNew.id) : '',
    start_date: '', due_date: '', required_students: 1, completion_mode: 'single_done', danger_level: '', difficulty_level: '', importance_level: '', recurrence: '',
    assign_student_ids: []
  });
  const [taskImageData, setTaskImageData] = useState(null);
  const [taskImagePreview, setTaskImagePreview] = useState(() => (
    editTask && !isDuplicate && editTask.image_url ? withAppBase(editTask.image_url) : null
  ));
  const [taskImageRemoved, setTaskImageRemoved] = useState(false);
  const [taskImageBusy, setTaskImageBusy] = useState(false);
  const taskImageGalleryInputRef = useRef(null);
  const taskImageCameraInputRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [tutorialSearch, setTutorialSearch] = useState('');
  const [referentSearch, setReferentSearch] = useState('');
  const [assignInitialSearch, setAssignInitialSearch] = useState('');

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

  const toggleReferentUserId = (userId) => {
    const id = String(userId || '').trim();
    if (!id) return;
    setForm((f) => {
      const cur = [...(f.referent_user_ids || [])];
      const has = cur.includes(id);
      return {
        ...f,
        referent_user_ids: has ? cur.filter((x) => x !== id) : [...cur, id],
      };
    });
  };

  const toggleAssignStudentId = (studentId) => {
    const id = String(studentId || '').trim();
    if (!id) return;
    setForm((f) => {
      const cur = [...new Set((f.assign_student_ids || []).map((x) => String(x || '').trim()).filter(Boolean))];
      const has = cur.includes(id);
      return {
        ...f,
        assign_student_ids: has ? cur.filter((x) => x !== id) : [...cur, id],
      };
    });
  };

  const hadInitialTaskImage = !!(editTask && !isDuplicate && editTask.image_url);

  const clearTaskImage = () => {
    setTaskImageData(null);
    setTaskImagePreview(null);
    setTaskImageRemoved(hadInitialTaskImage);
    if (taskImageGalleryInputRef.current) taskImageGalleryInputRef.current.value = '';
    if (taskImageCameraInputRef.current) taskImageCameraInputRef.current.value = '';
  };

  const onTaskImageFile = async (e) => {
    disarmNativeFilePickerGuard();
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!isLikelyImageFile(file)) {
      setErr('Format image invalide (image requise)');
      return;
    }
    setErr('');
    setTaskImageBusy(true);
    try {
      const compressed = await compressImage(file, 1600, 0.82);
      const payload = String(compressed || '').split(',')[1] || '';
      const padding = payload.endsWith('==') ? 2 : (payload.endsWith('=') ? 1 : 0);
      const approxBytes = Math.floor((payload.length * 3) / 4) - padding;
      if (approxBytes > 3 * 1024 * 1024) {
        setErr('Image trop lourde après compression (max 3 Mo)');
        return;
      }
      setTaskImageData(compressed);
      setTaskImagePreview(compressed);
      setTaskImageRemoved(false);
    } catch (errImg) {
      setErr(errImg?.message || 'Image invalide');
    } finally {
      setTaskImageBusy(false);
    }
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
    const normalizedReferentIds = [...new Set((form.referent_user_ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
    const payload = {
      title: form.title.trim(),
      description: form.description || '',
      map_id: form.map_id || null,
      zone_ids: [...new Set(form.zone_ids.map((id) => String(id || '').trim()).filter(Boolean))],
      marker_ids: [...new Set(form.marker_ids.map((id) => String(id || '').trim()).filter(Boolean))],
      tutorial_ids: normalizedTutorialIds,
      referent_user_ids: normalizedReferentIds,
      project_id: form.project_id || null,
      start_date: form.start_date || null,
      due_date: form.due_date || null,
      required_students: form.required_students,
      completion_mode: form.completion_mode || 'single_done',
      danger_level: form.danger_level ? form.danger_level : null,
      difficulty_level: form.difficulty_level ? form.difficulty_level : null,
      importance_level: form.importance_level ? form.importance_level : null,
      recurrence: form.recurrence || null,
      living_beings: [...new Set((form.living_beings || []).map((n) => String(n || '').trim()).filter(Boolean))],
      assign_student_ids: [...new Set((form.assign_student_ids || []).map((id) => String(id || '').trim()).filter(Boolean))],
    };
    if (!payload.map_id && (payload.zone_ids.length || payload.marker_ids.length)) {
      payload.map_id = mapFromLinks();
    }
    if (taskImageData) payload.imageData = taskImageData;
    else if (editTask && !isDuplicate && taskImageRemoved) payload.remove_task_image = true;
    setSaving(true);
    try { await onSave(payload); onClose(); }
    catch (e) { setErr(e.message); setSaving(false); }
  };

  const selectableZones = zones.filter(z => !z.special && (!form.map_id || z.map_id === form.map_id));
  const selectableMarkers = markers.filter(m => !form.map_id || m.map_id === form.map_id);
  /** Inclut le projet déjà lié même s’il est hors filtre carte / absent de la liste chargée (évite d’envoyer project_id null par erreur). */
  const selectableProjects = useMemo(() => {
    const byMap = taskProjects.filter((p) => !form.map_id || p.map_id === form.map_id);
    if (isProposal || !editTask?.project_id) return byMap;
    const pid = String(editTask.project_id).trim();
    if (!pid) return byMap;
    if (byMap.some((p) => String(p.id) === pid)) return byMap;
    const found = taskProjects.find((p) => String(p.id) === pid);
    if (found) return [found, ...byMap];
    const stub = {
      id: pid,
      title: editTask.project_title || 'Projet lié',
      map_id: editTask.project_map_id || '',
      status: editTask.project_status,
    };
    return [stub, ...byMap];
  }, [
    taskProjects,
    form.map_id,
    editTask?.project_id,
    editTask?.project_title,
    editTask?.project_map_id,
    editTask?.project_status,
    isProposal,
  ]);
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

  const teacherReferentCandidates = useMemo(
    () => referentCandidates.filter((c) => c.user_type === 'teacher'),
    [referentCandidates]
  );
  const studentReferentCandidates = useMemo(
    () => referentCandidates.filter((c) => c.user_type === 'student'),
    [referentCandidates]
  );
  const filteredTeacherReferents = useMemo(() => {
    const q = referentSearch.trim().toLowerCase();
    if (!q) return teacherReferentCandidates;
    return teacherReferentCandidates.filter((c) => referentCandidateLabel(c).toLowerCase().includes(q));
  }, [teacherReferentCandidates, referentSearch]);
  const filteredStudentReferents = useMemo(() => {
    const q = referentSearch.trim().toLowerCase();
    if (!q) return studentReferentCandidates;
    return studentReferentCandidates.filter((c) => referentCandidateLabel(c).toLowerCase().includes(q));
  }, [studentReferentCandidates, referentSearch]);
  const selectedReferentCount = useMemo(
    () => [...new Set((form.referent_user_ids || []).map((id) => String(id || '').trim()).filter(Boolean))].length,
    [form.referent_user_ids]
  );
  const normalizedAssignStudentIds = useMemo(
    () => [...new Set((form.assign_student_ids || []).map((id) => String(id || '').trim()).filter(Boolean))],
    [form.assign_student_ids]
  );
  const searchableStudentsForAssign = useMemo(
    () => [...students].sort((a, b) => {
      const na = `${a.first_name || ''} ${a.last_name || ''}`.trim().toLocaleLowerCase('fr');
      const nb = `${b.first_name || ''} ${b.last_name || ''}`.trim().toLocaleLowerCase('fr');
      return na.localeCompare(nb, 'fr');
    }),
    [students]
  );
  const filteredStudentsForAssign = useMemo(() => {
    const q = assignInitialSearch.trim().toLowerCase();
    if (!q) return searchableStudentsForAssign;
    return searchableStudentsForAssign.filter((s) => {
      const label = `${s.first_name || ''} ${s.last_name || ''}`.trim().toLowerCase();
      return label.includes(q);
    });
  }, [searchableStudentsForAssign, assignInitialSearch]);

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
        <div className="field">
          <label>Photo illustrative (optionnel)</label>
          <p style={{ fontSize: '.8rem', color: '#555', margin: '0 0 8px', lineHeight: 1.45 }}>
            Depuis la galerie ou l’appareil photo : lieu, outil, plante… (JPEG/PNG/WebP, compressée à l’envoi)
          </p>
          {!taskImagePreview ? (
            <div
              className={`img-upload-area img-upload-area--split${taskImageBusy ? ' is-busy' : ''}`}
              role="group"
              aria-label="Photo illustrative : galerie ou appareil photo"
              style={taskImageBusy ? { opacity: 0.7, pointerEvents: 'none' } : undefined}
            >
              <div style={{ fontSize: '2rem', marginBottom: 6 }}>📷</div>
              <div style={{ fontSize: '.85rem', color: '#888', marginBottom: 10 }}>
                {taskImageBusy ? 'Traitement…' : 'Galerie ou appareil photo'}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={taskImageBusy}
                  onClick={() => {
                    if (taskImageBusy) return;
                    if (taskImageGalleryInputRef.current) taskImageGalleryInputRef.current.value = '';
                    armNativeFilePickerGuard();
                    taskImageGalleryInputRef.current?.click();
                  }}
                >
                  📁 Choisir une photo
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={taskImageBusy}
                  onClick={() => {
                    if (taskImageBusy) return;
                    if (taskImageCameraInputRef.current) taskImageCameraInputRef.current.value = '';
                    armNativeFilePickerGuard();
                    taskImageCameraInputRef.current?.click();
                  }}
                >
                  📸 Prendre une photo
                </button>
              </div>
              <input
                ref={taskImageGalleryInputRef}
                type="file"
                accept="image/*"
                onChange={onTaskImageFile}
              />
              <input
                ref={taskImageCameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={onTaskImageFile}
              />
            </div>
          ) : (
            <div className="img-preview-wrap">
              <img src={taskImagePreview} className="img-preview" alt="Aperçu photo tâche" />
              <button type="button" className="img-remove" onClick={clearTaskImage} aria-label="Retirer la photo">✕</button>
            </div>
          )}
        </div>
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
              {selectableProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  📁 {p.title}{p.status === 'on_hold' ? ' (en attente)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field"><label>Zones et repères (plusieurs possibles)</label>
          <div className="task-form-pick-list">
            {selectableZones.length === 0 && selectableMarkers.length === 0 ? (
              <p className="task-form-pick-empty">Aucune zone ni repère pour cette carte.</p>
            ) : (
              <>
                {selectableZones.length > 0 && (
                  <>
                    {selectableMarkers.length > 0 && (
                      <div className="task-form-pick-subheading" aria-hidden="true">Zones</div>
                    )}
                    {selectableZones.map((z) => (
                      <label key={z.id} className="task-form-pick-item">
                        <input
                          type="checkbox"
                          className="task-form-pick-checkbox"
                          checked={form.zone_ids.includes(String(z.id || '').trim())}
                          onChange={() => toggleZoneId(z.id)}
                        />
                        <span className="task-form-pick-text">{zonePickDisplayName(z)}</span>
                      </label>
                    ))}
                  </>
                )}
                {selectableMarkers.length > 0 && (
                  <>
                    {selectableZones.length > 0 && (
                      <div className="task-form-pick-subheading" aria-hidden="true">Repères</div>
                    )}
                    {selectableMarkers.map((m) => (
                      <label key={m.id} className="task-form-pick-item">
                        <input
                          type="checkbox"
                          className="task-form-pick-checkbox"
                          checked={form.marker_ids.includes(String(m.id || '').trim())}
                          onChange={() => toggleMarkerId(m.id)}
                        />
                        <span className="task-form-pick-text">{m.emoji ? `${m.emoji} ` : '📍 '}{m.label}</span>
                      </label>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>
        <div className="field">
          <label>Êtres vivants (biodiversité)</label>
          <p style={{ fontSize: '.74rem', color: '#64748b', margin: '0 0 6px', lineHeight: 1.4 }}>
            Optionnel — comme pour les zones et les repères. Ctrl / Cmd + clic pour en choisir plusieurs.
          </p>
          {plants.length === 0 ? (
            <p className="task-form-pick-empty">Catalogue biodiversité indisponible ici.</p>
          ) : (
            <select
              multiple
              size={Math.min(8, Math.max(4, plants.length + 1))}
              value={form.living_beings}
              onChange={(e) => {
                const picked = Array.from(e.target.selectedOptions).map((opt) => opt.value);
                setForm((f) => ({
                  ...f,
                  living_beings: nextLivingBeingsFromMultiSelect(f.living_beings, picked, plants),
                }));
              }}
            >
              {plants.map((p) => (
                <option key={p.id} value={p.name}>{p.emoji} {p.name}</option>
              ))}
            </select>
          )}
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
            <div className="task-form-pick-list">
              {tutorials.length === 0
                ? <p className="task-form-pick-empty">Aucun tutoriel disponible.</p>
                : filteredTutorials.length === 0
                  ? <p className="task-form-pick-empty">Aucun tutoriel trouvé.</p>
                  : filteredTutorials.map(t => (
                  <label key={t.id} className="task-form-pick-item">
                    <input
                      type="checkbox"
                      className="task-form-pick-checkbox"
                      checked={normalizedTutorialIds.includes(Number.parseInt(t.id, 10))}
                      onChange={() => toggleTutorialId(t.id)}
                    />
                    <span className="task-form-pick-text">📘 {t.title}</span>
                  </label>
                ))}
            </div>
          </div>
        )}
        {!isProposal && (
          <div className="field">
            <label>Référents (optionnel)</label>
            <p style={{ fontSize: '.8rem', color: '#555', margin: '0 0 8px', lineHeight: 1.45 }}>
              Elles figurent sur la fiche : les {terms.studentPlural} savent vers qui se tourner en cas de question.
            </p>
            {referentCandidates.length > 0 && (
              <div style={{ display: 'grid', gap: 8, marginBottom: 8 }}>
                <input
                  value={referentSearch}
                  onChange={(e) => setReferentSearch(e.target.value)}
                  placeholder="🔍 Filtrer par nom…"
                />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '.8rem', color: '#666' }}>
                    {selectedReferentCount} sélectionné{selectedReferentCount > 1 ? 's' : ''}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setForm((f) => ({ ...f, referent_user_ids: [] }))}
                  >
                    Effacer les référents
                  </button>
                </div>
              </div>
            )}
            <div className="task-form-pick-list">
              {referentCandidates.length === 0 ? (
                <p className="task-form-pick-empty">Chargement de la liste des utilisateurs ou aucun compte actif.</p>
              ) : (
                <>
                  {filteredTeacherReferents.length > 0 && (
                    <>
                      <div className="task-form-pick-subheading" aria-hidden="true">Équipe pédagogique</div>
                      {filteredTeacherReferents.map((c) => {
                        const cid = String(c.id || '').trim();
                        return (
                          <label key={cid} className="task-form-pick-item">
                            <input
                              type="checkbox"
                              className="task-form-pick-checkbox"
                              checked={(form.referent_user_ids || []).includes(cid)}
                              onChange={() => toggleReferentUserId(cid)}
                            />
                            <span className="task-form-pick-text">
                              👤 {referentCandidateLabel(c)}
                              <span style={{ opacity: 0.75, fontSize: '.78rem' }}> — {referentRoleHint(c, terms)}</span>
                            </span>
                          </label>
                        );
                      })}
                    </>
                  )}
                  {filteredStudentReferents.length > 0 && (
                    <>
                      <div className="task-form-pick-subheading" aria-hidden="true">
                        {terms.studentPlural.charAt(0).toUpperCase() + terms.studentPlural.slice(1)}
                      </div>
                      {filteredStudentReferents.map((c) => {
                        const cid = String(c.id || '').trim();
                        return (
                          <label key={cid} className="task-form-pick-item">
                            <input
                              type="checkbox"
                              className="task-form-pick-checkbox"
                              checked={(form.referent_user_ids || []).includes(cid)}
                              onChange={() => toggleReferentUserId(cid)}
                            />
                            <span className="task-form-pick-text">
                              👤 {referentCandidateLabel(c)}
                              <span style={{ opacity: 0.75, fontSize: '.78rem' }}> — {referentRoleHint(c, terms)}</span>
                            </span>
                          </label>
                        );
                      })}
                    </>
                  )}
                  {filteredTeacherReferents.length === 0 && filteredStudentReferents.length === 0 && (
                    <p className="task-form-pick-empty">Aucun résultat pour ce filtre.</p>
                  )}
                </>
              )}
            </div>
          </div>
        )}
        <div className="row">
          <div className="field"><label>{terms.studentPlural.charAt(0).toUpperCase() + terms.studentPlural.slice(1)} requis</label>
            <input type="number" min="1" max="10" value={form.required_students} onChange={set('required_students')} />
          </div>
          <div className="field"><label>Date de départ</label><input type="date" value={form.start_date} onChange={set('start_date')} /></div>
          <div className="field"><label>Date limite</label><input type="date" value={form.due_date} onChange={set('due_date')} /></div>
        </div>
        {enableInitialAssignment && !isProposal && !editTask && !isDuplicate && (
          <div className="field">
            <label>Attribuer dès la création (optionnel)</label>
            <p style={{ fontSize: '.8rem', color: '#555', margin: '0 0 8px', lineHeight: 1.45 }}>
              Tu peux inscrire plusieurs {terms.studentPlural} dès la création. Si besoin, le nombre de places requis est relevé automatiquement pour correspondre à ta sélection.
            </p>
            {students.length > 0 && (
              <div style={{ display: 'grid', gap: 8, marginBottom: 8 }}>
                <input
                  value={assignInitialSearch}
                  onChange={(e) => setAssignInitialSearch(e.target.value)}
                  placeholder={`🔍 Filtrer les ${terms.studentPlural}…`}
                />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '.8rem', color: '#666' }}>
                    {normalizedAssignStudentIds.length} sélectionné{normalizedAssignStudentIds.length > 1 ? 's' : ''}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setForm((f) => ({ ...f, assign_student_ids: [] }))}
                  >
                    Effacer la sélection
                  </button>
                </div>
              </div>
            )}
            <div className="task-form-pick-list">
              {students.length === 0 ? (
                <p className="task-form-pick-empty">Aucun compte {terms.studentSingular} chargé (liste stats).</p>
              ) : filteredStudentsForAssign.length === 0 ? (
                <p className="task-form-pick-empty">Aucun résultat pour ce filtre.</p>
              ) : (
                filteredStudentsForAssign.map((s) => {
                  const sid = String(s.id || '').trim();
                  return (
                    <label key={sid} className="task-form-pick-item">
                      <input
                        type="checkbox"
                        className="task-form-pick-checkbox"
                        checked={normalizedAssignStudentIds.includes(sid)}
                        onChange={() => toggleAssignStudentId(sid)}
                      />
                      <span className="task-form-pick-text">
                        👤 {`${s.first_name || ''} ${s.last_name || ''}`.trim()}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        )}
        <div className="row">
          <div className="field"><label>Niveau de danger</label>
            <select value={form.danger_level || ''} onChange={set('danger_level')}>
              <option value="">Non renseigné</option>
              <option value="safe">Sans danger</option>
              <option value="potential_danger">Danger potentiel</option>
              <option value="dangerous">Dangereux</option>
              <option value="very_dangerous">Très dangereux</option>
            </select>
          </div>
          <div className="field"><label>Niveau de difficulté</label>
            <select value={form.difficulty_level || ''} onChange={set('difficulty_level')}>
              <option value="">Non renseigné</option>
              <option value="easy">Facile</option>
              <option value="medium">Moyen</option>
              <option value="hard">Compliqué</option>
              <option value="very_hard">Super compliqué</option>
            </select>
          </div>
          <div className="field"><label>Degré d&apos;importance</label>
            <select value={form.importance_level || ''} onChange={set('importance_level')}>
              <option value="">Non renseigné</option>
              <option value="not_important">Pas important</option>
              <option value="low">Peu important</option>
              <option value="medium">Modéré</option>
              <option value="high">Important</option>
              <option value="absolute">Priorité absolue</option>
            </select>
          </div>
        </div>
        {!isProposal && (
          <div className="row">
            <div className="field"><label>Mode de validation</label>
              <select value={form.completion_mode || 'single_done'} onChange={set('completion_mode')}>
                <option value="single_done">Individuel (un n3beur termine la tâche)</option>
                <option value="all_assignees_done">Collectif (tous les assignés doivent terminer)</option>
              </select>
            </div>
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

function TaskProjectFormModal({
  maps = [],
  zones = [],
  markers = [],
  tutorials = [],
  activeMapId = 'foret',
  editProject = null,
  onClose,
  onSave,
}) {
  const dialogRef = useDialogA11y(onClose);
  useOverlayHistoryBack(true, onClose);
  const defaultMapId = activeMapId || maps[0]?.id || 'foret';
  const [tutorialSearch, setTutorialSearch] = useState('');
  const [form, setForm] = useState({
    title: '',
    description: '',
    map_id: defaultMapId,
    zone_ids: [],
    marker_ids: [],
    tutorial_ids: [],
    status: 'active',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    setTutorialSearch('');
    if (!editProject) {
      setForm({
        title: '',
        description: '',
        map_id: defaultMapId,
        zone_ids: [],
        marker_ids: [],
        tutorial_ids: [],
        status: 'active',
      });
      return;
    }
    setForm({
      title: String(editProject.title || ''),
      description: String(editProject.description || ''),
      map_id: editProject.map_id || defaultMapId,
      zone_ids: initialLocationIds(editProject, 'zone_ids', 'zone_id'),
      marker_ids: initialLocationIds(editProject, 'marker_ids', 'marker_id'),
      tutorial_ids: normalizeTutorialIds(editProject.tutorial_ids || []),
      status: editProject.status === 'on_hold' ? 'on_hold' : 'active',
    });
  }, [editProject, defaultMapId]);

  const toggleZoneId = (zoneId) => {
    const normalizedZoneId = String(zoneId || '').trim();
    if (!normalizedZoneId) return;
    setForm((f) => {
      const has = f.zone_ids.includes(normalizedZoneId);
      return {
        ...f,
        zone_ids: has ? f.zone_ids.filter((id) => id !== normalizedZoneId) : [...f.zone_ids, normalizedZoneId],
      };
    });
  };

  const toggleMarkerId = (markerId) => {
    const normalizedMarkerId = String(markerId || '').trim();
    if (!normalizedMarkerId) return;
    setForm((f) => {
      const has = f.marker_ids.includes(normalizedMarkerId);
      return {
        ...f,
        marker_ids: has ? f.marker_ids.filter((id) => id !== normalizedMarkerId) : [...f.marker_ids, normalizedMarkerId],
      };
    });
  };

  const toggleTutorialId = (tutorialId) => {
    const id = Number.parseInt(tutorialId, 10);
    if (!Number.isFinite(id) || id <= 0) return;
    setForm((f) => {
      const tutorialIds = normalizeTutorialIds(f.tutorial_ids);
      const has = tutorialIds.includes(id);
      return {
        ...f,
        tutorial_ids: has ? tutorialIds.filter((x) => x !== id) : [...tutorialIds, id],
      };
    });
  };

  const selectableZones = zones.filter((z) => !z.special && (!form.map_id || z.map_id === form.map_id));
  const selectableMarkers = markers.filter((m) => !form.map_id || m.map_id === form.map_id);
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

  const submit = async () => {
    if (!form.title.trim()) return setErr('Le titre est requis');
    if (!form.map_id) return setErr('La carte est requise');
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        map_id: form.map_id,
        zone_ids: [...new Set(form.zone_ids.map((id) => String(id || '').trim()).filter(Boolean))],
        marker_ids: [...new Set(form.marker_ids.map((id) => String(id || '').trim()).filter(Boolean))],
        tutorial_ids: normalizedTutorialIds,
      };
      if (editProject) payload.status = form.status;
      await onSave(payload);
      onClose();
    } catch (e) {
      setErr(e.message);
      setSaving(false);
    }
  };

  const isEdit = !!editProject;
  const heading = isEdit ? 'Modifier le projet' : 'Nouveau projet';

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        className="modal fade-in"
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        tabIndex={-1}
      >
        <button className="modal-close" aria-label="Fermer la fenêtre" onClick={onClose}>✕</button>
        <h3>{heading}</h3>
        {err && <p style={{ color: var_alert, marginBottom: 12, fontSize: '.85rem' }}>{err}</p>}
        <div className="field"><label>Titre *</label><input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Ex: Préparer la serre de printemps" /></div>
        <div className="field"><label>Description</label><textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={4} placeholder="Objectif du projet, consignes générales..." /></div>
        <div className="field"><label>Carte</label>
          <select
            value={form.map_id}
            onChange={(e) => {
              const v = e.target.value;
              setForm((f) => ({
                ...f,
                map_id: v,
                zone_ids: f.zone_ids.filter((id) => zones.some((z) => String(z.id) === String(id) && z.map_id === v)),
                marker_ids: f.marker_ids.filter((id) => markers.some((m) => String(m.id) === String(id) && m.map_id === v)),
              }));
            }}
          >
            {maps.map((mp) => <option key={mp.id} value={mp.id}>{mp.label}</option>)}
          </select>
        </div>
        {isEdit && (
          <div className="field"><label>Statut du projet</label>
            <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              <option value="active">Actif (inscriptions ouvertes)</option>
              <option value="on_hold">En attente (inscriptions fermées)</option>
            </select>
          </div>
        )}
        <div className="field"><label>Zones et repères (optionnel)</label>
          <div className="task-form-pick-list">
            {selectableZones.length === 0 && selectableMarkers.length === 0 ? (
              <p className="task-form-pick-empty">Aucune zone ni repère pour cette carte.</p>
            ) : (
              <>
                {selectableZones.length > 0 && (
                  <>
                    {selectableMarkers.length > 0 && (
                      <div className="task-form-pick-subheading" aria-hidden="true">Zones</div>
                    )}
                    {selectableZones.map((z) => (
                      <label key={z.id} className="task-form-pick-item">
                        <input
                          type="checkbox"
                          className="task-form-pick-checkbox"
                          checked={form.zone_ids.includes(String(z.id || '').trim())}
                          onChange={() => toggleZoneId(z.id)}
                        />
                        <span className="task-form-pick-text">{zonePickDisplayName(z)}</span>
                      </label>
                    ))}
                  </>
                )}
                {selectableMarkers.length > 0 && (
                  <>
                    {selectableZones.length > 0 && (
                      <div className="task-form-pick-subheading" aria-hidden="true">Repères</div>
                    )}
                    {selectableMarkers.map((m) => (
                      <label key={m.id} className="task-form-pick-item">
                        <input
                          type="checkbox"
                          className="task-form-pick-checkbox"
                          checked={form.marker_ids.includes(String(m.id || '').trim())}
                          onChange={() => toggleMarkerId(m.id)}
                        />
                        <span className="task-form-pick-text">{m.emoji ? `${m.emoji} ` : '📍 '}{m.label}</span>
                      </label>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>
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
          <div className="task-form-pick-list">
            {tutorials.length === 0
              ? <p className="task-form-pick-empty">Aucun tutoriel disponible.</p>
              : filteredTutorials.length === 0
                ? <p className="task-form-pick-empty">Aucun tutoriel trouvé.</p>
                : filteredTutorials.map((t) => (
                  <label key={t.id} className="task-form-pick-item">
                    <input
                      type="checkbox"
                      className="task-form-pick-checkbox"
                      checked={normalizedTutorialIds.includes(Number.parseInt(t.id, 10))}
                      onChange={() => toggleTutorialId(t.id)}
                    />
                    <span className="task-form-pick-text">📘 {t.title}</span>
                  </label>
                ))}
          </div>
        </div>
        <button className="btn btn-primary btn-full" onClick={submit} disabled={saving}>
          {saving ? 'Sauvegarde...' : isEdit ? 'Enregistrer le projet' : 'Créer le projet'}
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

function tutorialPickerLocationIds(tu) {
  if (!tu) return { zoneIds: [], markerIds: [] };
  const zoneIds = [...new Set((tu.zone_ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const markerIds = [...new Set((tu.marker_ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
  return { zoneIds, markerIds };
}

function tutorialPickerHasLocation(tu, locationFilterValue) {
  if (!locationFilterValue) return true;
  const [kind, rawId] = String(locationFilterValue).split(':');
  const { zoneIds: zl, markerIds: ml } = tutorialPickerLocationIds(tu);
  if (!rawId) return zl.includes(String(locationFilterValue).trim());
  if (kind === 'zone') return zl.includes(String(rawId).trim());
  if (kind === 'marker') return ml.includes(String(rawId).trim());
  return true;
}

function tutorialPickerLinkedToSameMap(tu, mapId) {
  if (!mapId) return true;
  const zl = tu.zones_linked || [];
  const ml = tu.markers_linked || [];
  if (zl.length === 0 && ml.length === 0) return true;
  return [...zl, ...ml].every((x) => x.map_id === mapId);
}

function dedupeTutorialsByIdForTasks(list) {
  const seen = new Set();
  const out = [];
  for (const tu of list || []) {
    if (!tu || tu.id == null) continue;
    const k = String(tu.id);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(tu);
  }
  return out;
}

/** Tutoriels référencés par une tâche (tutorials_linked ou tutorial_ids + catalogue). */
function taskLinkedTutorialRefsForPicker(task, tutorialsCatalog = []) {
  if (!task) return [];
  const linked = task.tutorials_linked;
  if (Array.isArray(linked) && linked.length) return linked;
  const ids = task.tutorial_ids;
  if (!Array.isArray(ids) || !ids.length) return [];
  const out = [];
  for (const raw of ids) {
    const tu = tutorialsCatalog.find((x) => Number(x.id) === Number(raw));
    if (tu) out.push(tu);
  }
  return out;
}

function tutorialRefsFromTasksAtLocationFilter(filterZone, tasks, tutorialsCatalog) {
  if (!filterZone) return [];
  const refs = [];
  for (const t of tasks || []) {
    if (t.status === 'done' || t.status === 'validated') continue;
    if (!taskHasLocation(t, filterZone)) continue;
    refs.push(...taskLinkedTutorialRefsForPicker(t, tutorialsCatalog));
  }
  return dedupeTutorialsByIdForTasks(refs);
}

function proposalMetaFromDescription(description) {
  const raw = String(description || '');
  if (!raw) return { proposer: '', cleanedDescription: '' };
  const match = raw.match(/(?:^|\n)Proposition (?:élève|n3beur):\s*(.+)\s*$/m);
  const proposer = match?.[1]?.trim() || '';
  const cleanedDescription = raw
    .replace(/(?:^|\n)Proposition (?:élève|n3beur):\s*.+\s*$/m, '')
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
  const fullName = `${firstName} ${lastName}`.trim() || 'n3beur';
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

function getCompletionMode(task) {
  return task?.completion_mode === 'all_assignees_done' ? 'all_assignees_done' : 'single_done';
}

function getAssigneesDoneCount(task) {
  const fromApi = Number(task?.assignees_done_count);
  if (Number.isFinite(fromApi) && fromApi >= 0) return fromApi;
  if (!Array.isArray(task?.assignments)) return 0;
  return task.assignments.reduce((count, assignment) => (assignment?.done_at ? count + 1 : count), 0);
}

/** Clé `loading[…]` pour POST /done côté n3boss (tâche collective) — doit coïncider entre la carte et `withLoad`. */
function teacherCollectiveAssigneeLoadKey(taskId, assignment) {
  const tid = String(taskId || '');
  const rawId = assignment?.id != null ? String(assignment.id) : '';
  if (rawId !== '') return `${tid}_teacher_collective_done_${rawId}`;
  const sid = assignment?.student_id ?? assignment?.studentId;
  if (sid != null && String(sid).trim() !== '') {
    return `${tid}_teacher_collective_done_sid:${String(sid).trim()}`;
  }
  const fn = String(assignment?.student_first_name || '').trim();
  const ln = String(assignment?.student_last_name || '').trim();
  if (fn && ln) return `${tid}_teacher_collective_done_${fn}|${ln}`;
  return `${tid}_teacher_collective_done_legacy`;
}

function completionModeLabel(mode) {
  return mode === 'all_assignees_done' ? 'Validation collective' : 'Validation individuelle';
}

/** Aligné sur l’API (student_id + noms) pour l’affectation rapide côté n3boss. */
function isStudentAlreadyAssignedToTask(task, targetStudent = null) {
  if (!task || !targetStudent) return false;
  return (task.assignments || []).some((a) => (
    String(a.student_id || '') === String(targetStudent.id || '')
    || (
      String(a.student_first_name || '').trim().toLowerCase() === String(targetStudent.first_name || '').trim().toLowerCase()
      && String(a.student_last_name || '').trim().toLowerCase() === String(targetStudent.last_name || '').trim().toLowerCase()
    )
  ));
}

function toQuickAssignStudentId(id) {
  return String(id ?? '');
}

const TEACHER_STATUS_ACTIONS = [
  { value: 'available', label: 'À faire', icon: '🔥' },
  { value: 'in_progress', label: 'En cours', icon: '⚙️' },
  { value: 'done', label: 'Terminée', icon: '✅' },
  { value: 'validated', label: 'Validée', icon: '✔️' },
  { value: 'proposed', label: 'Proposée', icon: '💡' },
  { value: 'on_hold', label: 'En attente', icon: '⏸️' },
];
const TASK_STATUS_FILTER_OPTIONS = [
  { value: 'available', label: 'À faire' },
  { value: 'in_progress', label: 'En cours' },
  { value: 'done', label: 'Terminée' },
  { value: 'validated', label: 'Validée' },
  { value: 'proposed', label: 'Proposée' },
  { value: 'on_hold', label: 'En attente' },
];

function taskEffectiveStatus(task) {
  const baseStatus = task?.status || 'available';
  if (baseStatus === 'done' || baseStatus === 'validated' || baseStatus === 'proposed') return baseStatus;
  if (baseStatus === 'on_hold' || task?.project_status === 'on_hold' || task?.is_before_start_date || isBeforeTaskStartDate(task)) {
    return 'on_hold';
  }
  return baseStatus;
}

function mapLabelFromMaps(mapId, maps) {
  if (!mapId) return 'Globale';
  const map = maps.find((m) => m.id === mapId);
  return map ? map.label : mapId;
}

function TasksView({ tasks, taskProjects = [], zones, markers = [], maps = [], tutorials = [], plants = [], activeMapId = 'foret', isTeacher, student, canSelfAssignTasks = true, canEnrollOnTasks, canParticipateContextComments = true, canViewOtherUsersIdentity = true, onRefresh, onForceLogout, isN3Affiliated = false, publicSettings = null, onTaskFormOverlayOpenChange = null, mapLocationFocus = null, onMapLocationFocusChange = null, onOpenPlantCatalogPreview = null }) {
  const canEnrollNewTask = canEnrollOnTasks !== undefined ? canEnrollOnTasks : canSelfAssignTasks;
  const roleTerms = getRoleTerms(isN3Affiliated);
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
  const [viewMode, setViewMode] = useState(() => {
    try {
      const saved = localStorage.getItem('foretmap:tasks:viewMode');
      if (saved === 'list') return 'list';
      if (saved === 'condensed') return 'condensed';
      return 'tiles';
    } catch {
      return 'tiles';
    }
  });
  const [importFile, setImportFile] = useState(null);
  const [importDryRun, setImportDryRun] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState(null);
  const [teacherStudents, setTeacherStudents] = useState([]);
  const [referentCandidates, setReferentCandidates] = useState([]);
  const [quickAssignTaskId, setQuickAssignTaskId] = useState(null);
  const [quickAssignStudentIds, setQuickAssignStudentIds] = useState([]);
  const [loadingTeacherStudents, setLoadingTeacherStudents] = useState(false);
  /** True dès que l’utilisateur modifie la sélection (évite d’écraser le préremplissage différé). */
  const quickAssignUserEditedRef = useRef(false);
  /** Préremplit le sélecteur « Projet » à l’ouverture de « Nouvelle tâche » (y compris projet en attente). */
  const [newTaskDefaultProjectId, setNewTaskDefaultProjectId] = useState(null);
  const confirmDialogRef = useDialogA11y(() => setConfirmTask(null));
  useOverlayHistoryBack(!!confirmTask, () => setConfirmTask(null));
  const { isHelpEnabled, hasSeenSection, markSectionSeen, trackPanelOpen, trackPanelDismiss } = useHelp({ publicSettings, isTeacher });
  const contextCommentsEnabled = publicSettings?.modules?.context_comments_enabled !== false;
  const tutorialsModuleEnabled = publicSettings?.modules?.tutorials_enabled !== false;
  const helpTasks = HELP_PANELS.tasks;
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
        const payload = await api('/api/stats/all');
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
  }, [isTeacher]);

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
      else setToast('Oups : ' + e.message);
    }
    setLoading(l => ({ ...l, [id]: false }));
  };

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
    const created = await api('/api/tasks', 'POST', taskPayload);
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
    if (filterStatus && taskEffectiveStatus(t) !== filterStatus) return false;
    if (filterProject && t.project_id !== filterProject) return false;
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
  const allFiltered = applyFilters(tasks);
  const visibleProjectIds = useMemo(
    () => new Set(visibleProjects.map((p) => String(p.id || ''))),
    [visibleProjects]
  );
  const isTaskInVisibleProject = (task) => {
    const projectId = String(task?.project_id || '');
    return !!projectId && visibleProjectIds.has(projectId);
  };
  const regularFiltered = useMemo(
    () => allFiltered.filter((t) => !isTaskInVisibleProject(t)),
    [allFiltered, visibleProjectIds]
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
  const onHold = regularFiltered.filter(t => taskEffectiveStatus(t) === 'on_hold');
  const hasStudentFilters = !isTeacher && (
    !!filterText
    || !!filterZone
    || !!filterProject
    || !!filterStatus
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
    if (effective === 'validated' || effective === 'done' || effective === 'on_hold') return false;
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
    if (taskEffectiveStatus(task) === 'on_hold') return false;
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
    if (taskEffectiveStatus(task) === 'on_hold') return "Patience : tâche ou projet en pause";
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
    tooltipText,
    openTasksTutorialPreview,
    onForceLogout,
    onOpenBiodiversityFromTaskName: (name) => {
      if (typeof onOpenPlantCatalogPreview !== 'function') return;
      const p = (plants || []).find((x) => String(x?.name || '').trim() === String(name || '').trim());
      if (p) onOpenPlantCatalogPreview(p.id);
      else setToast('Pas de fiche « Biodiversité » pour ce nom. Un prof peut compléter le catalogue.');
    },
  };

  return (
    <div className="tasks-view fade-in">
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
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
                isPulsing={!hasSeenSection('tasks')}
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
                {p.title}{p.status === 'on_hold' ? ' (en attente)' : ''}
              </option>
            ))}
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

      {!isTeacher && myTasks.length > 0 && (
        <div className="tasks-section">
          <div className="tasks-section-title">🧩 Mes tâches</div>
          <div className={sectionListClass}>{myTasks.map((t, idx) => <TaskTileCard key={t.id} {...taskTileProps} t={t} index={idx} />)}</div>
        </div>
      )}

      {isTeacher ? (
        <>
          {available.length > 0 && (
            <div className="tasks-section">
              <div className="tasks-section-title">🔥 À faire</div>
              <div className={sectionListClass}>{available.map((t, idx) => <TaskTileCard key={t.id} {...taskTileProps} t={t} index={idx} />)}</div>
            </div>
          )}
          {inProgress.length > 0 && (
            <div className="tasks-section">
              <div className="tasks-section-title">⚙️ En cours</div>
              <div className={sectionListClass}>{inProgress.map((t, idx) => <TaskTileCard key={t.id} {...taskTileProps} t={t} index={idx} />)}</div>
            </div>
          )}
          <TaskProjectsBlock
            visibleProjects={visibleProjects}
            allFiltered={allFiltered}
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
            loading={loading}
            taskTileProps={taskTileProps}
            openTasksTutorialPreview={openTasksTutorialPreview}
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
            visibleProjects={visibleProjects}
            allFiltered={allFiltered}
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
            loading={loading}
            taskTileProps={taskTileProps}
            openTasksTutorialPreview={openTasksTutorialPreview}
          />
            </>
          ) : (
            <>
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
              {inProgressNotMine.length > 0 && (
              <div className="tasks-section">
                <div className="tasks-section-title">⚙️ En cours (déjà prises)</div>
                <div className={sectionListClass}>{inProgressNotMine.map((t, idx) => <TaskTileCard key={t.id} {...taskTileProps} t={t} index={idx} />)}</div>
              </div>
              )}
              <TaskProjectsBlock
            visibleProjects={visibleProjects}
            allFiltered={allFiltered}
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
            loading={loading}
            taskTileProps={taskTileProps}
            openTasksTutorialPreview={openTasksTutorialPreview}
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

      {allFiltered.length === 0 && (
        <div className="empty"><div className="empty-icon">🌿</div><p>Rien à faire ici pour l’instant — reviens plus tard ou change tes filtres.</p></div>
      )}
    </div>
  );
}

function LogModal({ task, student, onClose, onDone, onForceLogout }) {
  const dialogRef = useDialogA11y(onClose);
  // Pas de useOverlayHistoryBack : même conflit popstate / caméra native que le formulaire tâche.
  const commentFieldId = useId();
  const [comment, setComment] = useState(() => readTaskLogCommentDraft(task?.id));
  const [imageData, setImageData] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const galleryInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  useEffect(() => {
    setComment(readTaskLogCommentDraft(task?.id));
  }, [task?.id]);

  useEffect(() => {
    const id = task?.id;
    if (id == null || id === '') return undefined;
    const t = setTimeout(() => writeTaskLogCommentDraft(id, comment), 200);
    return () => {
      clearTimeout(t);
      writeTaskLogCommentDraft(id, comment);
    };
  }, [comment, task?.id]);

  const handleFile = async (e) => {
    disarmNativeFilePickerGuard();
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!isLikelyImageFile(file)) {
      setErr('Format image invalide (image requise)');
      return;
    }
    setErr('');
    try {
      const compressed = await compressImage(file, 1200, 0.72);
      setImageData(compressed);
      setPreview(compressed);
    } catch (errImg) {
      setErr(errImg?.message || 'Image invalide');
    }
  };

  const submit = async () => {
    setSaving(true);
    try {
      await api(`/api/tasks/${task.id}/done`, 'POST', {
        comment, imageData,
        firstName: student.first_name, lastName: student.last_name,
        studentId: student.id
      });
      writeTaskLogCommentDraft(task.id, '');
      await onDone?.();
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
          <label htmlFor={commentFieldId}>Commentaire (optionnel)</label>
          <textarea id={commentFieldId} value={comment} onChange={e => setComment(e.target.value)} rows={3}
            placeholder="Comment ça s'est passé ? Des observations sur l'être vivant ?" />
        </div>

        <div className="field">
          <label>Photo (optionnel)</label>
          {!preview ? (
            <div className="img-upload-area img-upload-area--split" role="group" aria-label="Photo du rapport : galerie ou appareil photo">
              <div style={{ fontSize: '2rem', marginBottom: 6 }}>📷</div>
              <div style={{ fontSize: '.85rem', color: '#888', marginBottom: 10 }}>Galerie ou appareil photo</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    if (galleryInputRef.current) galleryInputRef.current.value = '';
                    armNativeFilePickerGuard();
                    galleryInputRef.current?.click();
                  }}
                >
                  📁 Choisir une photo
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    if (cameraInputRef.current) cameraInputRef.current.value = '';
                    armNativeFilePickerGuard();
                    cameraInputRef.current?.click();
                  }}
                >
                  📸 Prendre une photo
                </button>
              </div>
              <input ref={galleryInputRef} type="file" accept="image/*" onChange={handleFile} />
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFile} />
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
  useOverlayHistoryBack(true, onClose);
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
      setToast('Rapport retiré — c’est noté.');
      loadLogs();
    } catch (e) { setToast('Oups : ' + e.message); }
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
          ? <div className="empty"><div className="empty-icon">📭</div><p>Pas encore de retour sur cette mission — à toi d’ouvrir le bal !</p></div>
          : logs.map(l => (
            <div key={l.id} className="log-entry fade-in">
              <div className="log-entry-header">
                <span className="log-entry-author">{l.student_first_name} {l.student_last_name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{formatDateTimeFr(l.created_at)}</span>
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

function TaskTileCard({
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
  tooltipText,
  openTasksTutorialPreview,
  onForceLogout,
  onOpenBiodiversityFromTaskName,
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
    const canEditOwnProposal = !isTeacher
      && t.status === 'proposed'
      && student
      && String(t.proposed_by_student_id || '') === String(student.id || '');
    const slots = getAvailableSlots(t);
    const proposalMeta = proposalMetaFromDescription(t.description);
    const cardDescription = t.status === 'proposed' ? proposalMeta.cleanedDescription : (t.description || '');
    const assignees = Array.isArray(t.assignments) ? t.assignments : [];
    const completionMode = getCompletionMode(t);
    const isCollectiveCompletion = completionMode === 'all_assignees_done';
    const doneCount = getAssigneesDoneCount(t);
    const totalCount = getAssignedCount(t);
    const mineAssignment = assignees.find((a) => (
      student && (
        String(a.student_id || '') === String(student.id || '')
        || (
          String(a.student_first_name || '').trim().toLowerCase() === String(student.first_name || '').trim().toLowerCase()
          && String(a.student_last_name || '').trim().toLowerCase() === String(student.last_name || '').trim().toLowerCase()
        )
      )
    )) || null;
    const hasCompletedOwnAssignment = !!(isCollectiveCompletion && mineAssignment?.done_at);
    const isQuickAssignOpen = quickAssignTaskId === t.id;
    const quickAssignDelta = isQuickAssignOpen ? teacherQuickAssignDelta(t, quickAssignStudentIds) : { toAdd: [], toRemove: [] };
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
    return (
      <div
        className={`task-card ${viewMode === 'tiles' ? 'task-card--tile' : ''}${isCondensed ? ` task-card--condensed${condensedExpanded ? ' task-card--condensed-open' : ''}` : ''} fade-in ${isMine ? 'mine' : ''} ${effectiveStatus === 'validated' ? 'done' : ''} ${effectiveStatus === 'proposed' ? 'proposed' : ''}`}
        style={{ animationDelay: `${Math.min(index * 60, 360)}ms` }}
      >
        {coverLightbox && <Lightbox src={coverLightbox} caption="" onClose={() => setCoverLightbox(null)} />}
        <TopTag {...topTagProps}>
          <div className="task-title-row">
            {taskStatusIndicator(effectiveStatus, isN3Affiliated)}
            <div className="task-title">{t.title}</div>
            {isCondensed && (
              <span className="task-condensed-chevron" aria-hidden>{condensedExpanded ? '▼' : '▶'}</span>
            )}
          </div>
        </TopTag>
        {showTaskDetails && (
        <>
        <div className="task-meta">
          {(t.zones_linked || []).map((z) => (
            <span key={z.id} className="task-chip">{z.name}</span>
          ))}
          {!((t.zones_linked || []).length) && t.zone_name && <span className="task-chip">{t.zone_name}</span>}
          {(t.markers_linked || []).map((m) => (
            <span key={m.id} className="task-chip">📍 {m.label}</span>
          ))}
          {!((t.markers_linked || []).length) && t.marker_label && <span className="task-chip">📍 {t.marker_label}</span>}
          {t.project_title && <span className="task-chip">📁 {t.project_title}</span>}
          {t.project_title && t.project_status === 'on_hold' && <span className="task-chip">⏸️ Projet en attente</span>}
          {startDateChip(t.start_date)}
          {isTeacher && t.status === 'proposed' && proposalMeta.proposer && (
            <span className="task-chip proposal">🙋 Proposée par {proposalMeta.proposer}</span>
          )}
          {dueDateChip(t.due_date)}
          {!isTeacher && <span className="task-chip">👤 {t.required_students} {t.required_students > 1 ? roleTerms.studentPlural : roleTerms.studentSingular}</span>}
          <span className="task-chip">🧩 {completionModeLabel(completionMode)}</span>
          <TaskDifficultyAndRiskChips task={t} />
          {isCollectiveCompletion && <span className="task-chip">✅ {doneCount}/{totalCount} terminé{totalCount > 1 ? 's' : ''}</span>}
          {t.recurrence && <span className="task-chip">🔄 {t.recurrence === 'weekly' ? 'Hebdo' : t.recurrence === 'biweekly' ? 'Bi-hebdo' : t.recurrence === 'monthly' ? 'Mensuel' : t.recurrence}</span>}
        </div>
        {coverSrc && (
          <button
            type="button"
            className="task-card-cover-btn"
            onClick={() => setCoverLightbox(coverSrc)}
            aria-label="Agrandir la photo de la tâche"
          >
            <img src={coverSrc} className="task-card-cover" alt="" />
          </button>
        )}
        {cardDescription && <div className="task-desc">{cardDescription}</div>}
        {(((Array.isArray(t.living_beings_list) ? t.living_beings_list : []).length > 0)
          || ((t.tutorials_linked || []).length > 0)) && (
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
            {(t.tutorials_linked || []).map((tu) => (
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
                <span key={tu.id} className="task-chip">📘 {tu.title}</span>
              )
            ))}
          </div>
        )}
        {referentsLinked.length > 0 && (
          <div
            className="task-desc"
            style={{ marginTop: 8, borderLeft: '3px solid var(--leaf, #22c55e)', paddingLeft: 10, lineHeight: 1.5 }}
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
            <strong>Avant de commencer</strong> : cette tâche est indiquée comme compliquée ou dangereuse.
            Demande l&apos;accord et les consignes à l&apos;équipe pédagogique (aucun référent n&apos;est renseigné sur cette fiche).
          </div>
        )}
        {effectiveStatus === 'on_hold' && (
          <div className="task-desc" style={{ marginTop: 8, borderLeft: '3px solid #f59e0b', paddingLeft: 10 }}>
            {isTeacher
              ? 'Inscription n3beur temporairement bloquée (tâche ou projet en attente). Les commentaires restent ouverts.'
              : 'Inscription temporairement fermée par l’équipe pédagogique. Tu peux quand même laisser un commentaire.'}
          </div>
        )}
        {assignees.length > 0 && (
          <div className="assignees">
            {assignees.map((a, i) => {
              const item = formatAssigneeName(a, student, isTeacher || canViewOtherUsersIdentity);
              const label = item.isCurrentStudent && item.fullName.toLowerCase() !== 'toi'
                ? `${item.fullName} (toi)`
                : item.fullName;
              const suffix = isCollectiveCompletion ? (a.done_at ? ' ✓' : ' • en cours') : '';
              const collectiveBusy = !!loading[teacherCollectiveAssigneeLoadKey(t.id, a)];
              const canTeacherMarkThisPart = isTeacher && isCollectiveCompletion && !a.done_at && effectiveStatus !== 'validated';
              if (canTeacherMarkThisPart && typeof teacherMarkCollectiveAssignmentDone === 'function') {
                return (
                  <button
                    key={a.id != null ? `a-${a.id}` : `${a.student_first_name}-${a.student_last_name}-${i}`}
                    type="button"
                    className={`assignee-tag assignee-tag--teacher-mark ${item.isCurrentStudent ? 'me' : ''}`}
                    disabled={collectiveBusy}
                    title="Marquer tout de suite la part de cet élève comme terminée (équivalent à « Marquer terminée » côté n3beur)"
                    onClick={() => teacherMarkCollectiveAssignmentDone(t, a)}
                  >
                    {label}{suffix}
                  </button>
                );
              }
              return (
                <span key={a.id != null ? `a-${a.id}` : `${a.student_first_name}-${a.student_last_name}-${i}`} className={`assignee-tag ${item.isCurrentStudent ? 'me' : ''}`}>
                  {label}{suffix}
                </span>
              );
            })}
          </div>
        )}
        {slots > 0 && effectiveStatus !== 'validated' && (
          <div className="slots">{slots} place{slots > 1 ? 's' : ''} restante{slots > 1 ? 's' : ''}</div>
        )}
        <div className="task-actions">
          {!isTeacher && canEnrollNewTask && !isMine && slots > 0 && effectiveStatus !== 'validated' && effectiveStatus !== 'on_hold' && (
            <button className="btn btn-primary btn-sm" disabled={loading[t.id + 'assign']} onClick={() => assign(t)}>
              {loading[t.id + 'assign'] ? '...' : '✋ Je m\'en occupe'}
            </button>
          )}
          {!isTeacher && canSelfAssignTasks && isMine && t.status !== 'done' && t.status !== 'validated' && !hasCompletedOwnAssignment && (
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
          {!isTeacher && hasCompletedOwnAssignment && (
            <span className="task-chip">✅ Ta partie est déjà marquée terminée</span>
          )}
          {isTeacher && (
            <button
              className={`btn btn-sm ${isQuickAssignOpen ? 'btn-primary' : 'btn-ghost'}`}
              disabled={quickAssignBusy || loadingTeacherStudents || teacherStudents.length === 0 || taskEffectiveStatus(t) === 'on_hold'}
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
                    .map((s) => toQuickAssignStudentId(s.id))
                );
              }}
              title={taskEffectiveStatus(t) === 'on_hold'
                ? "Affectation désactivée (en attente)"
                : (teacherStudents.length === 0 ? 'Aucun n3beur disponible' : 'Afficher la liste des n3beurs')}
            >
              {quickAssignBusy ? '...' : '⚡ Affectation rapide'}
            </button>
          )}
          {isTeacher && isQuickAssignOpen && (
            <div style={{ display: 'grid', gap: 8, width: '100%' }}>
              {loadingTeacherStudents ? (
                <p style={{ margin: 0, fontSize: '.82rem', color: '#666' }}>Chargement n3beurs...</p>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '.8rem', color: '#666' }}>
                      {quickAssignStudentIds.length} coché{quickAssignStudentIds.length > 1 ? 's' : ''}
                      {quickAssignDelta.toRemove.length > 0 || quickAssignDelta.toAdd.length > 0
                        ? ` · ${quickAssignDelta.toRemove.length > 0 ? `−${quickAssignDelta.toRemove.length}` : ''}${quickAssignDelta.toRemove.length > 0 && quickAssignDelta.toAdd.length > 0 ? ' ' : ''}${quickAssignDelta.toAdd.length > 0 ? `+${quickAssignDelta.toAdd.length}` : ''}`
                        : ''}
                    </span>
                    <span style={{ fontSize: '.8rem', color: quickAssignDelta.toAdd.length > quickAssignSlotsAfterRemovals ? '#b45309' : '#666' }}>
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
                          setQuickAssignStudentIds(teacherStudents.map((s) => toQuickAssignStudentId(s.id)));
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
                  <div style={{
                    maxHeight: 160,
                    overflowY: 'auto',
                    border: '1px solid rgba(0,0,0,.08)',
                    borderRadius: 10,
                    padding: '6px 8px',
                    background: 'var(--parchment, #faf8f3)',
                    textAlign: 'left',
                  }}>
                    {teacherStudents.map((s) => {
                      const fullName = `${s.first_name || ''} ${s.last_name || ''}`.trim();
                      const sid = toQuickAssignStudentId(s.id);
                      const checked = quickAssignStudentIds.includes(sid);
                      return (
                        <label key={sid} style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-start',
                          gap: 10,
                          minHeight: 44,
                          width: '100%',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={quickAssignBusy}
                            onChange={() => {
                              quickAssignUserEditedRef.current = true;
                              setQuickAssignStudentIds((ids) => (
                                ids.includes(sid)
                                  ? ids.filter((id) => toQuickAssignStudentId(id) !== sid)
                                  : [...ids, sid]
                              ));
                            }}
                          />
                          <span style={{ fontSize: '.88rem', textAlign: 'left', flex: 1 }}>{fullName || 'n3beur'}</span>
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
                <button className="btn btn-ghost btn-sm" aria-label="Modifier la tâche" onClick={() => { setNewTaskDefaultProjectId(null); setEditTask(t); setDuplicateTask(null); setShowForm(true); }}>✏️</button>
              </Tooltip>
              <Tooltip text={tooltipText(HELP_TOOLTIPS.tasks.duplicate)}>
                <button
                  className="btn btn-ghost btn-sm"
                  aria-label="Dupliquer la tâche"
                  onClick={() => { setNewTaskDefaultProjectId(null); setDuplicateTask(t); setEditTask(null); setShowForm(true); }}
                >
                  📄
                </button>
              </Tooltip>
              <Tooltip text={tooltipText(HELP_TOOLTIPS.tasks.delete)}>
                <button className="btn btn-danger btn-sm" aria-label="Supprimer la tâche" disabled={loading[t.id + 'del']} onClick={() => deleteTask(t)}>🗑️</button>
              </Tooltip>
            </>
          )}
          {!isTeacher && canEditOwnProposal && (
            <button
              className="btn btn-ghost btn-sm"
              aria-label="Modifier ma proposition"
              onClick={() => { setNewTaskDefaultProjectId(null); setEditTask(t); setDuplicateTask(null); setShowProposalForm(false); setShowForm(true); }}
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

function TaskProjectsBlock({
  visibleProjects,
  allFiltered,
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
  loading,
  taskTileProps,
  openTasksTutorialPreview,
}) {
if (visibleProjects.length <= 0) return null;
    return (
      <div className="tasks-section">
        <div className="tasks-section-title">📁 Projets ({visibleProjects.length})</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {visibleProjects.map((p) => {
            const projectTasks = allFiltered.filter((t) => String(t.project_id || '') === String(p.id || ''));
            const projectTasksCount = projectTasks.length;
            const projectStatus = p.status === 'on_hold' ? 'on_hold' : 'active';
            const loadingActive = !!loading[`${p.id}projectactive`];
            const loadingHold = !!loading[`${p.id}projecton_hold`];
            return (
              <div key={p.id} className="task-card" style={{ padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div>
                    <div className="task-title" style={{ fontSize: '1rem' }}>📁 {p.title}</div>
                    <div className="task-meta" style={{ marginTop: 6 }}>
                      {(p.zones_linked || []).map((z) => (
                        <span key={z.id} className="task-chip">{z.name}</span>
                      ))}
                      {(p.markers_linked || []).map((m) => (
                        <span key={m.id} className="task-chip">📍 {m.label}</span>
                      ))}
                      {(p.tutorials_linked || []).map((tu) => (
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
                          <span key={tu.id} className="task-chip">📘 {tu.title}</span>
                        )
                      ))}
                    </div>
                    <div style={{ fontSize: '.82rem', color: '#666' }}>
                      {p.map_label || mapLabelFromMaps(p.map_id, maps)} · {projectTasksCount} tâche{projectTasksCount > 1 ? 's' : ''}
                    </div>
                    {!!(p.description || '').trim() && (
                      <div className="task-desc" style={{ marginTop: 8 }}>{String(p.description).trim()}</div>
                    )}
                    {p.status === 'on_hold' && (
                      <div style={{ fontSize: '.82rem', color: '#92400e', marginTop: 4 }}>
                        {isTeacher
                          ? '⏸️ Projet en pause : plus de nouvelles inscriptions n3beurs pour l’instant, les commentaires restent ouverts. Tu peux quand même ajouter des tâches ; elles attendront une réouverture des inscriptions avec le projet.'
                          : '⏸️ Projet en pause : inscriptions fermées pour l’instant, les commentaires restent ouverts.'}
                      </div>
                    )}
                  </div>
                  {isTeacher ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
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
                    </div>
                  ) : (
                    <span className="task-chip">{projectStatus === 'on_hold' ? '⏸️ En attente' : '✅ Actif'}</span>
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
                        <TaskTileCard key={t.id} {...taskTileProps} t={t} index={idx} />
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


export { TaskFormModal, TasksView, LogModal, TaskLogsViewer };
