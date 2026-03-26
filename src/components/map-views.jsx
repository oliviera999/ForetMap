import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../services/api';
import { ZONE_COLORS } from '../constants/garden';
import { MARKER_EMOJIS } from '../constants/emojis';
import { stageBadge } from '../utils/badges';
import { compressImage } from '../utils/image';
import { useDialogA11y } from '../hooks/useDialogA11y';

function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2400); return () => clearTimeout(t); }, []);
  return <div className="toast" role="status" aria-live="polite" aria-atomic="true">{msg}</div>;
}

function Lightbox({ src, caption, onClose }) {
  const el = useMemo(() => document.createElement('div'), []);
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

function parseLivingBeings(value, fallback = '') {
  const raw = Array.isArray(value) ? value : (() => {
    if (!value) return [];
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed;
      } catch (_) {}
      return value.split(',');
    }
    return [];
  })();
  const cleaned = [...new Set(raw.map(v => String(v || '').trim()).filter(Boolean))];
  if (cleaned.length === 0 && fallback) return [String(fallback).trim()];
  return cleaned;
}

function PhotoGallery({ zoneId, isTeacher }) {
  const [photos, setPhotos] = useState([]);
  const [big, setBig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState('');
  const fileRef = useRef();

  const load = async () => {
    setLoading(true);
    try {
      const list = await api(`/api/zones/${zoneId}/photos`);
      setPhotos(list);
      setLoading(false);
    } catch (e) { console.error('[ForetMap] chargement photos zone', e); setLoading(false); }
  };

  useEffect(() => { load(); }, [zoneId]);

  const upload = async e => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const img = await compressImage(file);
      await api(`/api/zones/${zoneId}/photos`, 'POST', { image_data: img, caption });
      setCaption('');
      await load();
    } catch (err) { alert(err.message); }
    setUploading(false);
  };

  const del = async id => {
    if (!confirm('Supprimer cette photo ?')) return;
    await api(`/api/zones/${zoneId}/photos/${id}`, 'DELETE');
    await load();
  };

  return (
    <div style={{ marginTop: 12 }}>
      {big && <Lightbox src={big.src} caption={big.caption} onClose={() => setBig(null)} />}

      {loading
        ? <p style={{ color: '#aaa', fontSize: '.85rem', textAlign: 'center', padding: '16px 0' }}>Chargement...</p>
        : photos.length === 0
          ? <p style={{ color: '#bbb', fontSize: '.85rem', fontStyle: 'italic', textAlign: 'center', padding: '12px 0' }}>
              Aucune photo pour cette zone.
            </p>
          : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(100px,1fr))', gap: 8, marginBottom: 12 }}>
              {photos.map(p => (
                <div key={p.id} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden',
                  aspectRatio: '1', background: '#e8f5e9' }}>
                  {p.image_url
                    ? <img src={p.image_url} style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
                        onClick={() => setBig({ src: p.image_url, caption: p.caption })} alt={p.caption || ''} />
                    : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: '1.5rem', animation: 'sway 1.5s infinite' }}>🌿</div>
                  }
                  {p.image_url && p.caption && (
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,.55)',
                      color: 'white', fontSize: '.62rem', padding: '3px 5px',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.caption}</div>
                  )}
                  {isTeacher && p.image_url && (
                    <button onClick={() => del(p.id)}
                      style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,.55)',
                        border: 'none', color: 'white', borderRadius: '50%', width: 22, height: 22,
                        fontSize: '.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
      }

      {isTeacher && (
        <div>
          <input value={caption} onChange={e => setCaption(e.target.value)}
            placeholder="Légende (optionnel)" style={{ fontSize: '16px', width: '100%', marginBottom: 6,
              padding: '8px 12px', border: '1.5px solid var(--mint)', borderRadius: 8, background: 'var(--cream)' }} />
          <button className="btn btn-secondary btn-sm btn-full" disabled={uploading}
            onClick={() => fileRef.current.click()}>
            {uploading ? 'Envoi...' : '📷 Ajouter une photo'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment"
            style={{ display: 'none' }} onChange={upload} />
        </div>
      )}
    </div>
  );
}

/** IDs zones/repères liés à une tâche (API multi + champs legacy). */
function taskLocationIds(t) {
  if (!t) return { zoneIds: [], markerIds: [] };
  const zoneIds = [...new Set([...(t.zone_ids || []), ...(t.zone_id ? [t.zone_id] : [])])];
  const markerIds = [...new Set([...(t.marker_ids || []), ...(t.marker_id ? [t.marker_id] : [])])];
  return { zoneIds, markerIds };
}

function isTaskAssignedToStudent(task, student) {
  if (!task || !student) return false;
  const first = String(student.first_name || '').toLowerCase();
  const last = String(student.last_name || '').toLowerCase();
  return (task.assignments || []).some((a) => (
    String(a.student_first_name || '').toLowerCase() === first &&
    String(a.student_last_name || '').toLowerCase() === last
  ));
}

function taskOpenSlots(task) {
  const required = Number(task?.required_students || 1);
  const assigned = Array.isArray(task?.assignments) ? task.assignments.length : 0;
  return Math.max(0, required - assigned);
}

function canStudentAssignTask(task, student) {
  if (!task || !student) return false;
  if (task.status === 'validated' || task.status === 'done') return false;
  if (isTaskAssignedToStudent(task, student)) return false;
  return taskOpenSlots(task) > 0;
}

function taskEnrollmentMeta(task, student) {
  const isMine = isTaskAssignedToStudent(task, student);
  const slots = taskOpenSlots(task);
  const isClosed = task?.status === 'validated' || task?.status === 'done';
  if (isMine) {
    return { tone: '#0f766e', bg: '#f0fdfa', border: '#99f6e4', dot: '●', label: 'Déjà prise par toi' };
  }
  if (isClosed) {
    return { tone: '#92400e', bg: '#fffbeb', border: '#fde68a', dot: '●', label: task.status === 'done' ? 'Terminée (en attente)' : 'Validée' };
  }
  if (slots <= 0) {
    return { tone: '#991b1b', bg: '#fef2f2', border: '#fecaca', dot: '●', label: 'Complet' };
  }
  return { tone: '#166534', bg: '#f0fdf4', border: '#86efac', dot: '●', label: `${slots} place${slots > 1 ? 's' : ''} disponible${slots > 1 ? 's' : ''}` };
}

function TaskEnrollmentLegend() {
  const items = [
    { key: 'mine', color: '#0f766e', label: 'Déjà prise' },
    { key: 'open', color: '#166534', label: 'Disponible' },
    { key: 'full', color: '#991b1b', label: 'Complet' },
    { key: 'closed', color: '#92400e', label: 'Fermée' },
  ];
  return (
    <div style={{ marginBottom: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {items.map((item) => (
        <span key={item.key} style={{ fontSize: '.78rem', color: '#555', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ color: item.color, fontSize: '.9rem', lineHeight: 1 }}>●</span>
          {item.label}
        </span>
      ))}
    </div>
  );
}

const TASK_VISUAL_PRIORITY = { done: 1, progress: 2, todo: 3 };
const TASK_VISUAL_LABEL = {
  todo: 'Tâche à faire',
  progress: 'Tâche en cours',
  done: 'Tâche terminée',
};

function taskVisualStatus(status) {
  if (status === 'available') return 'todo';
  if (status === 'in_progress') return 'progress';
  if (status === 'done' || status === 'validated') return 'done';
  return null;
}

function mergeTaskVisualStatus(current, next) {
  if (!current) return next;
  if (!next) return current;
  return (TASK_VISUAL_PRIORITY[next] || 0) > (TASK_VISUAL_PRIORITY[current] || 0) ? next : current;
}

function ZoneInfoModal({ zone, plants, tasks, isTeacher, student, onClose, onUpdate, onDelete, onEditPoints, onLinkTask, onUnlinkTask, onAssignTasks }) {
  const dialogRef = useDialogA11y(onClose);
  const [tab, setTab] = useState('tasks');
  const [zoneName, setZoneName] = useState(zone.name || '');
  const [plant, setPlant] = useState(zone.current_plant || '');
  const [livingBeings, setLivingBeings] = useState(parseLivingBeings(zone.living_beings_list || zone.living_beings, zone.current_plant));
  const [stage, setStage] = useState(zone.stage || 'empty');
  const [desc, setDesc] = useState(zone.description || '');
  const [linkTaskId, setLinkTaskId] = useState('');
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);
  const [assigning, setAssigning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const displayStage = zone.special ? 'special' : zone.stage;
  const plantObj = plants.find(p => p.name === zone.current_plant);
  const taskMapId = (t) => t.map_id_resolved || t.map_id || t.zone_map_id || t.marker_map_id || null;
  const linkedTasks = (tasks || []).filter((t) => taskLocationIds(t).zoneIds.includes(zone.id));
  const studentAssignableTasks = linkedTasks.filter((t) => canStudentAssignTask(t, student));
  const assignableTasks = (tasks || []).filter((t) => {
    if (linkedTasks.some((lt) => lt.id === t.id)) return false;
    const mapId = taskMapId(t);
    return mapId === zone.map_id || mapId == null;
  });
  const showTasksTab = isTeacher || (!!student && linkedTasks.length > 0);

  useEffect(() => {
    if (!showTasksTab && tab === 'tasks') {
      setTab('info');
    }
  }, [showTasksTab, tab]);

  useEffect(() => {
    setSelectedTaskIds((prev) => prev.filter((id) => studentAssignableTasks.some((t) => t.id === id)));
  }, [studentAssignableTasks]);

  const save = async () => {
    if (!zoneName.trim()) {
      setToast('Nom requis');
      return;
    }
    setSaving(true);
    try {
      await onUpdate(zone.id, { name: zoneName, current_plant: plant, living_beings: livingBeings, stage, description: desc });
      setToast('Sauvegardé ✓');
      setTab('info');
    } catch (e) { setToast('Erreur'); }
    setSaving(false);
  };

  const TABS = [
    ...(showTasksTab ? [{ id: 'tasks', label: '✅ Tâches' }] : []),
    { id: 'info', label: 'ℹ️ Info' },
    { id: 'photos', label: '📷 Photos' },
    ...(isTeacher && !zone.special ? [{ id: 'edit', label: '✏️ Modifier' }] : []),
  ];

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        className="log-modal fade-in"
        style={{ paddingTop: 16 }}
        role="dialog"
        aria-modal="true"
        aria-label={`Zone ${zone.name}`}
        tabIndex={-1}
      >
        {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
        <button className="modal-close" onClick={onClose}>✕</button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: '1.8rem' }}>
            {zone.special
              ? (zone.id.includes('ruche') ? '🐝' : zone.id.includes('mare') ? '💧' : zone.id.includes('butte') ? '🌸' : '🏛️')
              : (plantObj?.emoji || (zone.current_plant ? '🌱' : '🪨'))
            }
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{zone.name}</h3>
            <div style={{ marginTop: 3 }}>{stageBadge(displayStage)}</div>
          </div>
          {isTeacher && !zone.special && (
            <button className="btn btn-danger btn-sm"
              onClick={() => { if (confirm(`Supprimer "${zone.name}" ?`)) { onDelete(zone.id); onClose(); } }}>
              🗑️
            </button>
          )}
        </div>

        <div style={{ display: 'flex', background: 'var(--parchment)', borderRadius: 10, padding: 3, marginBottom: 14, gap: 2 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ flex: 1, padding: '8px 4px', border: 'none', borderRadius: 8, cursor: 'pointer',
                fontFamily: 'DM Sans,sans-serif', fontSize: '.8rem', fontWeight: tab === t.id ? 700 : 400,
                background: tab === t.id ? 'var(--forest)' : 'transparent',
                color: tab === t.id ? 'white' : 'var(--soil)', transition: 'all .15s' }}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'info' && (
          <div className="fade-in">
            {!zone.special && zone.current_plant && (
              <div style={{ background: 'var(--parchment)', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
                <div style={{ fontWeight: 700, color: 'var(--forest)', marginBottom: 3 }}>{zone.current_plant}</div>
                {plantObj?.description && <p style={{ fontSize: '.83rem', color: '#555', lineHeight: 1.5, margin: 0 }}>{plantObj.description}</p>}
              </div>
            )}
            {parseLivingBeings(zone.living_beings_list || zone.living_beings, zone.current_plant).length > 0 && (
              <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 14px', marginBottom: 12, border: '1px solid #dbeafe' }}>
                <div style={{ fontSize: '.78rem', fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>Êtres vivants associés</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {parseLivingBeings(zone.living_beings_list || zone.living_beings, zone.current_plant).map((name) => (
                    <span key={name} className="task-chip">🌱 {name}</span>
                  ))}
                </div>
              </div>
            )}
            {zone.description && (
              <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '10px 14px', marginBottom: 12,
                border: '1px solid var(--mint)', fontSize: '.88rem', color: '#333', lineHeight: 1.6 }}>
                {zone.description}
              </div>
            )}
            {zone.history?.length > 0 && (
              <div className="history-list">
                <h4>Historique cultures</h4>
                {zone.history.map((h, i) => (
                  <div key={i} className="history-item">
                    <span>{h.plant}</span><span style={{ color: '#aaa', fontSize: '.76rem' }}>{h.harvested_at}</span>
                  </div>
                ))}
              </div>
            )}
            {!zone.special && !zone.current_plant && !zone.description && zone.history?.length === 0 && (
              <p style={{ color: '#bbb', fontSize: '.85rem', fontStyle: 'italic', textAlign: 'center', padding: '20px 0' }}>
                Zone vide — aucune information pour l'instant.
              </p>
            )}
          </div>
        )}

        {tab === 'photos' && (
          <div className="fade-in">
            <PhotoGallery zoneId={zone.id} isTeacher={isTeacher} />
          </div>
        )}

        {tab === 'edit' && isTeacher && !zone.special && (
          <div className="fade-in">
            <div className="field"><label>Nom de la zone *</label>
              <input value={zoneName} onChange={e => setZoneName(e.target.value)} placeholder="Ex: Potager Est" />
            </div>
            <div className="field"><label>Être vivant actuel</label>
              <select value={plant} onChange={e => {
                setPlant(e.target.value);
                setLivingBeings((prev) => {
                  const list = parseLivingBeings(prev, e.target.value);
                  return e.target.value ? [...new Set([e.target.value, ...list])] : list;
                });
                if (e.target.value && stage === 'empty') setStage('growing');
                if (!e.target.value) setStage('empty');
              }}>
                <option value="">— Vide —</option>
                {plants.map(p => <option key={p.id} value={p.name}>{p.emoji} {p.name}</option>)}
              </select>
            </div>
            <div className="field"><label>Autres êtres vivants associés</label>
              <select
                multiple
                value={livingBeings}
                onChange={e => {
                  const list = Array.from(e.target.selectedOptions).map(opt => opt.value);
                  setLivingBeings([...new Set([...(plant ? [plant] : []), ...list])]);
                }}>
                {plants.map(p => <option key={p.id} value={p.name}>{p.emoji} {p.name}</option>)}
              </select>
            </div>
            <div className="field"><label>État</label>
              <select value={stage} onChange={e => setStage(e.target.value)}>
                <option value="empty">Vide</option>
                <option value="growing">En croissance</option>
                <option value="ready">Prêt à récolter</option>
              </select>
            </div>
            <div className="field"><label>Description</label>
              <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3}
                placeholder="Observations, conseils, notes sur cette zone..." />
            </div>
            <button className="btn btn-primary btn-full" onClick={save} disabled={saving}>
              {saving ? '...' : '💾 Sauvegarder'}
            </button>
            {onEditPoints && (
              <button className="btn btn-ghost btn-full" style={{ marginTop: 8 }}
                onClick={() => { onEditPoints(zone); onClose(); }}>
                🔷 Modifier le contour de la zone
              </button>
            )}
          </div>
        )}
        {tab === 'tasks' && isTeacher && (
          <div className="fade-in">
            <div style={{ marginTop: 12 }}>
              {linkedTasks.length === 0 ? (
                <p style={{ color: '#999', fontSize: '.85rem' }}>Aucune tâche liée à cette zone.</p>
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
                setToast('Tâche liée à la zone ✓');
              }}>
              🔗 Lier la tâche
            </button>
          </div>
        )}
        {tab === 'tasks' && !isTeacher && (
          <div className="fade-in">
            {linkedTasks.length === 0 ? (
              <p style={{ color: '#999', fontSize: '.85rem' }}>Aucune tâche liée à cette zone.</p>
            ) : (
              <>
                <TaskEnrollmentLegend />
                <p style={{ color: '#666', fontSize: '.84rem', marginBottom: 10 }}>
                  Sélectionne une ou plusieurs tâches puis inscris-toi directement.
                </p>
                <div style={{ display: 'grid', gap: 8 }}>
                  {linkedTasks.map((t) => {
                    const canAssign = canStudentAssignTask(t, student);
                    const isMine = isTaskAssignedToStudent(t, student);
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
                          disabled={!canAssign || assigning}
                          onChange={() => {
                            if (!canAssign) return;
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
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
                <button
                  className="btn btn-primary btn-full"
                  style={{ marginTop: 12 }}
                  disabled={assigning || selectedTaskIds.length === 0}
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
      </div>
    </div>
  );
}

function ZoneDrawModal({ points_pct, onClose, onSave, plants }) {
  const dialogRef = useDialogA11y(onClose);
  const [form, setForm] = useState({ name: '', current_plant: '', living_beings: [], stage: 'empty', description: '', color: ZONE_COLORS[0] });
  const [saving, setSaving] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try { await onSave({ ...form, points: points_pct }); onClose(); }
    catch (e) { setSaving(false); }
  };
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        className="log-modal fade-in"
        role="dialog"
        aria-modal="true"
        aria-label="Nouvelle zone"
        tabIndex={-1}
      >
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3>🖊️ Nouvelle zone</h3>
        <p style={{ fontSize: '.83rem', color: '#888', marginBottom: 14 }}>{points_pct.length} points tracés</p>
        <div className="field"><label>Nom *</label>
          <input value={form.name} onChange={set('name')} placeholder="Ex: Potager Est" autoFocus />
        </div>
        <div className="row">
          <div className="field"><label>Être vivant</label>
            <select value={form.current_plant} onChange={e => {
              const value = e.target.value;
              setForm((f) => ({
                ...f,
                current_plant: value,
                living_beings: value ? [...new Set([value, ...f.living_beings])] : f.living_beings,
              }));
            }}>
              <option value="">— Vide —</option>
              {plants.map(p => <option key={p.id} value={p.name}>{p.emoji} {p.name}</option>)}
            </select>
          </div>
          <div className="field"><label>État</label>
            <select value={form.stage} onChange={set('stage')}>
              <option value="empty">Vide</option>
              <option value="growing">En croissance</option>
              <option value="ready">Prêt à récolter</option>
            </select>
          </div>
        </div>
        <div className="field"><label>Êtres vivants associés</label>
          <select
            multiple
            value={form.living_beings}
            onChange={e => {
              const list = Array.from(e.target.selectedOptions).map(opt => opt.value);
              setForm((f) => ({ ...f, living_beings: [...new Set([...(f.current_plant ? [f.current_plant] : []), ...list])] }));
            }}>
            {plants.map(p => <option key={p.id} value={p.name}>{p.emoji} {p.name}</option>)}
          </select>
        </div>
        <div className="field"><label>Description</label>
          <textarea value={form.description} onChange={set('description')} rows={2}
            placeholder="Notes, observations sur cette zone..." />
        </div>
        <div className="field"><label>Couleur</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {ZONE_COLORS.map(c => (
              <div key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                style={{ width: 30, height: 30, borderRadius: 8, background: c, cursor: 'pointer',
                  border: form.color === c ? '3px solid #1a4731' : '2px solid #ddd',
                  transition: 'transform .1s', transform: form.color === c ? 'scale(1.15)' : 'none' }} />
            ))}
          </div>
        </div>
        <button className="btn btn-primary btn-full" onClick={save} disabled={saving} style={{ marginTop: 4 }}>
          {saving ? '...' : '✅ Créer la zone'}
        </button>
      </div>
    </div>
  );
}

function MarkerModal({ marker, plants, tasks, onClose, onSave, onDelete, onLinkTask, onUnlinkTask, onAssignTasks, isTeacher, student }) {
  const dialogRef = useDialogA11y(onClose);
  const isNew = !marker.id;
  const [form, setForm] = useState({
    label: marker.label || '', plant_name: marker.plant_name || '',
    living_beings: parseLivingBeings(marker.living_beings_list || marker.living_beings, marker.plant_name),
    note: marker.note || '', emoji: marker.emoji || '🌱',
  });
  const [saving, setSaving] = useState(false);
  const [linkTaskId, setLinkTaskId] = useState('');
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);
  const [assigning, setAssigning] = useState(false);
  const [toast, setToast] = useState(null);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const taskMapId = (t) => t.map_id_resolved || t.map_id || t.zone_map_id || t.marker_map_id || null;
  const linkedTasks = (tasks || []).filter((t) => taskLocationIds(t).markerIds.includes(marker.id));
  const studentAssignableTasks = linkedTasks.filter((t) => canStudentAssignTask(t, student));
  const assignableTasks = (tasks || []).filter((t) => {
    if (linkedTasks.some((lt) => lt.id === t.id)) return false;
    const mapId = taskMapId(t);
    return mapId === marker.map_id || mapId == null;
  });

  useEffect(() => {
    setSelectedTaskIds((prev) => prev.filter((id) => studentAssignableTasks.some((t) => t.id === id)));
  }, [studentAssignableTasks]);

  const save = async () => {
    if (!form.label.trim()) return;
    setSaving(true);
    const living = parseLivingBeings(form.living_beings, form.plant_name);
    const payload = { ...marker, ...form, living_beings: living, plant_name: form.plant_name || living[0] || '' };
    try { await onSave(payload); onClose(); }
    catch (e) { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        className="log-modal fade-in"
        role="dialog"
        aria-modal="true"
        aria-label={isNew ? 'Nouveau repère' : `Repère ${form.label || marker.label || ''}`}
        tabIndex={-1}
      >
        {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
        <button className="modal-close" onClick={onClose}>✕</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: '2rem' }}>{form.emoji}</span>
          <h3 style={{ margin: 0 }}>{isNew ? 'Nouveau repère' : form.label}</h3>
        </div>

        {isTeacher ? (
          <>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {MARKER_EMOJIS.map(e => (
                <button key={e} className={`emoji-btn ${form.emoji === e ? 'sel' : ''}`}
                  onClick={() => setForm(f => ({ ...f, emoji: e }))}>{e}</button>
              ))}
            </div>
            <div className="field"><label>Nom du repère *</label>
              <input value={form.label} onChange={set('label')} placeholder="Ex: Olivier n°10" />
            </div>
            <div className="field"><label>Être vivant associé</label>
              <select value={form.plant_name} onChange={e => {
                const value = e.target.value;
                setForm(f => ({
                  ...f,
                  plant_name: value,
                  living_beings: value ? [...new Set([value, ...parseLivingBeings(f.living_beings, value)])] : parseLivingBeings(f.living_beings, ''),
                }));
              }}>
                <option value="">— Aucune —</option>
                {plants.map(p => <option key={p.id} value={p.name}>{p.emoji} {p.name}</option>)}
              </select>
            </div>
            <div className="field"><label>Autres êtres vivants associés</label>
              <select
                multiple
                value={form.living_beings}
                onChange={e => {
                  const list = Array.from(e.target.selectedOptions).map(opt => opt.value);
                  setForm(f => ({ ...f, living_beings: [...new Set([...(f.plant_name ? [f.plant_name] : []), ...list])] }));
                }}>
                {plants.map(p => <option key={p.id} value={p.name}>{p.emoji} {p.name}</option>)}
              </select>
            </div>
            <div className="field"><label>Note</label>
              <textarea value={form.note} onChange={set('note')} rows={3}
                placeholder="Observations, entretien..." />
            </div>
            {!!marker.id && (
              <>
                <div className="field"><label>Lier une tâche existante</label>
                  <select value={linkTaskId} onChange={e => setLinkTaskId(e.target.value)}>
                    <option value="">— Choisir une tâche —</option>
                    {assignableTasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                </div>
                <button className="btn btn-secondary btn-full" disabled={!linkTaskId}
                  onClick={async () => {
                    await onLinkTask?.(linkTaskId);
                    setLinkTaskId('');
                  }}>
                  🔗 Lier à ce repère
                </button>
                <div style={{ marginTop: 10 }}>
                  {linkedTasks.length === 0 ? (
                    <p style={{ color: '#999', fontSize: '.85rem' }}>Aucune tâche liée à ce repère.</p>
                  ) : linkedTasks.map((t) => (
                    <div key={t.id} className="history-item" style={{ alignItems: 'center' }}>
                      <span>{t.title}</span>
                      <button className="btn btn-ghost btn-sm" onClick={async () => onUnlinkTask?.(t)}>Délier</button>
                    </div>
                  ))}
                </div>
              </>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={save} disabled={saving}>
                {saving ? '...' : (isNew ? '📍 Placer' : '💾 Sauver')}
              </button>
              {!isNew && (
                <button className="btn btn-danger" onClick={() => {
                  if (confirm('Supprimer ce repère ?')) { onDelete(marker.id); onClose(); }
                }}>🗑️</button>
              )}
            </div>
          </>
        ) : (
          <div>
            <div style={{ marginTop: 14 }}>
              <h4 style={{ margin: '0 0 8px', fontSize: '.95rem' }}>✅ Tâches liées</h4>
              {linkedTasks.length === 0 ? (
                <p style={{ color: '#999', fontSize: '.85rem' }}>Aucune tâche liée à ce repère.</p>
              ) : (
                <>
                  <TaskEnrollmentLegend />
                  <p style={{ color: '#666', fontSize: '.84rem', marginBottom: 10 }}>
                    Tu peux t'inscrire à une ou plusieurs tâches liées à ce repère.
                  </p>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {linkedTasks.map((t) => {
                      const canAssign = canStudentAssignTask(t, student);
                      const isMine = isTaskAssignedToStudent(t, student);
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
                            disabled={!canAssign || assigning}
                            onChange={() => {
                              if (!canAssign) return;
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
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  <button
                    className="btn btn-primary btn-full"
                    style={{ marginTop: 12 }}
                    disabled={assigning || selectedTaskIds.length === 0}
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
            {form.plant_name && (
              <div style={{ background: 'var(--parchment)', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
                <div style={{ fontWeight: 700, color: 'var(--forest)' }}>{form.plant_name}</div>
              </div>
            )}
            {form.note
              ? <p style={{ fontSize: '.9rem', color: '#444', lineHeight: 1.6 }}>{form.note}</p>
              : <p style={{ fontSize: '.85rem', color: '#aaa', fontStyle: 'italic' }}>Aucune note.</p>
            }
            {parseLivingBeings(form.living_beings, form.plant_name).length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {parseLivingBeings(form.living_beings, form.plant_name).map((name) => (
                  <span key={name} className="task-chip">🌱 {name}</span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function useMapGestures({ mapImageSrc, activeMapId, mode, onRefresh }) {
  const containerRef = useRef(null);
  const worldRef = useRef(null);
  const imgRef = useRef(null);
  const tx = useRef({ x: 0, y: 0, s: 1 });
  const [committed, setCommitted] = useState({ x: 0, y: 0, s: 1 });
  const [imgSize, setImgSize] = useState({ w: 1, h: 1 });
  const imgSizeRef = useRef({ w: 1, h: 1 });
  const moved = useRef(false);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const pinching = useRef(false);
  const rafId = useRef(null);
  const commitRef = useRef(null);
  const draggingMarkerRef = useRef(null);
  const draggingMarkerEl = useRef(null);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const [mapInteractionEnabled, setMapInteractionEnabled] = useState(true);

  const applyTransform = () => {
    if (!worldRef.current) return;
    const { x, y, s } = tx.current;
    worldRef.current.style.transform = `translate(${x}px,${y}px) scale(${s})`;
  };

  const commit = () => {
    const snap = { ...tx.current };
    setCommitted(snap);
    cancelAnimationFrame(commitRef.current);
    commitRef.current = requestAnimationFrame(applyTransform);
  };

  const scheduleApply = () => {
    if (rafId.current) return;
    rafId.current = requestAnimationFrame(() => {
      applyTransform();
      rafId.current = null;
    });
  };

  const enableMapInteraction = () => {
    setMapInteractionEnabled(true);
  };

  const toggleMapInteraction = () => {
    setMapInteractionEnabled((prev) => {
      const next = !prev;
      return next;
    });
  };

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(pointer: coarse)');
    const update = () => setIsCoarsePointer(media.matches);
    update();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  useEffect(() => {
    setMapInteractionEnabled(true);
  }, [activeMapId]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const onLoad = () => {
      imgSizeRef.current = { w: img.naturalWidth, h: img.naturalHeight };
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
    };
    if (img.complete) onLoad(); else img.addEventListener('load', onLoad);
    return () => img.removeEventListener('load', onLoad);
  }, [mapImageSrc]);

  useEffect(() => {
    const c = containerRef.current;
    if (!c || imgSizeRef.current.w <= 1) return;
    const { w, h } = imgSizeRef.current;
    const s = Math.min(c.clientWidth / w, c.clientHeight / h, 1);
    const x = (c.clientWidth - w * s) / 2;
    const y = (c.clientHeight - h * s) / 2;
    tx.current = { x, y, s };
    applyTransform();
    setCommitted({ x, y, s });
  }, [imgSize]);

  const toImagePct = (clientX, clientY) => {
    const c = containerRef.current;
    if (!c) return null;
    const r = c.getBoundingClientRect();
    const { x, y, s } = tx.current;
    const { w, h } = imgSizeRef.current;
    return { xp: ((clientX - r.left - x) / s / w) * 100, yp: ((clientY - r.top - y) / s / h) * 100 };
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onPD = (e) => {
      if (e.target.closest('.edit-pt') || e.target.closest('.map-bubble')) return;
      moved.current = false;
      if (mode !== 'view') return;
      const touchLike = e.pointerType === 'touch' || e.pointerType === 'pen';
      const interactionActive = mapInteractionEnabled || tx.current.s > 1.05;
      if (touchLike && isCoarsePointer && !interactionActive) return;
      isPanning.current = true;
      panStart.current = { x: e.clientX - tx.current.x, y: e.clientY - tx.current.y };
    };

    const onPM = (e) => {
      if (isPanning.current) {
        if (!moved.current) {
          moved.current = true;
          try { el.setPointerCapture(e.pointerId); } catch (_) {}
        }
        tx.current.x = e.clientX - panStart.current.x;
        tx.current.y = e.clientY - panStart.current.y;
        scheduleApply();
        e.preventDefault();
        return;
      }
      if (draggingMarkerRef.current && draggingMarkerEl.current) {
        if (!moved.current) moved.current = true;
        const p = toImagePct(e.clientX, e.clientY);
        if (!p) return;
        const mel = draggingMarkerEl.current;
        mel.style.left = p.xp + '%';
        mel.style.top = p.yp + '%';
        mel._pct = p;
        e.preventDefault();
      }
    };

    const onPU = () => {
      if (isPanning.current) {
        isPanning.current = false;
        commit();
      }
      if (draggingMarkerRef.current) {
        const id = draggingMarkerRef.current;
        const mel = draggingMarkerEl.current;
        if (mel?._pct) {
          api(`/api/map/markers/${id}`, 'PUT', { x_pct: mel._pct.xp, y_pct: mel._pct.yp }).then(onRefresh);
          delete mel._pct;
        }
        draggingMarkerRef.current = null;
        draggingMarkerEl.current = null;
      }
      setTimeout(() => { moved.current = false; }, 0);
    };

    const onWH = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const d = e.deltaY > 0 ? 0.85 : 1.18;
      const ns = Math.min(Math.max(tx.current.s * d, 0.15), 6);
      tx.current.x = mx - (mx - tx.current.x) * (ns / tx.current.s);
      tx.current.y = my - (my - tx.current.y) * (ns / tx.current.s);
      tx.current.s = ns;
      scheduleApply();
      clearTimeout(onWH._t);
      onWH._t = setTimeout(commit, 80);
    };

    const touchRef2 = {};
    const onTS = (e) => {
      if (e.touches.length !== 2) return;
      isPanning.current = false;
      pinching.current = true;
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const rect = el.getBoundingClientRect();
      touchRef2.dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      touchRef2.s = tx.current.s;
      touchRef2.ox = tx.current.x;
      touchRef2.oy = tx.current.y;
      touchRef2.mx = (t0.clientX + t1.clientX) / 2 - rect.left;
      touchRef2.my = (t0.clientY + t1.clientY) / 2 - rect.top;
      enableMapInteraction();
      e.preventDefault();
    };

    const onTM = (e) => {
      if (!pinching.current || e.touches.length !== 2) return;
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      const ns = Math.min(Math.max(touchRef2.s * (dist / touchRef2.dist), 0.15), 6);
      tx.current.x = touchRef2.mx - (touchRef2.mx - touchRef2.ox) * (ns / touchRef2.s);
      tx.current.y = touchRef2.my - (touchRef2.my - touchRef2.oy) * (ns / touchRef2.s);
      tx.current.s = ns;
      scheduleApply();
      e.preventDefault();
    };

    const onTE = (e) => {
      if (pinching.current && e.touches.length < 2) {
        pinching.current = false;
        commit();
      }
    };

    el.addEventListener('pointerdown', onPD, { passive: true });
    el.addEventListener('pointermove', onPM, { passive: false });
    el.addEventListener('pointerup', onPU, { passive: true });
    el.addEventListener('pointerleave', onPU, { passive: true });
    el.addEventListener('wheel', onWH, { passive: false });
    el.addEventListener('touchstart', onTS, { passive: false });
    el.addEventListener('touchmove', onTM, { passive: false });
    el.addEventListener('touchend', onTE, { passive: true });

    return () => {
      el.removeEventListener('pointerdown', onPD);
      el.removeEventListener('pointermove', onPM);
      el.removeEventListener('pointerup', onPU);
      el.removeEventListener('pointerleave', onPU);
      el.removeEventListener('wheel', onWH);
      el.removeEventListener('touchstart', onTS);
      el.removeEventListener('touchmove', onTM);
      el.removeEventListener('touchend', onTE);
    };
  }, [enableMapInteraction, isCoarsePointer, mapInteractionEnabled, mode, onRefresh]);

  const fitMap = () => {
    const c = containerRef.current;
    if (!c) return;
    const { w, h } = imgSizeRef.current;
    const s = Math.min(c.clientWidth / w, c.clientHeight / h, 1);
    const x = (c.clientWidth - w * s) / 2;
    const y = (c.clientHeight - h * s) / 2;
    tx.current = { x, y, s };
    applyTransform();
    setCommitted({ x, y, s });
  };

  const beginMarkerDrag = (id, target, pointerId) => {
    draggingMarkerRef.current = id;
    draggingMarkerEl.current = target;
    target.setPointerCapture(pointerId);
    enableMapInteraction();
  };

  const prefersPageScroll = isCoarsePointer && mode === 'view' && committed.s <= 1.05 && !mapInteractionEnabled;
  const touchAction = prefersPageScroll ? 'pan-y' : 'none';

  return {
    containerRef,
    worldRef,
    imgRef,
    tx,
    committed,
    imgSize,
    imgSizeRef,
    moved,
    applyTransform,
    commit,
    fitMap,
    toImagePct,
    beginMarkerDrag,
    isCoarsePointer,
    mapInteractionEnabled,
    setMapInteractionEnabled,
    toggleMapInteraction,
    prefersPageScroll,
    touchAction,
  };
}

function MapView({ zones, markers, tasks = [], plants, maps = [], activeMapId = 'foret', onMapChange, isTeacher, student, onZoneUpdate, onRefresh, embedded = false }) {
  const [mode, setMode] = useState('view');
  const [showLabels, setShowLabels] = useState(true);
  const [drawPoints, setDrawPoints] = useState([]);
  const [editZone, setEditZone] = useState(null);
  const [editPoints, setEditPoints] = useState([]);
  const [draggingPtIdx, setDraggingPtIdx] = useState(-1);
  const [selectedZone, setSelectedZone] = useState(null);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [pendingZone, setPendingZone] = useState(null);
  const [pendingMarker, setPendingMarker] = useState(null);
  const [toast, setToast] = useState(null);
  const activeMap = maps.find((m) => m.id === activeMapId);
  const mapImageCandidates = useMemo(() => {
    const base = activeMapId === 'n3'
      ? ['/maps/plan%20n3.jpg', '/maps/map-n3.svg', '/map.png']
      : ['/map.png', '/maps/map-foret.svg'];
    const first = activeMap?.map_image_url ? [activeMap.map_image_url] : [];
    return [...new Set([...first, ...base])];
  }, [activeMap?.map_image_url, activeMapId]);
  const [mapImageIdx, setMapImageIdx] = useState(0);
  const mapImageSrc = mapImageCandidates[Math.min(mapImageIdx, mapImageCandidates.length - 1)];
  const mapFramePaddingPx = useMemo(() => {
    const custom = Number(activeMap?.frame_padding_px);
    if (Number.isFinite(custom) && custom >= 0) return Math.min(custom, 32);
    return activeMapId === 'n3' ? 14 : 8;
  }, [activeMap?.frame_padding_px, activeMapId]);
  const {
    containerRef,
    worldRef,
    imgRef,
    tx,
    committed,
    imgSize,
    moved,
    applyTransform,
    commit,
    fitMap,
    toImagePct,
    beginMarkerDrag,
    isCoarsePointer,
    mapInteractionEnabled,
    toggleMapInteraction,
    prefersPageScroll,
    touchAction,
  } = useMapGestures({ mapImageSrc, activeMapId, mode, onRefresh });
  const { zoneTaskVisualById, markerTaskVisualById } = useMemo(() => {
    const zoneMap = new Map();
    const markerMap = new Map();
    for (const t of tasks || []) {
      const visual = taskVisualStatus(t.status);
      if (!visual) continue;
      const { zoneIds, markerIds } = taskLocationIds(t);
      zoneIds.forEach((id) => {
        zoneMap.set(id, mergeTaskVisualStatus(zoneMap.get(id), visual));
      });
      markerIds.forEach((id) => {
        markerMap.set(id, mergeTaskVisualStatus(markerMap.get(id), visual));
      });
    }
    return { zoneTaskVisualById: zoneMap, markerTaskVisualById: markerMap };
  }, [tasks]);

  useEffect(() => {
    setMapImageIdx(0);
  }, [mapImageCandidates]);

  useEffect(() => {
    setMode('view');
    setDrawPoints([]);
    setEditZone(null);
    setEditPoints([]);
    setSelectedZone(null);
    setSelectedMarker(null);
    setPendingZone(null);
    setPendingMarker(null);
  }, [activeMapId]);

  const onMapClick = e => {
    if (moved.current) return;
    if (e.target.closest('.map-zone-hit') || e.target.closest('.map-bubble')) return;
    const p = toImagePct(e.clientX, e.clientY);
    if (!p) return;
    if (mode === 'draw-zone') setDrawPoints(pts => [...pts, p]);
    else if (mode === 'add-marker') { setPendingMarker(p); setMode('view'); }
  };

  const finishZone = () => { if (drawPoints.length >= 3) { setPendingZone(drawPoints); setDrawPoints([]); setMode('view'); } };
  const undoPoint = () => setDrawPoints(pts => pts.slice(0, -1));
  const cancelDraw = () => { setDrawPoints([]); setMode('view'); };

  const startEditPoints = z => {
    let pts; try { pts = z.points ? JSON.parse(z.points) : []; } catch (e) { pts = []; }
    setEditZone(z); setEditPoints(pts); setMode('edit-points'); setSelectedZone(null);
  };
  const saveEditPoints = async () => {
    if (!editZone) return;
    await api(`/api/zones/${editZone.id}`, 'PUT', { points: editPoints });
    await onRefresh();
    setEditZone(null); setEditPoints([]); setMode('view');
    setToast('Contour sauvegardé ✓');
  };

  const saveMarker = async d => {
    const payload = { ...d, map_id: d.map_id || activeMapId };
    if (d.id) await api(`/api/map/markers/${d.id}`, 'PUT', payload);
    else await api('/api/map/markers', 'POST', payload);
    await onRefresh();
  };
  const linkTaskToZone = async (taskId, zoneId) => {
    const t = (tasks || []).find((x) => x.id === taskId);
    const { zoneIds: zi, markerIds: mi } = taskLocationIds(t);
    const zoneIds = [...new Set([...zi, zoneId])];
    await api(`/api/tasks/${taskId}`, 'PUT', { zone_ids: zoneIds, marker_ids: mi });
    await onRefresh();
  };
  const linkTaskToMarker = async (taskId, markerId) => {
    const t = (tasks || []).find((x) => x.id === taskId);
    const { zoneIds: zi, markerIds: mi } = taskLocationIds(t);
    const markerIds = [...new Set([...mi, markerId])];
    await api(`/api/tasks/${taskId}`, 'PUT', { zone_ids: zi, marker_ids: markerIds });
    await onRefresh();
  };
  const unlinkTaskFromZone = async (task, zoneId) => {
    const { zoneIds: zi, markerIds: mi } = taskLocationIds(task);
    const zoneIds = zi.filter((id) => id !== zoneId);
    const payload = { zone_ids: zoneIds, marker_ids: mi };
    if (zoneIds.length === 0 && mi.length === 0) payload.map_id = activeMapId;
    await api(`/api/tasks/${task.id}`, 'PUT', payload);
    await onRefresh();
  };
  const unlinkTaskFromMarker = async (task, markerId) => {
    const { zoneIds: zi, markerIds: mi } = taskLocationIds(task);
    const markerIds = mi.filter((id) => id !== markerId);
    const payload = { zone_ids: zi, marker_ids: markerIds };
    if (zi.length === 0 && markerIds.length === 0) payload.map_id = activeMapId;
    await api(`/api/tasks/${task.id}`, 'PUT', payload);
    await onRefresh();
  };
  const deleteMarker = async id => { await api(`/api/map/markers/${id}`, 'DELETE'); await onRefresh(); };
  const deleteZone = async id => { await api(`/api/zones/${id}`, 'DELETE'); await onRefresh(); };
  const assignTasksToStudent = async (taskIds) => {
    const ids = [...new Set((taskIds || []).filter(Boolean))];
    if (!ids.length || !student) {
      return { assignedCount: 0, failedCount: 0, firstError: null };
    }
    let assignedCount = 0;
    let failedCount = 0;
    let firstError = null;
    for (const taskId of ids) {
      try {
        await api(`/api/tasks/${taskId}/assign`, 'POST', {
          firstName: student.first_name,
          lastName: student.last_name,
          studentId: student.id,
        });
        assignedCount += 1;
      } catch (err) {
        failedCount += 1;
        if (!firstError) firstError = err?.message || 'Erreur serveur';
      }
    }
    await onRefresh();
    return { assignedCount, failedCount, firstError };
  };

  const { s: cs } = committed;
  const { w: iw, h: ih } = imgSize;
  const inv = 1 / cs;

  const toWorld = p => ({ cx: (p.xp / 100) * iw, cy: (p.yp / 100) * ih });

  const renderZonePoly = z => {
    let pts; try { pts = z.points ? JSON.parse(z.points) : null; } catch (e) { pts = null; }
    if (!pts || pts.length < 3) return null;
    const wp = pts.map(toWorld);
    const str = wp.map(p => `${p.cx},${p.cy}`).join(' ');
    const mx = wp.reduce((s, p) => s + p.cx, 0) / wp.length;
    const my = wp.reduce((s, p) => s + p.cy, 0) / wp.length;
    const isEd = mode === 'edit-points' && editZone?.id === z.id;
    const zoneTaskVisual = zoneTaskVisualById.get(z.id);
    return (
      <g key={z.id} className={mode === 'view' ? 'map-zone-hit' : ''} style={{ cursor: mode === 'view' ? 'pointer' : 'default' }}
        onClick={e => { if (mode === 'view' && !moved.current) { e.stopPropagation(); setSelectedZone(z); } }}>
        <polygon points={str} fill={isEd ? 'rgba(82,183,136,0.35)' : (z.color || '#86efac90')}
          stroke={isEd ? '#52b788' : 'rgba(26,71,49,0.5)'}
          strokeWidth={(isEd ? 2.5 : 1.5) * inv} strokeDasharray={z.special ? `${5 * inv},${3 * inv}` : 'none'} />
        {showLabels && (
          <text x={mx} y={my} textAnchor="middle" dominantBaseline="middle"
            fontSize={Math.max(8, 12 * inv)} fontWeight="700" fontFamily="DM Sans,sans-serif"
            fill="#1a4731" stroke="rgba(255,255,255,0.8)" strokeWidth={3 * inv} paintOrder="stroke"
            style={{ pointerEvents: 'none', userSelect: 'none' }}>{z.name}</text>
        )}
        {zoneTaskVisual && (
          <circle
            className={`map-task-status map-task-status--${zoneTaskVisual}`}
            cx={mx + (14 * inv)}
            cy={my - (11 * inv)}
            r={Math.max(4, 6 * inv)}
            style={{ pointerEvents: 'none' }}>
            <title>{TASK_VISUAL_LABEL[zoneTaskVisual]}</title>
          </circle>
        )}
      </g>
    );
  };

  const renderEditPts = () => {
    if (mode !== 'edit-points' || !editPoints.length) return null;
    const wp = editPoints.map(toWorld);
    const str = wp.map(p => `${p.cx},${p.cy}`).join(' ');
    const r = Math.max(5, 8 * inv);
    return (
      <g>
        <polygon points={str} fill="rgba(82,183,136,0.2)" stroke="#52b788" strokeWidth={2 * inv} />
        {wp.map((p, i) => (
          <circle key={i} className="edit-pt" cx={p.cx} cy={p.cy} r={r}
            fill={draggingPtIdx === i ? '#1a4731' : 'white'} stroke="#1a4731" strokeWidth={2 * inv}
            style={{ cursor: 'grab' }}
            onPointerDown={e => { e.stopPropagation(); setDraggingPtIdx(i); e.currentTarget.setPointerCapture(e.pointerId); }}
            onPointerMove={e => { if (draggingPtIdx === i) { const p2 = toImagePct(e.clientX, e.clientY); if (p2) setEditPoints(pts => pts.map((pt, j) => j === i ? p2 : pt)); } }}
            onPointerUp={e => { e.stopPropagation(); setDraggingPtIdx(-1); }} />
        ))}
      </g>
    );
  };

  const renderDrawing = () => {
    if (!drawPoints.length) return null;
    const wp = drawPoints.map(toWorld);
    const str = wp.map(p => `${p.cx},${p.cy}`).join(' ');
    const r = Math.max(4, 6 * inv);
    return (
      <g>
        {drawPoints.length > 1 && <polyline points={str} fill="none" stroke="#52b788" strokeWidth={2 * inv} strokeDasharray={`${6 * inv},${3 * inv}`} />}
        {wp.map((p, i) => <circle key={i} cx={p.cx} cy={p.cy} r={r} fill="#1a4731" stroke="white" strokeWidth={1.5 * inv} />)}
      </g>
    );
  };

  const cursor = mode === 'view' ? 'grab' : mode === 'draw-zone' ? 'crosshair' : mode === 'edit-points' ? 'default' : 'cell';
  const mapColHeight = embedded
    ? 'min(78dvh, 920px)'
    : (isTeacher ? 'calc(100dvh - 56px)' : 'calc(100dvh - 56px - 72px)');
  const mapAspect = imgSize.w > 1 && imgSize.h > 1 ? `${imgSize.w} / ${imgSize.h}` : '16 / 10';
  const mobileInteractionsActive = mapInteractionEnabled || committed.s > 1.05;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: mapColHeight, minHeight: embedded ? 520 : 380 }}>
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}

      {selectedZone && (
        <ZoneInfoModal zone={selectedZone} plants={plants} tasks={tasks} isTeacher={isTeacher} student={student}
          onClose={() => setSelectedZone(null)}
          onUpdate={async (id, data) => { await onZoneUpdate(id, data); setSelectedZone(null); await onRefresh(); }}
          onDelete={async id => { await deleteZone(id); setSelectedZone(null); }}
          onLinkTask={async (taskId) => linkTaskToZone(taskId, selectedZone.id)}
          onUnlinkTask={(t) => unlinkTaskFromZone(t, selectedZone.id)}
          onAssignTasks={assignTasksToStudent}
          onEditPoints={isTeacher ? z => startEditPoints(z) : null} />
      )}
      {selectedMarker && (
        <MarkerModal marker={selectedMarker} plants={plants} tasks={tasks} isTeacher={isTeacher} student={student}
          onClose={() => setSelectedMarker(null)} onSave={saveMarker} onDelete={deleteMarker}
          onLinkTask={async (taskId) => linkTaskToMarker(taskId, selectedMarker.id)}
          onUnlinkTask={(t) => unlinkTaskFromMarker(t, selectedMarker.id)}
          onAssignTasks={assignTasksToStudent} />
      )}
      {pendingZone && (
        <ZoneDrawModal points_pct={pendingZone} plants={plants}
          onClose={() => setPendingZone(null)}
          onSave={async data => { await api('/api/zones', 'POST', { ...data, map_id: activeMapId }); setPendingZone(null); await onRefresh(); }} />
      )}
      {pendingMarker && (
        <MarkerModal marker={{ x_pct: pendingMarker.xp, y_pct: pendingMarker.yp, label: '', note: '', emoji: '🌱', plant_name: '', map_id: activeMapId }}
          plants={plants} isTeacher={isTeacher}
          onClose={() => setPendingMarker(null)}
          onSave={async data => { await api('/api/map/markers', 'POST', { ...data, map_id: activeMapId }); setPendingMarker(null); await onRefresh(); }}
          onDelete={() => setPendingMarker(null)} />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
        background: 'white', borderBottom: '1.5px solid var(--mint)', flexShrink: 0, flexWrap: 'wrap', minHeight: 50 }}>
        {maps.length > 0 && (
          <div style={{ display: 'flex', gap: 3, background: 'var(--parchment)', borderRadius: 10, padding: 3 }}>
            {maps.map((mp) => (
              <button key={mp.id}
                style={{ background: activeMapId === mp.id ? 'var(--forest)' : 'transparent', color: activeMapId === mp.id ? 'white' : 'var(--soil)',
                  border: 'none', borderRadius: 8, padding: '7px 11px', cursor: 'pointer',
                  fontFamily: 'DM Sans,sans-serif', fontSize: '.82rem', fontWeight: 700, whiteSpace: 'nowrap' }}
                onClick={() => onMapChange?.(mp.id)}>
                {mp.label}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 3, background: 'var(--parchment)', borderRadius: 10, padding: 3 }}>
          {[['view', '🖐️ Nav'],
            ...(isTeacher && mode !== 'edit-points' ? [
              ['draw-zone', `🖊️ Zone${mode === 'draw-zone' && drawPoints.length > 0 ? ` (${drawPoints.length})` : ''}`],
              ['add-marker', '📍 Repère'],
            ] : [])
          ].map(([m, label]) => (
            <button key={m}
              style={{ background: mode === m ? 'var(--forest)' : 'transparent', color: mode === m ? 'white' : 'var(--soil)',
                border: 'none', borderRadius: 8, padding: '7px 11px', cursor: 'pointer',
                fontFamily: 'DM Sans,sans-serif', fontSize: '.82rem', fontWeight: 600,
                transition: 'all .15s', whiteSpace: 'nowrap' }}
              onClick={() => { setMode(p => p === m && m !== 'view' ? 'view' : m); if (m === 'view') { setDrawPoints([]); setEditZone(null); setEditPoints([]); } }}>
              {label}
            </button>
          ))}
        </div>

        {isTeacher && mode === 'draw-zone' && drawPoints.length > 0 && (
          <div style={{ display: 'flex', gap: 4 }}>
            {drawPoints.length >= 3 && <button className="btn btn-secondary btn-sm" onClick={finishZone}>✅ Terminer</button>}
            <button className="btn btn-ghost btn-sm" onClick={undoPoint}>↩ Undo</button>
            <button className="btn btn-danger btn-sm" onClick={cancelDraw}>✕</button>
          </div>
        )}
        {mode === 'edit-points' && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: '.8rem', color: 'var(--leaf)', fontWeight: 700,
              background: '#f0fdf4', padding: '5px 10px', borderRadius: 8, border: '1px solid var(--mint)' }}>
              ✏️ {editZone?.name}
            </span>
            <button className="btn btn-primary btn-sm" onClick={saveEditPoints}>💾 Sauver</button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setMode('view'); setEditZone(null); setEditPoints([]); }}>✕</button>
          </div>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
          {isCoarsePointer && mode === 'view' && (
            <button
              className={`map-gesture-toggle ${mobileInteractionsActive ? 'is-on' : ''}`}
              onClick={toggleMapInteraction}
              title={mobileInteractionsActive ? 'Désactiver les gestes carte' : 'Activer les gestes carte'}>
              {mobileInteractionsActive ? '🔓 Gestes' : '🔒 Gestes'}
            </button>
          )}
          <button title={showLabels ? 'Masquer' : 'Afficher noms'}
            onClick={() => setShowLabels(l => !l)}
            style={{ background: showLabels ? 'var(--mint)' : 'transparent', border: '1.5px solid var(--mint)',
              color: 'var(--forest)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: '.9rem' }}>🏷️</button>
          <div style={{ display: 'flex', background: 'var(--parchment)', borderRadius: 10, padding: 3, gap: 2 }}>
            {[['＋', 1.28], ['－', 0.78], ['⊡', 0]].map(([label, factor]) => (
              <button key={label} onClick={() => {
                if (factor === 0) { fitMap(); return; }
                const c = containerRef.current; if (!c) return;
                const r = c.getBoundingClientRect();
                const mx = r.width / 2, my = r.height / 2;
                const ns = factor > 1 ? Math.min(tx.current.s * factor, 6) : Math.max(tx.current.s * factor, 0.15);
                tx.current.x = mx - (mx - tx.current.x) * (ns / tx.current.s);
                tx.current.y = my - (my - tx.current.y) * (ns / tx.current.s);
                tx.current.s = ns;
                applyTransform();
                commit();
              }}
              style={{ background: 'transparent', border: 'none', color: 'var(--soil)',
                padding: '6px 10px', cursor: 'pointer', fontSize: '1rem', borderRadius: 7 }}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: mapFramePaddingPx }}>
        <div ref={containerRef}
          style={{ width: '100%', maxWidth: '100%', maxHeight: '100%', aspectRatio: mapAspect,
            overflow: 'hidden', position: 'relative', background: '#eef2ee',
            cursor, touchAction, userSelect: 'none', WebkitUserSelect: 'none' }}
          onClick={onMapClick}>

          <div ref={worldRef}
            style={{ position: 'absolute', left: 0, top: 0, width: iw, height: ih,
              transformOrigin: '0 0', willChange: 'transform' }}>

          <img ref={imgRef} src={mapImageSrc} draggable={false} alt={`Plan ${activeMap?.label || 'du jardin'}`}
            onError={() => setMapImageIdx((idx) => (
              idx < mapImageCandidates.length - 1 ? idx + 1 : idx
            ))}
            style={{ position: 'absolute', left: 0, top: 0, width: iw, height: ih,
              userSelect: 'none', pointerEvents: 'none',
              boxShadow: '0 4px 24px rgba(0,0,0,.18)' }} />

          <svg style={{ position: 'absolute', left: 0, top: 0, width: iw, height: ih,
            overflow: 'visible', pointerEvents: 'none' }}>
            <g style={{ pointerEvents: 'all' }}>
              {zones.map(z => renderZonePoly(z))}
              {renderDrawing()}
              {renderEditPts()}
            </g>
          </svg>

          {markers.map((m) => {
            const markerTaskVisual = markerTaskVisualById.get(m.id);
            const markerTaskLabel = markerTaskVisual ? TASK_VISUAL_LABEL[markerTaskVisual] : '';
            const markerAriaLabel = [m.label || 'Repère', markerTaskLabel].filter(Boolean).join(' — ');
            const markerPinSize = isCoarsePointer
              ? 'clamp(46px, 13vw, 54px)'
              : 'clamp(34px, 8vw, 38px)';
            const markerEmojiSize = isCoarsePointer
              ? 'clamp(1.3rem, 5.2vw, 1.6rem)'
              : 'clamp(1rem, 4.1vw, 1.08rem)';
            const markerHitPadding = isCoarsePointer ? 6 : 0;
            const markerStatusDotSize = isCoarsePointer ? 15 : 10;
            const markerStatusDotBorder = isCoarsePointer ? 2 : 1.5;
            const markerStatusDotOffset = isCoarsePointer ? -2 : -1;
            const markerLabelFontSize = isCoarsePointer ? '.75rem' : '.66rem';
            const openMarker = (e) => {
              e.stopPropagation();
              if (!moved.current) setSelectedMarker(m);
            };
            return (
            <button key={m.id} className="map-bubble" type="button"
              style={{ position: 'absolute', left: m.x_pct + '%', top: m.y_pct + '%',
                transform: 'translate(-50%,-50%)', zIndex: 10, cursor: isTeacher ? 'grab' : 'pointer',
                border: 'none', background: 'transparent', padding: markerHitPadding }}
              aria-label={markerAriaLabel}
              title={markerAriaLabel}
              onClick={openMarker}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openMarker(e);
                }
              }}
              onPointerDown={isTeacher ? e => {
                e.stopPropagation();
                beginMarkerDrag(m.id, e.currentTarget, e.pointerId);
              } : undefined}
              onPointerUp={e => e.stopPropagation()}>
              <div className="map-bubble-pin" style={{ background: 'white', border: '2.5px solid var(--forest)',
                borderRadius: '50%', width: markerPinSize, height: markerPinSize,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: markerEmojiSize, boxShadow: '0 2px 10px rgba(0,0,0,.22)' }}>
                {m.emoji}
                {markerTaskVisual && (
                  <span
                    className={`map-task-status-dot map-task-status-dot--${markerTaskVisual}`}
                    role="img"
                    aria-label={markerTaskLabel}
                    title={markerTaskLabel}
                    style={{
                      width: markerStatusDotSize,
                      height: markerStatusDotSize,
                      borderWidth: markerStatusDotBorder,
                      top: markerStatusDotOffset,
                      right: markerStatusDotOffset,
                    }}
                  />
                )}
              </div>
              {showLabels && (
                <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
                  background: 'rgba(26,71,49,.9)', color: 'white', borderRadius: 5,
                  padding: '2px 7px', fontSize: markerLabelFontSize, fontWeight: 700,
                  whiteSpace: 'nowrap', marginTop: 3, maxWidth: isCoarsePointer ? 120 : 90,
                  overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'none',
                  boxShadow: '0 1px 5px rgba(0,0,0,.2)' }}>
                  {m.label}
                </div>
              )}
            </button>
            );
          })}
          </div>

          {mode !== 'view' && mode !== 'edit-points' && (
            <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(26,71,49,.9)', color: 'white', borderRadius: 22,
              padding: '9px 20px', fontSize: '.82rem', fontWeight: 600,
              pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 20 }}>
              {mode === 'draw-zone' && drawPoints.length < 3 && '🖊️ Touche la carte (min. 3 pts)'}
              {mode === 'draw-zone' && drawPoints.length >= 3 && `✅ ${drawPoints.length} pts — Terminer`}
              {mode === 'add-marker' && '📍 Touche la carte pour placer'}
            </div>
          )}
          {mode === 'edit-points' && (
            <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(82,183,136,.92)', color: 'white', borderRadius: 22,
              padding: '9px 20px', fontSize: '.82rem', fontWeight: 600,
              pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 20 }}>
              ✋ Glisse les points pour modifier
            </div>
          )}
          {prefersPageScroll && (
            <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(26,71,49,.9)', color: 'white', borderRadius: 18,
              padding: '6px 12px', fontSize: '.72rem', fontWeight: 600,
              pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 20 }}>
              📱 1 doigt: page · 2 doigts: zoom carte
            </div>
          )}
          {isCoarsePointer && mode === 'view' && !prefersPageScroll && (
            <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(26,71,49,.82)', color: 'white', borderRadius: 18,
              padding: '6px 12px', fontSize: '.72rem', fontWeight: 600,
              pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 20 }}>
              ✋ Gestes carte actifs
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export { Lightbox, PhotoGallery, ZoneInfoModal, ZoneDrawModal, MarkerModal, MapView };
