import React, { useEffect, useMemo, useState } from 'react';
import { MAP_MARKER_EMOJI_MAX_CHARS, MARKER_EMOJIS, clampEmojiInput } from '../../constants/emojis';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import { useOverlayHistoryBack } from '../../hooks/useOverlayHistoryBack';
import { api } from '../../services/api';
import { TimedToast } from '../../shared/components/TimedToast.jsx';
import { TaskDifficultyAndRiskChips } from '../../utils/badges';
import { nextLivingBeingsFromMultiSelect, orderedLivingBeingsForForm } from '../../utils/livingBeings';
import { dedupeTutorialsById, isTaskDetachedFromLocation, livingBeingNamesFromTasksAtLocation, taskLocationIds, tutorialLocationIds, tutorialsFromTasksAtLocation } from '../../utils/mapLocationContext';
import { isStudentAssignedToTask } from '../../utils/task-assignments';
import { canStudentAssignTask, taskEnrollmentMeta } from '../../utils/taskEnrollment.js';
import { mergeDefaultVisitMediaImageBlocks, normalizeVisitEditorialBlocksForSave, parseVisitEditorialBlocksFromJson } from '../../utils/visitEditorialBlocks.js';
import { DialogShell } from '../DialogShell';
import { MarkdownContent } from '../MarkdownContent.jsx';
import { MarkdownTextarea } from '../MarkdownTextarea.jsx';
import { tutorialPreviewCanEmbed, tutorialPreviewPayload } from '../TutorialPreviewModal';
import { VisitEditorialMapPhotoImportList, VisitEditorialMediaIdPicker } from '../VisitEditorialPhotoUi.jsx';
import { ContextComments } from '../context-comments';
import { BiodiversitySpeciesOpenLinks, LivingBeingsCatalogPanel } from './LivingBeingsCatalogPanel.jsx';
import { PhotoGallery } from './PhotoGallery.jsx';
import { ZoneOrMarkerEmojiField } from './ZoneOrMarkerEmojiField.jsx';
import { LocationTutorialPreviewList, TaskEnrollmentLegend, tutorialLinkedToSameMap } from './mapModalShared.jsx';

function MarkerModal({
  marker,
  plants,
  tasks,
  tutorials = [],
  onClose,
  onSave,
  onUpdate,
  onDelete,
  onDuplicate,
  onLinkTask,
  onUnlinkTask,
  onLinkTutorial,
  onUnlinkTutorial,
  onAssignTasks,
  isTeacher,
  student,
  canSelfAssignTasks = true,
  canEnrollOnTasks,
  markerEmojis = MARKER_EMOJIS,
  onNavigateToTasksForLocation = null,
  onOpenTutorialPreview = null,
  contextCommentsEnabled = true,
  canParticipateContextComments = true,
  onRequestAdjustMarkerPosition = null,
  onOpenPlantCatalogPreview = null,
}) {
  const canEnroll = canEnrollOnTasks !== undefined ? canEnrollOnTasks : canSelfAssignTasks;
  const dialogRef = useDialogA11y(onClose);
  useOverlayHistoryBack(true, onClose);
  const isNew = !marker.id;
  const [tab, setTab] = useState('tasks');
  const [form, setForm] = useState({
    label: marker.label || '',
    living_beings: orderedLivingBeingsForForm(marker.living_beings_list || marker.living_beings, marker.plant_name),
    note: marker.note || '',
    emoji: String(marker.emoji ?? '').trim(),
    visit_subtitle: marker.visit_subtitle || '',
    visit_short_description: marker.visit_short_description || '',
    visit_details_title: marker.visit_details_title || 'Détails',
    visit_details_text: marker.visit_details_text || '',
  });
  const [saving, setSaving] = useState(false);
  const [linkTaskId, setLinkTaskId] = useState('');
  const [linkTutorialId, setLinkTutorialId] = useState('');
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);
  const [assigning, setAssigning] = useState(false);
  const [toast, setToast] = useState(null);
  const [duplicating, setDuplicating] = useState(false);
  const [visitEditorialBlocks, setVisitEditorialBlocks] = useState(() => parseVisitEditorialBlocksFromJson(marker.visit_body_json));
  const [visitMediaOptions, setVisitMediaOptions] = useState([]);
  const [markerPhotoOptions, setMarkerPhotoOptions] = useState([]);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const taskMapId = (t) => t.map_id_resolved || t.map_id || t.zone_map_id || t.marker_map_id || null;
  const linkedTasks = (tasks || []).filter((t) => (
    taskLocationIds(t).markerIds.some((id) => String(id) === String(marker.id)) && !isTaskDetachedFromLocation(t)
  ));
  const studentAssignableTasks = linkedTasks.filter((t) => canStudentAssignTask(t, student));
  const assignableTasks = (tasks || []).filter((t) => {
    if (linkedTasks.some((lt) => lt.id === t.id)) return false;
    if (isTaskDetachedFromLocation(t)) return false;
    const mapId = taskMapId(t);
    return mapId === marker.map_id || mapId == null;
  });
  const linkedTutorialsDirect = (tutorials || []).filter((tu) => (
    tutorialLocationIds(tu).markerIds.some((id) => String(id) === String(marker.id))
  ));
  const tutorialsFromTasksHere = tutorialsFromTasksAtLocation('marker', marker.id, tasks, tutorials);
  const linkedTutorialsAll = dedupeTutorialsById([...linkedTutorialsDirect, ...tutorialsFromTasksHere]);
  const tutorialsOnlyViaTasks = tutorialsFromTasksHere.filter(
    (tu) => !linkedTutorialsDirect.some((d) => String(d.id) === String(tu.id)),
  );
  const linkedTutorialsVisible = isTeacher
    ? linkedTutorialsAll
    : linkedTutorialsAll.filter((tu) => tu.is_active !== false);
  const markerLivingNamesOrdered = orderedLivingBeingsForForm(marker.living_beings_list || marker.living_beings, marker.plant_name);
  const livingBeingsFromTasksHere = livingBeingNamesFromTasksAtLocation('marker', marker.id, tasks);
  const livingBeingsOnlyOnTasks = livingBeingsFromTasksHere.filter((n) => !markerLivingNamesOrdered.includes(n));
  const visitAsideTutorials = !isNew && (isTeacher ? linkedTutorialsAll : linkedTutorialsVisible).length > 0;
  const visitAsideSpecies = !isNew && (markerLivingNamesOrdered.length > 0 || livingBeingsOnlyOnTasks.length > 0);
  const showVisitAsideBlock = !isNew && !!(marker.visit_subtitle || marker.visit_short_description || marker.visit_details_text
    || visitAsideSpecies || visitAsideTutorials);
  const assignableTutorials = (tutorials || []).filter((tu) => (
    tu.is_active !== false
    && !tutorialLocationIds(tu).markerIds.some((id) => String(id) === String(marker.id))
    && tutorialLinkedToSameMap(tu, marker.map_id)
  ));

  const showTasksTab = !isNew && (isTeacher || (!!student && linkedTasks.length > 0));
  const showTutorialsTab = !isNew && (isTeacher || linkedTutorialsVisible.length > 0);

  useEffect(() => {
    if (isNew) return;
    if (!showTasksTab && tab === 'tasks') setTab('info');
  }, [isNew, showTasksTab, tab]);

  useEffect(() => {
    if (isNew) return;
    if (!showTutorialsTab && tab === 'tutorials') setTab('info');
  }, [isNew, showTutorialsTab, tab]);

  useEffect(() => {
    setSelectedTaskIds((prev) => prev.filter((id) => studentAssignableTasks.some((t) => t.id === id)));
  }, [studentAssignableTasks]);

  useEffect(() => {
    setForm({
      label: marker.label || '',
      living_beings: orderedLivingBeingsForForm(marker.living_beings_list || marker.living_beings, marker.plant_name),
      note: marker.note || '',
      emoji: marker.emoji || '🌱',
      visit_subtitle: marker.visit_subtitle || '',
      visit_short_description: marker.visit_short_description || '',
      visit_details_title: marker.visit_details_title || 'Détails',
      visit_details_text: marker.visit_details_text || '',
    });
  }, [
    marker.id,
    marker.label,
    marker.note,
    marker.emoji,
    marker.plant_name,
    marker.living_beings,
    marker.living_beings_list,
    marker.visit_subtitle,
    marker.visit_short_description,
    marker.visit_details_title,
    marker.visit_details_text,
    marker.visit_body_json,
  ]);

  useEffect(() => {
    if (isNew || !marker.id) {
      setVisitMediaOptions([]);
      setMarkerPhotoOptions([]);
      return;
    }
    let cancel = false;
    (async () => {
      try {
        const [photos, content] = await Promise.all([
          api(`/api/map/markers/${marker.id}/photos`),
          api(`/api/visit/content?map_id=${encodeURIComponent(marker.map_id || '')}`),
        ]);
        if (cancel) return;
        const markerVisit = (content?.markers || []).find((m) => String(m.id) === String(marker.id));
        const vm = [...(markerVisit?.visit_media || [])].sort(
          (a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || Number(a.id) - Number(b.id),
        );
        setVisitMediaOptions(vm);
        setMarkerPhotoOptions(Array.isArray(photos) ? photos : []);
      } catch (_) {
        if (!cancel) {
          setVisitMediaOptions([]);
          setMarkerPhotoOptions([]);
        }
      }
    })();
    return () => { cancel = true; };
  }, [isNew, marker.id, marker.map_id]);

  useEffect(() => {
    if (isNew) return;
    const fromJson = parseVisitEditorialBlocksFromJson(marker.visit_body_json);
    const trimmedBody = marker.visit_body_json == null ? '' : String(marker.visit_body_json).trim();
    const imageBlocksFromJson = fromJson.filter((b) => b.type === 'image');
    if (!trimmedBody) {
      setVisitEditorialBlocks(
        visitMediaOptions
          .map((media, i) => {
            const mediaId = Number(media?.id);
            if (!Number.isFinite(mediaId) || mediaId <= 0) return null;
            return {
              id: `default-img-${mediaId}`,
              type: 'image',
              media_ids: [mediaId],
              layout: 'single',
              size: i === 0 ? 'lg' : 'md',
              align: 'center',
              caption: String(media?.caption || '').trim(),
            };
          })
          .filter(Boolean),
      );
      return;
    }
    const hasImageBlock = imageBlocksFromJson.length > 0;
    if (!hasImageBlock && visitMediaOptions.length > 0) {
      setVisitEditorialBlocks(
        mergeDefaultVisitMediaImageBlocks(imageBlocksFromJson, visitMediaOptions).filter((b) => b.type === 'image'),
      );
      return;
    }
    setVisitEditorialBlocks(imageBlocksFromJson);
  }, [isNew, marker.visit_body_json, marker.id, visitMediaOptions]);

  const buildPayload = () => {
    const living = form.living_beings;
    const emojiVal = clampEmojiInput(
      (form.emoji || '').trim(),
      MAP_MARKER_EMOJI_MAX_CHARS,
    );
    return {
      ...marker,
      ...form,
      emoji: emojiVal,
      living_beings: living,
      plant_name: '',
      visit_subtitle: form.visit_subtitle,
      visit_short_description: form.visit_short_description,
      visit_details_title: form.visit_details_title,
      visit_details_text: form.visit_details_text,
      visit_editorial_blocks: normalizeVisitEditorialBlocksForSave(visitEditorialBlocks),
    };
  };

  const imageBlocks = useMemo(
    () => visitEditorialBlocks.filter((b) => b.type === 'image'),
    [visitEditorialBlocks],
  );
  const addImageBlock = () => {
    const id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setVisitEditorialBlocks((prev) => [...prev, { id, type: 'image', media_ids: [], layout: 'single', size: 'md', align: 'center', caption: '' }]);
  };
  const updateImageBlock = (id, patch) => {
    setVisitEditorialBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };
  const removeImageBlock = (id) => {
    setVisitEditorialBlocks((prev) => prev.filter((b) => b.id !== id));
  };
  const attachMarkerPhotoToVisit = async (photo) => {
    if (!photo?.image_url || !marker.id) return;
    try {
      await api('/api/visit/media', 'POST', {
        target_type: 'marker',
        target_id: marker.id,
        image_url: String(photo.image_url || '').trim(),
        caption: String(photo.caption || '').trim(),
      });
      const content = await api(`/api/visit/content?map_id=${encodeURIComponent(marker.map_id || '')}`);
      const markerVisit = (content?.markers || []).find((m) => String(m.id) === String(marker.id));
      const vm = [...(markerVisit?.visit_media || [])].sort(
        (a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || Number(a.id) - Number(b.id),
      );
      setVisitMediaOptions(vm);
      setToast('Photo associée à la visite ✓');
    } catch (e) {
      setToast(e?.message || 'Erreur association photo');
    }
  };

  const saveNew = async () => {
    if (!form.label.trim()) return;
    setSaving(true);
    try {
      await onSave(buildPayload());
      onClose();
    } catch (e) {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!form.label.trim()) return;
    if (!onUpdate) return;
    setSaving(true);
    try {
      await onUpdate(marker.id, buildPayload());
      setToast('Sauvegardé ✓');
      setTab('info');
    } catch (e) {
      setToast('Erreur');
    }
    setSaving(false);
  };

  const TABS_EXISTING = [
    ...(showTasksTab ? [{ id: 'tasks', label: '✅ Tâches' }] : []),
    ...(showTutorialsTab ? [{ id: 'tutorials', label: '📘 Tutoriels' }] : []),
    { id: 'info', label: 'ℹ️ Info' },
    { id: 'photos', label: '📷 Photos' },
    ...(isTeacher ? [{ id: 'edit', label: '✏️ Modifier' }] : []),
  ];

  if (isNew) {
    return (
      <DialogShell
        open
        onClose={onClose}
        overlayClassName="modal-overlay"
        dialogClassName="log-modal fade-in"
        ariaLabel="Nouveau repère"
        closeOnOverlay
        dialogRef={dialogRef}
      >
          {toast && <TimedToast msg={toast} onDone={() => setToast(null)} />}
          <button className="modal-close" onClick={onClose}>✕</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <h3 style={{ margin: 0 }}>Nouveau repère</h3>
          </div>
          {isTeacher ? (
            <>
              <div className="field"><label>Nom du repère *</label>
                <input value={form.label} onChange={set('label')} placeholder="Ex: Olivier n°10" />
              </div>
              <div className="field"><label>Êtres vivants</label>
                <p style={{ fontSize: '.76rem', color: '#64748b', margin: '0 0 8px', lineHeight: 1.45 }}>
                  Ctrl / Cmd + clic pour plusieurs ; l’ordre choisi est conservé.
                </p>
                <select
                  multiple
                  size={Math.min(10, Math.max(4, plants.length + 1))}
                  value={form.living_beings}
                  onChange={(e) => {
                    const picked = Array.from(e.target.selectedOptions).map((opt) => opt.value);
                    setForm((f) => ({
                      ...f,
                      living_beings: nextLivingBeingsFromMultiSelect(f.living_beings, picked, plants),
                    }));
                  }}>
                  {plants.map(p => <option key={p.id} value={p.name}>{p.emoji} {p.name}</option>)}
                </select>
              </div>
              {form.living_beings.length > 0 && (
                <LivingBeingsCatalogPanel plants={plants} names={form.living_beings} showHeading={false} />
              )}
              <div className="field"><label>Description</label>
                <MarkdownTextarea value={form.note} onChange={set('note')} rows={3}
                  placeholder="Observations, entretien..." />
              </div>
              <p style={{ fontSize: '.78rem', color: '#64748b', margin: '0 0 10px', lineHeight: 1.45 }}>
                Textes ci-dessous : même contenu qu’en mode visite (sous-titre, accroche, bloc dépliable).
              </p>
              <div className="field"><label>Sous-titre (visite)</label>
                <input value={form.visit_subtitle} onChange={set('visit_subtitle')} placeholder="Optionnel" />
              </div>
              <div className="field"><label>Description courte (visite)</label>
                <MarkdownTextarea value={form.visit_short_description} onChange={set('visit_short_description')} rows={2} placeholder="Texte d’accroche sous le titre" />
              </div>
              <div className="field"><label>Titre du bloc dépliable (visite)</label>
                <input value={form.visit_details_title} onChange={set('visit_details_title')} placeholder="Détails" />
              </div>
              <div className="field"><label>Détails dépliables (visite)</label>
                <MarkdownTextarea value={form.visit_details_text} onChange={set('visit_details_text')} rows={4} placeholder="Contenu du panneau repliable" />
              </div>
              <div className="field"><label htmlFor="marker-new-emoji-custom">Emoji du repère (optionnel)</label>
                <ZoneOrMarkerEmojiField
                  id="marker-new-emoji-custom"
                  value={form.emoji}
                  onChange={(v) => setForm((f) => ({ ...f, emoji: v }))}
                  maxLen={MAP_MARKER_EMOJI_MAX_CHARS}
                  allowNone
                />
                <div style={{
                  display: 'flex', gap: 6, flexWrap: 'wrap', maxHeight: 180, overflowY: 'auto', paddingRight: 2,
                  WebkitOverflowScrolling: 'touch', touchAction: 'pan-y',
                }}>
                  {markerEmojis.map((emoji) => (
                    <button
                      type="button"
                      key={emoji}
                      className={`emoji-btn ${form.emoji === emoji ? 'sel' : ''}`}
                      onClick={() => setForm((f) => ({ ...f, emoji }))}>
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
              <button className="btn btn-primary btn-full" style={{ marginTop: 8 }} onClick={saveNew} disabled={saving}>
                {saving ? '...' : '📍 Placer'}
              </button>
            </>
          ) : (
            <p style={{ color: '#64748b', fontSize: '.9rem' }}>Création de repère réservée au professeur.</p>
          )}
      </DialogShell>
    );
  }

  return (
    <DialogShell
      open
      onClose={onClose}
      overlayClassName="modal-overlay"
      dialogClassName="log-modal fade-in"
      dialogStyle={{ paddingTop: 16 }}
      ariaLabel={`Repère ${marker.label || ''}`}
      closeOnOverlay
      dialogRef={dialogRef}
    >
        {toast && <TimedToast msg={toast} onDone={() => setToast(null)} />}
        <button className="modal-close" onClick={onClose}>✕</button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{marker.label}</h3>
            <div style={{ marginTop: 3, fontSize: '.72rem', color: '#64748b', fontWeight: 600 }}>Repère</div>
          </div>
          {isTeacher && (
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              {onDuplicate && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={duplicating}
                  title="Créer une copie sur la même carte (position légèrement décalée)"
                  onClick={async () => {
                    setDuplicating(true);
                    try {
                      await onDuplicate(marker);
                    } catch (_) {
                      setToast('Duplication impossible');
                    }
                    setDuplicating(false);
                  }}>
                  {duplicating ? '…' : '📋 Copie'}
                </button>
              )}
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => {
                  if (confirm(`Supprimer le repère « ${marker.label} » ?`)) {
                    onDelete(marker.id);
                    onClose();
                  }
                }}>
                🗑️
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', background: 'var(--parchment)', borderRadius: 10, padding: 3, marginBottom: 14, gap: 2 }}>
          {TABS_EXISTING.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                padding: '8px 4px',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontFamily: 'DM Sans,sans-serif',
                fontSize: '.8rem',
                fontWeight: tab === t.id ? 700 : 400,
                background: tab === t.id ? 'var(--forest)' : 'transparent',
                color: tab === t.id ? 'white' : 'var(--soil)',
                transition: 'all .15s',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {onNavigateToTasksForLocation && marker.id && (
          <div style={{ marginBottom: 12 }}>
            <button
              type="button"
              className="btn btn-secondary btn-full"
              onClick={() => {
                onNavigateToTasksForLocation({ kind: 'marker', id: String(marker.id) });
                onClose();
              }}>
              ✅ Ouvrir l’onglet Tâches filtré sur ce repère
            </button>
            <p style={{ fontSize: '.74rem', color: '#64748b', margin: '6px 0 0', lineHeight: 1.4 }}>
              Affiche les tâches et tutoriels rattachés à ce lieu dans la liste des tâches.
            </p>
          </div>
        )}

        {tab === 'tasks' && isTeacher && (
          <div className="fade-in">
            <div style={{ marginTop: 12 }}>
              {linkedTasks.length === 0 ? (
                <p style={{ color: '#999', fontSize: '.85rem' }}>Aucune tâche liée à ce repère.</p>
              ) : linkedTasks.map((t) => (
                <div key={t.id} className="history-item" style={{ alignItems: 'center' }}>
                  <span>{t.title}</span>
                  <button className="btn btn-ghost btn-sm"
                    onClick={async () => {
                      await onUnlinkTask?.(t);
                      setToast('Tâche dissociée');
                    }}>
                    Délier
                  </button>
                </div>
              ))}
            </div>
            <div className="field" style={{ marginTop: 14 }}><label>Lier une tâche existante</label>
              <select value={linkTaskId} onChange={e => setLinkTaskId(e.target.value)}>
                <option value="">— Choisir une tâche —</option>
                {assignableTasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>
            <button className="btn btn-primary btn-full" disabled={!linkTaskId}
              onClick={async () => {
                await onLinkTask?.(linkTaskId);
                setLinkTaskId('');
                setToast('Tâche liée au repère ✓');
              }}>
              🔗 Lier la tâche
            </button>
          </div>
        )}
        {tab === 'tasks' && !isTeacher && (
          <div className="fade-in">
            {linkedTasks.length === 0 ? (
              <p style={{ color: '#999', fontSize: '.85rem' }}>Aucune tâche liée à ce repère.</p>
            ) : (
              <>
                <TaskEnrollmentLegend />
                <p style={{ color: '#666', fontSize: '.84rem', marginBottom: 10 }}>
                  {canSelfAssignTasks
                    ? 'Sélectionne une ou plusieurs tâches puis inscris-toi directement.'
                    : 'Profil visiteur : consultation en lecture seule.'}
                </p>
                {canSelfAssignTasks && Number(student?.taskEnrollment?.maxActiveAssignments) > 0 && (
                  <p style={{ fontSize: '.78rem', color: student?.taskEnrollment?.atLimit ? '#92400e' : '#166534', marginBottom: 10, lineHeight: 1.45 }}>
                    {student.taskEnrollment?.atLimit
                      ? `Limite atteinte (${student.taskEnrollment.currentActiveAssignments}/${student.taskEnrollment.maxActiveAssignments} tâches actives). Retire-toi d’une tâche ou attends une validation.`
                      : `Tâches actives : ${student.taskEnrollment.currentActiveAssignments}/${student.taskEnrollment.maxActiveAssignments} (non validées, toutes cartes).`}
                  </p>
                )}
                <div style={{ display: 'grid', gap: 8 }}>
                  {linkedTasks.map((t) => {
                    const canAssign = canStudentAssignTask(t, student);
                    const isMine = isStudentAssignedToTask(t, student);
                    const meta = taskEnrollmentMeta(t, student);
                    const checked = selectedTaskIds.includes(t.id);
                    return (
                      <label key={t.id} style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        border: '1px solid rgba(0,0,0,.08)',
                        borderRadius: 10,
                        padding: '10px 12px',
                        background: checked ? '#f0fdf4' : 'var(--parchment)',
                        cursor: canAssign ? 'pointer' : 'default',
                        opacity: canAssign || isMine ? 1 : 0.72,
                      }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!canEnroll || !canAssign || assigning}
                          onChange={() => {
                            if (!canEnroll || !canAssign) return;
                            setSelectedTaskIds((prev) => (
                              prev.includes(t.id) ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                            ));
                          }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, color: 'var(--forest)', fontSize: '.9rem' }}>{t.title}</div>
                          <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <span className="task-chip" style={{ color: meta.tone, borderColor: meta.border, background: meta.bg }}>
                              <span style={{ marginRight: 4, opacity: .8 }}>{meta.dot}</span>{meta.label}
                            </span>
                            <TaskDifficultyAndRiskChips task={t} />
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
                <button
                  className="btn btn-primary btn-full"
                  style={{ marginTop: 12 }}
                  disabled={!canEnroll || assigning || selectedTaskIds.length === 0}
                  onClick={async () => {
                    if (!onAssignTasks || selectedTaskIds.length === 0) return;
                    setAssigning(true);
                    const result = await onAssignTasks(selectedTaskIds);
                    if (result.failedCount > 0) {
                      const ok = result.assignedCount > 0 ? `${result.assignedCount} tâche(s) prise(s). ` : '';
                      setToast(`${ok}${result.failedCount} échec(s) : ${result.firstError || 'erreur inconnue'}`);
                    } else {
                      setToast(`${result.assignedCount} tâche(s) prise(s) en charge ✓`);
                    }
                    setSelectedTaskIds([]);
                    setAssigning(false);
                  }}>
                  {assigning ? 'Inscription...' : `✋ M'inscrire à ${selectedTaskIds.length || '...'} tâche(s)`}
                </button>
              </>
            )}
          </div>
        )}
        {tab === 'tutorials' && isTeacher && (
          <div className="fade-in">
            <div style={{ marginTop: 12 }}>
              {linkedTutorialsDirect.length === 0 && tutorialsOnlyViaTasks.length === 0 ? (
                <p style={{ color: '#999', fontSize: '.85rem' }}>Aucun tutoriel lié à ce repère.</p>
              ) : (
                <>
                  {linkedTutorialsDirect.length === 0 ? null : linkedTutorialsDirect.map((tu) => (
                    <div key={tu.id} className="history-item" style={{ alignItems: 'center' }}>
                      <span>{tu.title}{tu.is_active === false ? ' (archivé)' : ''}</span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={async () => {
                          await onUnlinkTutorial?.(tu);
                          setToast('Tutoriel dissocié');
                        }}>
                        Délier
                      </button>
                    </div>
                  ))}
                  {tutorialsOnlyViaTasks.length > 0 && (
                    <div style={{ marginTop: linkedTutorialsDirect.length ? 16 : 0 }}>
                      <p style={{ fontSize: '.78rem', color: '#64748b', margin: '0 0 8px', lineHeight: 1.45 }}>
                        Rattachés aux missions sur ce lieu (pour les retirer, modifie la tâche concernée).
                      </p>
                      {tutorialsOnlyViaTasks.map((tu) => (
                        <div key={`task-tu-${tu.id}`} className="history-item" style={{ alignItems: 'center' }}>
                          <span>{tu.title}{tu.is_active === false ? ' (archivé)' : ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="field" style={{ marginTop: 14 }}><label>Lier un tutoriel à ce repère</label>
              <select value={linkTutorialId} onChange={(e) => setLinkTutorialId(e.target.value)}>
                <option value="">— Choisir un tutoriel —</option>
                {assignableTutorials.map((tu) => (
                  <option key={tu.id} value={String(tu.id)}>{tu.title}</option>
                ))}
              </select>
              <p style={{ fontSize: '.74rem', color: '#64748b', margin: '6px 0 0', lineHeight: 1.4 }}>
                Tu peux lier plusieurs tutoriels en répétant l’opération pour chaque fiche.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-full"
              disabled={!linkTutorialId}
              onClick={async () => {
                await onLinkTutorial?.(linkTutorialId);
                setLinkTutorialId('');
                setToast('Tutoriel lié au repère ✓');
              }}>
              🔗 Lier le tutoriel
            </button>
          </div>
        )}
        {tab === 'tutorials' && !isTeacher && (
          <div className="fade-in">
            {linkedTutorialsVisible.length === 0 ? (
              <p style={{ color: '#999', fontSize: '.85rem' }}>Aucun tutoriel lié à ce repère.</p>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {linkedTutorialsVisible.map((tu) => {
                  const zones = tu.zones_linked || [];
                  const otherMarkers = (tu.markers_linked || []).filter((mk) => mk.id !== marker.id);
                  return (
                    <div
                      key={tu.id}
                      style={{
                        border: '1px solid rgba(0,0,0,.08)',
                        borderRadius: 10,
                        padding: '12px 14px',
                        background: 'var(--parchment)',
                      }}>
                      <div style={{ fontWeight: 700, color: 'var(--forest)' }}>{tu.title}</div>
                      {tu.summary && (
                        <p style={{ margin: '8px 0 0', fontSize: '.82rem', color: '#555', lineHeight: 1.45 }}>{tu.summary}</p>
                      )}
                      {zones.length > 0 && (
                        <p style={{ margin: '10px 0 0', fontSize: '.76rem', color: '#64748b' }}>
                          <strong>Zones</strong> : {zones.map((z) => z.name).join(', ')}
                        </p>
                      )}
                      {otherMarkers.length > 0 && (
                        <p style={{ margin: '6px 0 0', fontSize: '.76rem', color: '#64748b' }}>
                          <strong>Autres repères</strong> : {otherMarkers.map((m) => m.label).join(', ')}
                        </p>
                      )}
                      {tutorialPreviewCanEmbed(tu) && onOpenTutorialPreview ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          style={{ marginTop: 10 }}
                          onClick={() => onOpenTutorialPreview(tutorialPreviewPayload(tu))}
                        >
                          📖 Consulter
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {tab === 'info' && (
          <div className="fade-in">
            {marker.note && (
              <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '10px 14px', marginBottom: 12,
                border: '1px solid var(--mint)', fontSize: '.88rem', color: '#333', lineHeight: 1.6 }}>
                <MarkdownContent>{marker.note}</MarkdownContent>
              </div>
            )}
            {showVisitAsideBlock && (
              <div style={{ marginBottom: 12 }}>
                {marker.visit_subtitle && <p className="visit-subtitle" style={{ margin: '0 0 8px' }}>{marker.visit_subtitle}</p>}
                {marker.visit_short_description && (
                  <MarkdownContent style={{ margin: '0 0 8px', fontSize: '.88rem', color: '#333' }}>{marker.visit_short_description}</MarkdownContent>
                )}
                {marker.visit_details_text && (
                  <details className="visit-details" style={{ marginTop: 8 }}>
                    <summary>{marker.visit_details_title || 'Détails'}</summary>
                    <MarkdownContent style={{ margin: '8px 0 0', fontSize: '.86rem' }}>{marker.visit_details_text}</MarkdownContent>
                  </details>
                )}
                {visitAsideSpecies && (
                  <details className="visit-details" style={{ marginTop: 8 }}>
                    <summary>Biodiversité</summary>
                    <div style={{ marginTop: 8 }}>
                      {markerLivingNamesOrdered.length > 0 && (
                        <div style={{ marginBottom: livingBeingsOnlyOnTasks.length ? 14 : 0 }}>
                          {markerLivingNamesOrdered.length > 1 || livingBeingsOnlyOnTasks.length > 0 ? (
                            <h4 style={{ margin: '0 0 8px', fontSize: '.82rem', color: 'var(--forest)' }}>Sur ce repère</h4>
                          ) : null}
                          {onOpenPlantCatalogPreview ? (
                            <BiodiversitySpeciesOpenLinks
                              plants={plants}
                              names={markerLivingNamesOrdered}
                              showHeading={false}
                              onOpenPlant={onOpenPlantCatalogPreview}
                            />
                          ) : (
                            <LivingBeingsCatalogPanel plants={plants} names={markerLivingNamesOrdered} showHeading={false} />
                          )}
                        </div>
                      )}
                      {livingBeingsOnlyOnTasks.length > 0 && (
                        <div>
                          <h4 style={{ margin: '0 0 8px', fontSize: '.82rem', color: 'var(--forest)' }}>Également dans les missions</h4>
                          {onOpenPlantCatalogPreview ? (
                            <BiodiversitySpeciesOpenLinks
                              plants={plants}
                              names={livingBeingsOnlyOnTasks}
                              showHeading={false}
                              sectionTitle="Également dans les missions"
                              onOpenPlant={onOpenPlantCatalogPreview}
                            />
                          ) : (
                            <LivingBeingsCatalogPanel plants={plants} names={livingBeingsOnlyOnTasks} showHeading={false} />
                          )}
                        </div>
                      )}
                    </div>
                  </details>
                )}
                {visitAsideTutorials && (
                  <details className="visit-details" style={{ marginTop: 8 }}>
                    <summary>Tuto</summary>
                    <div style={{ marginTop: 8 }}>
                      <LocationTutorialPreviewList
                        tutorials={isTeacher ? linkedTutorialsAll : linkedTutorialsVisible}
                        locationKind="marker"
                        locationId={marker.id}
                        onOpenTutorialPreview={onOpenTutorialPreview}
                      />
                    </div>
                  </details>
                )}
              </div>
            )}
            {orderedLivingBeingsForForm(marker.living_beings_list || marker.living_beings, marker.plant_name).length === 0
              && livingBeingsOnlyOnTasks.length === 0
              && !marker.note
              && !showVisitAsideBlock && (
              <p style={{ color: '#bbb', fontSize: '.85rem', fontStyle: 'italic', textAlign: 'center', padding: '20px 0' }}>
                Aucune information pour l’instant.
              </p>
            )}
            {contextCommentsEnabled && (
              <ContextComments
                contextType="marker"
                contextId={marker.id}
                title="Commentaires du repère"
                placeholder="Ajouter une observation sur ce repère..."
                canParticipateContextComments={canParticipateContextComments}
              />
            )}
          </div>
        )}
        {tab === 'photos' && (
          <div className="fade-in">
            <PhotoGallery markerId={marker.id} isTeacher={isTeacher} />
          </div>
        )}
        {tab === 'edit' && isTeacher && (
          <div className="fade-in">
            <div className="field"><label>Nom du repère *</label>
              <input value={form.label} onChange={set('label')} placeholder="Ex: Olivier n°10" />
            </div>
            <div className="field"><label>Êtres vivants</label>
              <p style={{ fontSize: '.76rem', color: '#64748b', margin: '0 0 8px', lineHeight: 1.45 }}>
                Ctrl / Cmd + clic pour plusieurs ; l’ordre choisi est conservé.
              </p>
              <select
                multiple
                size={Math.min(10, Math.max(4, plants.length + 1))}
                value={form.living_beings}
                onChange={(e) => {
                  const picked = Array.from(e.target.selectedOptions).map((opt) => opt.value);
                  setForm((f) => ({
                    ...f,
                    living_beings: nextLivingBeingsFromMultiSelect(f.living_beings, picked, plants),
                  }));
                }}>
                {plants.map(p => <option key={p.id} value={p.name}>{p.emoji} {p.name}</option>)}
              </select>
            </div>
            {form.living_beings.length > 0 && (
              <LivingBeingsCatalogPanel plants={plants} names={form.living_beings} showHeading={false} />
            )}
            <div className="field"><label>Description</label>
              <MarkdownTextarea value={form.note} onChange={set('note')} rows={3}
                placeholder="Observations, entretien..." />
            </div>
            <p style={{ fontSize: '.78rem', color: '#64748b', margin: '0 0 10px', lineHeight: 1.45 }}>
              Textes ci-dessous : même contenu qu’en mode visite (sous-titre, accroche, bloc dépliable).
            </p>
            <div className="field"><label>Sous-titre (visite)</label>
              <input value={form.visit_subtitle} onChange={set('visit_subtitle')} placeholder="Optionnel" />
            </div>
            <div className="field"><label>Description courte (visite)</label>
              <MarkdownTextarea value={form.visit_short_description} onChange={set('visit_short_description')} rows={2} placeholder="Texte d’accroche sous le titre" />
            </div>
            <div className="field"><label>Titre du bloc dépliable (visite)</label>
              <input value={form.visit_details_title} onChange={set('visit_details_title')} placeholder="Détails" />
            </div>
            <div className="field"><label>Détails dépliables (visite)</label>
              <MarkdownTextarea value={form.visit_details_text} onChange={set('visit_details_text')} rows={4} placeholder="Contenu du panneau repliable" />
            </div>
            <div className="visit-editorial-builder">
              <h5>Bloc images (visite)</h5>
              <p className="section-sub">Choisis des photos déjà associées au repère, ou associe d’abord une photo de l’onglet Photos.</p>
              <div className="visit-editorial-builder__actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={addImageBlock}>+ Bloc image</button>
              </div>
              <VisitEditorialMapPhotoImportList
                photos={markerPhotoOptions}
                heading="Photos liées à ce repère"
                onAssociate={attachMarkerPhotoToVisit}
              />
              <div className="visit-editorial-builder__list">
                {imageBlocks.map((block) => (
                  <div key={block.id} className="visit-editorial-builder__item">
                    <div className="visit-editorial-builder__head">
                      <strong>Image(s)</strong>
                      <div className="visit-editorial-builder__head-actions">
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => removeImageBlock(block.id)}>Suppr.</button>
                      </div>
                    </div>
                    <div className="visit-editorial-builder__image">
                      <label>Photos du bloc (1 ou 2)</label>
                      <VisitEditorialMediaIdPicker
                        mediaList={visitMediaOptions}
                        selectedIds={block.media_ids || []}
                        onChange={(ids) => updateImageBlock(block.id, { media_ids: ids })}
                        emptyHint="Aucune photo visite — onglet Photos ou associe une photo repère ci-dessus."
                      />
                      <div className="visit-editorial-builder__image-meta">
                        <select value={block.size || 'md'} onChange={(e) => updateImageBlock(block.id, { size: e.target.value })}>
                          <option value="sm">Compact</option>
                          <option value="md">Normal</option>
                          <option value="lg">Large</option>
                        </select>
                      </div>
                      <input
                        value={block.caption || ''}
                        onChange={(e) => updateImageBlock(block.id, { caption: e.target.value })}
                        placeholder="Légende (optionnel)"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="field"><label htmlFor="marker-edit-emoji-custom">Emoji du repère (optionnel)</label>
              <ZoneOrMarkerEmojiField
                id="marker-edit-emoji-custom"
                value={form.emoji}
                onChange={(v) => setForm((f) => ({ ...f, emoji: v }))}
                maxLen={MAP_MARKER_EMOJI_MAX_CHARS}
                allowNone
              />
              <div style={{
                display: 'flex', gap: 6, flexWrap: 'wrap', maxHeight: 180, overflowY: 'auto', paddingRight: 2,
                WebkitOverflowScrolling: 'touch', touchAction: 'pan-y',
              }}>
                {markerEmojis.map((emoji) => (
                  <button
                    type="button"
                    key={emoji}
                    className={`emoji-btn ${form.emoji === emoji ? 'sel' : ''}`}
                    onClick={() => setForm((f) => ({ ...f, emoji }))}>
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
            <button className="btn btn-primary btn-full" onClick={saveEdit} disabled={saving}>
              {saving ? '...' : '💾 Sauvegarder'}
            </button>
            {onRequestAdjustMarkerPosition && (
              <button
                type="button"
                className="btn btn-ghost btn-full"
                style={{ marginTop: 8 }}
                onClick={() => {
                  onRequestAdjustMarkerPosition();
                  onClose();
                }}>
                📍 Ajuster la position sur la carte
              </button>
            )}
          </div>
        )}

    </DialogShell>
  );
}


export { MarkerModal };
