import React, { useEffect, useMemo, useState } from 'react';
import { MediaLibraryMenu } from '../../components/MediaLibraryMenu.jsx';
import { useGlPctMapGestures } from '../hooks/useGlPctMapGestures.js';
import { GLPctMapCanvas } from './GLPctMapCanvas.jsx';

function pointsToSvgPolygon(points) {
  if (!Array.isArray(points)) return '';
  return points.map((p) => `${Number(p.x)},${Number(p.y)}`).join(' ');
}

function normalizePoint(point) {
  const x = Math.max(0, Math.min(100, Number(point?.x)));
  const y = Math.max(0, Math.min(100, Number(point?.y)));
  return { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) };
}

const DEFAULT_COLOR = '#22c55e';
const DEFAULT_MUSIC_VOLUME = 0.7;

function readZoneMusicUrl(zone) {
  const url = zone?.musicUrl ?? zone?.music_url ?? null;
  if (url == null) return '';
  return String(url).trim();
}

function readZoneMusicVolume(zone) {
  const raw = zone?.musicVolume ?? zone?.music_volume;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_MUSIC_VOLUME;
  return Math.max(0, Math.min(1, n));
}

export function GLKingdomZoneEditor({
  imageUrl,
  chapterTitle,
  zones,
  canManage,
  onCreateZone,
  onUpdateZone,
  onDeleteZone,
  fetchMediaLibrary,
  uploadMediaLibrary,
  removeMediaLibrary,
  zoneMusicEnabled = false,
  onSelectedZoneChange,
  onPreviewZoneMusic,
}) {
  const mapGestures = useGlPctMapGestures();
  const [mode, setMode] = useState('view');
  const [drawPoints, setDrawPoints] = useState([]);
  const [selectedZoneId, setSelectedZoneId] = useState(null);
  const [draftLabel, setDraftLabel] = useState('');
  const [draftColor, setDraftColor] = useState(DEFAULT_COLOR);
  const [draftMusicUrl, setDraftMusicUrl] = useState('');
  const [draftMusicVolumePct, setDraftMusicVolumePct] = useState(70);
  const [dragVertex, setDragVertex] = useState(null);

  const selectedZone = useMemo(
    () => (Array.isArray(zones) ? zones.find((zone) => Number(zone.id) === Number(selectedZoneId)) : null) || null,
    [zones, selectedZoneId]
  );
  const selectedPoints = useMemo(
    () => (Array.isArray(selectedZone?.points) ? selectedZone.points.map(normalizePoint) : []),
    [selectedZone]
  );

  useEffect(() => {
    if (!selectedZone) {
      setDraftLabel('');
      setDraftColor(DEFAULT_COLOR);
      setDraftMusicUrl('');
      setDraftMusicVolumePct(Math.round(DEFAULT_MUSIC_VOLUME * 100));
      return;
    }
    setDraftLabel(selectedZone.label || '');
    setDraftColor(selectedZone.color || DEFAULT_COLOR);
    setDraftMusicUrl(readZoneMusicUrl(selectedZone));
    setDraftMusicVolumePct(Math.round(readZoneMusicVolume(selectedZone) * 100));
  }, [selectedZone]);

  useEffect(() => {
    onSelectedZoneChange?.(selectedZone);
  }, [selectedZone, onSelectedZoneChange]);

  useEffect(() => {
    if (!dragVertex || !mapGestures?.toImagePct) return undefined;
    const onMove = (event) => {
      const pct = mapGestures.toImagePct(event.clientX, event.clientY);
      if (!pct) return;
      onUpdateZone?.(dragVertex.zoneId, {
        points: selectedPoints.map((point, index) => (
          index === dragVertex.pointIndex ? normalizePoint({ x: pct.x, y: pct.y }) : point
        )),
      }, { optimistic: true });
    };
    const onUp = async () => {
      setDragVertex(null);
      await onUpdateZone?.(dragVertex.zoneId, { points: selectedPoints }, { flushOptimistic: true });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragVertex, mapGestures, onUpdateZone, selectedPoints]);

  function selectZone(zoneId) {
    setSelectedZoneId(zoneId);
    setMode('edit');
  }

  async function createZone() {
    if (!canManage) return;
    if (drawPoints.length < 3) return;
    await onCreateZone?.({
      label: draftLabel.trim() || 'Zone',
      color: draftColor || DEFAULT_COLOR,
      points: drawPoints.map(normalizePoint),
    });
    setDrawPoints([]);
    setDraftLabel('');
    setMode('view');
  }

  async function saveZoneMeta() {
    if (!selectedZoneId) return;
    const payload = {
      label: draftLabel.trim() || 'Zone',
      color: draftColor || DEFAULT_COLOR,
    };
    if (zoneMusicEnabled) {
      payload.musicUrl = draftMusicUrl.trim() || null;
      payload.musicVolume = Math.max(0, Math.min(1, Number(draftMusicVolumePct) / 100));
    }
    await onUpdateZone?.(selectedZoneId, payload);
  }

  async function clearZoneMusic() {
    if (!selectedZoneId) return;
    setDraftMusicUrl('');
    await onUpdateZone?.(selectedZoneId, { musicUrl: null });
  }

  function previewDraftMusic() {
    const url = draftMusicUrl.trim();
    if (!url) return;
    onPreviewZoneMusic?.(url, Math.max(0, Math.min(1, Number(draftMusicVolumePct) / 100)));
  }

  const canUseMediaLibrary = typeof fetchMediaLibrary === 'function';

  return (
    <>
      <GLPctMapCanvas
        imageUrl={imageUrl}
        imageAlt={chapterTitle || 'Carte du royaume'}
        mapGestures={mapGestures}
        className="gl-kingdom-map"
        imageClassName="gl-kingdom-map-image"
        cursor={mode === 'draw' ? 'crosshair' : 'default'}
        onMapClick={(pct, event) => {
          if (!canManage) return;
          if (event.target.closest('.gl-zone-edit-pt') || event.target.closest('.gl-kingdom-zone-polygon')) return;
          if (mode === 'draw') {
            setDrawPoints((prev) => [...prev, normalizePoint({ x: pct.x, y: pct.y })]);
          }
        }}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="gl-kingdom-map-overlay">
          {Array.isArray(zones) && zones.map((zone) => (
            <polygon
              key={zone.id}
              className={`gl-kingdom-zone-polygon${Number(selectedZoneId) === Number(zone.id) ? ' is-selected' : ''}`}
              points={pointsToSvgPolygon(zone.points)}
              fill={zone.color || DEFAULT_COLOR}
              fillOpacity="0.3"
              stroke={zone.color || DEFAULT_COLOR}
              strokeWidth="0.5"
              data-zone-id={zone.id}
              onClick={() => selectZone(zone.id)}
            />
          ))}
          {drawPoints.length > 0 ? (
            <polygon
              className="gl-kingdom-zone-draft"
              points={pointsToSvgPolygon(drawPoints)}
              fill={draftColor || DEFAULT_COLOR}
              fillOpacity="0.2"
              stroke={draftColor || DEFAULT_COLOR}
              strokeWidth="0.6"
              strokeDasharray="1 1"
            />
          ) : null}
          {mode === 'edit' && selectedZone ? selectedPoints.map((point, index) => (
            <circle
              key={`${selectedZone.id}-${index}`}
              className="gl-zone-edit-pt"
              cx={point.x}
              cy={point.y}
              r="1.3"
              onPointerDown={(event) => {
                if (!canManage) return;
                event.preventDefault();
                setDragVertex({ zoneId: selectedZone.id, pointIndex: index });
              }}
            />
          )) : null}
        </svg>
      </GLPctMapCanvas>

      {canManage ? (
        <div className="gl-map-editor-toolbar">
          <button
            type="button"
            className={mode === 'draw' ? 'is-active' : ''}
            onClick={() => {
              const nextMode = mode === 'draw' ? 'view' : 'draw';
              setMode(nextMode);
              setSelectedZoneId(null);
              setDrawPoints([]);
            }}
          >
            {mode === 'draw' ? 'Annuler dessin' : 'Dessiner une zone'}
          </button>
          {mode === 'draw' && drawPoints.length > 0 ? (
            <button type="button" onClick={() => setDrawPoints((prev) => prev.slice(0, -1))}>
              Retirer le dernier point
            </button>
          ) : null}
        </div>
      ) : null}

      <ul className="gl-kingdom-map-zones">
        {Array.isArray(zones) && zones.map((zone) => (
          <li key={zone.id} className={Number(selectedZoneId) === Number(zone.id) ? 'is-selected' : ''}>
            <button
              type="button"
              className="gl-marker-row-btn"
              onClick={() => selectZone(zone.id)}
            >
              <strong>{zone.label}</strong>
              {zoneMusicEnabled && readZoneMusicUrl(zone) ? (
                <span className="gl-zone-music-badge" aria-label="Musique associée" title="Musique associée"> 🎧</span>
              ) : null}
            </button>
            {canManage ? (
              <button type="button" className="gl-danger" onClick={() => onDeleteZone?.(zone.id)}>
                Supprimer
              </button>
            ) : null}
          </li>
        ))}
        {Array.isArray(zones) && zones.length === 0 ? (
          <li className="gl-empty gl-hint">
            <span className="gl-empty-icon" aria-hidden>🏰</span>
            Aucune zone.
          </li>
        ) : null}
      </ul>

      {canManage && mode === 'draw' ? (
        <form className="gl-form" onSubmit={(event) => { event.preventDefault(); createZone(); }}>
          <label>
            Label
            <input value={draftLabel} onChange={(event) => setDraftLabel(event.target.value)} />
          </label>
          <label>
            Couleur
            <input value={draftColor} onChange={(event) => setDraftColor(event.target.value)} />
          </label>
          <button type="submit" disabled={drawPoints.length < 3}>
            Créer la zone ({drawPoints.length} points)
          </button>
        </form>
      ) : null}

      {canManage && mode === 'edit' && selectedZone ? (
        <form className="gl-form gl-zone-music-form" onSubmit={(event) => { event.preventDefault(); saveZoneMeta(); }}>
          <label>
            Label
            <input value={draftLabel} onChange={(event) => setDraftLabel(event.target.value)} />
          </label>
          <label>
            Couleur
            <input value={draftColor} onChange={(event) => setDraftColor(event.target.value)} />
          </label>
          {zoneMusicEnabled ? (
            <fieldset className="gl-zone-music-fieldset">
              <legend>Musique d’ambiance</legend>
              <label>
                URL audio
                <input
                  value={draftMusicUrl}
                  onChange={(event) => setDraftMusicUrl(event.target.value)}
                  placeholder="/uploads/media-library/audio/..."
                />
              </label>
              {canUseMediaLibrary ? (
                <MediaLibraryMenu
                  title="Bibliothèque audio"
                  fetchItems={fetchMediaLibrary}
                  uploadDataUrl={uploadMediaLibrary}
                  removeItem={removeMediaLibrary}
                  onPickUrl={(url) => setDraftMusicUrl(String(url || ''))}
                  canUpload
                  canRemove
                  manageHint="Filtrez sur Audio pour choisir une piste."
                />
              ) : null}
              <label>
                Volume ({draftMusicVolumePct} %)
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={draftMusicVolumePct}
                  onChange={(event) => setDraftMusicVolumePct(Number(event.target.value))}
                />
              </label>
              <div className="gl-inline-actions gl-zone-music-actions">
                <button type="button" onClick={previewDraftMusic} disabled={!draftMusicUrl.trim()}>
                  Écouter
                </button>
                <button type="button" onClick={clearZoneMusic} disabled={!draftMusicUrl.trim()}>
                  Retirer la musique
                </button>
              </div>
            </fieldset>
          ) : null}
          <button type="submit">Enregistrer la zone</button>
        </form>
      ) : null}
    </>
  );
}
