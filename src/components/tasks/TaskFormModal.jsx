import React, { useState, useMemo, useRef } from 'react';
import { withAppBase } from '../../services/api';
import { compressImageWithPreset, isLikelyImageFile } from '../../utils/image';
import { getRoleTerms } from '../../utils/n3-terminology';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import { armNativeFilePickerGuard, disarmNativeFilePickerGuard } from '../../utils/overlayHistory';
import { nextLivingBeingsFromMultiSelect } from '../../utils/livingBeings';
import { DialogShell } from '../DialogShell';
import { MarkdownTextarea } from '../MarkdownTextarea.jsx';
import {
  zonePickDisplayName,
  initialLocationIds,
  initialLinkedObjectIds,
  normalizeTutorialIds,
  referentCandidateLabel,
  referentRoleHint,
  initialTaskFormMapId,
  buildInitialTaskForm,
  buildTaskSavePayload,
} from '../../utils/taskFormHelpers.js';
import { projectStatusLabel } from '../../utils/taskListHelpers.js';

const var_alert = 'var(--alert)';

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
  const initialMapId = initialTaskFormMapId(editTask, defaultProjectForNew, activeMapId);
  const initialZoneIds = (() => {
    const ids = initialLocationIds(editTask, 'zone_ids', 'zone_id');
    return ids.length ? ids : initialLinkedObjectIds(editTask, 'zones_linked');
  })();
  const initialMarkerIds = (() => {
    const ids = initialLocationIds(editTask, 'marker_ids', 'marker_id');
    return ids.length ? ids : initialLinkedObjectIds(editTask, 'markers_linked');
  })();
  const [form, setForm] = useState(() => buildInitialTaskForm({
    editTask,
    isDuplicate,
    initialMapId,
    initialZoneIds,
    initialMarkerIds,
    defaultProjectForNew,
  }));
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
      const compressed = await compressImageWithPreset(file, 'taskLog');
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
    const payload = buildTaskSavePayload({
      form,
      zones,
      markers,
      normalizedTutorialIds,
      taskImageData,
      editTask,
      isDuplicate,
      taskImageRemoved,
    });
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
    <DialogShell
      open
      onClose={onClose}
      overlayClassName="modal-overlay"
      dialogClassName="modal fade-in"
      ariaLabel={isDuplicate ? 'Dupliquer la tâche' : editTask ? 'Modifier la tâche' : isProposal ? 'Proposer une tâche' : 'Nouvelle tâche'}
      closeOnOverlay
      dialogRef={dialogRef}
    >
        <button className="modal-close" aria-label="Fermer la fenêtre" onClick={onClose}>✕</button>
        <h3>{isDuplicate ? 'Dupliquer la tâche' : editTask ? 'Modifier la tâche' : isProposal ? 'Proposer une tâche' : 'Nouvelle tâche'}</h3>
        {err && <p style={{ color: var_alert, marginBottom: 12, fontSize: '.85rem' }}>{err}</p>}
        <div className="field"><label htmlFor="task-form-title">Titre *</label><input id="task-form-title" value={form.title} onChange={set('title')} placeholder="Ex: Arroser les tomates" /></div>
        <div className="field"><label htmlFor="task-form-description">Description</label><MarkdownTextarea id="task-form-description" aria-label="Description" value={form.description} onChange={set('description')} rows={2} placeholder="Instructions détaillées..." /></div>
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
                  📁 {p.title}{projectStatusLabel(p.status)}
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
              <option value="absolute">Urgent !</option>
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
    </DialogShell>
  );
}

export { TaskFormModal };
