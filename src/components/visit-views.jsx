import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, AccountDeletedError } from '../services/api';
import { MARKER_EMOJIS, parseEmojiListSetting, detectLeadingMarkerEmoji, stripLeadingMarkerEmoji } from '../constants/emojis';
import { getRoleTerms } from '../utils/n3-terminology';
import { useHelp } from '../hooks/useHelp';
import { HelpPanel } from './HelpPanel';
import { Tooltip } from './Tooltip';
import { HELP_PANELS, HELP_TOOLTIPS, resolveRoleText } from '../constants/help';
import { getContentText } from '../utils/content';

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

function pointToPct(event, element, transform = { x: 0, y: 0, s: 1 }) {
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const scale = Number(transform?.s) > 0 ? Number(transform.s) : 1;
  const offsetX = Number(transform?.x) || 0;
  const offsetY = Number(transform?.y) || 0;
  const localX = (event.clientX - rect.left - offsetX) / scale;
  const localY = (event.clientY - rect.top - offsetY) / scale;
  const xp = (localX / rect.width) * 100;
  const yp = (localY / rect.height) * 100;
  if (!Number.isFinite(xp) || !Number.isFinite(yp)) return null;
  return {
    xp: Math.max(0, Math.min(100, Number(xp.toFixed(2)))),
    yp: Math.max(0, Math.min(100, Number(yp.toFixed(2)))),
  };
}

function VisitSyncPanel({ isTeacher, mapId, onSynced, onForceLogout }) {
  const [direction, setDirection] = useState('map_to_visit');
  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selectedZones, setSelectedZones] = useState([]);
  const [selectedMarkers, setSelectedMarkers] = useState([]);

  const sourceKey = direction === 'map_to_visit' ? 'map' : 'visit';
  const sourceZones = options?.source?.[sourceKey]?.zones || [];
  const sourceMarkers = options?.source?.[sourceKey]?.markers || [];

  const loadOptions = useCallback(async () => {
    if (!isTeacher) return;
    setLoading(true);
    try {
      const res = await api(`/api/visit/sync/options?map_id=${encodeURIComponent(mapId)}`);
      setOptions(res || null);
    } catch (err) {
      if (err instanceof AccountDeletedError) onForceLogout?.();
      else alert(err.message || 'Erreur chargement synchronisation');
      setOptions(null);
    } finally {
      setLoading(false);
    }
  }, [isTeacher, mapId, onForceLogout]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    setSelectedZones(sourceZones.map((z) => z.id));
    setSelectedMarkers(sourceMarkers.map((m) => m.id));
  }, [direction, options, sourceZones, sourceMarkers]);

  const toggleSelection = (id, isZone) => {
    const setter = isZone ? setSelectedZones : setSelectedMarkers;
    setter((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  };

  const selectAll = () => {
    setSelectedZones(sourceZones.map((z) => z.id));
    setSelectedMarkers(sourceMarkers.map((m) => m.id));
  };

  const clearAll = () => {
    setSelectedZones([]);
    setSelectedMarkers([]);
  };

  const runSync = async () => {
    if (!selectedZones.length && !selectedMarkers.length) {
      alert('Sélectionne au moins une zone ou un repère.');
      return;
    }
    setSyncing(true);
    try {
      const res = await api('/api/visit/sync', 'POST', {
        map_id: mapId,
        direction,
        zone_ids: selectedZones,
        marker_ids: selectedMarkers,
      });
      alert(`Synchronisation terminée : ${res?.imported?.zones || 0} zone(s), ${res?.imported?.markers || 0} repère(s).`);
      await onSynced?.();
      await loadOptions();
    } catch (err) {
      if (err instanceof AccountDeletedError) onForceLogout?.();
      else alert(err.message || 'Erreur synchronisation');
    } finally {
      setSyncing(false);
    }
  };

  if (!isTeacher) return null;

  return (
    <section className="visit-sync-card">
      <h3>🔁 Import sélectif carte / visite</h3>
      <p className="section-sub">Choisis le sens puis les éléments à importer (zones et/ou repères).</p>
      <div className="visit-map-switch">
        <button
          className={`btn btn-sm ${direction === 'map_to_visit' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setDirection('map_to_visit')}
        >
          Carte → Visite
        </button>
        <button
          className={`btn btn-sm ${direction === 'visit_to_map' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setDirection('visit_to_map')}
        >
          Visite → Carte
        </button>
        <button className="btn btn-ghost btn-sm" onClick={selectAll} disabled={loading || syncing}>
          Tout cocher
        </button>
        <button className="btn btn-ghost btn-sm" onClick={clearAll} disabled={loading || syncing}>
          Tout décocher
        </button>
      </div>
      {loading ? (
        <p className="section-sub">Chargement des éléments disponibles...</p>
      ) : (
        <div className="visit-sync-grid">
          <div className="visit-sync-list">
            <h4>Zones ({sourceZones.length})</h4>
            {sourceZones.length === 0 ? (
              <p className="section-sub">Aucune zone disponible.</p>
            ) : (
              sourceZones.map((z) => (
                <label key={z.id} className="visit-sync-item">
                  <input
                    type="checkbox"
                    checked={selectedZones.includes(z.id)}
                    onChange={() => toggleSelection(z.id, true)}
                    disabled={syncing}
                  />
                  {' '}{z.name || z.id}
                </label>
              ))
            )}
          </div>
          <div className="visit-sync-list">
            <h4>Repères ({sourceMarkers.length})</h4>
            {sourceMarkers.length === 0 ? (
              <p className="section-sub">Aucun repère disponible.</p>
            ) : (
              sourceMarkers.map((m) => (
                <label key={m.id} className="visit-sync-item">
                  <input
                    type="checkbox"
                    checked={selectedMarkers.includes(m.id)}
                    onChange={() => toggleSelection(m.id, false)}
                    disabled={syncing}
                  />
                  {' '}{m.label || m.id}
                </label>
              ))
            )}
          </div>
        </div>
      )}
      <button className="btn btn-secondary btn-sm" disabled={loading || syncing} onClick={runSync}>
        {syncing ? 'Synchronisation...' : 'Lancer l’import sélectionné'}
      </button>
    </section>
  );
}

function VisitEditorPanel({ selected, selectedType, onSaved, onForceLogout, isTeacher, roleTerms, markerEmojis = MARKER_EMOJIS }) {
  const [form, setForm] = useState({
    title: '',
    subtitle: '',
    short_description: '',
    details_title: 'Détails',
    details_text: '',
    sort_order: 0,
    is_active: true,
    emoji: '📍',
  });
  const [saving, setSaving] = useState(false);
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaCaption, setMediaCaption] = useState('');
  const [mediaSaving, setMediaSaving] = useState(false);
  const tooltipText = (entry) => resolveRoleText(entry, true);

  useEffect(() => {
    const nextTitle = selectedType === 'zone' ? (selected?.name || '') : (selected?.label || '');
    const trimmedTitle = String(nextTitle || '').trim();
    const detectedZoneEmoji = detectLeadingMarkerEmoji(trimmedTitle, markerEmojis);
    setForm({
      title: nextTitle,
      subtitle: selected?.visit_subtitle || '',
      short_description: selected?.visit_short_description || '',
      details_title: selected?.visit_details_title || 'Détails',
      details_text: selected?.visit_details_text || '',
      sort_order: Number(selected?.visit_sort_order || 0),
      is_active: Number(selected?.visit_is_active ?? 1) === 1,
      emoji: selectedType === 'zone' ? (detectedZoneEmoji || markerEmojis[0] || '📍') : (selected?.emoji || markerEmojis[0] || '📍'),
    });
    setMediaUrl('');
    setMediaCaption('');
  }, [markerEmojis, selected, selectedType]);

  if (!isTeacher || !selected || !selectedType) return null;

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        subtitle: form.subtitle,
        short_description: form.short_description,
        details_title: form.details_title,
        details_text: form.details_text,
        sort_order: form.sort_order,
        is_active: form.is_active,
      };
      if (selectedType === 'zone') payload.name = form.title;
      else {
        payload.label = form.title;
        payload.emoji = form.emoji;
      }
      await api(`/api/visit/${selectedType === 'zone' ? 'zones' : 'markers'}/${selected.id}`, 'PUT', payload);
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
      <h4>🎛️ Édition visite ({roleTerms.teacherShort})</h4>
      <div className="field">
        <label>{selectedType === 'zone' ? 'Titre de zone' : 'Titre du repère'}</label>
        <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
      </div>
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
      <div className="field">
        <label>{selectedType === 'zone' ? 'Liste d’emojis (insérer dans le titre de zone)' : 'Emoji du repère'}</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {markerEmojis.map((emoji) => (
            <button
              key={emoji}
              className={`emoji-btn ${form.emoji === emoji ? 'sel' : ''}`}
              onClick={() => {
                if (selectedType === 'zone') {
                  setForm((f) => ({
                    ...f,
                    emoji,
                    title: `${emoji} ${stripLeadingMarkerEmoji(f.title, markerEmojis)}`.trim(),
                  }));
                  return;
                }
                setForm((f) => ({ ...f, emoji }));
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
      <button className="btn btn-primary btn-sm" disabled={saving} onClick={save}>
        {saving ? 'Enregistrement...' : '💾 Sauver'}
      </button>
      <button
        className="btn btn-danger btn-sm"
        style={{ marginLeft: 8 }}
        onClick={async () => {
          if (!confirm(`Supprimer ce ${selectedType === 'zone' ? 'zone de visite' : 'repère de visite'} ?`)) return;
          try {
            await api(`/api/visit/${selectedType === 'zone' ? 'zones' : 'markers'}/${selected.id}`, 'DELETE');
            await onSaved?.();
          } catch (err) {
            if (err instanceof AccountDeletedError) onForceLogout?.();
            else alert(err.message || 'Erreur suppression');
          }
        }}
      >
        🗑️ Supprimer
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
              <Tooltip text={tooltipText(HELP_TOOLTIPS.visit.mediaDelete)}>
                <button className="btn btn-danger btn-sm" aria-label="Supprimer la photo" onClick={() => deleteMedia(m.id)}>🗑️</button>
              </Tooltip>
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
  isN3Affiliated = false,
  publicSettings = null,
}) {
  const configuredLocationEmojis = String(
    publicSettings?.ui?.map?.location_emojis
    || publicSettings?.map?.location_emojis
    || ''
  );
  const markerEmojis = useMemo(
    () => parseEmojiListSetting(configuredLocationEmojis, MARKER_EMOJIS),
    [configuredLocationEmojis]
  );
  const roleTerms = getRoleTerms(isN3Affiliated);
  const visitTitle = getContentText(publicSettings, 'visit.title', '🧭 Visite de la carte');
  const visitSubtitle = getContentText(publicSettings, 'visit.subtitle', 'Explore les zones et repères, puis marque ce que tu as déjà vu.');
  const visitEmptySelection = getContentText(publicSettings, 'visit.empty_selection', 'Sélectionne une zone ou un repère pour afficher les détails.');
  const visitTutorialsTitle = getContentText(publicSettings, 'visit.tutorials_title', '📘 Tutoriels de la visite');
  const visitTutorialsEmpty = getContentText(publicSettings, 'visit.tutorials_empty', 'Aucun tutoriel sélectionné pour le moment.');
  const studentIdForProgress = useMemo(() => {
    if (isTeacher) return null;
    if (!student?.id) return null;
    if (student?.preview_mode) return null;
    const id = String(student.id).trim();
    return id || null;
  }, [isTeacher, student?.id, student?.preview_mode]);
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
  const [mode, setMode] = useState('view');
  const [drawPoints, setDrawPoints] = useState([]);
  const [creating, setCreating] = useState(false);
  const stageRef = useRef(null);
  const dragRef = useRef({
    active: false,
    moved: false,
    pointerId: null,
    startClientX: 0,
    startClientY: 0,
    baseX: 0,
    baseY: 0,
  });
  const skipClickRef = useRef(false);
  const pinchRef = useRef({
    active: false,
    dist: 0,
    startScale: 1,
    startX: 0,
    startY: 0,
    midX: 0,
    midY: 0,
  });
  const [mapTransform, setMapTransform] = useState({ x: 0, y: 0, s: 1 });
  const { isHelpEnabled, hasSeenSection, markSectionSeen, trackPanelOpen, trackPanelDismiss } = useHelp({ publicSettings, isTeacher });

  useEffect(() => {
    const next = String(initialMapId || 'foret').trim() || 'foret';
    setMapId((prev) => (prev === next ? prev : next));
  }, [initialMapId]);

  const currentMap = useMemo(() => maps.find((m) => m.id === mapId), [maps, mapId]);
  const canPanAndZoom = mode === 'view';

  const clampTransform = useCallback((next, rectLike = null) => {
    const stage = stageRef.current;
    const rect = rectLike || (stage ? stage.getBoundingClientRect() : null);
    const safeScale = Math.max(1, Math.min(6, Number(next?.s) || 1));
    if (!rect || !rect.width || !rect.height || safeScale <= 1) {
      return { x: 0, y: 0, s: safeScale };
    }
    const minX = rect.width * (1 - safeScale);
    const minY = rect.height * (1 - safeScale);
    const x = Math.min(0, Math.max(minX, Number(next?.x) || 0));
    const y = Math.min(0, Math.max(minY, Number(next?.y) || 0));
    return { x, y, s: safeScale };
  }, []);

  const zoomAroundClientPoint = useCallback((clientX, clientY, factor) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    setMapTransform((prev) => {
      const nextScale = Math.max(1, Math.min(6, prev.s * factor));
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      const next = {
        s: nextScale,
        x: px - (px - prev.x) * (nextScale / prev.s),
        y: py - (py - prev.y) * (nextScale / prev.s),
      };
      return clampTransform(next, rect);
    });
  }, [clampTransform]);

  const zoomFromCenter = useCallback((factor) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const centerX = rect.left + (rect.width / 2);
    const centerY = rect.top + (rect.height / 2);
    zoomAroundClientPoint(centerX, centerY, factor);
  }, [zoomAroundClientPoint]);

  const resetMapTransform = useCallback(() => {
    setMapTransform({ x: 0, y: 0, s: 1 });
  }, []);

  const consumeSkipClick = useCallback(() => {
    if (!skipClickRef.current) return false;
    skipClickRef.current = false;
    return true;
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [mapsRes, visitRes, progressRes] = await Promise.all([
        api('/api/maps').catch(() => []),
        api(`/api/visit/content?map_id=${encodeURIComponent(mapId)}`),
        api(studentIdForProgress
          ? `/api/visit/progress?student_id=${encodeURIComponent(studentIdForProgress)}`
          : '/api/visit/progress'),
      ]);
      const fetchedMaps = Array.isArray(mapsRes) ? mapsRes : [];
      const activeMaps = fetchedMaps.filter((m) => m?.is_active !== false);
      const visibleMaps = activeMaps.length > 0 ? activeMaps : fetchedMaps;
      setMaps(visibleMaps);
      if (visibleMaps.length > 0 && !visibleMaps.some((m) => m.id === mapId)) {
        setMapId(visibleMaps[0].id);
      }
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
  }, [mapId, onForceLogout, selected?.id, studentIdForProgress]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    resetMapTransform();
    skipClickRef.current = false;
    dragRef.current.active = false;
    dragRef.current.moved = false;
  }, [mapId, resetMapTransform]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onResize = () => {
      setMapTransform((prev) => clampTransform(prev));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clampTransform]);

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
        student_id: studentIdForProgress,
      });
    } catch (err) {
      if (err instanceof AccountDeletedError) onForceLogout?.();
      else alert(err.message || 'Erreur mise à jour');
      setSeen(seen);
    } finally {
      setSavingSeen(false);
    }
  };

  const createZoneFromPoints = async () => {
    if (drawPoints.length < 3) return;
    const name = prompt('Titre de la zone de visite ?');
    if (!name || !name.trim()) return;
    setCreating(true);
    try {
      await api('/api/visit/zones', 'POST', {
        map_id: mapId,
        name: name.trim(),
        points: drawPoints,
      });
      setDrawPoints([]);
      setMode('view');
      await loadData();
    } catch (err) {
      if (err instanceof AccountDeletedError) onForceLogout?.();
      else alert(err.message || 'Erreur création zone');
    } finally {
      setCreating(false);
    }
  };

  const onMapClick = async (event) => {
    if (consumeSkipClick()) return;
    if (!isTeacher || mode === 'view') return;
    const stage = event.currentTarget;
    const p = pointToPct(event, stage, mapTransform);
    if (!p) return;

    if (mode === 'draw-zone') {
      setDrawPoints((prev) => [...prev, p]);
      return;
    }

    if (mode === 'add-marker') {
      const label = prompt('Titre du repère de visite ?');
      if (!label || !label.trim()) return;
      setCreating(true);
      try {
        await api('/api/visit/markers', 'POST', {
          map_id: mapId,
          x_pct: p.xp,
          y_pct: p.yp,
          label: label.trim(),
          emoji: markerEmojis[0] || '📍',
        });
        setMode('view');
        await loadData();
      } catch (err) {
        if (err instanceof AccountDeletedError) onForceLogout?.();
        else alert(err.message || 'Erreur création repère');
      } finally {
        setCreating(false);
      }
    }
  };

  const onStagePointerDown = (event) => {
    if (!canPanAndZoom) return;
    if (event.target.closest('.visit-map-controls') || event.target.closest('.visit-zone-poly') || event.target.closest('.visit-marker-btn')) return;
    const stage = stageRef.current;
    if (!stage) return;
    dragRef.current = {
      active: true,
      moved: false,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      baseX: mapTransform.x,
      baseY: mapTransform.y,
    };
    try { stage.setPointerCapture(event.pointerId); } catch (_) {}
  };

  const onStagePointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag.active || !canPanAndZoom) return;
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const dx = event.clientX - drag.startClientX;
    const dy = event.clientY - drag.startClientY;
    const hasMoved = Math.hypot(dx, dy) > 4;
    if (hasMoved) {
      drag.moved = true;
      skipClickRef.current = true;
    }
    const next = clampTransform({ x: drag.baseX + dx, y: drag.baseY + dy, s: mapTransform.s }, rect);
    setMapTransform(next);
    if (drag.moved) event.preventDefault();
  };

  const onStagePointerUp = (event) => {
    const drag = dragRef.current;
    if (!drag.active) return;
    const stage = stageRef.current;
    if (stage && drag.pointerId != null) {
      try { stage.releasePointerCapture(drag.pointerId); } catch (_) {}
    }
    dragRef.current = {
      active: false,
      moved: drag.moved,
      pointerId: null,
      startClientX: 0,
      startClientY: 0,
      baseX: 0,
      baseY: 0,
    };
    if (drag.moved) {
      setTimeout(() => {
        skipClickRef.current = false;
      }, 0);
    }
    if (pinchRef.current.active) {
      pinchRef.current.active = false;
    }
    if (event && drag.moved) event.preventDefault();
  };

  const onStageWheel = (event) => {
    if (!canPanAndZoom) return;
    event.preventDefault();
    const factor = event.deltaY > 0 ? 0.88 : 1.14;
    zoomAroundClientPoint(event.clientX, event.clientY, factor);
  };

  const onStageTouchStart = (event) => {
    if (!canPanAndZoom) return;
    if (event.touches.length !== 2) return;
    const stage = stageRef.current;
    if (!stage) return;
    const t0 = event.touches[0];
    const t1 = event.touches[1];
    const rect = stage.getBoundingClientRect();
    pinchRef.current = {
      active: true,
      dist: Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY),
      startScale: mapTransform.s,
      startX: mapTransform.x,
      startY: mapTransform.y,
      midX: ((t0.clientX + t1.clientX) / 2) - rect.left,
      midY: ((t0.clientY + t1.clientY) / 2) - rect.top,
    };
    dragRef.current.active = false;
    skipClickRef.current = true;
    event.preventDefault();
  };

  const onStageTouchMove = (event) => {
    if (!canPanAndZoom) return;
    if (!pinchRef.current.active || event.touches.length !== 2) return;
    const stage = stageRef.current;
    if (!stage) return;
    const t0 = event.touches[0];
    const t1 = event.touches[1];
    const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
    const rect = stage.getBoundingClientRect();
    const nextScale = Math.max(1, Math.min(6, pinchRef.current.startScale * (dist / Math.max(1, pinchRef.current.dist))));
    const next = clampTransform({
      s: nextScale,
      x: pinchRef.current.midX - (pinchRef.current.midX - pinchRef.current.startX) * (nextScale / pinchRef.current.startScale),
      y: pinchRef.current.midY - (pinchRef.current.midY - pinchRef.current.startY) * (nextScale / pinchRef.current.startScale),
    }, rect);
    setMapTransform(next);
    event.preventDefault();
  };

  const onStageTouchEnd = () => {
    if (pinchRef.current.active) pinchRef.current.active = false;
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
          <h2 className="section-title">{visitTitle}</h2>
          <p className="section-sub">{visitSubtitle}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isHelpEnabled && (
            <HelpPanel
              sectionId="visit"
              title={HELP_PANELS.visit.title}
              entries={HELP_PANELS.visit.items}
              isTeacher={isTeacher}
              isPulsing={!hasSeenSection('visit')}
              onMarkSeen={markSectionSeen}
              onOpen={trackPanelOpen}
              onDismiss={trackPanelDismiss}
            />
          )}
          {!student && onBackToAuth && (
            <button className="btn btn-ghost btn-sm" onClick={onBackToAuth}>↩ Retour connexion</button>
          )}
        </div>
      </div>

      {maps.length > 1 && (
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
      )}
      {isTeacher && (
        <div className="visit-map-switch">
          <button className={`btn btn-sm ${mode === 'view' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setMode('view'); setDrawPoints([]); }}>
            🖐️ Navigation
          </button>
          <button className={`btn btn-sm ${mode === 'draw-zone' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('draw-zone')}>
            🖊️ Zone visite
          </button>
          <button className={`btn btn-sm ${mode === 'add-marker' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('add-marker')}>
            📍 Repère visite
          </button>
          {mode === 'draw-zone' && (
            <>
              <button className="btn btn-secondary btn-sm" disabled={drawPoints.length < 3 || creating} onClick={createZoneFromPoints}>
                ✅ Terminer zone ({drawPoints.length})
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setDrawPoints((prev) => prev.slice(0, -1))}>
                ↩️ Retirer point
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => setDrawPoints([])}>
                ✕ Annuler
              </button>
            </>
          )}
        </div>
      )}
      {isTeacher && (
        <VisitSyncPanel
          isTeacher={isTeacher}
          mapId={mapId}
          onSynced={loadData}
          onForceLogout={onForceLogout}
        />
      )}

      <div className="visit-grid">
        <div className="visit-map-card">
          <div
            ref={stageRef}
            className="visit-map-stage"
            onClick={onMapClick}
            onPointerDown={onStagePointerDown}
            onPointerMove={onStagePointerMove}
            onPointerUp={onStagePointerUp}
            onPointerCancel={onStagePointerUp}
            onPointerLeave={onStagePointerUp}
            onWheel={onStageWheel}
            onTouchStart={onStageTouchStart}
            onTouchMove={onStageTouchMove}
            onTouchEnd={onStageTouchEnd}
            style={{
              cursor: isTeacher && mode !== 'view' ? 'crosshair' : (canPanAndZoom ? 'grab' : 'default'),
              touchAction: canPanAndZoom ? 'none' : 'auto',
            }}
          >
            <div
              className="visit-map-world"
              style={{ transform: `translate(${mapTransform.x}px, ${mapTransform.y}px) scale(${mapTransform.s})` }}
            >
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
                      onClick={(event) => {
                        event.stopPropagation();
                        if (consumeSkipClick()) return;
                        setSelected(z);
                        setSelectedType('zone');
                      }}
                    />
                  );
                })}
                {mode === 'draw-zone' && drawPoints.length >= 1 && (
                  <>
                    <polyline
                      points={drawPoints.map((pt) => `${pt.xp},${pt.yp}`).join(' ')}
                      fill="none"
                      stroke="#166534"
                      strokeWidth="0.35"
                      strokeDasharray="0.8 0.4"
                    />
                    {drawPoints.map((pt, idx) => (
                      <circle key={`draw-${idx}`} cx={pt.xp} cy={pt.yp} r="0.7" fill="#166534" />
                    ))}
                  </>
                )}
              </svg>

              {(content.markers || []).map((m) => {
                const isSeen = seen.has(itemSeenKey('marker', m.id));
                return (
                  <button
                    key={m.id}
                    className="visit-marker-btn"
                    style={{ left: `${m.x_pct}%`, top: `${m.y_pct}%` }}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (consumeSkipClick()) return;
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
            <div className="visit-map-controls">
              <button
                type="button"
                className="visit-map-ctrl"
                aria-label="Zoomer la carte de visite"
                onClick={(event) => {
                  event.stopPropagation();
                  zoomFromCenter(1.2);
                }}
              >
                ＋
              </button>
              <button
                type="button"
                className="visit-map-ctrl"
                aria-label="Dézoomer la carte de visite"
                onClick={(event) => {
                  event.stopPropagation();
                  zoomFromCenter(0.84);
                }}
              >
                －
              </button>
              <button
                type="button"
                className="visit-map-ctrl"
                aria-label="Recentrer la carte de visite"
                onClick={(event) => {
                  event.stopPropagation();
                  resetMapTransform();
                }}
              >
                ⊡
              </button>
            </div>
          </div>
        </div>

        <aside className="visit-side-card">
          {!selected ? (
            <div className="empty">
              <div className="empty-icon">👆</div>
              <p>{visitEmptySelection}</p>
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
                roleTerms={roleTerms}
                markerEmojis={markerEmojis}
              />
            </div>
          )}
        </aside>
      </div>

      <section className="visit-tutorials">
        <h3>{visitTutorialsTitle}</h3>
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
          <p className="section-sub">{visitTutorialsEmpty}</p>
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
