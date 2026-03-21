import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api, AccountDeletedError } from '../services/api';
import { SPECIAL_EMOJI, SPECIAL_DESC, TREE_LEGEND, TREE_DOTS } from '../constants/garden';
import { statusBadge, daysUntil, dueDateChip } from '../utils/badges';
import { compressImage } from '../utils/image';
import { TaskFormModal, TasksView, LogModal, TaskLogsViewer } from './tasks-views';
import { Lightbox, PhotoGallery, ZoneInfoModal, ZoneDrawModal, MarkerModal, MapView } from './map-views';

// ── TOAST ──────────────────────────────────────────────────────────────────
function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2400); return () => clearTimeout(t); }, []);
  return <div className="toast">{msg}</div>;
}

// ── INTERACTIVE MAP ──────────────────────────────────────────────────────────


// ── PLANT EDIT FORM (outside PlantManager to avoid remount on every keystroke) ──
function PlantEditForm({ title, form, setForm, onSave, onCancel, saving }) {
  const set = k => e => setForm(f => ({...f, [k]: e.target.value}));
  return (
    <div className="plant-edit-form fade-in">
      <h4>{title}</h4>
      <div className="field"><label>Emoji</label>
        <div className="emoji-row">
          {EMOJI_OPTS.map(e => (
            <button key={e} className={`emoji-btn ${form.emoji === e ? 'sel' : ''}`}
              onClick={() => setForm(f => ({...f, emoji: e}))}>{e}</button>
          ))}
        </div>
        <input value={form.emoji} onChange={set('emoji')} placeholder="ou colle un emoji" style={{marginTop:6}}/>
      </div>
      <div className="field"><label>Nom *</label>
        <input value={form.name} onChange={set('name')} placeholder="Ex: Aubergine"/>
      </div>
      <div className="field"><label>Description d'identification</label>
        <textarea value={form.description} onChange={set('description')} rows={3}
          placeholder="Comment reconnaître cette plante ? Feuilles, taille, odeur..."/>
      </div>
      <div style={{display:'flex',gap:8}}>
        <button className="btn btn-primary btn-sm" onClick={onSave} disabled={saving}>{saving ? '...' : '💾 Sauvegarder'}</button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Annuler</button>
      </div>
    </div>
  );
}

// ── PLANT MANAGER (teacher) ───────────────────────────────────────────────────
const EMOJI_OPTS = ['🌱','🌿','🥬','🥕','🍅','🫑','🥒','🍓','🌸','🌺','🫘','🌾','🍋','🍊','🌰','🧅','🧄','🫚'];

function PlantManager({ plants, onRefresh }) {
  const [editId,  setEditId]  = useState(null);
  const [form,    setForm]    = useState({ name:'', emoji:'🌱', description:'' });
  const [showAdd, setShowAdd] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [toast,   setToast]   = useState(null);

  const startEdit = p => {
    setEditId(p.id);
    setForm({ name: p.name, emoji: p.emoji, description: p.description || '' });
    setShowAdd(false);
  };

  const cancelEdit = () => { setEditId(null); setShowAdd(false); };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editId) await api(`/api/plants/${editId}`, 'PUT', form);
      else        await api('/api/plants', 'POST', form);
      await onRefresh();
      setEditId(null);
      setShowAdd(false);
      setForm({ name:'', emoji:'🌱', description:'' });
      setToast(editId ? 'Plante modifiée ✓' : 'Plante ajoutée ✓');
    } catch(e) { setToast('Erreur : ' + e.message); }
    setSaving(false);
  };

  const del = async p => {
    if (!confirm(`Supprimer "${p.name}" ?`)) return;
    try {
      await api(`/api/plants/${p.id}`, 'DELETE');
      await onRefresh();
      setToast('Plante supprimée');
    } catch(e) { setToast('Erreur : ' + e.message); }
  };

  return (
    <div>
      {toast && <Toast msg={toast} onDone={() => setToast(null)}/>}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
        <h2 className="section-title">🌱 Base de données plantes</h2>
        {!showAdd && !editId && (
          <button className="btn btn-primary btn-sm" onClick={() => { setShowAdd(true); setForm({ name:'', emoji:'🌱', description:'' }); }}>
            + Ajouter
          </button>
        )}
      </div>
      <p className="section-sub">{plants.length} plantes enregistrées</p>

      {showAdd && (
        <PlantEditForm
          title="Nouvelle plante"
          form={form} setForm={setForm}
          onSave={save} onCancel={cancelEdit} saving={saving}
        />
      )}

      <div className="map-wrap plant-manager">
        {plants.map(p => (
          <div key={p.id}>
            {editId === p.id ? (
              <PlantEditForm
                title={`Modifier — ${p.name}`}
                form={form} setForm={setForm}
                onSave={save} onCancel={cancelEdit} saving={saving}
              />
            ) : (
              <div className="plant-row">
                <div className="plant-emoji-big">{p.emoji}</div>
                <div className="plant-info">
                  <div className="plant-row-name">{p.name}</div>
                  <div className="plant-row-desc">{p.description || <em style={{color:'#bbb'}}>Pas de description</em>}</div>
                </div>
                <div className="plant-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => startEdit(p)}>✏️</button>
                  <button className="btn btn-danger btn-sm" onClick={() => del(p)}>🗑️</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── OBSERVATION NOTEBOOK (student) ────────────────────────────────────────────
function ObservationNotebook({ student, zones }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [content, setContent] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [imageData, setImageData] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const fileRef = useRef();

  const load = async () => {
    try {
      const data = await api(`/api/observations/student/${student.id}`);
      setEntries(data);
    } catch (e) { console.error('[ForetMap] observations', e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [student.id]);

  const handleFile = e => {
    const file = e.target.files[0];
    if (!file) return;
    compressImage(file).then(d => { setImageData(d); setPreview(d); }).catch(() => {});
  };

  const submit = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      await api('/api/observations', 'POST', {
        studentId: student.id,
        zone_id: zoneId || null,
        content: content.trim(),
        imageData,
      });
      setContent(''); setZoneId(''); setImageData(null); setPreview(null);
      setShowForm(false);
      setToast('Observation enregistrée ✓');
      await load();
    } catch (e) { setToast('Erreur : ' + e.message); }
    setSaving(false);
  };

  const deleteObs = async (id) => {
    try {
      await api(`/api/observations/${id}`, 'DELETE');
      setToast('Observation supprimée');
      await load();
    } catch (e) { setToast('Erreur : ' + e.message); }
  };

  return (
    <div className="fade-in">
      {toast && <Toast msg={toast} onDone={() => setToast(null)}/>}
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4}}>
        <h2 className="section-title">📓 Mon carnet</h2>
        {!showForm && <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>+ Observation</button>}
      </div>
      <p className="section-sub">Tes observations sur la forêt comestible</p>

      {showForm && (
        <div className="plant-edit-form fade-in" style={{marginBottom:16}}>
          <h4>Nouvelle observation</h4>
          <div className="field"><label>Zone (optionnel)</label>
            <select value={zoneId} onChange={e => setZoneId(e.target.value)}>
              <option value="">— Aucune zone —</option>
              {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </div>
          <div className="field"><label>Observation *</label>
            <textarea value={content} onChange={e => setContent(e.target.value)} rows={3}
              placeholder="Qu'as-tu observé ? Croissance, insectes, couleur des feuilles..." autoFocus/>
          </div>
          <div className="field"><label>Photo (optionnel)</label>
            {!preview ? (
              <div className="img-upload-area" onClick={() => fileRef.current.click()}>
                <div style={{fontSize:'1.5rem', marginBottom:4}}>📷</div>
                <div style={{fontSize:'.82rem', color:'#888'}}>Ajouter une photo</div>
                <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleFile}/>
              </div>
            ) : (
              <div className="img-preview-wrap">
                <img src={preview} className="img-preview" alt="preview"/>
                <button className="img-remove" onClick={() => { setImageData(null); setPreview(null); }}>✕</button>
              </div>
            )}
          </div>
          <div style={{display:'flex', gap:8}}>
            <button className="btn btn-primary btn-sm" onClick={submit} disabled={saving || !content.trim()}>
              {saving ? '...' : '💾 Enregistrer'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setShowForm(false); setContent(''); setImageData(null); setPreview(null); }}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {loading
        ? <div className="loader" style={{height:'40vh'}}><div className="loader-leaf">🌿</div><p>Chargement...</p></div>
        : entries.length === 0
          ? <div className="empty"><div className="empty-icon">📓</div><p>Ton carnet est vide. Ajoute ta première observation !</p></div>
          : entries.map(e => (
            <div key={e.id} className="obs-card fade-in">
              <div className="obs-header">
                <span className="obs-date">{new Date(e.created_at).toLocaleDateString('fr-FR', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
                <button className="btn btn-ghost btn-sm" style={{padding:'2px 6px', minHeight:'auto', fontSize:'.7rem'}}
                  onClick={() => { if (confirm('Supprimer cette observation ?')) deleteObs(e.id); }}>🗑️</button>
              </div>
              <div className="obs-content">{e.content}</div>
              {e.zone_name && <div className="obs-zone">📍 {e.zone_name}</div>}
              {e.image_url && <img src={e.image_url} alt="observation" style={{width:'100%',borderRadius:8,marginTop:8,maxHeight:200,objectFit:'cover'}}/>}
            </div>
          ))
      }
    </div>
  );
}

// ── PLANT VIEWER (student read-only) ──────────────────────────────────────────
function PlantViewer({ plants, zones }) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);

  const filtered = plants.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.description || '').toLowerCase().includes(search.toLowerCase())
  );

  const zonesForPlant = p => zones.filter(z => z.current_plant === p.name);

  return (
    <div className="fade-in">
      <h2 className="section-title">🌱 Catalogue des plantes</h2>
      <p className="section-sub">{plants.length} espèces dans la forêt</p>

      <div className="field" style={{marginBottom:12}}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Chercher une plante..." style={{background:'white'}}/>
      </div>

      {filtered.length === 0
        ? <div className="empty"><div className="empty-icon">🌿</div><p>Aucune plante trouvée</p></div>
        : filtered.map(p => {
            const pZones = zonesForPlant(p);
            const isExpanded = expanded === p.id;
            return (
              <div key={p.id} className={`plant-viewer-card ${isExpanded ? 'expanded' : ''}`}
                onClick={() => setExpanded(isExpanded ? null : p.id)}>
                <div style={{display:'flex', alignItems:'center', gap:12}}>
                  <span style={{fontSize:'2rem'}}>{p.emoji}</span>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontWeight:600, fontSize:'.95rem', color:'var(--forest)'}}>{p.name}</div>
                    {!isExpanded && p.description && (
                      <div style={{fontSize:'.8rem', color:'#aaa', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{p.description}</div>
                    )}
                  </div>
                  <span style={{fontSize:'.9rem', color:'#ccc'}}>{isExpanded ? '▲' : '▼'}</span>
                </div>
                {isExpanded && (
                  <div className="fade-in" style={{marginTop:10}}>
                    {p.description && (
                      <p style={{fontSize:'.88rem', color:'#555', lineHeight:1.6, marginBottom:8}}>{p.description}</p>
                    )}
                    {pZones.length > 0 ? (
                      <div>
                        <div style={{fontSize:'.74rem', fontWeight:700, color:'#aaa', textTransform:'uppercase', marginBottom:4}}>Zones associées</div>
                        <div className="plant-zones">
                          {pZones.map(z => <span key={z.id} className="plant-zone-chip">📍 {z.name}</span>)}
                        </div>
                      </div>
                    ) : (
                      <p style={{fontSize:'.82rem', color:'#bbb', fontStyle:'italic'}}>Pas encore plantée dans une zone</p>
                    )}
                  </div>
                )}
              </div>
            );
          })
      }
    </div>
  );
}

// ── STUDENT STATS ─────────────────────────────────────────────────────────────
function StudentStats({ student }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    api(`/api/stats/me/${student.id}`).then(setData).catch(err => {
      console.error('[ForetMap] stats élève', err);
    });
  }, [student.id]);

  if (!data) return <div className="loader" style={{height:'60vh'}}><div className="loader-leaf">🌿</div><p>Chargement...</p></div>;

  const { stats, assignments } = data;
  const RANKS = [
    { min: 0,  label: '🪨 Nouveau',  color: '#94a3b8' },
    { min: 1,  label: '🌱 Débutant', color: '#86efac' },
    { min: 5,  label: '🌿 Actif',    color: '#52b788' },
    { min: 10, label: '🏆 Expert',   color: '#1a4731' },
  ];
  const currentRank = [...RANKS].reverse().find(r => stats.done >= r.min) || RANKS[0];
  const nextRank = RANKS[RANKS.indexOf(currentRank) + 1];
  const progressPct = nextRank
    ? Math.min(100, ((stats.done - currentRank.min) / (nextRank.min - currentRank.min)) * 100)
    : 100;

  return (
    <div className="fade-in">
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4}}>
        <h2 className="section-title">📊 Mes statistiques</h2>
        <span style={{background:'var(--parchment)', borderRadius:20, padding:'4px 12px', fontSize:'.8rem', fontWeight:600, color:'var(--soil)'}}>{currentRank.label}</span>
      </div>
      <p className="section-sub">Bonjour {data.first_name} ! Voici ton bilan dans la forêt.</p>

      {/* Barre de progression de rang */}
      <div className="rank-progress">
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
          <span style={{fontSize:'.82rem', fontWeight:600, color:'var(--forest)'}}>{currentRank.label}</span>
          {nextRank && <span style={{fontSize:'.76rem', color:'#aaa'}}>Prochain : {nextRank.label} ({nextRank.min - stats.done} tâche{nextRank.min - stats.done > 1 ? 's' : ''} restante{nextRank.min - stats.done > 1 ? 's' : ''})</span>}
          {!nextRank && <span style={{fontSize:'.76rem', color:currentRank.color, fontWeight:600}}>Rang maximum atteint !</span>}
        </div>
        <div className="rank-bar-bg">
          <div className="rank-bar-fill" style={{width:`${progressPct}%`}}/>
        </div>
        <div className="rank-steps">
          {RANKS.map(r => (
            <span key={r.min} className={stats.done >= r.min ? 'current' : ''}>{r.label.split(' ')[0]}</span>
          ))}
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card highlight">
          <div className="stat-icon">✅</div>
          <div className="stat-number">{stats.done}</div>
          <div className="stat-label">Tâches validées</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">⏳</div>
          <div className="stat-number">{stats.pending}</div>
          <div className="stat-label">En cours</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📋</div>
          <div className="stat-number">{stats.submitted}</div>
          <div className="stat-label">En attente prof</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🌱</div>
          <div className="stat-number">{stats.total}</div>
          <div className="stat-label">Total prises</div>
        </div>
      </div>

      <h3 style={{fontFamily:'Playfair Display,serif', fontSize:'1.1rem', marginBottom:12, color:'var(--forest)'}}>Activité récente</h3>
      <div className="activity-list">
        {assignments.length === 0
          ? <div className="empty"><div className="empty-icon">🌿</div><p>Aucune tâche prise pour l'instant</p></div>
          : assignments.slice(0, 10).map((a, i) => (
            <div key={i} className="activity-item">
              <div className={`activity-dot ${a.status}`}/>
              <div className="activity-info">
                <div className="activity-title">{a.title}</div>
                <div className="activity-meta">
                  {a.zone_name && `📍 ${a.zone_name} · `}
                  {new Date(a.assigned_at).toLocaleDateString('fr-FR', {day:'2-digit', month:'short'})}
                </div>
              </div>
              {statusBadge(a.status)}
            </div>
          ))
        }
      </div>
    </div>
  );
}

// ── TEACHER STATS ─────────────────────────────────────────────────────────────
function TeacherStats() {
  const [data,          setData]          = useState(null);
  const [search,        setSearch]        = useState('');
  const [toast,         setToast]         = useState(null);
  const [confirmStudent, setConfirmStudent] = useState(null); // student to delete

  const load = useCallback(() => api('/api/stats/all').then(setData).catch(err => {
    console.error('[ForetMap] stats tous', err);
    setToast('Impossible de charger les statistiques.');
  }), []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onRealtime = (e) => {
      if (e.detail && e.detail.domain === 'students') load();
    };
    window.addEventListener('foretmap_realtime', onRealtime);
    return () => window.removeEventListener('foretmap_realtime', onRealtime);
  }, [load]);

  const deleteStudent = async (s) => {
    // Show inline confirm instead of browser confirm() (broken on mobile)
    setConfirmStudent(s);
  };

  const confirmDelete = async () => {
    const s = confirmStudent;
    setConfirmStudent(null);
    try {
      await api(`/api/students/${s.id}`, 'DELETE');
      setToast(`${s.first_name} ${s.last_name} supprimé`);
      await load();
    } catch(e) { setToast('Erreur : ' + e.message); }
  };

  if (!data) return <div className="loader" style={{height:'60vh'}}><div className="loader-leaf">🌿</div><p>Chargement...</p></div>;

  const filtered = data.filter(s =>
    `${s.first_name} ${s.last_name}`.toLowerCase().includes(search.toLowerCase())
  );

  const maxDone    = Math.max(...data.map(s => s.stats.done), 1);
  const rankIcon   = i => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
  const rankClass  = i => i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';

  const totalValidated = data.reduce((s, d) => s + d.stats.done, 0);
  const totalPending   = data.reduce((s, d) => s + d.stats.pending, 0);
  const activeStudents = data.filter(d => d.stats.total > 0).length;

  return (
    <div className="fade-in">
      {toast && <Toast msg={toast} onDone={() => setToast(null)}/>}

      {confirmStudent && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmStudent(null)}>
          <div className="log-modal fade-in" style={{paddingBottom:'calc(20px + var(--safe-bottom))'}} onClick={e => e.stopPropagation()}>
            <h3 style={{marginBottom:8}}>Supprimer l'élève ?</h3>
            <p style={{fontSize:'.95rem',color:'#444',marginBottom:6,lineHeight:1.5}}>
              <strong>{confirmStudent.first_name} {confirmStudent.last_name}</strong>
            </p>
            <p style={{fontSize:'.85rem',color:'#888',marginBottom:20,lineHeight:1.5}}>
              Ses assignations de tâches seront également supprimées.
            </p>
            <div style={{display:'flex',gap:10}}>
              <button className="btn btn-danger" style={{flex:1}} onClick={confirmDelete}>Supprimer</button>
              <button className="btn btn-ghost" style={{flex:1}} onClick={() => setConfirmStudent(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4}}>
        <h2 className="section-title">📊 Gestion des élèves</h2>
      </div>
      <p className="section-sub">{data.length} élève{data.length>1?'s':''} inscrits</p>

      {/* Export CSV */}
      <div className="export-row">
        <button className="btn btn-secondary btn-sm" onClick={() => {
          const token = localStorage.getItem('foretmap_teacher_token');
          const link = document.createElement('a');
          link.href = API + '/api/stats/export';
          const headers = new Headers();
          if (token) headers.set('Authorization', 'Bearer ' + token);
          fetch(API + '/api/stats/export', { headers })
            .then(r => r.blob())
            .then(blob => {
              link.href = URL.createObjectURL(blob);
              link.download = `foretmap-stats-${new Date().toISOString().slice(0,10)}.csv`;
              link.click();
              URL.revokeObjectURL(link.href);
            })
            .catch(() => setToast('Erreur lors de l\'export'));
        }}>
          📥 Exporter CSV
        </button>
      </div>

      {/* Global stats */}
      <div className="stats-grid" style={{gridTemplateColumns:'repeat(3,1fr)', marginBottom:20}}>
        <div className="stat-card highlight">
          <div className="stat-icon">✅</div>
          <div className="stat-number">{totalValidated}</div>
          <div className="stat-label">Tâches validées</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">⏳</div>
          <div className="stat-number">{totalPending}</div>
          <div className="stat-label">En cours</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">👤</div>
          <div className="stat-number">{activeStudents}</div>
          <div className="stat-label">Actifs</div>
        </div>
      </div>

      {/* Search */}
      <div className="field" style={{marginBottom:12}}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Rechercher un élève..."
          style={{background:'white'}}/>
      </div>

      {/* Leaderboard */}
      <div className="leaderboard">
        {filtered.length === 0
          ? <div className="empty" style={{padding:32}}>
              <div className="empty-icon">👤</div>
              <p>{search ? 'Aucun élève trouvé' : 'Aucun élève inscrit'}</p>
            </div>
          : filtered.map((s, i) => {
              // find real rank in full list
              const realRank = data.findIndex(d => d.id === s.id);
              return (
                <div key={s.id} className="lb-row" style={{gap:8}}>
                  <div className={`lb-rank ${rankClass(realRank)}`}>{rankIcon(realRank)}</div>
                  <div className="lb-name" style={{flex:1,minWidth:0}}>
                    <strong>{s.first_name} {s.last_name}</strong>
                    <small>
                      {s.last_seen
                        ? `Vu le ${new Date(s.last_seen).toLocaleDateString('fr-FR')}`
                        : 'Jamais connecté'}
                    </small>
                  </div>
                  <div style={{display:'flex', gap:10, alignItems:'center', flexShrink:0}}>
                    <div className="lb-stat">
                      <div className="lb-stat-num" style={{color:'var(--sage)'}}>{s.stats.done}</div>
                      <div className="lb-stat-label">✅</div>
                    </div>
                    <div className="lb-stat">
                      <div className="lb-stat-num" style={{color:'#f59e0b'}}>{s.stats.pending}</div>
                      <div className="lb-stat-label">⏳</div>
                    </div>
                    <div className="lb-stat">
                      <div className="lb-stat-num">{s.stats.total}</div>
                      <div className="lb-stat-label">total</div>
                    </div>
                    <div style={{width:60, display:'none'}} className="lb-bar-desktop">
                      <div className="lb-bar-bg">
                        <div className="lb-bar-fill" style={{width:`${(s.stats.done/maxDone)*100}%`}}/>
                      </div>
                    </div>
                  </div>
                  <button className="btn btn-danger btn-sm"
                    style={{flexShrink:0}}
                    onClick={() => deleteStudent(s)}
                    title={`Supprimer ${s.first_name}`}>
                    🗑️
                  </button>
                </div>
              );
            })
        }
      </div>
    </div>
  );
}

// ── AUDIT LOG (teacher) ───────────────────────────────────────────────────────
function AuditLog() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/api/audit?limit=100').then(setEntries).catch(err => {
      console.error('[ForetMap] audit', err);
    }).finally(() => setLoading(false));
  }, []);

  const actionLabels = {
    'validate_task': 'Validation tâche',
    'delete_task': 'Suppression tâche',
    'delete_student': 'Suppression élève',
    'delete_log': 'Suppression rapport',
    'create_task': 'Création tâche',
    'update_task': 'Modification tâche',
    'create_zone': 'Création zone',
    'delete_zone': 'Suppression zone',
  };

  if (loading) return <div className="loader" style={{height:'40vh'}}><div className="loader-leaf">🌿</div><p>Chargement...</p></div>;

  return (
    <div className="fade-in">
      <h2 className="section-title">📜 Historique d'actions</h2>
      <p className="section-sub">Dernières actions effectuées en mode professeur</p>
      {entries.length === 0
        ? <div className="empty"><div className="empty-icon">📜</div><p>Aucune action enregistrée</p></div>
        : <div className="activity-list">
            {entries.map(e => (
              <div key={e.id} className="activity-item">
                <div className="activity-dot validated"/>
                <div className="activity-info">
                  <div className="activity-title">{actionLabels[e.action] || e.action}</div>
                  <div className="activity-meta">
                    {e.details && `${e.details} · `}
                    {e.target_type} {e.target_id ? `#${e.target_id.slice(0,8)}` : ''}
                    {' · '}{new Date(e.created_at).toLocaleDateString('fr-FR', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}
                  </div>
                </div>
              </div>
            ))}
          </div>
      }
    </div>
  );
}

function AboutView({ appVersion }) {
  const docsLinks = [
    { label: 'CHANGELOG', href: '/CHANGELOG.md', desc: 'Historique des modifications publiées' },
    { label: 'README', href: '/README.md', desc: 'Présentation du projet et installation' },
    { label: 'API', href: '/docs/API.md', desc: 'Routes backend et formats JSON' },
    { label: 'LOCAL_DEV', href: '/docs/LOCAL_DEV.md', desc: 'Mise en place locale (Docker + tests)' },
    { label: 'EVOLUTION', href: '/docs/EVOLUTION.md', desc: 'Feuille de route d\'évolution' },
    { label: 'VERSIONING', href: '/docs/VERSIONING.md', desc: 'Règles de versionnage SemVer' },
  ];

  return (
    <div className="fade-in">
      <h2 className="section-title">ℹ️ À propos</h2>
      <p className="section-sub">Informations du projet ForetMap</p>

      <div className="about-grid">
        <div className="about-card">
          <h3>Objet de l'application</h3>
          <p>
            ForetMap aide les élèves et les professeurs du Lycée Lyautey à organiser les activités de la forêt
            comestible: suivi des zones, des plantes, des tâches et des observations.
          </p>
          <div className="about-meta">
            <span className="about-chip">Version: {appVersion || 'indisponible'}</span>
            <span className="about-chip">Auteur: Mohammed El Farrai</span>
            <span className="about-chip">Contributeur: oliviera999</span>
          </div>
        </div>

        <div className="about-card">
          <h3>Documentation</h3>
          <div className="about-links">
            {docsLinks.map(link => (
              <a key={link.label} className="about-link" href={link.href} target="_blank" rel="noopener noreferrer">
                <strong>{link.label}</strong><br/>
                <small>{link.desc}</small>
              </a>
            ))}
          </div>
        </div>

        <div className="about-card">
          <h3>Dépôt GitHub</h3>
          <a className="about-link" href="https://github.com/oliviera999/ForetMap" target="_blank" rel="noopener noreferrer">
            <strong>github.com/oliviera999/ForetMap</strong><br/>
            <small>Code source complet du projet</small>
          </a>
        </div>
      </div>
    </div>
  );
}

export {
  Toast,
  Lightbox,
  PhotoGallery,
  ZoneInfoModal,
  ZoneDrawModal,
  MarkerModal,
  MapView,
  TaskFormModal,
  TasksView,
  LogModal,
  TaskLogsViewer,
  PlantEditForm,
  PlantManager,
  ObservationNotebook,
  PlantViewer,
  StudentStats,
  TeacherStats,
  AuditLog,
  AboutView,
};
