import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MediaLibraryMenu } from '../../components/MediaLibraryMenu.jsx';
import {
  findNearestEdgeInsertion,
  insertPctPointAt,
  normalizePctPoint,
  normalizePctPoints,
  pointsToSvgPolygon,
  removePctPointAt,
} from '../../shared/pct-map/pctPolygon.js';
import { PctPolygonEditOverlay } from '../../shared/pct-map/PctPolygonEditOverlay.jsx';
import { usePctPolygonEditSession } from '../../shared/pct-map/usePctPolygonEditSession.js';
import { useGlPctMapGestures } from '../hooks/useGlPctMapGestures.js';
import { GLPctMapCanvas } from './GLPctMapCanvas.jsx';

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
  const [selectedVertexIndex, setSelectedVertexIndex] = useState(null);
  const [insertVertexMode, setInsertVertexMode] = useState(false);

  const selectedZone = useMemo(
    () => (Array.isArray(zones) ? zones.find((zone) => Number(zone.id) === Number(selectedZoneId)) : null) || null,
    [zones, selectedZoneId]
  );

  const shapeSession = usePctPolygonEditSession({
    onSave: async (points) => {
      if (!selectedZoneId) return;
      await onUpdateZone?.(selectedZoneId, { points });
    },
  });

  const isEditingShape = shapeSession.active && mode === 'edit-shape';

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
    if (isEditingShape) {
      onSelectedZoneChange?.(null);
      return;
    }
    onSelectedZoneChange?.(selectedZone);
  }, [selectedZone, isEditingShape, onSelectedZoneChange]);

  const displayZones = useMemo(() => {
    if (!Array.isArray(zones)) return [];
    if (!isEditingShape || !selectedZoneId) return zones;
    return zones.map((zone) => {
      if (Number(zone.id) !== Number(selectedZoneId)) return zone;
      return { ...zone, points: shapeSession.points };
    });
  }, [zones, isEditingShape, selectedZoneId, shapeSession.points]);

  const selectZone = useCallback((zoneId) => {
    if (isEditingShape) return;
    setSelectedZoneId(zoneId);
    setMode('edit');
    setSelectedVertexIndex(null);
    setInsertVertexMode(false);
  }, [isEditingShape]);

  const startShapeEdit = useCallback(() => {
    if (!selectedZone?.points?.length) return;
    shapeSession.start(selectedZone.points);
    setMode('edit-shape');
    setSelectedVertexIndex(null);
    setInsertVertexMode(false);
  }, [selectedZone, shapeSession]);

  const cancelShapeEdit = useCallback(() => {
    shapeSession.discard();
    setMode('edit');
    setSelectedVertexIndex(null);
    setInsertVertexMode(false);
  }, [shapeSession]);

  const saveShapeEdit = useCallback(async () => {
    await shapeSession.save();
    setMode('edit');
    setSelectedVertexIndex(null);
    setInsertVertexMode(false);
  }, [shapeSession]);

  async function createZone() {
    if (!canManage) return;
    if (drawPoints.length < 3) return;
    await onCreateZone?.({
      label: draftLabel.trim() || 'Zone',
      color: draftColor || DEFAULT_COLOR,
      points: normalizePctPoints(drawPoints),
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

  function handleMapClick(pct, event) {
    if (!canManage) return;
    if (event.target.closest('.gl-pct-edit-pt') || event.target.closest('.gl-pct-edit-zone-translate')) return;

    if (isEditingShape) {
      if (insertVertexMode) {
        const hit = findNearestEdgeInsertion(shapeSession.points, pct, 4);
        if (hit) {
          shapeSession.setPoints(insertPctPointAt(shapeSession.points, hit.insertIndex, hit.point));
          shapeSession.scheduleRecordHistory();
          setSelectedVertexIndex(hit.insertIndex);
        } else {
          const next = [...shapeSession.points, normalizePctPoint(pct)];
          shapeSession.setPoints(next);
          shapeSession.scheduleRecordHistory();
          setSelectedVertexIndex(next.length - 1);
        }
        setInsertVertexMode(false);
      }
      return;
    }

    if (event.target.closest('.gl-kingdom-zone-polygon')) return;

    if (mode === 'draw') {
      setDrawPoints((prev) => [...prev, normalizePctPoint(pct)]);
    }
  }

  function removeSelectedVertex() {
    if (!isEditingShape || selectedVertexIndex == null) return;
    const next = removePctPointAt(shapeSession.points, selectedVertexIndex);
    if (next.length === shapeSession.points.length) return;
    shapeSession.setPoints(next);
    shapeSession.scheduleRecordHistory();
    setSelectedVertexIndex(null);
  }

  const canUseMediaLibrary = typeof fetchMediaLibrary === 'function';
  const editStrokeColor = draftColor || selectedZone?.color || DEFAULT_COLOR;
  const mapCursor = mode === 'draw' || insertVertexMode ? 'crosshair' : 'default';

  return (
    <>
      {canManage && isEditingShape ? (
        <div className="gl-map-editor-toolbar gl-map-editor-toolbar--shape" role="toolbar" aria-label="Édition du contour">
          <span className="gl-shape-edit-badge">
            Contour — {draftLabel || selectedZone?.label || 'Zone'}
          </span>
          <button
            type="button"
            className="is-active"
            onClick={() => setInsertVertexMode((v) => !v)}
            title="Cliquez sur un bord du polygone (ou sur la carte) pour ajouter un sommet"
          >
            {insertVertexMode ? 'Annuler ajout sommet' : 'Ajouter un sommet'}
          </button>
          <button
            type="button"
            disabled={selectedVertexIndex == null || shapeSession.points.length <= 3}
            onClick={removeSelectedVertex}
          >
            Retirer le sommet
          </button>
          <button
            type="button"
            disabled={!shapeSession.canUndo}
            onClick={shapeSession.undo}
            title="Annuler (Ctrl+Z)"
          >
            Annuler
          </button>
          <button type="button" className="gl-primary" onClick={saveShapeEdit}>
            Sauver le contour
          </button>
          <button type="button" onClick={cancelShapeEdit}>
            Abandonner
          </button>
        </div>
      ) : null}

      {canManage && !isEditingShape ? (
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

      <GLPctMapCanvas
        imageUrl={imageUrl}
        imageAlt={chapterTitle || 'Carte du royaume'}
        mapGestures={mapGestures}
        className="gl-kingdom-map"
        imageClassName="gl-kingdom-map-image"
        cursor={mapCursor}
        onMapClick={handleMapClick}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="gl-kingdom-map-overlay">
          {displayZones.map((zone) => {
            const isSelected = Number(selectedZoneId) === Number(zone.id);
            const hideWhileShapeEdit = isEditingShape && !isSelected;
            if (hideWhileShapeEdit) {
              return (
                <polygon
                  key={zone.id}
                  className="gl-kingdom-zone-polygon gl-kingdom-zone-polygon--dimmed"
                  points={pointsToSvgPolygon(zone.points)}
                  fill={zone.color || DEFAULT_COLOR}
                  fillOpacity="0.12"
                  stroke={zone.color || DEFAULT_COLOR}
                  strokeWidth="0.35"
                  style={{ pointerEvents: 'none' }}
                />
              );
            }
            return (
              <polygon
                key={zone.id}
                className={`gl-kingdom-zone-polygon${isSelected ? ' is-selected' : ''}`}
                points={pointsToSvgPolygon(zone.points)}
                fill={zone.color || DEFAULT_COLOR}
                fillOpacity={isEditingShape && isSelected ? 0.15 : 0.3}
                stroke={zone.color || DEFAULT_COLOR}
                strokeWidth="0.5"
                data-zone-id={zone.id}
                onClick={(e) => {
                  if (isEditingShape) return;
                  e.stopPropagation();
                  selectZone(zone.id);
                }}
              />
            );
          })}
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
          {isEditingShape ? (
            <PctPolygonEditOverlay
              points={shapeSession.points}
              strokeColor={editStrokeColor}
              fillColor={editStrokeColor}
              toImagePct={mapGestures.toImagePct}
              onPointsChange={shapeSession.setPoints}
              onGestureEnd={shapeSession.scheduleRecordHistory}
              onVertexSelect={setSelectedVertexIndex}
            />
          ) : null}
        </svg>
      </GLPctMapCanvas>

      {isEditingShape ? (
        <p className="gl-hint">
          Glissez un sommet ou le polygone entier. « Ajouter un sommet » puis cliquez sur un bord (ou la carte).
          Raccourci&nbsp;: Ctrl+Z pour annuler. Minimum 3 sommets.
        </p>
      ) : null}

      <ul className="gl-kingdom-map-zones">
        {displayZones.map((zone) => (
          <li key={zone.id} className={Number(selectedZoneId) === Number(zone.id) ? 'is-selected' : ''}>
            <button
              type="button"
              className="gl-marker-row-btn"
              disabled={isEditingShape}
              onClick={() => selectZone(zone.id)}
            >
              <strong>{zone.label}</strong>
              {zoneMusicEnabled && readZoneMusicUrl(zone) ? (
                <span className="gl-zone-music-badge" aria-label="Musique associée" title="Musique associée"> 🎧</span>
              ) : null}
            </button>
            {canManage && !isEditingShape ? (
              <button type="button" className="gl-danger" onClick={() => onDeleteZone?.(zone.id)}>
                Supprimer
              </button>
            ) : null}
          </li>
        ))}
        {displayZones.length === 0 ? (
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

      {canManage && mode === 'edit' && selectedZone && !isEditingShape ? (
        <form className="gl-form gl-zone-music-form" onSubmit={(event) => { event.preventDefault(); saveZoneMeta(); }}>
          <div className="gl-inline-actions gl-zone-edit-actions">
            <button type="button" className="gl-primary" onClick={startShapeEdit}>
              Modifier le contour
            </button>
          </div>
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
