import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { api, AccountDeletedError } from '../services/api';
import { SPECIAL_EMOJI, SPECIAL_DESC, TREE_LEGEND, TREE_DOTS, ZONE_COLORS } from '../constants/garden';
import { stageBadge, statusBadge, daysUntil, dueDateChip } from '../utils/badges';
import { compressImage } from '../utils/image';

// ── TOAST ──────────────────────────────────────────────────────────────────
function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2400); return () => clearTimeout(t); }, []);
  return <div className="toast">{msg}</div>;
}

// ── INTERACTIVE MAP ──────────────────────────────────────────────────────────

// ── LIGHTBOX PORTAL — renders at body level, escapes any overflow parent ─────
function Lightbox({ src, caption, onClose }) {
  // Render via portal so position:fixed isn't trapped by parent overflow
  const el = useMemo(() => document.createElement('div'), []);
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
      style={{position:'fixed',inset:0,background:'rgba(0,0,0,.93)',zIndex:99999,
        display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
        padding:20}}
      onClick={onClose}>
      <img src={src} onClick={e => e.stopPropagation()}
        style={{maxWidth:'95vw',maxHeight:'85vh',borderRadius:10,
          objectFit:'contain',boxShadow:'0 8px 40px rgba(0,0,0,.5)',
          animation:'popIn .25s var(--spring,cubic-bezier(.34,1.56,.64,1))'}}
        alt={caption||''}/>
      {caption && (
        <p style={{color:'rgba(255,255,255,.8)',marginTop:12,fontSize:'.9rem',
          maxWidth:'80vw',textAlign:'center'}}>{caption}</p>
      )}
      <button
        style={{position:'absolute',top:16,right:16,
          background:'rgba(255,255,255,.15)',backdropFilter:'blur(4px)',
          border:'none',color:'white',borderRadius:'50%',
          width:40,height:40,fontSize:'1.1rem',cursor:'pointer',
          display:'flex',alignItems:'center',justifyContent:'center'}}
        onClick={onClose}>✕</button>
    </div>
  );

  return createPortal(content, el);
}
function compressImage(file, maxPx=1200, quality=0.75) {
  return new Promise((res, rej) => {
    if (file.size > 15*1024*1024) return rej(new Error('Image trop lourde (max 15MB)'));
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxPx) { h = Math.round(h*maxPx/w); w = maxPx; }
        else if (h > maxPx) { w = Math.round(w*maxPx/h); h = maxPx; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        res(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ── PHOTO GALLERY COMPONENT ───────────────────────────────────────────────────
function PhotoGallery({ zoneId, isTeacher }) {
  const [photos,  setPhotos]  = useState([]);
  const [big,     setBig]     = useState(null);   // { src, caption }
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [caption,   setCaption]   = useState('');
  const fileRef = useRef();

  const load = async () => {
    setLoading(true);
    try {
      const list = await api(`/api/zones/${zoneId}/photos`);
      setPhotos(list.map(p => ({ ...p, image_data: null })));
      setLoading(false);
      // Pour les photos sans image_url (legacy base64), charger image_data
      for (const p of list) {
        if (p.image_url) continue;
        try {
          const d = await api(`/api/zones/${zoneId}/photos/${p.id}/data`);
          setPhotos(prev => prev.map(x => x.id === p.id ? { ...x, image_data: d.image_data } : x));
        } catch (e) { console.error('[ForetMap] photo legacy (data)', e); }
      }
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
    } catch(err) { alert(err.message); }
    setUploading(false);
  };

  const del = async id => {
    if (!confirm('Supprimer cette photo ?')) return;
    await api(`/api/zones/${zoneId}/photos/${id}`, 'DELETE');
    await load();
  };

  return (
    <div style={{marginTop:12}}>
      {/* Lightbox — rendered via portal, escapes modal overflow */}
      {big && <Lightbox src={big.src} caption={big.caption} onClose={() => setBig(null)}/>}

      {loading
        ? <p style={{color:'#aaa',fontSize:'.85rem',textAlign:'center',padding:'16px 0'}}>Chargement...</p>
        : photos.length === 0
          ? <p style={{color:'#bbb',fontSize:'.85rem',fontStyle:'italic',textAlign:'center',padding:'12px 0'}}>
              Aucune photo pour cette zone.
            </p>
          : <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(100px,1fr))',gap:8,marginBottom:12}}>
              {photos.map(p => (
                <div key={p.id} style={{position:'relative',borderRadius:8,overflow:'hidden',
                  aspectRatio:'1',background:'#e8f5e9'}}>
                  {(p.image_url || p.image_data)
                    ? <img src={p.image_url || p.image_data} style={{width:'100%',height:'100%',objectFit:'cover',cursor:'pointer'}}
                        onClick={() => setBig({src:p.image_url || p.image_data, caption:p.caption})} alt={p.caption||''}/>
                    : <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',
                        justifyContent:'center',fontSize:'1.5rem',animation:'sway 1.5s infinite'}}>🌿</div>
                  }
                  {(p.image_url || p.image_data) && p.caption && (
                    <div style={{position:'absolute',bottom:0,left:0,right:0,background:'rgba(0,0,0,.55)',
                      color:'white',fontSize:'.62rem',padding:'3px 5px',
                      overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.caption}</div>
                  )}
                  {isTeacher && (p.image_url || p.image_data) && (
                    <button onClick={() => del(p.id)}
                      style={{position:'absolute',top:4,right:4,background:'rgba(0,0,0,.55)',
                        border:'none',color:'white',borderRadius:'50%',width:22,height:22,
                        fontSize:'.7rem',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
      }

      {isTeacher && (
        <div>
          <input value={caption} onChange={e=>setCaption(e.target.value)}
            placeholder="Légende (optionnel)" style={{fontSize:'16px',width:'100%',marginBottom:6,
              padding:'8px 12px',border:'1.5px solid var(--mint)',borderRadius:8,background:'var(--cream)'}}/>
          <button className="btn btn-secondary btn-sm btn-full" disabled={uploading}
            onClick={() => fileRef.current.click()}>
            {uploading ? 'Envoi...' : '📷 Ajouter une photo'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment"
            style={{display:'none'}} onChange={upload}/>
        </div>
      )}
    </div>
  );
}

// ── ZONE INFO MODAL ───────────────────────────────────────────────────────────
function ZoneInfoModal({ zone, plants, isTeacher, onClose, onUpdate, onDelete, onEditPoints }) {
  const [tab,    setTab]    = useState('info');   // 'info' | 'photos' | 'edit'
  const [plant,  setPlant]  = useState(zone.current_plant || '');
  const [stage,  setStage]  = useState(zone.stage || 'empty');
  const [desc,   setDesc]   = useState(zone.description || '');
  const [saving, setSaving] = useState(false);
  const [toast,  setToast]  = useState(null);

  const displayStage = zone.special ? 'special' : zone.stage;
  const plantObj = plants.find(p => p.name === zone.current_plant);

  const save = async () => {
    setSaving(true);
    try {
      await onUpdate(zone.id, { current_plant: plant, stage, description: desc });
      setToast('Sauvegardé ✓');
      setTab('info');
    } catch(e) { setToast('Erreur'); }
    setSaving(false);
  };

  const TABS = [
    { id:'info',   label:'ℹ️ Info'   },
    { id:'photos', label:'📷 Photos' },
    ...(isTeacher && !zone.special ? [{ id:'edit', label:'✏️ Modifier' }] : []),
  ];

  return (
    <div className="modal-overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="log-modal fade-in" style={{paddingTop:16}}>
        {toast && <Toast msg={toast} onDone={() => setToast(null)}/>}
        <button className="modal-close" onClick={onClose}>✕</button>

        {/* Header */}
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
          <span style={{fontSize:'1.8rem'}}>
            {zone.special
              ? (zone.id.includes('ruche')?'🐝':zone.id.includes('mare')?'💧':zone.id.includes('butte')?'🌸':'🏛️')
              : (plantObj?.emoji || (zone.current_plant?'🌱':'🪨'))
            }
          </span>
          <div style={{flex:1,minWidth:0}}>
            <h3 style={{margin:0,fontSize:'1.1rem'}}>{zone.name}</h3>
            <div style={{marginTop:3}}>{stageBadge(displayStage)}</div>
          </div>
          {isTeacher && !zone.special && (
            <button className="btn btn-danger btn-sm"
              onClick={() => { if(confirm(`Supprimer "${zone.name}" ?`)) { onDelete(zone.id); onClose(); } }}>
              🗑️
            </button>
          )}
        </div>

        {/* Tabs */}
        <div style={{display:'flex',background:'var(--parchment)',borderRadius:10,padding:3,marginBottom:14,gap:2}}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{flex:1,padding:'8px 4px',border:'none',borderRadius:8,cursor:'pointer',
                fontFamily:'DM Sans,sans-serif',fontSize:'.8rem',fontWeight:tab===t.id?700:400,
                background:tab===t.id?'var(--forest)':'transparent',
                color:tab===t.id?'white':'var(--soil)',transition:'all .15s'}}>
              {t.label}
            </button>
          ))}
        </div>

        {/* INFO TAB */}
        {tab === 'info' && (
          <div className="fade-in">
            {!zone.special && zone.current_plant && (
              <div style={{background:'var(--parchment)',borderRadius:10,padding:'10px 14px',marginBottom:12}}>
                <div style={{fontWeight:700,color:'var(--forest)',marginBottom:3}}>{zone.current_plant}</div>
                {plantObj?.description && <p style={{fontSize:'.83rem',color:'#555',lineHeight:1.5,margin:0}}>{plantObj.description}</p>}
              </div>
            )}
            {zone.description && (
              <div style={{background:'#f0fdf4',borderRadius:10,padding:'10px 14px',marginBottom:12,
                border:'1px solid var(--mint)',fontSize:'.88rem',color:'#333',lineHeight:1.6}}>
                {zone.description}
              </div>
            )}
            {zone.history?.length > 0 && (
              <div className="history-list">
                <h4>Historique cultures</h4>
                {zone.history.map((h,i) => (
                  <div key={i} className="history-item">
                    <span>{h.plant}</span><span style={{color:'#aaa',fontSize:'.76rem'}}>{h.harvested_at}</span>
                  </div>
                ))}
              </div>
            )}
            {!zone.special && !zone.current_plant && !zone.description && zone.history?.length === 0 && (
              <p style={{color:'#bbb',fontSize:'.85rem',fontStyle:'italic',textAlign:'center',padding:'20px 0'}}>
                Zone vide — aucune information pour l'instant.
              </p>
            )}
          </div>
        )}

        {/* PHOTOS TAB */}
        {tab === 'photos' && (
          <div className="fade-in">
            <PhotoGallery zoneId={zone.id} isTeacher={isTeacher}/>
          </div>
        )}

        {/* EDIT TAB */}
        {tab === 'edit' && isTeacher && !zone.special && (
          <div className="fade-in">
            <div className="field"><label>Plante actuelle</label>
              <select value={plant} onChange={e => {
                setPlant(e.target.value);
                if (e.target.value && stage==='empty') setStage('growing');
                if (!e.target.value) setStage('empty');
              }}>
                <option value="">— Vide —</option>
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
                placeholder="Observations, conseils, notes sur cette zone..."/>
            </div>
            <button className="btn btn-primary btn-full" onClick={save} disabled={saving}>
              {saving ? '...' : '💾 Sauvegarder'}
            </button>
            {onEditPoints && (
              <button className="btn btn-ghost btn-full" style={{marginTop:8}}
                onClick={() => { onEditPoints(zone); onClose(); }}>
                🔷 Modifier le contour de la zone
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── ZONE DRAW MODAL ───────────────────────────────────────────────────────────
function ZoneDrawModal({ points_pct, onClose, onSave, plants }) {
  const [form, setForm] = useState({ name:'', current_plant:'', stage:'empty', description:'', color: ZONE_COLORS[0] });
  const [saving, setSaving] = useState(false);
  const set = k => e => setForm(f => ({...f, [k]: e.target.value}));
  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try { await onSave({ ...form, points: points_pct }); onClose(); }
    catch(e) { setSaving(false); }
  };
  return (
    <div className="modal-overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="log-modal fade-in">
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3>🖊️ Nouvelle zone</h3>
        <p style={{fontSize:'.83rem', color:'#888', marginBottom:14}}>{points_pct.length} points tracés</p>
        <div className="field"><label>Nom *</label>
          <input value={form.name} onChange={set('name')} placeholder="Ex: Potager Est" autoFocus/>
        </div>
        <div className="row">
          <div className="field"><label>Plante</label>
            <select value={form.current_plant} onChange={set('current_plant')}>
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
        <div className="field"><label>Description</label>
          <textarea value={form.description} onChange={set('description')} rows={2}
            placeholder="Notes, observations sur cette zone..."/>
        </div>
        <div className="field"><label>Couleur</label>
          <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
            {ZONE_COLORS.map(c => (
              <div key={c} onClick={() => setForm(f => ({...f, color:c}))}
                style={{width:30, height:30, borderRadius:8, background:c, cursor:'pointer',
                  border: form.color===c ? '3px solid #1a4731' : '2px solid #ddd',
                  transition:'transform .1s', transform: form.color===c ? 'scale(1.15)' : 'none'}}/>
            ))}
          </div>
        </div>
        <button className="btn btn-primary btn-full" onClick={save} disabled={saving} style={{marginTop:4}}>
          {saving ? '...' : '✅ Créer la zone'}
        </button>
      </div>
    </div>
  );
}

// ── MARKER MODAL ─────────────────────────────────────────────────────────────
function MarkerModal({ marker, plants, onClose, onSave, onDelete, isTeacher }) {
  const isNew = !marker.id;
  const [form, setForm] = useState({
    label: marker.label || '', plant_name: marker.plant_name || '',
    note: marker.note || '', emoji: marker.emoji || '🌱',
  });
  const [saving, setSaving] = useState(false);
  const set = k => e => setForm(f => ({...f, [k]: e.target.value}));
  const EMOJIS = ['🌱','🌿','🥬','🥕','🍅','🍓','🫘','🌸','🌳','🌲','🐝','💧','🪨','🏠','⚠️','🌾','🍋'];

  const save = async () => {
    if (!form.label.trim()) return;
    setSaving(true);
    try { await onSave({ ...marker, ...form }); onClose(); }
    catch(e) { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="log-modal fade-in">
        <button className="modal-close" onClick={onClose}>✕</button>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
          <span style={{fontSize:'2rem'}}>{form.emoji}</span>
          <h3 style={{margin:0}}>{isNew ? 'Nouveau repère' : form.label}</h3>
        </div>

        {isTeacher ? (
          <>
            <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
              {EMOJIS.map(e => (
                <button key={e} className={`emoji-btn ${form.emoji===e?'sel':''}`}
                  onClick={() => setForm(f=>({...f,emoji:e}))}>{e}</button>
              ))}
            </div>
            <div className="field"><label>Nom du repère *</label>
              <input value={form.label} onChange={set('label')} placeholder="Ex: Olivier n°10"/>
            </div>
            <div className="field"><label>Plante associée</label>
              <select value={form.plant_name} onChange={set('plant_name')}>
                <option value="">— Aucune —</option>
                {plants.map(p => <option key={p.id} value={p.name}>{p.emoji} {p.name}</option>)}
              </select>
            </div>
            <div className="field"><label>Note</label>
              <textarea value={form.note} onChange={set('note')} rows={3}
                placeholder="Observations, entretien..."/>
            </div>
            <div style={{display:'flex',gap:8,marginTop:4}}>
              <button className="btn btn-primary" style={{flex:1}} onClick={save} disabled={saving}>
                {saving?'...':(isNew?'📍 Placer':'💾 Sauver')}
              </button>
              {!isNew && (
                <button className="btn btn-danger" onClick={() => {
                  if(confirm('Supprimer ce repère ?')) { onDelete(marker.id); onClose(); }
                }}>🗑️</button>
              )}
            </div>
          </>
        ) : (
          <div>
            {form.plant_name && (
              <div style={{background:'var(--parchment)',borderRadius:10,padding:'10px 14px',marginBottom:12}}>
                <div style={{fontWeight:700,color:'var(--forest)'}}>{form.plant_name}</div>
              </div>
            )}
            {form.note
              ? <p style={{fontSize:'.9rem',color:'#444',lineHeight:1.6}}>{form.note}</p>
              : <p style={{fontSize:'.85rem',color:'#aaa',fontStyle:'italic'}}>Aucune note.</p>
            }
          </div>
        )}
      </div>
    </div>
  );
}

// ── MAIN MAP COMPONENT ────────────────────────────────────────────────────────
function MapView({ zones, markers, plants, isTeacher, onZoneUpdate, onRefresh }) {
  const containerRef = useRef(null);
  const worldRef     = useRef(null);
  const imgRef       = useRef(null);

  // Single source of truth: refs for live values, state only for coordinate math in render
  const tx = useRef({ x:0, y:0, s:1 }); // live transform — never causes re-render
  const [committed, setCommitted] = useState({ x:0, y:0, s:1 }); // for SVG/markers math
  const [imgSize, setImgSize] = useState({ w:1, h:1 });
  const imgSizeRef = useRef({ w:1, h:1 });

  const applyTransform = () => {
    if (worldRef.current) {
      const { x, y, s } = tx.current;
      worldRef.current.style.transform = `translate(${x}px,${y}px) scale(${s})`;
    }
  };

  // Only call when gesture ends — triggers React re-render for SVG coordinate recalc
  // We also re-apply the transform after React renders to prevent any flash
  const commitRef = useRef(null);
  const commit = () => {
    const snap = { ...tx.current };
    setCommitted(snap);
    // Re-apply after React paints to prevent any frame where React's stale transform shows
    cancelAnimationFrame(commitRef.current);
    commitRef.current = requestAnimationFrame(applyTransform);
  };

  const [mode,          setMode]          = useState('view');
  const [showLabels,    setShowLabels]    = useState(true);
  const [drawPoints,    setDrawPoints]    = useState([]);
  const [editZone,      setEditZone]      = useState(null);
  const [editPoints,    setEditPoints]    = useState([]);
  const [draggingPtIdx, setDraggingPtIdx] = useState(-1);
  const [selectedZone,   setSelectedZone]   = useState(null);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [pendingZone,    setPendingZone]     = useState(null);
  const [pendingMarker,  setPendingMarker]   = useState(null);
  const [toast,          setToast]           = useState(null);

  const modeRef           = useRef('view');
  const draggingMarkerRef = useRef(null);
  const draggingMarkerEl  = useRef(null);
  const isPanning         = useRef(false);
  const panStart          = useRef({ x:0, y:0 });
  const moved             = useRef(false);
  const pinching          = useRef(false);
  const pinchRef          = useRef({});
  const rafId             = useRef(null);

  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const onLoad = () => {
      imgSizeRef.current = { w: img.naturalWidth, h: img.naturalHeight };
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
    };
    if (img.complete) onLoad(); else img.addEventListener('load', onLoad);
    return () => img.removeEventListener('load', onLoad);
  }, []);

  useEffect(() => {
    const c = containerRef.current;
    if (!c || imgSizeRef.current.w <= 1) return;
    const { w, h } = imgSizeRef.current;
    const s  = Math.min(c.clientWidth / w, c.clientHeight / h, 1);
    const x  = (c.clientWidth  - w * s) / 2;
    const y  = (c.clientHeight - h * s) / 2;
    tx.current = { x, y, s };
    applyTransform();
    setCommitted({ x, y, s });
  }, [imgSize]);

  const fitMap = () => {
    const c = containerRef.current;
    if (!c) return;
    const { w, h } = imgSizeRef.current;
    const s  = Math.min(c.clientWidth / w, c.clientHeight / h, 1);
    const x  = (c.clientWidth  - w * s) / 2;
    const y  = (c.clientHeight - h * s) / 2;
    tx.current = { x, y, s };
    applyTransform();
    setCommitted({ x, y, s });
  };

  const scheduleApply = () => {
    if (rafId.current) return;
    rafId.current = requestAnimationFrame(() => {
      applyTransform();
      rafId.current = null;
    });
  };

  const toImagePct = (clientX, clientY) => {
    const c = containerRef.current;
    if (!c) return null;
    const r  = c.getBoundingClientRect();
    const { x, y, s } = tx.current;
    const { w, h }    = imgSizeRef.current;
    return { xp: ((clientX - r.left  - x) / s / w) * 100,
             yp: ((clientY - r.top - y) / s / h) * 100 };
  };

  // ── NATIVE LISTENERS ──────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onPD = e => {
      if (e.target.closest('.edit-pt') || e.target.closest('.map-bubble')) return;
      moved.current = false;
      if (modeRef.current === 'view') {
        isPanning.current = true;
        panStart.current  = { x: e.clientX - tx.current.x, y: e.clientY - tx.current.y };
      }
    };

    const onPM = e => {
      if (isPanning.current) {
        if (!moved.current) {
          moved.current = true;
          try { el.setPointerCapture(e.pointerId); } catch(_) {}
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
        mel.style.top  = p.yp + '%';
        mel._pct = p;
        e.preventDefault();
      }
    };

    const onPU = e => {
      if (isPanning.current) {
        isPanning.current = false;
        commit(); // sync React state ONCE on release
      }
      if (draggingMarkerRef.current) {
        const id  = draggingMarkerRef.current;
        const mel = draggingMarkerEl.current;
        if (mel?._pct) {
          api(`/api/map/markers/${id}`, 'PUT', { x_pct: mel._pct.xp, y_pct: mel._pct.yp }).then(onRefresh);
          delete mel._pct;
        }
        draggingMarkerRef.current = null;
        draggingMarkerEl.current  = null;
      }
      setTimeout(() => { moved.current = false; }, 0);
    };

    const onWH = e => {
      e.preventDefault();
      const r    = el.getBoundingClientRect();
      const mx   = e.clientX - r.left, my = e.clientY - r.top;
      const d    = e.deltaY > 0 ? 0.85 : 1.18;
      const ns   = Math.min(Math.max(tx.current.s * d, 0.15), 6);
      tx.current.x = mx - (mx - tx.current.x) * (ns / tx.current.s);
      tx.current.y = my - (my - tx.current.y) * (ns / tx.current.s);
      tx.current.s = ns;
      scheduleApply();
      clearTimeout(onWH._t);
      onWH._t = setTimeout(commit, 80);
    };

    const touchRef2 = {};
    const onTS = e => {
      if (e.touches.length === 2) {
        isPanning.current = false;
        pinching.current  = true;
        const t0 = e.touches[0], t1 = e.touches[1];
        const rect = el.getBoundingClientRect();
        touchRef2.dist = Math.hypot(t0.clientX-t1.clientX, t0.clientY-t1.clientY);
        touchRef2.s    = tx.current.s;
        touchRef2.ox   = tx.current.x;
        touchRef2.oy   = tx.current.y;
        touchRef2.mx   = (t0.clientX+t1.clientX)/2 - rect.left;
        touchRef2.my   = (t0.clientY+t1.clientY)/2 - rect.top;
        e.preventDefault();
      }
    };
    const onTM = e => {
      if (pinching.current && e.touches.length === 2) {
        e.preventDefault();
        const t0   = e.touches[0], t1 = e.touches[1];
        const dist = Math.hypot(t0.clientX-t1.clientX, t0.clientY-t1.clientY);
        const ns   = Math.min(Math.max(touchRef2.s*(dist/touchRef2.dist), 0.15), 6);
        tx.current.x = touchRef2.mx - (touchRef2.mx - touchRef2.ox) * (ns / touchRef2.s);
        tx.current.y = touchRef2.my - (touchRef2.my - touchRef2.oy) * (ns / touchRef2.s);
        tx.current.s = ns;
        scheduleApply();
      }
    };
    const onTE = e => {
      if (pinching.current && e.touches.length < 2) {
        pinching.current = false;
        commit();
      }
    };

    el.addEventListener('pointerdown',  onPD, { passive: true  });
    el.addEventListener('pointermove',  onPM, { passive: false });
    el.addEventListener('pointerup',    onPU, { passive: true  });
    el.addEventListener('pointerleave', onPU, { passive: true  });
    el.addEventListener('wheel',        onWH, { passive: false });
    el.addEventListener('touchstart',   onTS, { passive: false });
    el.addEventListener('touchmove',    onTM, { passive: false });
    el.addEventListener('touchend',     onTE, { passive: true  });

    return () => {
      el.removeEventListener('pointerdown',  onPD);
      el.removeEventListener('pointermove',  onPM);
      el.removeEventListener('pointerup',    onPU);
      el.removeEventListener('pointerleave', onPU);
      el.removeEventListener('wheel',        onWH);
      el.removeEventListener('touchstart',   onTS);
      el.removeEventListener('touchmove',    onTM);
      el.removeEventListener('touchend',     onTE);
    };
  }, [onRefresh]);

  const onMapClick = e => {
    if (moved.current) return;
    if (e.target.closest('.map-zone-hit') || e.target.closest('.map-bubble')) return;
    const p = toImagePct(e.clientX, e.clientY);
    if (!p) return;
    if (modeRef.current === 'draw-zone') setDrawPoints(pts => [...pts, p]);
    else if (modeRef.current === 'add-marker') { setPendingMarker(p); setMode('view'); }
  };

  const finishZone   = () => { if (drawPoints.length >= 3) { setPendingZone(drawPoints); setDrawPoints([]); setMode('view'); }};
  const undoPoint    = () => setDrawPoints(pts => pts.slice(0,-1));
  const cancelDraw   = () => { setDrawPoints([]); setMode('view'); };

  const startEditPoints = z => {
    let pts; try { pts = z.points ? JSON.parse(z.points) : []; } catch(e) { pts = []; }
    setEditZone(z); setEditPoints(pts); setMode('edit-points'); setSelectedZone(null);
  };
  const saveEditPoints = async () => {
    if (!editZone) return;
    await api(`/api/zones/${editZone.id}`, 'PUT', { points: editPoints });
    await onRefresh();
    setEditZone(null); setEditPoints([]); setMode('view');
    setToast('Contour sauvegardé ✓');
  };

  const saveMarker   = async d => { if(d.id) await api(`/api/map/markers/${d.id}`,'PUT',d); else await api('/api/map/markers','POST',d); await onRefresh(); };
  const deleteMarker = async id => { await api(`/api/map/markers/${id}`,'DELETE'); await onRefresh(); };
  const deleteZone   = async id => { await api(`/api/zones/${id}`,'DELETE'); await onRefresh(); };

  // SVG coords use committed state (updated only on gesture end)
  const { x: cx, y: cy, s: cs } = committed;
  const { w: iw, h: ih } = imgSize;
  const inv = 1 / cs;

  const toWorld = p => ({ cx:(p.xp/100)*iw, cy:(p.yp/100)*ih });

  const renderZonePoly = z => {
    let pts; try { pts = z.points ? JSON.parse(z.points) : null; } catch(e) { pts = null; }
    if (!pts || pts.length < 3) return null;
    const wp  = pts.map(toWorld);
    const str = wp.map(p=>`${p.cx},${p.cy}`).join(' ');
    const mx  = wp.reduce((s,p)=>s+p.cx,0)/wp.length;
    const my  = wp.reduce((s,p)=>s+p.cy,0)/wp.length;
    const isEd = mode==='edit-points' && editZone?.id===z.id;
    return (
      <g key={z.id} className={mode==='view'?'map-zone-hit':''} style={{cursor:mode==='view'?'pointer':'default'}}
        onClick={e=>{if(mode==='view'&&!moved.current){e.stopPropagation();setSelectedZone(z);}}}>
        <polygon points={str} fill={isEd?'rgba(82,183,136,0.35)':(z.color||'#86efac90')}
          stroke={isEd?'#52b788':'rgba(26,71,49,0.5)'}
          strokeWidth={(isEd?2.5:1.5)*inv} strokeDasharray={z.special?`${5*inv},${3*inv}`:'none'}/>
        {showLabels && (
          <text x={mx} y={my} textAnchor="middle" dominantBaseline="middle"
            fontSize={Math.max(8,12*inv)} fontWeight="700" fontFamily="DM Sans,sans-serif"
            fill="#1a4731" stroke="rgba(255,255,255,0.8)" strokeWidth={3*inv} paintOrder="stroke"
            style={{pointerEvents:'none',userSelect:'none'}}>{z.name}</text>
        )}
      </g>
    );
  };

  const renderEditPts = () => {
    if (mode!=='edit-points'||!editPoints.length) return null;
    const wp  = editPoints.map(toWorld);
    const str = wp.map(p=>`${p.cx},${p.cy}`).join(' ');
    const r   = Math.max(5, 8*inv);
    return (
      <g>
        <polygon points={str} fill="rgba(82,183,136,0.2)" stroke="#52b788" strokeWidth={2*inv}/>
        {wp.map((p,i)=>(
          <circle key={i} className="edit-pt" cx={p.cx} cy={p.cy} r={r}
            fill={draggingPtIdx===i?'#1a4731':'white'} stroke="#1a4731" strokeWidth={2*inv}
            style={{cursor:'grab'}}
            onPointerDown={e=>{e.stopPropagation();setDraggingPtIdx(i);e.currentTarget.setPointerCapture(e.pointerId);}}
            onPointerMove={e=>{if(draggingPtIdx===i){const p2=toImagePct(e.clientX,e.clientY);if(p2)setEditPoints(pts=>pts.map((pt,j)=>j===i?p2:pt));}}}
            onPointerUp={e=>{e.stopPropagation();setDraggingPtIdx(-1);}}/>
        ))}
      </g>
    );
  };

  const renderDrawing = () => {
    if (!drawPoints.length) return null;
    const wp  = drawPoints.map(toWorld);
    const str = wp.map(p=>`${p.cx},${p.cy}`).join(' ');
    const r   = Math.max(4,6*inv);
    return (
      <g>
        {drawPoints.length>1&&<polyline points={str} fill="none" stroke="#52b788" strokeWidth={2*inv} strokeDasharray={`${6*inv},${3*inv}`}/>}
        {wp.map((p,i)=><circle key={i} cx={p.cx} cy={p.cy} r={r} fill="#1a4731" stroke="white" strokeWidth={1.5*inv}/>)}
      </g>
    );
  };

  const cursor = mode==='view'?'grab':mode==='draw-zone'?'crosshair':mode==='edit-points'?'default':'cell';

  /* Prof : pas de barre du bas → ne pas réserver 72px (évite zone morte / chevauchements) */
  const mapColHeight = isTeacher ? 'calc(100dvh - 56px)' : 'calc(100dvh - 56px - 72px)';

  return (
    <div style={{display:'flex',flexDirection:'column',height:mapColHeight,minHeight:380}}>
      {toast && <Toast msg={toast} onDone={()=>setToast(null)}/>}

      {selectedZone && (
        <ZoneInfoModal zone={selectedZone} plants={plants} isTeacher={isTeacher}
          onClose={()=>setSelectedZone(null)}
          onUpdate={async(id,data)=>{await onZoneUpdate(id,data);setSelectedZone(null);await onRefresh();}}
          onDelete={async id=>{await deleteZone(id);setSelectedZone(null);}}
          onEditPoints={isTeacher?z=>startEditPoints(z):null}/>
      )}
      {selectedMarker && (
        <MarkerModal marker={selectedMarker} plants={plants} isTeacher={isTeacher}
          onClose={()=>setSelectedMarker(null)} onSave={saveMarker} onDelete={deleteMarker}/>
      )}
      {pendingZone && (
        <ZoneDrawModal points_pct={pendingZone} plants={plants}
          onClose={()=>setPendingZone(null)}
          onSave={async data=>{await api('/api/zones','POST',data);setPendingZone(null);await onRefresh();}}/>
      )}
      {pendingMarker && (
        <MarkerModal marker={{x_pct:pendingMarker.xp,y_pct:pendingMarker.yp,label:'',note:'',emoji:'🌱',plant_name:''}}
          plants={plants} isTeacher={isTeacher}
          onClose={()=>setPendingMarker(null)}
          onSave={async data=>{await api('/api/map/markers','POST',data);setPendingMarker(null);await onRefresh();}}
          onDelete={()=>setPendingMarker(null)}/>
      )}

      {/* Toolbar */}
      <div style={{display:'flex',alignItems:'center',gap:6,padding:'7px 12px',
        background:'white',borderBottom:'1.5px solid var(--mint)',flexShrink:0,flexWrap:'wrap',minHeight:50}}>
        <div style={{display:'flex',gap:3,background:'var(--parchment)',borderRadius:10,padding:3}}>
          {[['view','🖐️ Nav'],
            ...(isTeacher&&mode!=='edit-points'?[
              ['draw-zone',`🖊️ Zone${mode==='draw-zone'&&drawPoints.length>0?` (${drawPoints.length})`:''}`],
              ['add-marker','📍 Repère'],
            ]:[])
          ].map(([m,label])=>(
            <button key={m}
              style={{background:mode===m?'var(--forest)':'transparent',color:mode===m?'white':'var(--soil)',
                border:'none',borderRadius:8,padding:'7px 11px',cursor:'pointer',
                fontFamily:'DM Sans,sans-serif',fontSize:'.82rem',fontWeight:600,
                transition:'all .15s',whiteSpace:'nowrap'}}
              onClick={()=>{setMode(p=>p===m&&m!=='view'?'view':m);if(m==='view'){setDrawPoints([]);setEditZone(null);setEditPoints([]);}}}>
              {label}
            </button>
          ))}
        </div>

        {isTeacher&&mode==='draw-zone'&&drawPoints.length>0&&(
          <div style={{display:'flex',gap:4}}>
            {drawPoints.length>=3&&<button className="btn btn-secondary btn-sm" onClick={finishZone}>✅ Terminer</button>}
            <button className="btn btn-ghost btn-sm" onClick={undoPoint}>↩ Undo</button>
            <button className="btn btn-danger btn-sm" onClick={cancelDraw}>✕</button>
          </div>
        )}
        {mode==='edit-points'&&(
          <div style={{display:'flex',gap:6,alignItems:'center'}}>
            <span style={{fontSize:'.8rem',color:'var(--leaf)',fontWeight:700,
              background:'#f0fdf4',padding:'5px 10px',borderRadius:8,border:'1px solid var(--mint)'}}>
              ✏️ {editZone?.name}
            </span>
            <button className="btn btn-primary btn-sm" onClick={saveEditPoints}>💾 Sauver</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>{setMode('view');setEditZone(null);setEditPoints([]);}}>✕</button>
          </div>
        )}

        <div style={{marginLeft:'auto',display:'flex',gap:4,alignItems:'center'}}>
          <button title={showLabels?'Masquer':'Afficher noms'}
            onClick={()=>setShowLabels(l=>!l)}
            style={{background:showLabels?'var(--mint)':'transparent',border:'1.5px solid var(--mint)',
              color:'var(--forest)',borderRadius:8,padding:'6px 10px',cursor:'pointer',fontSize:'.9rem'}}>🏷️</button>
          <div style={{display:'flex',background:'var(--parchment)',borderRadius:10,padding:3,gap:2}}>
            {[['＋',1.28],['－',0.78],['⊡',0]].map(([label,factor])=>(
              <button key={label} onClick={()=>{
                if(factor===0){fitMap();return;}
                const c=containerRef.current;if(!c)return;
                const r=c.getBoundingClientRect();
                const mx=r.width/2,my=r.height/2;
                const ns=factor>1?Math.min(tx.current.s*factor,6):Math.max(tx.current.s*factor,0.15);
                tx.current.x=mx-(mx-tx.current.x)*(ns/tx.current.s);
                tx.current.y=my-(my-tx.current.y)*(ns/tx.current.s);
                tx.current.s=ns;
                applyTransform();
                commit();
              }}
              style={{background:'transparent',border:'none',color:'var(--soil)',
                padding:'6px 10px',cursor:'pointer',fontSize:'1rem',borderRadius:7}}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef}
        style={{flex:1,overflow:'hidden',position:'relative',background:'#eef2ee',
          cursor,touchAction:'none',userSelect:'none',WebkitUserSelect:'none'}}
        onClick={onMapClick}>

        {/* World — single CSS transform, GPU composited */}
        <div ref={worldRef}
          style={{position:'absolute',left:0,top:0,width:iw,height:ih,
            transformOrigin:'0 0',willChange:'transform',
            }}>

          <img ref={imgRef} src="/map.png" draggable={false} alt="Plan du jardin"
            style={{position:'absolute',left:0,top:0,width:iw,height:ih,
              userSelect:'none',pointerEvents:'none',
              boxShadow:'0 4px 24px rgba(0,0,0,.18)'}}/>

          <svg style={{position:'absolute',left:0,top:0,width:iw,height:ih,
            overflow:'visible',pointerEvents:'none'}}>
            <g style={{pointerEvents:'all'}}>
              {zones.map(z=>renderZonePoly(z))}
              {renderDrawing()}
              {renderEditPts()}
            </g>
          </svg>

          {markers.map(m=>(
            <div key={m.id} className="map-bubble"
              style={{position:'absolute',left:m.x_pct+'%',top:m.y_pct+'%',
                transform:'translate(-50%,-50%)',zIndex:10,cursor:isTeacher?'grab':'pointer'}}
              onClick={e=>{e.stopPropagation();if(!moved.current)setSelectedMarker(m);}}
              onPointerDown={isTeacher?e=>{
                e.stopPropagation();
                draggingMarkerRef.current=m.id;
                draggingMarkerEl.current=e.currentTarget;
                e.currentTarget.setPointerCapture(e.pointerId);
              }:undefined}
              onPointerUp={e=>e.stopPropagation()}>
              <div style={{background:'white',border:'2.5px solid var(--forest)',
                borderRadius:'50%',width:36,height:36,
                display:'flex',alignItems:'center',justifyContent:'center',
                fontSize:'1.1rem',boxShadow:'0 2px 10px rgba(0,0,0,.22)'}}>
                {m.emoji}
              </div>
              {showLabels&&(
                <div style={{position:'absolute',top:'100%',left:'50%',transform:'translateX(-50%)',
                  background:'rgba(26,71,49,.9)',color:'white',borderRadius:5,
                  padding:'2px 7px',fontSize:'.62rem',fontWeight:700,
                  whiteSpace:'nowrap',marginTop:3,maxWidth:90,
                  overflow:'hidden',textOverflow:'ellipsis',pointerEvents:'none',
                  boxShadow:'0 1px 5px rgba(0,0,0,.2)'}}>
                  {m.label}
                </div>
              )}
            </div>
          ))}
        </div>

        {mode!=='view'&&mode!=='edit-points'&&(
          <div style={{position:'absolute',bottom:14,left:'50%',transform:'translateX(-50%)',
            background:'rgba(26,71,49,.9)',color:'white',borderRadius:22,
            padding:'9px 20px',fontSize:'.82rem',fontWeight:600,
            pointerEvents:'none',whiteSpace:'nowrap',zIndex:20}}>
            {mode==='draw-zone'&&drawPoints.length<3&&'🖊️ Touche la carte (min. 3 pts)'}
            {mode==='draw-zone'&&drawPoints.length>=3&&`✅ ${drawPoints.length} pts — Terminer`}
            {mode==='add-marker'&&'📍 Touche la carte pour placer'}
          </div>
        )}
        {mode==='edit-points'&&(
          <div style={{position:'absolute',bottom:14,left:'50%',transform:'translateX(-50%)',
            background:'rgba(82,183,136,.92)',color:'white',borderRadius:22,
            padding:'9px 20px',fontSize:'.82rem',fontWeight:600,
            pointerEvents:'none',whiteSpace:'nowrap',zIndex:20}}>
            ✋ Glisse les points pour modifier
          </div>
        )}
      </div>
    </div>
  );
}


// ── TASK FORM MODAL ───────────────────────────────────────────────────────────
function TaskFormModal({ zones, onClose, onSave, editTask }) {
  const [form, setForm] = useState(editTask ? {
    title: editTask.title, description: editTask.description || '',
    zone_id: editTask.zone_id || '', due_date: editTask.due_date || '',
    required_students: editTask.required_students || 1,
    recurrence: editTask.recurrence || ''
  } : { title:'', description:'', zone_id:'', due_date:'', required_students:1, recurrence:'' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = k => e => setForm(f => ({...f, [k]: e.target.value}));

  const submit = async () => {
    if (!form.title.trim()) return setErr('Le titre est requis');
    setSaving(true);
    try { await onSave(form); onClose(); }
    catch(e) { setErr(e.message); setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal fade-in">
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3>{editTask ? 'Modifier la tâche' : 'Nouvelle tâche'}</h3>
        {err && <p style={{color:var_alert, marginBottom:12, fontSize:'.85rem'}}>{err}</p>}
        <div className="field"><label>Titre *</label><input value={form.title} onChange={set('title')} placeholder="Ex: Arroser les tomates"/></div>
        <div className="field"><label>Description</label><textarea value={form.description} onChange={set('description')} rows={2} placeholder="Instructions détaillées..."/></div>
        <div className="row">
          <div className="field"><label>Zone</label>
            <select value={form.zone_id} onChange={set('zone_id')}>
              <option value="">— Aucune —</option>
              {zones.filter(z => !z.special).map(z => <option key={z.id} value={z.id}>{z.name}{z.current_plant ? ` — ${z.current_plant}` : ''}</option>)}
            </select>
          </div>
          <div className="field"><label>Élèves requis</label>
            <input type="number" min="1" max="10" value={form.required_students} onChange={set('required_students')}/>
          </div>
        </div>
        <div className="row">
          <div className="field"><label>Date limite</label><input type="date" value={form.due_date} onChange={set('due_date')}/></div>
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

// quick workaround for CSS variable in JSX
const var_alert = 'var(--alert)';

// ── TASKS VIEW ────────────────────────────────────────────────────────────────
function TasksView({ tasks, zones, isTeacher, student, onRefresh, onForceLogout }) {
  const [showForm,   setShowForm]   = useState(false);
  const [editTask,   setEditTask]   = useState(null);
  const [logTask,    setLogTask]    = useState(null);
  const [logsTask,   setLogsTask]   = useState(null);
  const [loading,    setLoading]    = useState({});
  const [toast,      setToast]      = useState(null);
  const [confirmTask, setConfirmTask] = useState(null); // { task, action, label }
  const [filterText, setFilterText] = useState('');
  const [filterZone, setFilterZone] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const withLoad = async (id, fn) => {
    setLoading(l => ({...l, [id]: true}));
    try { await fn(); await onRefresh(); }
    catch(e) {
      if (e instanceof AccountDeletedError) onForceLogout();
      else setToast('Erreur : ' + e.message);
    }
    setLoading(l => ({...l, [id]: false}));
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

  // Échéances proches (3 jours) pour les élèves
  const urgentTasks = !isTeacher ? tasks.filter(t => {
    if (t.status === 'validated' || t.status === 'done') return false;
    const d = daysUntil(t.due_date);
    return d !== null && d <= 3 && d >= -2;
  }).sort((a, b) => daysUntil(a.due_date) - daysUntil(b.due_date)) : [];

  const usedZones = [...new Set(tasks.filter(t => t.zone_id).map(t => t.zone_id))];

  const TaskCard = ({ t, showValidate, showDone }) => {
    const isMine = myTasks.some(m => m.id === t.id);
    const slots  = t.required_students - (t.assignments?.length || 0);
    return (
      <div className={`task-card ${isMine ? 'mine' : ''} ${t.status === 'validated' ? 'done' : ''}`}>
        <div className="task-top">
          <div className="task-title">{t.title}</div>
          {statusBadge(t.status)}
        </div>
        <div className="task-meta">
          {t.zone_name && <span className="task-chip">🌿 {t.zone_name}</span>}
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
            <button className="btn btn-primary btn-sm" disabled={loading[t.id+'assign']} onClick={() => assign(t)}>
              {loading[t.id+'assign'] ? '...' : '✋ Je m\'en occupe'}
            </button>
          )}
          {!isTeacher && isMine && (t.status === 'in_progress' || t.status === 'available') && (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => setLogTask(t)}>
                ✅ Marquer terminée
              </button>
              <button className="btn btn-ghost btn-sm" disabled={loading[t.id+'unassign']}
                onClick={() => unassign(t)}
                title="Me retirer de cette tâche">
                {loading[t.id+'unassign'] ? '...' : '↩️ Me retirer'}
              </button>
            </>
          )}
          {isTeacher && t.status === 'done' && (
            <button className="btn btn-primary btn-sm" disabled={loading[t.id+'val']} onClick={() => validate(t)}>
              {loading[t.id+'val'] ? '...' : '✓ Valider'}
            </button>
          )}
          {isTeacher && (t.status === 'done' || t.status === 'validated') && (
            <button className="btn btn-ghost btn-sm" onClick={() => setLogsTask(t)}>📋 Rapports</button>
          )}
          {isTeacher && (
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => { setEditTask(t); setShowForm(true); }}>✏️</button>
              <button className="btn btn-danger btn-sm" disabled={loading[t.id+'del']} onClick={() => deleteTask(t)}>🗑️</button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      {toast && <Toast msg={toast} onDone={() => setToast(null)}/>}
      {(showForm || editTask) && (
        <TaskFormModal zones={zones} editTask={editTask} onClose={() => { setShowForm(false); setEditTask(null); }} onSave={saveTask}/>
      )}
      {logTask && (
        <LogModal task={logTask} student={student}
          onClose={() => setLogTask(null)}
          onDone={async () => { await onRefresh(); setToast('Rapport envoyé ✓'); }}
        />
      )}
      {logsTask && <TaskLogsViewer task={logsTask} onClose={() => setLogsTask(null)}/>}

      {/* Inline confirm — replaces browser confirm() which blocks/fails on mobile */}
      {confirmTask && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmTask(null)}>
          <div className="log-modal fade-in" style={{paddingBottom:'calc(20px + var(--safe-bottom))'}} onClick={e => e.stopPropagation()}>
            <h3 style={{marginBottom:8}}>Confirmation</h3>
            <p style={{fontSize:'.95rem',color:'#444',marginBottom:20,lineHeight:1.5}}>{confirmTask.label}</p>
            <div style={{display:'flex',gap:10}}>
              <button className="btn btn-danger" style={{flex:1}} onClick={async () => {
                const a = confirmTask.action; setConfirmTask(null); await a();
              }}>Confirmer</button>
              <button className="btn btn-ghost" style={{flex:1}} onClick={() => setConfirmTask(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4}}>
        <h2 className="section-title">✅ Tâches</h2>
        {isTeacher && <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>+ Nouvelle tâche</button>}
      </div>
      <p className="section-sub">{isTeacher ? 'Gérer et valider les tâches' : 'Prends en charge une tâche ou suis tes activités'}</p>

      {/* Barre de filtres */}
      <div className="task-filters">
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

      {/* Échéances proches (élèves uniquement) */}
      {!isTeacher && urgentTasks.length > 0 && (
        <div className="urgency-banner">
          <h4>🔥 Échéances proches</h4>
          {urgentTasks.slice(0, 5).map(t => {
            const d = daysUntil(t.due_date);
            const label = d < 0 ? `Retard ${-d}j` : d === 0 ? "Aujourd'hui" : d === 1 ? 'Demain' : `${d} jours`;
            return (
              <div key={t.id} className="urgency-item">
                <span className="urgency-days">{label}</span>
                <span style={{flex:1, color:'var(--forest)', fontWeight:500}}>{t.title}</span>
                {t.zone_name && <span style={{fontSize:'.76rem', color:'#aaa'}}>{t.zone_name}</span>}
              </div>
            );
          })}
        </div>
      )}

      {!isTeacher && myTasks.length > 0 && (
        <div className="tasks-section">
          <div className="tasks-section-title">Mes tâches</div>
          <div>{myTasks.map(t => <TaskCard key={t.id} t={t}/>)}</div>
        </div>
      )}

      {isTeacher ? (
        <>
          {done.length > 0 && (
        <div className="tasks-section">
          <div className="tasks-section-title">En attente de validation ({done.length})</div>
          <div>{done.map(t => <TaskCard key={t.id} t={t}/>)}</div>
        </div>
      )}
      {inProgress.length > 0 && (
        <div className="tasks-section">
          <div className="tasks-section-title">En cours</div>
          <div>{inProgress.map(t => <TaskCard key={t.id} t={t}/>)}</div>
        </div>
      )}
      {available.length > 0 && (
        <div className="tasks-section">
          <div className="tasks-section-title">Disponibles</div>
          <div>{available.map(t => <TaskCard key={t.id} t={t}/>)}</div>
        </div>
      )}
      {validated.length > 0 && (
        <div className="tasks-section">
          <div className="tasks-section-title">Validées</div>
          <div>{validated.map(t => <TaskCard key={t.id} t={t}/>)}</div>
        </div>
      )}
        </>
      ) : (
        <>
          {available.filter(t => !myTasks.some(m => m.id === t.id)).length > 0 && (
            <div className="tasks-section">
              <div className="tasks-section-title">Tâches disponibles</div>
              <div>{available.filter(t => !myTasks.some(m => m.id === t.id)).map(t => <TaskCard key={t.id} t={t}/>)}</div>
            </div>
          )}
          {tasks.filter(t => t.status === 'validated' && t.assignments?.some(
              a => a.student_first_name === student?.first_name && a.student_last_name === student?.last_name
            )).length > 0 && (
            <div className="tasks-section">
              <div className="tasks-section-title">Récemment validées ✓</div>
              <div>{tasks.filter(t => t.status === 'validated' && t.assignments?.some(
                a => a.student_first_name === student?.first_name && a.student_last_name === student?.last_name
              )).map(t => <TaskCard key={t.id} t={t}/>)}</div>
            </div>
          )}
        </>
      )}

      {tasks.length === 0 && (
        <div className="empty"><div className="empty-icon">🌿</div><p>Aucune tâche pour le moment</p></div>
      )}
    </div>
  );
}

// ── PIN MODAL ─────────────────────────────────────────────────────────────────
function PinModal({ onSuccess, onClose }) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const check = async () => {
    if (!pin.trim()) return setErr('Code requis');
    setErr('');
    setLoading(true);
    try {
      const data = await api('/api/auth/teacher', 'POST', { pin: pin.trim() });
      if (!data || !data.token) {
        setErr('Réponse serveur invalide');
        setLoading(false);
        return;
      }
      localStorage.setItem('foretmap_teacher_token', data.token);
      onSuccess();
    } catch (e) {
      setErr(e.message || 'Code incorrect');
      setPin('');
    }
    setLoading(false);
  };

  return (
    <div className="pin-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pin-card fade-in">
        <div style={{fontSize:'2rem', marginBottom:8}}>🔒</div>
        <h3>Mode professeur</h3>
        <p>Entrez le code PIN pour accéder au tableau de bord</p>
        {err && <div className="pin-error">{err}</div>}
        <input
          className="pin-input" type="password" maxLength={4}
          value={pin} onChange={e => { setPin(e.target.value); setErr(''); }}
          onKeyDown={e => e.key === 'Enter' && !loading && check()}
          placeholder="••••" autoFocus
        />
        <button className="btn btn-primary btn-full" onClick={check} disabled={loading}>{loading ? 'Vérification…' : 'Entrer'}</button>
        <button className="btn btn-ghost btn-full" style={{marginTop:8}} onClick={onClose}>Annuler</button>
      </div>
    </div>
  );
}

// ── AUTH SCREEN ───────────────────────────────────────────────────────────────
function AuthScreen({ onLogin, appVersion }) {
  const [mode,    setMode]    = useState('login');   // 'login' | 'register'
  const [first,   setFirst]   = useState('');
  const [last,    setLast]    = useState('');
  const [pass,    setPass]    = useState('');
  const [pass2,   setPass2]   = useState('');
  const [err,     setErr]     = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setErr('');
    if (!first.trim() || !last.trim() || !pass) return setErr('Tous les champs sont requis');
    if (mode === 'register' && pass !== pass2) return setErr('Les mots de passe ne correspondent pas');
    if (mode === 'register' && pass.length < 4) return setErr('Mot de passe trop court (min 4 caractères)');
    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const student  = await api(endpoint, 'POST', { firstName: first.trim(), lastName: last.trim(), password: pass });
      localStorage.setItem('foretmap_student', JSON.stringify(student));
      onLogin(student);
    } catch(e) { setErr(e.message); }
    setLoading(false);
  };

  const onKey = e => e.key === 'Enter' && submit();

  return (
    <div className="auth-wrap">
      <div className="auth-card fade-in">
        <div style={{fontSize:'2.5rem', marginBottom:10}}>🌿</div>
        <h1>ForêtMap</h1>
        <p className="sub">Atelier forêt comestible — Lycée Lyautey</p>

        <div className="auth-tabs">
          <button className={`auth-tab ${mode==='login'?'active':''}`} onClick={() => { setMode('login'); setErr(''); }}>Connexion</button>
          <button className={`auth-tab ${mode==='register'?'active':''}`} onClick={() => { setMode('register'); setErr(''); }}>Créer un compte</button>
        </div>

        {err && <div className="auth-error">⚠️ {err}</div>}

        <div className="row">
          <div className="field"><label>Prénom</label>
            <input value={first} onChange={e=>setFirst(e.target.value)} placeholder="Mohamed" autoFocus onKeyDown={onKey}/>
          </div>
          <div className="field"><label>Nom</label>
            <input value={last} onChange={e=>setLast(e.target.value)} placeholder="El Farrai" onKeyDown={onKey}/>
          </div>
        </div>
        <div className="field"><label>Mot de passe</label>
          <input type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••" onKeyDown={onKey}/>
        </div>
        {mode === 'register' && (
          <div className="field"><label>Confirmer le mot de passe</label>
            <input type="password" value={pass2} onChange={e=>setPass2(e.target.value)} placeholder="••••" onKeyDown={onKey}/>
          </div>
        )}
        <button className="btn btn-primary btn-full" onClick={submit} disabled={loading} style={{marginTop:4}}>
          {loading ? '...' : mode === 'login' ? 'Se connecter 🌱' : 'Créer le compte'}
        </button>
        {appVersion != null && <p className="auth-version">Version {appVersion}</p>}
      </div>
    </div>
  );
}

// ── LOG MODAL (student finishes task) ────────────────────────────────────────
function LogModal({ task, student, onClose, onDone }) {
  const [comment,   setComment]   = useState('');
  const [imageData, setImageData] = useState(null);
  const [preview,   setPreview]   = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [err,       setErr]       = useState('');
  const inputRef = useRef();

  const handleFile = e => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) return setErr('Image trop lourde (max 15MB)');

    const reader = new FileReader();
    reader.onload = ev => {
      // Compress via canvas — resize to max 1200px wide, quality 0.7
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
    } catch(e) { setErr(e.message); setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="log-modal fade-in">
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3>📋 Rapport de tâche</h3>
        <p style={{fontSize:'.85rem', color:'#777', marginBottom:16}}>
          <strong>{task.title}</strong> — laisse un commentaire ou une photo avant de valider
        </p>
        {err && <p style={{color:'var(--alert)', fontSize:'.82rem', marginBottom:8}}>{err}</p>}

        <div className="field">
          <label>Commentaire (optionnel)</label>
          <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3}
            placeholder="Comment ça s'est passé ? Des observations sur la plante ?"/>
        </div>

        <div className="field">
          <label>Photo (optionnel)</label>
          {!preview ? (
            <div className="img-upload-area" onClick={() => inputRef.current.click()}>
              <div style={{fontSize:'2rem', marginBottom:6}}>📷</div>
              <div style={{fontSize:'.85rem', color:'#888'}}>Touche pour prendre ou choisir une photo</div>
              <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={handleFile}/>
            </div>
          ) : (
            <div className="img-preview-wrap">
              <img src={preview} className="img-preview" alt="preview"/>
              <button className="img-remove" onClick={() => { setImageData(null); setPreview(null); }}>✕</button>
            </div>
          )}
        </div>

        <div style={{display:'flex', gap:8, marginTop:16}}>
          <button className="btn btn-primary" style={{flex:1}} onClick={submit} disabled={saving}>
            {saving ? 'Envoi...' : '✅ Marquer comme terminée'}
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
        </div>
      </div>
    </div>
  );
}

// ── TASK LOGS VIEWER (teacher sees logs on a done task) ───────────────────────
function TaskLogsViewer({ task, onClose }) {
  const [logs, setLogs] = useState([]);
  const [big,  setBig]  = useState(null);
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
      {big && <Lightbox src={big} caption="" onClose={() => setBig(null)}/>}
      {toast && <Toast msg={toast} onDone={() => setToast(null)}/>}
      <div className="log-modal fade-in">
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3>📋 Rapports — {task.title}</h3>
        {logs.length === 0
          ? <div className="empty"><div className="empty-icon">📭</div><p>Aucun rapport pour cette tâche</p></div>
          : logs.map(l => (
            <div key={l.id} className="log-entry fade-in">
              <div className="log-entry-header">
                <span className="log-entry-author">{l.student_first_name} {l.student_last_name}</span>
                <div style={{display:'flex', alignItems:'center', gap:8}}>
                  <span>{new Date(l.created_at).toLocaleDateString('fr-FR', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</span>
                  <button className="btn btn-danger btn-sm" style={{padding:'4px 8px', minHeight:'auto', fontSize:'.72rem'}}
                    onClick={() => { if (confirm('Supprimer ce rapport ?')) deleteLog(l.id); }}
                    title="Supprimer ce rapport">🗑️</button>
                </div>
              </div>
              {l.comment && <div className="log-comment">{l.comment}</div>}
              {(l.image_url || l.image_data) && (
                <img src={l.image_url || l.image_data} className="log-image" alt="rapport" onClick={() => setBig(l.image_url || l.image_data)}/>
              )}
            </div>
          ))
        }
      </div>
    </div>
  );
}

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
  PinModal,
  AuthScreen,
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
