import React, { useState, useEffect, useRef } from 'react';
import { api, AccountDeletedError } from '../services/api';
import { SPECIAL_EMOJI, SPECIAL_DESC, TREE_LEGEND, TREE_DOTS } from '../constants/garden';
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
};
