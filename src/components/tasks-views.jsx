import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { api, AccountDeletedError } from '../services/api';
import { statusBadge, daysUntil, dueDateChip } from '../utils/badges';

function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2400); return () => clearTimeout(t); }, []);
  return <div className="toast">{msg}</div>;
}

function Lightbox({ src, caption, onClose }) {
  const el = React.useMemo(() => document.createElement('div'), []);
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
        onClick={onClose}>✕</button>
    </div>
  );

  return createPortal(content, el);
}

const var_alert = 'var(--alert)';

function TaskFormModal({ zones, maps = [], activeMapId = 'foret', onClose, onSave, editTask }) {
  const initialMapId = editTask
    ? (editTask.map_id_resolved || editTask.map_id || editTask.zone_map_id || null)
    : activeMapId;
  const [form, setForm] = useState(editTask ? {
    title: editTask.title, description: editTask.description || '',
    map_id: initialMapId || '',
    zone_id: editTask.zone_id || '', due_date: editTask.due_date || '',
    required_students: editTask.required_students || 1,
    recurrence: editTask.recurrence || ''
  } : { title: '', description: '', map_id: initialMapId || '', zone_id: '', due_date: '', required_students: 1, recurrence: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = k => e => {
    const value = e.target.value;
    if (k === 'map_id') {
      setForm(f => ({ ...f, map_id: value, zone_id: '' }));
      return;
    }
    if (k === 'zone_id') {
      const selectedZone = zones.find(z => z.id === value);
      setForm(f => ({ ...f, zone_id: value, map_id: selectedZone?.map_id || f.map_id }));
      return;
    }
    setForm(f => ({ ...f, [k]: value }));
  };

  const submit = async () => {
    if (!form.title.trim()) return setErr('Le titre est requis');
    const selectedZone = zones.find(z => z.id === form.zone_id);
    const payload = {
      ...form,
      map_id: selectedZone?.map_id || form.map_id || null,
      zone_id: form.zone_id || null,
    };
    setSaving(true);
    try { await onSave(payload); onClose(); }
    catch (e) { setErr(e.message); setSaving(false); }
  };

  const selectableZones = zones.filter(z => !z.special && (!form.map_id || z.map_id === form.map_id));

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal fade-in">
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3>{editTask ? 'Modifier la tâche' : 'Nouvelle tâche'}</h3>
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
          <div className="field"><label>Zone</label>
            <select value={form.zone_id} onChange={set('zone_id')}>
              <option value="">— Aucune —</option>
              {selectableZones.map(z => <option key={z.id} value={z.id}>{z.name}{z.current_plant ? ` — ${z.current_plant}` : ''}</option>)}
            </select>
          </div>
        </div>
        <div className="row">
          <div className="field"><label>Élèves requis</label>
            <input type="number" min="1" max="10" value={form.required_students} onChange={set('required_students')} />
          </div>
          <div className="field"><label>Date limite</label><input type="date" value={form.due_date} onChange={set('due_date')} /></div>
        </div>
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
        <button className="btn btn-primary btn-full" onClick={submit} disabled={saving}>{saving ? 'Sauvegarde...' : editTask ? 'Modifier' : 'Créer la tâche'}</button>
      </div>
    </div>
  );
}

function TasksView({ tasks, zones, maps = [], activeMapId = 'foret', isTeacher, student, onRefresh, onForceLogout }) {
  const [showForm, setShowForm] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [logTask, setLogTask] = useState(null);
  const [logsTask, setLogsTask] = useState(null);
  const [loading, setLoading] = useState({});
  const [toast, setToast] = useState(null);
  const [confirmTask, setConfirmTask] = useState(null);
  const [filterText, setFilterText] = useState('');
  const [filterZone, setFilterZone] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterMap, setFilterMap] = useState('active');

  useEffect(() => {
    setFilterMap('active');
  }, [activeMapId]);

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

  const validate = t => withLoad(t.id + 'val', async () => {
    await api(`/api/tasks/${t.id}/validate`, 'POST');
    setToast('Tâche validée ✓');
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
    if (editTask) await api(`/api/tasks/${editTask.id}`, 'PUT', form);
    else await api('/api/tasks', 'POST', form);
    await onRefresh();
  };

  const applyFilters = list => list.filter(t => {
    const taskMapId = taskEffectiveMapId(t);
    if (filterMap === 'active' && taskMapId !== activeMapId && taskMapId != null) return false;
    if (filterMap !== 'active' && filterMap !== 'all' && taskMapId !== filterMap && taskMapId != null) return false;
    if (filterText && !t.title.toLowerCase().includes(filterText.toLowerCase()) &&
      !(t.description || '').toLowerCase().includes(filterText.toLowerCase())) return false;
    if (filterZone && t.zone_id !== filterZone) return false;
    if (filterStatus && t.status !== filterStatus) return false;
    return true;
  });

  const allFiltered = applyFilters(tasks);
  const myTasks = allFiltered.filter(t => student && t.status !== 'validated' && t.assignments?.some(
    a => a.student_first_name === student.first_name && a.student_last_name === student.last_name
  ));
  const available = allFiltered.filter(t => t.status === 'available' || (t.status === 'in_progress' && t.assignments?.length < t.required_students));
  const inProgress = allFiltered.filter(t => t.status === 'in_progress');
  const done = allFiltered.filter(t => t.status === 'done');
  const validated = allFiltered.filter(t => t.status === 'validated');

  const urgentTasks = !isTeacher ? allFiltered.filter(t => {
    if (t.status === 'validated' || t.status === 'done') return false;
    const d = daysUntil(t.due_date);
    return d !== null && d <= 3 && d >= -2;
  }).sort((a, b) => daysUntil(a.due_date) - daysUntil(b.due_date)) : [];

  const usedZones = [...new Set(allFiltered.filter(t => t.zone_id).map(t => t.zone_id))];

  const TaskCard = ({ t }) => {
    const isMine = myTasks.some(m => m.id === t.id);
    const slots = t.required_students - (t.assignments?.length || 0);
    return (
      <div className={`task-card ${isMine ? 'mine' : ''} ${t.status === 'validated' ? 'done' : ''}`}>
        <div className="task-top">
          <div className="task-title">{t.title}</div>
          {statusBadge(t.status)}
        </div>
        <div className="task-meta">
          <span className="task-chip">{taskEffectiveMapId(t) ? `🗺️ ${mapLabelById(taskEffectiveMapId(t))}` : '🌐 Globale'}</span>
          {t.zone_name && <span className="task-chip">🌿 {t.zone_name}</span>}
          {t.marker_label && <span className="task-chip">📍 {t.marker_label}</span>}
          {dueDateChip(t.due_date)}
          {!isTeacher && <span className="task-chip">👤 {t.required_students} élève{t.required_students > 1 ? 's' : ''}</span>}
          {t.recurrence && <span className="task-chip">🔄 {t.recurrence === 'weekly' ? 'Hebdo' : t.recurrence === 'biweekly' ? 'Bi-hebdo' : t.recurrence === 'monthly' ? 'Mensuel' : t.recurrence}</span>}
        </div>
        {t.description && <div className="task-desc">{t.description}</div>}
        {t.assignments?.length > 0 && (
          <div className="assignees">
            {t.assignments.map((a, i) => <span key={i} className="assignee-tag">{a.student_first_name} {a.student_last_name}</span>)}
          </div>
        )}
        {slots > 0 && t.status !== 'validated' && (
          <div className="slots">{slots} place{slots > 1 ? 's' : ''} disponible{slots > 1 ? 's' : ''}</div>
        )}
        <div className="task-actions">
          {!isTeacher && !isMine && slots > 0 && t.status !== 'validated' && (
            <button className="btn btn-primary btn-sm" disabled={loading[t.id + 'assign']} onClick={() => assign(t)}>
              {loading[t.id + 'assign'] ? '...' : '✋ Je m\'en occupe'}
            </button>
          )}
          {!isTeacher && isMine && (t.status === 'in_progress' || t.status === 'available') && (
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
          {isTeacher && t.status === 'done' && (
            <button className="btn btn-primary btn-sm" disabled={loading[t.id + 'val']} onClick={() => validate(t)}>
              {loading[t.id + 'val'] ? '...' : '✓ Valider'}
            </button>
          )}
          {isTeacher && (t.status === 'done' || t.status === 'validated') && (
            <button className="btn btn-ghost btn-sm" onClick={() => setLogsTask(t)}>📋 Rapports</button>
          )}
          {isTeacher && (
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => { setEditTask(t); setShowForm(true); }}>✏️</button>
              <button className="btn btn-danger btn-sm" disabled={loading[t.id + 'del']} onClick={() => deleteTask(t)}>🗑️</button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
      {(showForm || editTask) && (
        <TaskFormModal zones={zones} maps={maps} activeMapId={activeMapId} editTask={editTask} onClose={() => { setShowForm(false); setEditTask(null); }} onSave={saveTask} />
      )}
      {logTask && (
        <LogModal task={logTask} student={student}
          onClose={() => setLogTask(null)}
          onDone={async () => { await onRefresh(); setToast('Rapport envoyé ✓'); }}
        />
      )}
      {logsTask && <TaskLogsViewer task={logsTask} onClose={() => setLogsTask(null)} />}

      {confirmTask && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmTask(null)}>
          <div className="log-modal fade-in" style={{ paddingBottom: 'calc(20px + var(--safe-bottom))' }} onClick={e => e.stopPropagation()}>
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
        {isTeacher && <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>+ Nouvelle tâche</button>}
      </div>
      <p className="section-sub">{isTeacher ? 'Gérer et valider les tâches' : 'Prends en charge une tâche ou suis tes activités'}</p>

      <div className="task-filters">
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
            return <option key={zId} value={zId}>{z ? z.name : zId}</option>;
          })}
        </select>
        {isTeacher && (
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">Tous les statuts</option>
            <option value="available">Disponible</option>
            <option value="in_progress">En cours</option>
            <option value="done">Terminée</option>
            <option value="validated">Validée</option>
          </select>
        )}
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
                {t.zone_name && <span style={{ fontSize: '.76rem', color: '#aaa' }}>{t.zone_name}</span>}
              </div>
            );
          })}
        </div>
      )}

      {!isTeacher && myTasks.length > 0 && (
        <div className="tasks-section">
          <div className="tasks-section-title">Mes tâches</div>
          <div>{myTasks.map(t => <TaskCard key={t.id} t={t} />)}</div>
        </div>
      )}

      {isTeacher ? (
        <>
          {done.length > 0 && (
            <div className="tasks-section">
              <div className="tasks-section-title">En attente de validation ({done.length})</div>
              <div>{done.map(t => <TaskCard key={t.id} t={t} />)}</div>
            </div>
          )}
          {inProgress.length > 0 && (
            <div className="tasks-section">
              <div className="tasks-section-title">En cours</div>
              <div>{inProgress.map(t => <TaskCard key={t.id} t={t} />)}</div>
            </div>
          )}
          {available.length > 0 && (
            <div className="tasks-section">
              <div className="tasks-section-title">Disponibles</div>
              <div>{available.map(t => <TaskCard key={t.id} t={t} />)}</div>
            </div>
          )}
          {validated.length > 0 && (
            <div className="tasks-section">
              <div className="tasks-section-title">Validées</div>
              <div>{validated.map(t => <TaskCard key={t.id} t={t} />)}</div>
            </div>
          )}
        </>
      ) : (
        <>
          {available.filter(t => !myTasks.some(m => m.id === t.id)).length > 0 && (
            <div className="tasks-section">
              <div className="tasks-section-title">Tâches disponibles</div>
              <div>{available.filter(t => !myTasks.some(m => m.id === t.id)).map(t => <TaskCard key={t.id} t={t} />)}</div>
            </div>
          )}
          {allFiltered.filter(t => t.status === 'validated' && t.assignments?.some(
            a => a.student_first_name === student?.first_name && a.student_last_name === student?.last_name
          )).length > 0 && (
              <div className="tasks-section">
                <div className="tasks-section-title">Récemment validées ✓</div>
                <div>{allFiltered.filter(t => t.status === 'validated' && t.assignments?.some(
                  a => a.student_first_name === student?.first_name && a.student_last_name === student?.last_name
                )).map(t => <TaskCard key={t.id} t={t} />)}</div>
              </div>
            )}
        </>
      )}

      {allFiltered.length === 0 && (
        <div className="empty"><div className="empty-icon">🌿</div><p>Aucune tâche pour le moment</p></div>
      )}
    </div>
  );
}

function LogModal({ task, student, onClose, onDone }) {
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
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="log-modal fade-in">
        <button className="modal-close" onClick={onClose}>✕</button>
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
      <div className="log-modal fade-in">
        <button className="modal-close" onClick={onClose}>✕</button>
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
