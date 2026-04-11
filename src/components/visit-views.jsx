import React, { lazy, Suspense, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api, AccountDeletedError, withAppBase } from '../services/api';
import { compressImage } from '../utils/image';
import { MARKER_EMOJIS, parseEmojiListSetting, detectLeadingMarkerEmoji, stripLeadingMarkerEmoji } from '../constants/emojis';
import { getRoleTerms } from '../utils/n3-terminology';
import { useHelp } from '../hooks/useHelp';
import { HelpPanel } from './HelpPanel';
import { Tooltip } from './Tooltip';
import { HELP_PANELS, HELP_TOOLTIPS, resolveRoleText } from '../constants/help';
import { getContentText } from '../utils/content';
import { resolveMapOverlayTypography } from '../utils/mapOverlayTypography';
import { TutorialReadAcknowledgeButton, fetchTutorialReadIds } from './TutorialReadAcknowledge';
import { ContextComments } from './context-comments';
import { useOverlayHistoryBack } from '../hooks/useOverlayHistoryBack';
import { computeMapImageContainRect } from '../utils/mapImageFit';
import { parseVisitZonePoints as parsePctPoints, visitZoneCentroidPct } from '../utils/visitMapGeometry.js';
import { computeVisitMascotStartPct } from '../utils/visitMascotPlacement.js';
import { shouldShowVisitMapMascot as computeShowVisitMapMascot } from '../utils/visitMascotVisibility.js';
import { wheelZoomScaleFactor } from '../utils/mapWheelZoom';

const VisitMapMascotLottie = lazy(() => import('./VisitMapMascotLottie.jsx'));

const VISIT_MAP_MASCOT_MOVE_MS = 560;

function itemSeenKey(type, id) {
  return `${type}:${id}`;
}

function visitMediaImgSrc(m) {
  const u = m?.image_url;
  if (!u) return '';
  return withAppBase(u);
}

/**
 * Compense l’étirement anisotrope du SVG (viewBox carré + preserveAspectRatio="none" sur un rectangle carte) :
 * sans cela, les <text> et emojis paraissent tassés sur l’axe Y dès que largeur ≠ hauteur du calque.
 */
function visitZoneSvgTextUniformYTransform(cx, cy, fitW, fitH) {
  if (!(fitW > 0 && fitH > 0)) return undefined;
  const r = fitW / fitH;
  if (Math.abs(r - 1) < 0.0005) return undefined;
  return `translate(${cx},${cy}) scale(1,${r}) translate(${-cx},${-cy})`;
}

function pointToPct(event, stageEl, transform = { x: 0, y: 0, s: 1 }, fit = null) {
  const rect = stageEl.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const scale = Number(transform?.s) > 0 ? Number(transform.s) : 1;
  const tx = Number(transform?.x) || 0;
  const ty = Number(transform?.y) || 0;
  const u = (event.clientX - rect.left - tx) / scale;
  const v = (event.clientY - rect.top - ty) / scale;
  /* u,v sont en px dans le repère du « monde » (même largeur/hauteur que la scène, avant scale écran). */
  const fw = fit && fit.width > 0 ? fit.width : rect.width;
  const fh = fit && fit.height > 0 ? fit.height : rect.height;
  const fox = fit && fit.width > 0 ? fit.offsetX : 0;
  const foy = fit && fit.height > 0 ? fit.offsetY : 0;
  const xp = ((u - fox) / fw) * 100;
  const yp = ((v - foy) / fh) * 100;
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
  const [mediaUploading, setMediaUploading] = useState(false);
  const mediaFileRef = useRef(null);
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

  const addMediaFromFile = async (e) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    if (!String(file.type || '').startsWith('image/')) {
      alert('Format image invalide (image requise)');
      return;
    }
    setMediaUploading(true);
    try {
      const image_data = await compressImage(file);
      await api('/api/visit/media', 'POST', {
        target_type: selectedType,
        target_id: selected.id,
        image_data,
        caption: mediaCaption.trim(),
      });
      setMediaCaption('');
      await onSaved?.();
    } catch (err) {
      if (err instanceof AccountDeletedError) onForceLogout?.();
      else alert(err.message || 'Erreur envoi photo');
    } finally {
      setMediaUploading(false);
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
              type="button"
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
        <p style={{ fontSize: '.76rem', color: '#64748b', margin: '0 0 10px', lineHeight: 1.45 }}>
          Envoi d’image (comme sur la carte) ou lien URL (ex. Wikimedia, fichier déjà sur le serveur).
        </p>
        <div className="field">
          <label>Légende (optionnel)</label>
          <input value={mediaCaption} onChange={(e) => setMediaCaption(e.target.value)} />
        </div>
        <input ref={mediaFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={addMediaFromFile} />
        <button
          type="button"
          className="btn btn-secondary btn-sm btn-full"
          style={{ marginBottom: 10 }}
          disabled={mediaUploading}
          onClick={() => mediaFileRef.current?.click()}
        >
          {mediaUploading ? 'Envoi...' : '📷 Ajouter une photo (fichier)'}
        </button>
        <div className="field">
          <label>URL image</label>
          <input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://… ou /uploads/…" />
        </div>
        <button className="btn btn-secondary btn-sm" disabled={mediaSaving || !mediaUrl.trim()} onClick={addMedia}>
          {mediaSaving ? 'Ajout...' : '+ Ajouter depuis URL'}
        </button>
        <div className="visit-media-list">
          {(selected.visit_media || []).map((m) => (
            <div key={m.id} className="visit-media-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {m.image_url ? (
                <img
                  src={visitMediaImgSrc(m)}
                  alt=""
                  style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
                />
              ) : null}
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {m.caption || m.image_url || `#${m.id}`}
              </span>
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
  canParticipateContextComments = true,
}) {
  const contextCommentsEnabled = publicSettings?.modules?.context_comments_enabled !== false;
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
  const [mapId, setMapId] = useState(initialMapId || 'foret');
  /** Dernière carte affichée : évite d’appliquer une réponse `/api/visit/content` obsolète après changement de `map_id`. */
  const visitLoadMapIdLiveRef = useRef(mapId);
  visitLoadMapIdLiveRef.current = mapId;
  const [maps, setMaps] = useState([]);
  const [content, setContent] = useState({ zones: [], markers: [], tutorials: [] });
  const [selected, setSelected] = useState(null);
  const [selectedType, setSelectedType] = useState(null);
  const [seen, setSeen] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [savingSeen, setSavingSeen] = useState(false);
  const [tutorialSelection, setTutorialSelection] = useState([]);
  const [savingTutorials, setSavingTutorials] = useState(false);
  const [tutorialReadIds, setTutorialReadIds] = useState(() => new Set());
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
  const mapTransformRef = useRef(mapTransform);
  mapTransformRef.current = mapTransform;
  const visitZoomAnimRafRef = useRef(null);
  const [visitMapMascotPct, setVisitMapMascotPct] = useState({ xp: 50, yp: 50 });
  const [visitMapMascotFaceRight, setVisitMapMascotFaceRight] = useState(true);
  const [visitMapMascotWalking, setVisitMapMascotWalking] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const visitMapMascotPctRef = useRef({ xp: 50, yp: 50 });
  const visitMapMascotMoveTimeoutRef = useRef(null);
  const visitMascotStartPlacedForMapRef = useRef(null);
  const { isHelpEnabled, hasSeenSection, markSectionSeen, trackPanelOpen, trackPanelDismiss } = useHelp({ publicSettings, isTeacher });
  const isGuestPublicVisit = !student && typeof onBackToAuth === 'function';
  const clearGuestSelection = useCallback(() => {
    setSelected(null);
    setSelectedType(null);
  }, []);
  useOverlayHistoryBack(isGuestPublicVisit && !!selected, clearGuestSelection);

  const visitProgressLabelId = useId();

  /** Zones affichées sur le plan (polygone valide) + repères : aligné sur ce que l’utilisateur peut parcourir sur la carte courante. */
  const visitCartographyProgress = useMemo(() => {
    const zones = content.zones || [];
    const markers = content.markers || [];
    let total = 0;
    let seenCount = 0;
    for (const z of zones) {
      if (parsePctPoints(z.points).length < 3) continue;
      total += 1;
      if (seen.has(itemSeenKey('zone', z.id))) seenCount += 1;
    }
    for (const m of markers) {
      total += 1;
      if (seen.has(itemSeenKey('marker', m.id))) seenCount += 1;
    }
    const pct = total > 0 ? Math.min(100, Math.round((seenCount / total) * 100)) : 0;
    return { total, seenCount, pct };
  }, [content.zones, content.markers, seen]);

  /** Mascotte : afficher dès qu’il existe des zones/repères côté contenu, pas seulement si le total « parcourable » > 0 (polygones valides). */
  const showVisitMapMascot = computeShowVisitMapMascot(
    mode,
    visitCartographyProgress.total,
    content.zones,
    content.markers
  );

  useEffect(() => {
    const next = String(initialMapId || 'foret').trim() || 'foret';
    setMapId((prev) => (prev === next ? prev : next));
  }, [initialMapId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const ids = await fetchTutorialReadIds();
      if (!cancelled) setTutorialReadIds(new Set(ids));
    };
    load();
    if (typeof window !== 'undefined') {
      window.addEventListener('foretmap_session_changed', load);
      return () => {
        cancelled = true;
        window.removeEventListener('foretmap_session_changed', load);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [content.tutorials]);

  const currentMap = useMemo(() => maps.find((m) => m.id === mapId), [maps, mapId]);
  const visitMapImageSrc = currentMap?.map_image_url || '/map.png';
  const imgRef = useRef(null);
  const [visitImgNatural, setVisitImgNatural] = useState({ w: 0, h: 0 });
  const [visitMapFit, setVisitMapFit] = useState({ offsetX: 0, offsetY: 0, width: 0, height: 0 });
  const visitMapImageReady = visitImgNatural.w > 0 && visitImgNatural.h > 0;
  const canPanAndZoom = mode === 'view';

  /** Tailles emoji / libellé zone en unités SVG (viewBox 0–100), alignées sur `resolveMapOverlayTypography` + largeur calque carte. */
  const visitZoneSvgTypography = useMemo(() => {
    const mapSettings =
      publicSettings?.map && typeof publicSettings.map === 'object' ? publicSettings.map : null;
    const fw = visitMapFit.width > 0 ? visitMapFit.width : 360;
    const uPerPx = 100 / Math.max(1, fw);
    const inv = 1 / Math.max(mapTransform.s, 0.12);
    const t = resolveMapOverlayTypography(mapSettings, inv);
    return {
      emojiU: t.mapEmojiFontPx * uPerPx,
      labelU: t.mapLabelFontPx * uPerPx,
      gapU: t.mapEmojiLabelCenterGap * uPerPx,
      strokeU: Math.max(0.06, 3 * inv * uPerPx),
    };
  }, [publicSettings, visitMapFit.width, mapTransform.s]);

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

  const cancelVisitZoomAnim = useCallback(() => {
    if (visitZoomAnimRafRef.current != null) {
      cancelAnimationFrame(visitZoomAnimRafRef.current);
      visitZoomAnimRafRef.current = null;
    }
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

  /** Boutons +/− : interpolation courte ; molette : `wheelZoomScaleFactor`. */
  const zoomFromCenterAnimated = useCallback((factor) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    cancelVisitZoomAnim();
    const px = rect.width / 2;
    const py = rect.height / 2;
    const start = { ...mapTransformRef.current };
    const nextScale = Math.max(1, Math.min(6, start.s * factor));
    const target = clampTransform({
      s: nextScale,
      x: px - (px - start.x) * (nextScale / start.s),
      y: py - (py - start.y) * (nextScale / start.s),
    }, rect);

    if (prefersReducedMotion) {
      setMapTransform(target);
      return;
    }

    const duration = 200;
    const fromS = start.s;
    const fromX = start.x;
    const fromY = start.y;
    const toS = target.s;
    const t0 = performance.now();
    const easeOutCubic = (u) => 1 - (1 - u) ** 3;
    const step = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      const u = easeOutCubic(t);
      const curS = fromS + (toS - fromS) * u;
      const cur = clampTransform({
        s: curS,
        x: px - (px - fromX) * (curS / fromS),
        y: py - (py - fromY) * (curS / fromS),
      }, rect);
      setMapTransform(cur);
      if (t < 1) {
        visitZoomAnimRafRef.current = requestAnimationFrame(step);
      } else {
        visitZoomAnimRafRef.current = null;
        setMapTransform(target);
      }
    };
    visitZoomAnimRafRef.current = requestAnimationFrame(step);
  }, [clampTransform, prefersReducedMotion, cancelVisitZoomAnim]);

  const resetMapTransform = useCallback(() => {
    cancelVisitZoomAnim();
    setMapTransform({ x: 0, y: 0, s: 1 });
  }, [cancelVisitZoomAnim]);

  const consumeSkipClick = useCallback(() => {
    if (!skipClickRef.current) return false;
    skipClickRef.current = false;
    return true;
  }, []);

  const loadData = useCallback(async () => {
    const requestedMapId = String(mapId).trim();
    setLoading(true);
    try {
      const [mapsRes, visitRes, progressRes] = await Promise.all([
        api('/api/maps').catch(() => []),
        api(`/api/visit/content?map_id=${encodeURIComponent(requestedMapId)}`),
        api('/api/visit/progress'),
      ]);
      if (requestedMapId !== String(visitLoadMapIdLiveRef.current).trim()) return;

      const fetchedMaps = Array.isArray(mapsRes) ? mapsRes : [];
      const activeMaps = fetchedMaps.filter((m) => m?.is_active !== false);
      const visibleMaps = activeMaps.length > 0 ? activeMaps : fetchedMaps;
      setMaps(visibleMaps);
      if (visibleMaps.length > 0 && !visibleMaps.some((m) => m.id === requestedMapId)) {
        setMapId(visibleMaps[0].id);
      }
      const visitPayload =
        visitRes && typeof visitRes === 'object' && !Array.isArray(visitRes)
          ? { ...visitRes, map_id: visitRes.map_id ?? requestedMapId }
          : { zones: [], markers: [], tutorials: [], map_id: requestedMapId };
      setContent(visitPayload);
      setTutorialSelection((visitPayload.tutorials || []).map((t) => t.id));
      const nextSeen = new Set((progressRes?.seen || []).map((r) => itemSeenKey(r.target_type, r.target_id)));
      setSeen(nextSeen);
    } catch (err) {
      if (err instanceof AccountDeletedError) onForceLogout?.();
      else alert(err.message || 'Erreur chargement visite');
    } finally {
      setLoading(false);
    }
  }, [mapId, onForceLogout]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (loading) return;
    const sid = selected?.id;
    const st = selectedType;
    if (!sid || !st) return;
    const list = st === 'zone' ? (content.zones || []) : (content.markers || []);
    const next = list.find((x) => x.id === sid);
    if (next) setSelected(next);
    else {
      setSelected(null);
      setSelectedType(null);
    }
  }, [content, loading, selected?.id, selectedType]);

  useEffect(() => {
    resetMapTransform();
    skipClickRef.current = false;
    dragRef.current.active = false;
    dragRef.current.moved = false;
    setDrawPoints([]);
    setMode('view');
    if (visitMapMascotMoveTimeoutRef.current) {
      clearTimeout(visitMapMascotMoveTimeoutRef.current);
      visitMapMascotMoveTimeoutRef.current = null;
    }
    setVisitMapMascotWalking(false);
  }, [mapId, resetMapTransform]);

  useLayoutEffect(() => {
    visitMascotStartPlacedForMapRef.current = null;
  }, [mapId]);

  useLayoutEffect(() => {
    if (loading) return;
    if (content.map_id != null && String(content.map_id) !== String(mapId)) return;
    if (visitMascotStartPlacedForMapRef.current === mapId) return;
    visitMascotStartPlacedForMapRef.current = mapId;
    if (visitMapMascotMoveTimeoutRef.current) {
      clearTimeout(visitMapMascotMoveTimeoutRef.current);
      visitMapMascotMoveTimeoutRef.current = null;
    }
    setVisitMapMascotWalking(false);
    const start = computeVisitMascotStartPct(mapId, content.markers || []);
    visitMapMascotPctRef.current = start;
    setVisitMapMascotPct(start);
  }, [mapId, loading, content.map_id, content.markers]);

  useEffect(() => {
    visitMapMascotPctRef.current = visitMapMascotPct;
  }, [visitMapMascotPct]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setPrefersReducedMotion(!!mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => () => {
    cancelVisitZoomAnim();
    if (visitMapMascotMoveTimeoutRef.current) clearTimeout(visitMapMascotMoveTimeoutRef.current);
  }, [cancelVisitZoomAnim]);

  const moveVisitMapMascotTo = useCallback(
    (xp, yp) => {
      if (!Number.isFinite(xp) || !Number.isFinite(yp)) return;
      const nx = Math.max(0, Math.min(100, xp));
      const ny = Math.max(0, Math.min(100, yp));
      const prev = visitMapMascotPctRef.current;
      const dist = Math.hypot(nx - prev.xp, ny - prev.yp);
      if (dist < 0.08) return;

      const dx = nx - prev.xp;
      if (Math.abs(dx) > 0.12) setVisitMapMascotFaceRight(dx > 0);

      if (visitMapMascotMoveTimeoutRef.current) {
        clearTimeout(visitMapMascotMoveTimeoutRef.current);
        visitMapMascotMoveTimeoutRef.current = null;
      }

      if (prefersReducedMotion) {
        setVisitMapMascotWalking(false);
      } else {
        setVisitMapMascotWalking(true);
        visitMapMascotMoveTimeoutRef.current = window.setTimeout(() => {
          setVisitMapMascotWalking(false);
          visitMapMascotMoveTimeoutRef.current = null;
        }, VISIT_MAP_MASCOT_MOVE_MS);
      }

      visitMapMascotPctRef.current = { xp: nx, yp: ny };
      setVisitMapMascotPct({ xp: nx, yp: ny });
    },
    [prefersReducedMotion]
  );

  /** Dimensions naturelles : synchro cache (complete) + reset si pas encore décodé (évite % faux avant onLoad). */
  useLayoutEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    if (el.complete && el.naturalWidth > 0 && el.naturalHeight > 0) {
      setVisitImgNatural({ w: el.naturalWidth, h: el.naturalHeight });
    } else {
      setVisitImgNatural({ w: 0, h: 0 });
    }
  }, [visitMapImageSrc]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') return undefined;
    const run = () => {
      const cw = Math.max(1, stage.clientWidth);
      const ch = Math.max(1, stage.clientHeight);
      const nw = visitImgNatural.w;
      const nh = visitImgNatural.h;
      setVisitMapFit(computeMapImageContainRect(nw, nh, cw, ch));
    };
    run();
    const ro = new ResizeObserver(() => run());
    ro.observe(stage);
    return () => ro.disconnect();
  }, [visitImgNatural.w, visitImgNatural.h, mapId]);

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
    const wasSeen = seen.has(key);
    setSeen((prev) => {
      const optimistic = new Set(prev);
      if (wasSeen) optimistic.delete(key);
      else optimistic.add(key);
      return optimistic;
    });
    setSavingSeen(true);
    try {
      await api('/api/visit/seen', 'POST', {
        target_type: selectedType,
        target_id: selected.id,
        seen: !wasSeen,
      });
    } catch (err) {
      if (err instanceof AccountDeletedError) onForceLogout?.();
      else alert(err.message || 'Erreur mise à jour');
      setSeen((prev) => {
        const revert = new Set(prev);
        if (wasSeen) revert.add(key);
        else revert.delete(key);
        return revert;
      });
    } finally {
      setSavingSeen(false);
    }
  };

  const createZoneFromPoints = async () => {
    if (!visitMapImageReady || drawPoints.length < 3) return;
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
    if (!visitMapImageReady) return;
    const stage = event.currentTarget;
    const p = pointToPct(event, stage, mapTransform, visitMapFit);
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
    cancelVisitZoomAnim();
    if (event.target.closest('.visit-map-controls') || event.target.closest('.visit-zone-hit') || event.target.closest('.visit-marker-btn')) return;
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
    cancelVisitZoomAnim();
    const stage = stageRef.current;
    const factor = wheelZoomScaleFactor(event, { containerClientHeight: stage?.clientHeight });
    zoomAroundClientPoint(event.clientX, event.clientY, factor);
  };

  const onStageTouchStart = (event) => {
    if (!canPanAndZoom) return;
    cancelVisitZoomAnim();
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
      await api('/api/visit/tutorials', 'PUT', { map_id: mapId, tutorial_ids: tutorialSelection });
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
    <div className={`visit-view fade-in${isGuestPublicVisit ? ' visit-view--guest-public' : ''}`}>
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

      {visitCartographyProgress.total > 0 ? (
        <div className="visit-progress">
          <div className="visit-progress-head">
            <span id={visitProgressLabelId} className="visit-progress-label">
              Progression sur cette carte :{' '}
              <strong>
                {visitCartographyProgress.seenCount} / {visitCartographyProgress.total}
              </strong>
              {' '}
              <span className="visit-progress-hint">
                (zones et repères marqués « vus »)
              </span>
            </span>
            <span className="visit-progress-pct" aria-hidden="true">
              {visitCartographyProgress.pct} %
            </span>
          </div>
          <div
            className="visit-progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={visitCartographyProgress.total}
            aria-valuenow={visitCartographyProgress.seenCount}
            aria-labelledby={visitProgressLabelId}
          >
            <div
              className="visit-progress-fill"
              style={{ width: `${visitCartographyProgress.pct}%` }}
            />
          </div>
        </div>
      ) : (
        <p className="visit-progress-empty section-sub">
          {maps.length > 1
            ? 'Aucune zone ni repère sur cette carte. Choisis une autre carte ci-dessus si besoin.'
            : 'Aucune zone ni repère sur cette carte pour l’instant.'}
        </p>
      )}

      {isTeacher && !visitMapImageReady && !loading && (
        <p className="section-sub visit-map-image-hint" style={{ margin: '0 0 8px' }}>
          Chargement du plan… Les outils zone et repère sont disponibles une fois l’image affichée (coordonnées précises).
        </p>
      )}
      {isTeacher && (
        <div className="visit-map-switch">
          <button className={`btn btn-sm ${mode === 'view' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setMode('view'); setDrawPoints([]); }}>
            🖐️ Navigation
          </button>
          <button
            type="button"
            className={`btn btn-sm ${mode === 'draw-zone' ? 'btn-primary' : 'btn-ghost'}`}
            disabled={!visitMapImageReady}
            title={!visitMapImageReady ? 'Disponible dès que le plan est chargé.' : undefined}
            onClick={() => setMode('draw-zone')}
          >
            🖊️ Zone visite
          </button>
          <button
            type="button"
            className={`btn btn-sm ${mode === 'add-marker' ? 'btn-primary' : 'btn-ghost'}`}
            disabled={!visitMapImageReady}
            title={!visitMapImageReady ? 'Disponible dès que le plan est chargé.' : undefined}
            onClick={() => setMode('add-marker')}
          >
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
              cursor:
                isTeacher && mode !== 'view' && !visitMapImageReady ? 'wait'
                  : isTeacher && mode !== 'view' ? 'crosshair'
                    : (canPanAndZoom ? 'grab' : 'default'),
              touchAction: canPanAndZoom ? 'none' : 'auto',
            }}
          >
            <div
              className="visit-map-world"
              style={{ transform: `translate(${mapTransform.x}px, ${mapTransform.y}px) scale(${mapTransform.s})` }}
            >
              <div
                className="visit-map-fit-layer"
                style={
                  visitMapFit.width > 0 && visitMapFit.height > 0
                    ? {
                        left: visitMapFit.offsetX,
                        top: visitMapFit.offsetY,
                        width: visitMapFit.width,
                        height: visitMapFit.height,
                      }
                    : { left: 0, top: 0, width: '100%', height: '100%' }
                }
              >
                <img
                  ref={imgRef}
                  src={visitMapImageSrc}
                  alt={`Plan ${currentMap?.label || 'Forêt'}`}
                  className="visit-map-img"
                  onLoad={(e) => {
                    const el = e.currentTarget;
                    setVisitImgNatural({ w: el.naturalWidth || 0, h: el.naturalHeight || 0 });
                  }}
                  onError={() => setVisitImgNatural({ w: 0, h: 0 })}
                />

                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="visit-map-zones">
                  {(content.zones || []).map((z) => {
                    const points = parsePctPoints(z.points);
                    if (points.length < 3) return null;
                    const p = points.map((pt) => `${pt.xp},${pt.yp}`).join(' ');
                    const isSeen = seen.has(itemSeenKey('zone', z.id));
                    const mx = points.reduce((s, pt) => s + pt.xp, 0) / points.length;
                    const my = points.reduce((s, pt) => s + pt.yp, 0) / points.length;
                    const zoneEmoji = detectLeadingMarkerEmoji(z.name || '', markerEmojis);
                    const zoneLabel = stripLeadingMarkerEmoji(z.name || '', markerEmojis);
                    const { emojiU, labelU, gapU, strokeU } = visitZoneSvgTypography;
                    const fw = visitMapFit.width;
                    const fh = visitMapFit.height;
                    const titleY = my;
                    const titleUniform = visitZoneSvgTextUniformYTransform(mx, titleY, fw, fh);
                    const showZoneLabel = Boolean(String(zoneLabel || '').trim() || z.name);
                    return (
                      <g
                        key={z.id}
                        className="visit-zone-hit"
                        style={{ cursor: 'pointer' }}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (consumeSkipClick()) return;
                          if (mode === 'view') {
                            const c = visitZoneCentroidPct(z);
                            if (c) moveVisitMapMascotTo(c.xp, c.yp);
                          }
                          setSelected(z);
                          setSelectedType('zone');
                        }}
                      >
                        <polygon
                          points={p}
                          className={`visit-zone-poly ${isSeen ? 'is-seen' : 'is-unseen'}`}
                        />
                        {(zoneEmoji || showZoneLabel) ? (
                          <g transform={titleUniform}>
                            {zoneEmoji ? (
                              <text
                                x={mx}
                                y={titleY}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fontSize={emojiU}
                                fontFamily="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif"
                                className="visit-zone-label visit-zone-label--emoji"
                              >
                                {zoneEmoji}
                              </text>
                            ) : null}
                            {showZoneLabel ? (
                              <text
                                x={mx}
                                y={titleY + (zoneEmoji ? gapU : 0)}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fontSize={labelU}
                                fontWeight="700"
                                fontFamily="DM Sans, sans-serif"
                                fill="#1a4731"
                                stroke="rgba(255,255,255,0.88)"
                                strokeWidth={strokeU}
                                paintOrder="stroke"
                                className="visit-zone-label visit-zone-label--title"
                              >
                                {zoneLabel || z.name}
                              </text>
                            ) : null}
                          </g>
                        ) : null}
                      </g>
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

                {showVisitMapMascot ? (
                  <div
                    className={`visit-map-mascot${visitMapMascotWalking ? ' visit-map-mascot--walking' : ''}${prefersReducedMotion ? ' visit-map-mascot--reduced-motion' : ''}`}
                    style={{ left: `${visitMapMascotPct.xp}%`, top: `${visitMapMascotPct.yp}%` }}
                    aria-hidden="true"
                  >
                    <div
                      className="visit-map-mascot-inner"
                      style={{ transform: `translate(-50%, -100%) scaleX(${visitMapMascotFaceRight ? 1 : -1})` }}
                    >
                      <Suspense
                        fallback={
                          <div className="visit-map-mascot-lottie visit-map-mascot-lottie--fallback" aria-hidden="true" />
                        }
                      >
                        <VisitMapMascotLottie
                          walking={visitMapMascotWalking}
                          prefersReducedMotion={prefersReducedMotion}
                        />
                      </Suspense>
                    </div>
                  </div>
                ) : null}

                {(content.markers || []).map((m) => {
                  const isSeen = seen.has(itemSeenKey('marker', m.id));
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className="visit-marker-btn"
                      aria-label={String(m.label || '').trim() || 'Repère visite'}
                      style={{ left: `${m.x_pct}%`, top: `${m.y_pct}%` }}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (consumeSkipClick()) return;
                        if (mode === 'view') {
                          moveVisitMapMascotTo(Number(m.x_pct), Number(m.y_pct));
                        }
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
            <div className="visit-map-controls">
              <button
                type="button"
                className="visit-map-ctrl"
                aria-label="Zoomer la carte de visite"
                onClick={(event) => {
                  event.stopPropagation();
                  zoomFromCenterAnimated(1.2);
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
                  zoomFromCenterAnimated(0.84);
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
              {selectedType === 'zone' && selected.description && (
                <div
                  style={{
                    background: '#f0fdf4',
                    borderRadius: 10,
                    padding: '10px 14px',
                    marginBottom: 12,
                    border: '1px solid var(--mint)',
                    fontSize: '.88rem',
                    color: '#333',
                    lineHeight: 1.6,
                  }}>
                  {selected.description}
                </div>
              )}
              {selectedType === 'marker' && selected.note && (
                <div
                  style={{
                    background: '#f0fdf4',
                    borderRadius: 10,
                    padding: '10px 14px',
                    marginBottom: 12,
                    border: '1px solid var(--mint)',
                    fontSize: '.88rem',
                    color: '#333',
                    lineHeight: 1.6,
                  }}>
                  {selected.note}
                </div>
              )}
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
                      <img src={visitMediaImgSrc(m)} alt={m.caption || ''} />
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
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      const href =
                        t.type === 'link' && t.source_url
                          ? t.source_url
                          : `/api/tutorials/${t.id}/view`;
                      window.open(href, '_blank', 'noopener,noreferrer');
                    }}
                  >
                    👁️ Lire
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={() => window.open(`/api/tutorials/${t.id}/download/pdf`, '_blank', 'noopener,noreferrer')}>
                    ⬇️ PDF
                  </button>
                  <TutorialReadAcknowledgeButton
                    tutorialId={t.id}
                    tutorialTitle={t.title}
                    isRead={tutorialReadIds.has(Number(t.id))}
                    onAcknowledged={(id) => setTutorialReadIds((prev) => new Set([...prev, id]))}
                    onForceLogout={onForceLogout}
                  />
                </div>
                {contextCommentsEnabled && student?.id && (
                  <ContextComments
                    contextType="tutorial"
                    contextId={String(t.id)}
                    title="Commentaires sur ce tutoriel"
                    placeholder="Question ou retour sur ce tutoriel…"
                    canParticipateContextComments={canParticipateContextComments}
                  />
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export { VisitView };
