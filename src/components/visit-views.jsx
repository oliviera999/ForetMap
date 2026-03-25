import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, AccountDeletedError } from '../services/api';

function parsePctPoints(raw) {
  try {
    const points = JSON.parse(raw || '[]');
    if (!Array.isArray(points)) return [];
    return points
      .map((p) => ({
        xp: Number(p?.xp),
        yp: Number(p?.yp),
      }))
      .filter((p) => Number.isFinite(p.xp) && Number.isFinite(p.yp));
  } catch (_) {
    return [];
  }
}

function itemSeenKey(type, id) {
  return `${type}:${id}`;
}

function VisitEditorPanel({ selected, selectedType, onSaved, onForceLogout, isTeacher }) {
  const [form, setForm] = useState({
    subtitle: '',
    short_description: '',
    details_title: 'Détails',
    details_text: '',
    sort_order: 0,
    is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaCaption, setMediaCaption] = useState('');
  const [mediaSaving, setMediaSaving] = useState(false);

  useEffect(() => {
    setForm({
      subtitle: selected?.visit_subtitle || '',
      short_description: selected?.visit_short_description || '',
      details_title: selected?.visit_details_title || 'Détails',
      details_text: selected?.visit_details_text || '',
      sort_order: Number(selected?.visit_sort_order || 0),
      is_active: Number(selected?.visit_is_active ?? 1) === 1,
    });
    setMediaUrl('');
    setMediaCaption('');
  }, [selected]);

  if (!isTeacher || !selected || !selectedType) return null;

  const save = async () => {
    setSaving(true);
    try {
      await api(`/api/visit/${selectedType === 'zone' ? 'zones' : 'markers'}/${selected.id}`, 'PUT', form);
      await onSaved?.();
    } catch (err) {
      if (err instanceof AccountDeletedError) onForceLogout?.();
      else alert(err.message || 'Erreur enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const addMedia = async () => {
    if (!mediaUrl.trim()) return;
    setMediaSaving(true);
    try {
      await api('/api/visit/media', 'POST', {
        target_type: selectedType,
        target_id: selected.id,
        image_url: mediaUrl.trim(),
        caption: mediaCaption.trim(),
      });
      setMediaUrl('');
      setMediaCaption('');
      await onSaved?.();
    } catch (err) {
      if (err instanceof AccountDeletedError) onForceLogout?.();
      else alert(err.message || 'Erreur ajout photo');
    } finally {
      setMediaSaving(false);
    }
  };

  const deleteMedia = async (id) => {
    if (!confirm('Supprimer cette photo ?')) return;
    try {
      await api(`/api/visit/media/${id}`, 'DELETE');
      await onSaved?.();
    } catch (err) {
      if (err instanceof AccountDeletedError) onForceLogout?.();
      else alert(err.message || 'Erreur suppression photo');
    }
  };

  return (
    <div className="visit-editor">
      <h4>🎛️ Édition visite (prof)</h4>
      <div className="field">
        <label>Sous-titre</label>
        <input value={form.subtitle} onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))} />
      </div>
      <div className="field">
        <label>Description courte</label>
        <textarea rows={2} value={form.short_description} onChange={(e) => setForm((f) => ({ ...f, short_description: e.target.value }))} />
      </div>
      <div className="field">
        <label>Titre du bloc dépliable</label>
        <input value={form.details_title} onChange={(e) => setForm((f) => ({ ...f, details_title: e.target.value }))} />
      </div>
      <div className="field">
        <label>Détails dépliables</label>
        <textarea rows={4} value={form.details_text} onChange={(e) => setForm((f) => ({ ...f, details_text: e.target.value }))} />
      </div>
      <div className="row">
        <div className="field">
          <label>Ordre</label>
          <input
            type="number"
            min="0"
            value={form.sort_order}
            onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value || 0) }))}
          />
        </div>
        <div className="field" style={{ justifyContent: 'flex-end' }}>
          <label>
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
            />
            {' '}Visible en visite
          </label>
        </div>
      </div>
      <button className="btn btn-primary btn-sm" disabled={saving} onClick={save}>
        {saving ? 'Enregistrement...' : '💾 Sauver'}
      </button>

      <div className="visit-media-editor">
        <h5>🖼️ Photos</h5>
        <div className="field">
          <label>URL image</label>
          <input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="/uploads/..." />
        </div>
        <div className="field">
          <label>Légende</label>
          <input value={mediaCaption} onChange={(e) => setMediaCaption(e.target.value)} />
        </div>
        <button className="btn btn-secondary btn-sm" disabled={mediaSaving || !mediaUrl.trim()} onClick={addMedia}>
          {mediaSaving ? 'Ajout...' : '+ Ajouter photo'}
        </button>
        <div className="visit-media-list">
          {(selected.visit_media || []).map((m) => (
            <div key={m.id} className="visit-media-row">
              <span>{m.caption || m.image_url}</span>
              <button className="btn btn-danger btn-sm" onClick={() => deleteMedia(m.id)}>🗑️</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function VisitView({
  student = null,
  isTeacher = false,
  onForceLogout,
  initialMapId = 'foret',
  availableTutorials = [],
  onBackToAuth,
}) {
  const [mapId, setMapId] = useState(initialMapId || 'foret');
  const [maps, setMaps] = useState([]);
  const [content, setContent] = useState({ zones: [], markers: [], tutorials: [] });
  const [selected, setSelected] = useState(null);
  const [selectedType, setSelectedType] = useState(null);
  const [seen, setSeen] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [savingSeen, setSavingSeen] = useState(false);
  const [tutorialSelection, setTutorialSelection] = useState([]);
  const [savingTutorials, setSavingTutorials] = useState(false);

  const currentMap = useMemo(() => maps.find((m) => m.id === mapId), [maps, mapId]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [mapsRes, visitRes, progressRes] = await Promise.all([
        api('/api/maps').catch(() => []),
        api(`/api/visit/content?map_id=${encodeURIComponent(mapId)}`),
        api(student?.id
          ? `/api/visit/progress?student_id=${encodeURIComponent(student.id)}`
          : '/api/visit/progress'),
      ]);
      setMaps(Array.isArray(mapsRes) ? mapsRes : []);
      setContent(visitRes || { zones: [], markers: [], tutorials: [] });
      setTutorialSelection((visitRes?.tutorials || []).map((t) => t.id));
      const nextSeen = new Set((progressRes?.seen || []).map((r) => itemSeenKey(r.target_type, r.target_id)));
      setSeen(nextSeen);
      if (selected?.id) {
        const nextFromZone = (visitRes?.zones || []).find((z) => z.id === selected.id);
        const nextFromMarker = (visitRes?.markers || []).find((m) => m.id === selected.id);
        setSelected(nextFromZone || nextFromMarker || null);
        if (!nextFromZone && !nextFromMarker) setSelectedType(null);
      }
    } catch (err) {
      if (err instanceof AccountDeletedError) onForceLogout?.();
      else alert(err.message || 'Erreur chargement visite');
    } finally {
      setLoading(false);
    }
  }, [mapId, onForceLogout, selected?.id, student?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onToggleSeen = async () => {
    if (!selected || !selectedType) return;
    const key = itemSeenKey(selectedType, selected.id);
    const next = !seen.has(key);
    const optimistic = new Set(seen);
    if (next) optimistic.add(key);
    else optimistic.delete(key);
    setSeen(optimistic);
    setSavingSeen(true);
    try {
      await api('/api/visit/seen', 'POST', {
        target_type: selectedType,
        target_id: selected.id,
        seen: next,
        student_id: student?.id || null,
      });
    } catch (err) {
      if (err instanceof AccountDeletedError) onForceLogout?.();
      else alert(err.message || 'Erreur mise à jour');
      setSeen(seen);
    } finally {
      setSavingSeen(false);
    }
  };

  const saveTutorialSelection = async () => {
    setSavingTutorials(true);
    try {
      await api('/api/visit/tutorials', 'PUT', { tutorial_ids: tutorialSelection });
      await loadData();
    } catch (err) {
      if (err instanceof AccountDeletedError) onForceLogout?.();
      else alert(err.message || 'Erreur sauvegarde tutoriels');
    } finally {
      setSavingTutorials(false);
    }
  };

  if (loading) {
    return (
      <div className="loader">
        <div className="loader-leaf">🧭</div>
        <p>Préparation de la visite...</p>
      </div>
    );
  }

  return (
    <div className="visit-view fade-in">
      <div className="visit-header-row">
        <div>
          <h2 className="section-title">🧭 Visite de la carte</h2>
          <p className="section-sub">Explore les zones et repères, puis marque ce que tu as déjà vu.</p>
        </div>
        {!student && onBackToAuth && (
          <button className="btn btn-ghost btn-sm" onClick={onBackToAuth}>↩ Retour connexion</button>
        )}
      </div>

      <div className="visit-map-switch">
        {maps.map((m) => (
          <button
            key={m.id}
            className={`btn btn-sm ${mapId === m.id ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setMapId(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="visit-grid">
        <div className="visit-map-card">
          <div className="visit-map-stage">
            <img
              src={currentMap?.map_image_url || '/map.png'}
              alt={`Plan ${currentMap?.label || 'Forêt'}`}
              className="visit-map-img"
            />

            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="visit-map-zones">
              {(content.zones || []).map((z) => {
                const points = parsePctPoints(z.points);
                if (points.length < 3) return null;
                const p = points.map((pt) => `${pt.xp},${pt.yp}`).join(' ');
                const isSeen = seen.has(itemSeenKey('zone', z.id));
                return (
                  <polygon
                    key={z.id}
                    points={p}
                    className={`visit-zone-poly ${isSeen ? 'is-seen' : 'is-unseen'}`}
                    onClick={() => {
                      setSelected(z);
                      setSelectedType('zone');
                    }}
                  />
                );
              })}
            </svg>

            {(content.markers || []).map((m) => {
              const isSeen = seen.has(itemSeenKey('marker', m.id));
              return (
                <button
                  key={m.id}
                  className="visit-marker-btn"
                  style={{ left: `${m.x_pct}%`, top: `${m.y_pct}%` }}
                  onClick={() => {
                    setSelected(m);
                    setSelectedType('marker');
                  }}
                >
                  <span className="visit-marker-emoji">{m.emoji || '📍'}</span>
                  <span className={`visit-marker-indicator ${isSeen ? 'is-seen' : 'is-unseen'}`} />
                </button>
              );
            })}
          </div>
        </div>

        <aside className="visit-side-card">
          {!selected ? (
            <div className="empty">
              <div className="empty-icon">👆</div>
              <p>Sélectionne une zone ou un repère pour afficher les détails.</p>
            </div>
          ) : (
            <div>
              <h3>{selectedType === 'zone' ? selected.name : selected.label}</h3>
              {selected.visit_subtitle && <p className="visit-subtitle">{selected.visit_subtitle}</p>}
              {selected.visit_short_description && <p>{selected.visit_short_description}</p>}
              {selected.visit_details_text && (
                <details className="visit-details">
                  <summary>{selected.visit_details_title || 'Détails'}</summary>
                  <p>{selected.visit_details_text}</p>
                </details>
              )}
              {(selected.visit_media || []).length > 0 && (
                <div className="visit-media-gallery">
                  {selected.visit_media.map((m) => (
                    <figure key={m.id}>
                      <img src={m.image_url} alt={m.caption || ''} />
                      {m.caption && <figcaption>{m.caption}</figcaption>}
                    </figure>
                  ))}
                </div>
              )}
              <button className="btn btn-primary btn-sm" disabled={savingSeen} onClick={onToggleSeen}>
                {seen.has(itemSeenKey(selectedType, selected.id)) ? '✅ Marqué comme vu' : '🔴 Marquer comme vu'}
              </button>
              <VisitEditorPanel
                selected={selected}
                selectedType={selectedType}
                onSaved={loadData}
                onForceLogout={onForceLogout}
                isTeacher={isTeacher}
              />
            </div>
          )}
        </aside>
      </div>

      <section className="visit-tutorials">
        <h3>📘 Tutoriels de la visite</h3>
        {isTeacher && (
          <div className="visit-tutorial-picker">
            <p>Choisir les tutoriels affichés en visite (indépendamment des zones/repères) :</p>
            <div className="visit-tutorial-picker-list">
              {availableTutorials.map((t) => (
                <label key={t.id}>
                  <input
                    type="checkbox"
                    checked={tutorialSelection.includes(t.id)}
                    onChange={(e) => {
                      setTutorialSelection((prev) => (
                        e.target.checked
                          ? [...new Set([...prev, t.id])]
                          : prev.filter((id) => id !== t.id)
                      ));
                    }}
                  />
                  {' '}{t.title}
                </label>
              ))}
            </div>
            <button className="btn btn-secondary btn-sm" onClick={saveTutorialSelection} disabled={savingTutorials}>
              {savingTutorials ? 'Sauvegarde...' : '💾 Enregistrer la sélection des tutos'}
            </button>
          </div>
        )}
        {(content.tutorials || []).length === 0 ? (
          <p className="section-sub">Aucun tutoriel sélectionné pour le moment.</p>
        ) : (
          <div className="tuto-grid">
            {content.tutorials.map((t) => (
              <article key={t.id} className="tuto-card">
                <div className="tuto-card-head">
                  <h3>{t.title}</h3>
                  <span className="task-chip">{String(t.type || 'html').toUpperCase()}</span>
                </div>
                {t.summary && <p>{t.summary}</p>}
                <div className="task-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => window.open(`/api/tutorials/${t.id}/view`, '_blank', 'noopener,noreferrer')}>
                    👁️ Lire
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={() => window.open(`/api/tutorials/${t.id}/download/pdf`, '_blank', 'noopener,noreferrer')}>
                    ⬇️ PDF
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export { VisitView };
