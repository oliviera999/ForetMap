import React, { useState, useEffect, useRef, useMemo, useId } from 'react';
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
import { lockBodyScroll } from '../utils/body-scroll-lock';

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
  /** Ouvre une nouvelle tâche avec ce projet déjà choisi (ex. projet en attente). */
  defaultProjectId = null,
}) {
  const dialogRef = useDialogA11y(onClose);
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
    project_id: editTask.project_id || '',
    start_date: editTask.start_date || '',
    due_date: editTask.due_date || '',
    required_students: editTask.required_students || 1,
    completion_mode: getCompletionMode(editTask),
    recurrence: editTask.recurrence || '',
    assign_student_id: ''
  } : {
    title: '', description: '', map_id: initialMapId || '',
    zone_ids: [], marker_ids: [], tutorial_ids: [],
    project_id: defaultProjectForNew ? String(defaultProjectForNew.id) : '',
    start_date: '', due_date: '', required_students: 1, completion_mode: 'single_done', recurrence: '',
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
      start_date: form.start_date || null,
      due_date: form.due_date || null,
      required_students: form.required_students,
      completion_mode: form.completion_mode || 'single_done',
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
                        <span className="task-form-pick-text">🌿 {z.name}{z.current_plant ? ` — ${z.current_plant}` : ''}</span>
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

function completionModeLabel(mode) {
  return mode === 'all_assignees_done' ? 'Validation collective' : 'Validation individuelle';
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

function TasksView({ tasks, taskProjects = [], zones, markers = [], maps = [], tutorials = [], activeMapId = 'foret', isTeacher, student, canSelfAssignTasks = true, canEnrollOnTasks, canParticipateContextComments = true, canViewOtherUsersIdentity = true, onRefresh, onForceLogout, isN3Affiliated = false, publicSettings = null, onTaskFormOverlayOpenChange = null }) {
  const canEnrollNewTask = canEnrollOnTasks !== undefined ? canEnrollOnTasks : canSelfAssignTasks;
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
  const [hasTouchedStatusFilter, setHasTouchedStatusFilter] = useState(false);
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
  const [quickAssignTaskId, setQuickAssignTaskId] = useState(null);
  const [quickAssignStudentIds, setQuickAssignStudentIds] = useState([]);
  const [loadingTeacherStudents, setLoadingTeacherStudents] = useState(false);
  /** Préremplit le sélecteur « Projet » à l’ouverture de « Nouvelle tâche » (y compris projet en attente). */
  const [newTaskDefaultProjectId, setNewTaskDefaultProjectId] = useState(null);
  const confirmDialogRef = useDialogA11y(() => setConfirmTask(null));
  const { isHelpEnabled, hasSeenSection, markSectionSeen, trackPanelOpen, trackPanelDismiss } = useHelp({ publicSettings, isTeacher });
  const contextCommentsEnabled = publicSettings?.modules?.context_comments_enabled !== false;
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
        if (!cancelled) setToast('Impossible de charger la liste des n3beurs : ' + e.message);
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
  const taskEffectiveStatus = (task) => {
    const baseStatus = task?.status || 'available';
    if (baseStatus === 'done' || baseStatus === 'validated' || baseStatus === 'proposed') return baseStatus;
    if (baseStatus === 'on_hold' || task?.project_status === 'on_hold' || task?.is_before_start_date || isBeforeTaskStartDate(task)) {
      return 'on_hold';
    }
    return baseStatus;
  };

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

  const setProjectStatus = (project, nextStatus) => withLoad(`${project.id}project${nextStatus}`, async () => {
    await api(`/api/task-projects/${project.id}`, 'PUT', { status: nextStatus });
    setToast(`Projet "${project.title}" : ${nextStatus === 'on_hold' ? 'En attente' : 'Actif'}`);
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
  const myTasks = regularFiltered.filter(t => student && taskEffectiveStatus(t) !== 'validated' && t.assignments?.some(
    a => a.student_first_name === student.first_name && a.student_last_name === student.last_name
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
    () => regularFiltered.filter((t) => taskEffectiveStatus(t) === 'validated' && t.assignments?.some(
      (a) => a.student_first_name === student?.first_name && a.student_last_name === student?.last_name
    )),
    [regularFiltered, student?.first_name, student?.last_name]
  );

  const urgentTasks = !isTeacher ? regularFiltered.filter(t => {
    const effective = taskEffectiveStatus(t);
    if (effective === 'validated' || effective === 'done' || effective === 'on_hold') return false;
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
  const isStudentAlreadyAssignedToTask = (task, targetStudent = null) => {
    if (!task || !targetStudent) return false;
    return (task.assignments || []).some((a) => (
      String(a.student_id || '') === String(targetStudent.id || '')
      || (
        String(a.student_first_name || '').trim().toLowerCase() === String(targetStudent.first_name || '').trim().toLowerCase()
        && String(a.student_last_name || '').trim().toLowerCase() === String(targetStudent.last_name || '').trim().toLowerCase()
      )
    ));
  };
  const canTeacherAssignOnTask = (task, targetStudents = []) => {
    if (!isTeacher || !Array.isArray(targetStudents) || targetStudents.length === 0) return false;
    if (!task || taskEffectiveStatus(task) === 'on_hold' || task.status === 'validated' || task.status === 'done' || task.status === 'proposed') return false;
    if (getAvailableSlots(task) <= 0) return false;
    return targetStudents.some((studentRow) => !isStudentAlreadyAssignedToTask(task, studentRow));
  };
  const quickAssignHint = (task, targetStudents = []) => {
    if (!Array.isArray(targetStudents) || targetStudents.length === 0) return "Choisis au moins un n3beur";
    if (!task) return "Tâche indisponible";
    if (taskEffectiveStatus(task) === 'on_hold') return "Tâche ou projet en attente";
    if (task.status === 'proposed') return "Impossible d'affecter une tâche proposée";
    if (task.status === 'done' || task.status === 'validated') return "Tâche déjà terminée";
    if (getAvailableSlots(task) <= 0) return "Aucune place restante";
    const assignable = targetStudents.filter((studentRow) => !isStudentAlreadyAssignedToTask(task, studentRow));
    if (assignable.length === 0) return "Les n3beurs sélectionnés sont déjà inscrits";
    const slots = getAvailableSlots(task);
    const selectedCount = targetStudents.length;
    if (assignable.length > slots) {
      return `Seulement ${slots} place${slots > 1 ? 's' : ''} disponible${slots > 1 ? 's' : ''} pour ${selectedCount} sélection${selectedCount > 1 ? 's' : ''}`;
    }
    return `Affecter ${assignable.length} n3beur${assignable.length > 1 ? 's' : ''}`;
  };
  const runTeacherQuickAssign = (task, targetStudents) => withLoad(`${task.id}assign_teacher_quick`, async () => {
    if (!Array.isArray(targetStudents) || targetStudents.length === 0) return;
    const assignable = targetStudents.filter((studentRow) => !isStudentAlreadyAssignedToTask(task, studentRow));
    let slotsRemaining = getAvailableSlots(task);
    if (assignable.length === 0 || slotsRemaining <= 0) {
      setToast('Aucune nouvelle affectation possible');
      return;
    }
    let successCount = 0;
    let failCount = 0;
    let firstError = '';
    for (const targetStudent of assignable) {
      if (slotsRemaining <= 0) break;
      try {
        await api(`/api/tasks/${task.id}/assign`, 'POST', {
          firstName: targetStudent.first_name,
          lastName: targetStudent.last_name,
          studentId: targetStudent.id,
        });
        successCount += 1;
        slotsRemaining -= 1;
      } catch (e) {
        failCount += 1;
        if (!firstError) firstError = e.message || 'Erreur inconnue';
        if (String(e.message || '').toLowerCase().includes('plus de place')) break;
      }
    }
    if (successCount > 0 && failCount > 0) {
      setToast(`${successCount} n3beur${successCount > 1 ? 's' : ''} inscrit${successCount > 1 ? 's' : ''}, ${failCount} échec${failCount > 1 ? 's' : ''}`);
    } else if (successCount > 0) {
      setToast(`${successCount} n3beur${successCount > 1 ? 's' : ''} inscrit${successCount > 1 ? 's' : ''} à "${task.title}"`);
    } else if (firstError) {
      setToast(`Aucune affectation : ${firstError}`);
    } else {
      setToast('Aucune nouvelle affectation possible');
    }
    setQuickAssignTaskId(null);
    setQuickAssignStudentIds([]);
  });
  const ProjectsSection = () => {
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
                    <div style={{ fontSize: '.82rem', color: '#666' }}>
                      {p.map_label || mapLabelById(p.map_id)} · {projectTasksCount} tâche{projectTasksCount > 1 ? 's' : ''}
                    </div>
                    {p.status === 'on_hold' && (
                      <div style={{ fontSize: '.82rem', color: '#92400e', marginTop: 4 }}>
                        {isTeacher
                          ? '⏸️ Projet en attente : inscriptions élèves fermées, commentaires ouverts. Tu peux continuer à ajouter des tâches au projet ; elles resteront en attente d’inscription tant que le projet n’est pas réactivé.'
                          : '⏸️ Projet en attente : inscriptions fermées, commentaires ouverts.'}
                      </div>
                    )}
                  </div>
                  {isTeacher ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
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
                        <TaskCard key={t.id} t={t} index={idx} />
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
  };

  const TaskCard = ({ t, index = 0 }) => {
    const effectiveStatus = taskEffectiveStatus(t);
    const isMine = myTasks.some(m => m.id === t.id);
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
    const selectedQuickAssignStudents = isQuickAssignOpen
      ? teacherStudents.filter((s) => quickAssignStudentIds.includes(s.id))
      : [];
    const quickAssignAssignableCount = selectedQuickAssignStudents.filter((studentRow) => !isStudentAlreadyAssignedToTask(t, studentRow)).length;
    const quickAssignSlots = getAvailableSlots(t);
    const canQuickAssign = canTeacherAssignOnTask(t, selectedQuickAssignStudents);
    const quickAssignBusy = !!loading[`${t.id}assign_teacher_quick`];
    const quickAssignTitle = quickAssignHint(t, selectedQuickAssignStudents);
    return (
      <div
        className={`task-card ${viewMode === 'tiles' ? 'task-card--tile' : ''} fade-in ${isMine ? 'mine' : ''} ${effectiveStatus === 'validated' ? 'done' : ''} ${effectiveStatus === 'proposed' ? 'proposed' : ''}`}
        style={{ animationDelay: `${Math.min(index * 60, 360)}ms` }}
      >
        <div className="task-top">
          <div className="task-title-row">
            {taskStatusIndicator(effectiveStatus, isN3Affiliated)}
            <div className="task-title">{t.title}</div>
          </div>
        </div>
        <div className="task-meta">
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
          {t.project_title && t.project_status === 'on_hold' && <span className="task-chip">⏸️ Projet en attente</span>}
          {startDateChip(t.start_date)}
          {isTeacher && t.status === 'proposed' && proposalMeta.proposer && (
            <span className="task-chip proposal">🙋 Proposée par {proposalMeta.proposer}</span>
          )}
          {dueDateChip(t.due_date)}
          {!isTeacher && <span className="task-chip">👤 {t.required_students} {t.required_students > 1 ? roleTerms.studentPlural : roleTerms.studentSingular}</span>}
          <span className="task-chip">🧩 {completionModeLabel(completionMode)}</span>
          {isCollectiveCompletion && <span className="task-chip">✅ {doneCount}/{totalCount} terminé{totalCount > 1 ? 's' : ''}</span>}
          {t.recurrence && <span className="task-chip">🔄 {t.recurrence === 'weekly' ? 'Hebdo' : t.recurrence === 'biweekly' ? 'Bi-hebdo' : t.recurrence === 'monthly' ? 'Mensuel' : t.recurrence}</span>}
        </div>
        {cardDescription && <div className="task-desc">{cardDescription}</div>}
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
              return (
                <span key={`${a.student_first_name}-${a.student_last_name}-${i}`} className={`assignee-tag ${item.isCurrentStudent ? 'me' : ''}`}>
                  {item.isCurrentStudent && item.fullName.toLowerCase() !== 'toi' ? `${item.fullName} (toi)` : item.fullName}
                  {isCollectiveCompletion ? (a.done_at ? ' ✓' : ' • en cours') : ''}
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
          {!isTeacher && canSelfAssignTasks && isMine && (t.status === 'in_progress' || t.status === 'available') && !hasCompletedOwnAssignment && (
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
                  setQuickAssignTaskId(null);
                  setQuickAssignStudentIds([]);
                  return;
                }
                setQuickAssignTaskId(t.id);
                setQuickAssignStudentIds([]);
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
                      {quickAssignStudentIds.length} sélectionné{quickAssignStudentIds.length > 1 ? 's' : ''}
                    </span>
                    <span style={{ fontSize: '.8rem', color: quickAssignAssignableCount > quickAssignSlots ? '#b45309' : '#666' }}>
                      {quickAssignAssignableCount}/{quickAssignSlots} place{quickAssignSlots > 1 ? 's' : ''} utilisable{quickAssignSlots > 1 ? 's' : ''}
                    </span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={quickAssignBusy}
                        onClick={() => setQuickAssignStudentIds(teacherStudents.map((s) => s.id))}
                      >
                        Tout sélectionner
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={quickAssignBusy}
                        onClick={() => setQuickAssignStudentIds([])}
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
                      const checked = quickAssignStudentIds.includes(s.id);
                      return (
                        <label key={s.id} style={{
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
                              setQuickAssignStudentIds((ids) => (
                                ids.includes(s.id)
                                  ? ids.filter((id) => id !== s.id)
                                  : [...ids, s.id]
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
                onClick={() => runTeacherQuickAssign(t, selectedQuickAssignStudents)}
                title={quickAssignTitle}
              >
                {quickAssignBusy ? '...' : 'Affecter'}
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
      <p className="section-sub">{isTeacher ? 'Gérer, valider et traiter les propositions' : (canSelfAssignTasks ? 'Prends en charge une tâche ou propose-en une nouvelle' : 'Consultation en lecture seule')}</p>
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
            ? `Limite d’inscriptions atteinte : ${student.taskEnrollment.currentActiveAssignments}/${student.taskEnrollment.maxActiveAssignments} tâche(s) active(s) (non validées). Retire-toi d’une tâche ou attends une validation.`
            : `Inscriptions : ${student.taskEnrollment.currentActiveAssignments}/${student.taskEnrollment.maxActiveAssignments} tâche(s) active(s) (non validées par un n3boss, toutes cartes).`}
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
          <div className={sectionListClass}>{myTasks.map((t, idx) => <TaskCard key={t.id} t={t} index={idx} />)}</div>
        </div>
      )}

      {isTeacher ? (
        <>
          {available.length > 0 && (
            <div className="tasks-section">
              <div className="tasks-section-title">🔥 À faire</div>
              <div className={sectionListClass}>{available.map((t, idx) => <TaskCard key={t.id} t={t} index={idx} />)}</div>
            </div>
          )}
          {inProgress.length > 0 && (
            <div className="tasks-section">
              <div className="tasks-section-title">⚙️ En cours</div>
              <div className={sectionListClass}>{inProgress.map((t, idx) => <TaskCard key={t.id} t={t} index={idx} />)}</div>
            </div>
          )}
          <ProjectsSection />
          {proposed.length > 0 && (
            <div className="tasks-section">
              <div className="tasks-section-title">💡 Propositions {roleTerms.studentPlural} ({proposed.length})</div>
              <div className={sectionListClass}>{proposed.map((t, idx) => <TaskCard key={t.id} t={t} index={idx} />)}</div>
            </div>
          )}
          {done.length > 0 && (
            <div className="tasks-section">
              <div className="tasks-section-title">⏳ En attente de validation ({done.length})</div>
              <div className={sectionListClass}>{done.map((t, idx) => <TaskCard key={t.id} t={t} index={idx} />)}</div>
            </div>
          )}
          {onHold.length > 0 && (
            <div className="tasks-section">
              <div className="tasks-section-title">⏸️ En attente ({onHold.length})</div>
              <div className={sectionListClass}>{onHold.map((t, idx) => <TaskCard key={t.id} t={t} index={idx} />)}</div>
            </div>
          )}
          {validated.length > 0 && (
            <div className="tasks-section">
              <div className="tasks-section-title">✅ Validées</div>
              <div className={sectionListClass}>{validated.map((t, idx) => <TaskCard key={t.id} t={t} index={idx} />)}</div>
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
                <div className={sectionListClass}>{regularFiltered.map((t, idx) => <TaskCard key={t.id} t={t} index={idx} />)}</div>
              </div>
              <ProjectsSection />
            </>
          ) : (
            <>
              {availableNotMine.length > 0 && (
            <div className="tasks-section">
              <div className="tasks-section-title">🔥 Tâches à faire</div>
              <div className={sectionListClass}>{availableNotMine.map((t, idx) => <TaskCard key={t.id} t={t} index={idx} />)}</div>
            </div>
          )}
              {myProposals.length > 0 && (
              <div className="tasks-section">
                <div className="tasks-section-title">💡 Mes propositions ({myProposals.length})</div>
                <div className={sectionListClass}>{myProposals.map((t, idx) => <TaskCard key={t.id} t={t} index={idx} />)}</div>
              </div>
              )}
              {inProgressNotMine.length > 0 && (
              <div className="tasks-section">
                <div className="tasks-section-title">⚙️ En cours (déjà prises)</div>
                <div className={sectionListClass}>{inProgressNotMine.map((t, idx) => <TaskCard key={t.id} t={t} index={idx} />)}</div>
              </div>
              )}
              <ProjectsSection />
              {doneNotMine.length > 0 && (
              <div className="tasks-section">
                <div className="tasks-section-title">⏳ En attente de validation</div>
                <div className={sectionListClass}>{doneNotMine.map((t, idx) => <TaskCard key={t.id} t={t} index={idx} />)}</div>
              </div>
              )}
              {onHoldNotMine.length > 0 && (
              <div className="tasks-section">
                <div className="tasks-section-title">⏸️ En attente</div>
                <div className={sectionListClass}>{onHoldNotMine.map((t, idx) => <TaskCard key={t.id} t={t} index={idx} />)}</div>
              </div>
              )}
              {recentlyValidatedForStudent.length > 0 && (
              <div className="tasks-section">
                <div className="tasks-section-title">✅ Récemment validées</div>
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
  const commentFieldId = useId();
  const [comment, setComment] = useState(() => readTaskLogCommentDraft(task?.id));
  const [imageData, setImageData] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const inputRef = useRef();

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
      writeTaskLogCommentDraft(task.id, '');
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
          <label htmlFor={commentFieldId}>Commentaire (optionnel)</label>
          <textarea id={commentFieldId} value={comment} onChange={e => setComment(e.target.value)} rows={3}
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
