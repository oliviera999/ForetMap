import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { useGlPctMapGestures } from '../hooks/useGlPctMapGestures.js';
import { useGLKingdomZones } from '../hooks/useGLKingdomZones.js';
import { useGLKingdomZoneEditor } from '../hooks/useGLKingdomZoneEditor.js';
import { useGLZoneMusic } from '../hooks/useGLZoneMusic.js';
import { GLPctMapCanvas } from './GLPctMapCanvas.jsx';
import { GLBoardMarkers } from './GLBoardMarkers.jsx';
import { GLKingdomZoneMapOverlay } from './GLKingdomZoneMapOverlay.jsx';
import { GLKingdomZoneSidePanels } from './GLKingdomZoneSidePanels.jsx';
import { GLMarkerEventEditor } from './GLMarkerEventEditor.jsx';
import {
  GLMarkerAppearanceEditor,
  EMPTY_APPEARANCE_FORM,
  appearanceFormFromMarker,
  appearanceDefaultsForEventType,
  appearanceToPayload,
} from './GLMarkerAppearanceEditor.jsx';
import { glImageFrameToStyle, normalizeGlImageFrame } from '../../utils/glImageFrame.js';
import { defaultEventConfigForQuestion } from '../../utils/glMarkerEventConfig.js';
import { GLButton } from './ui/GLButton.jsx';
import { resolveMarkerAppearance } from '../../utils/glMarkerAppearance.js';

const EMPTY_MARKER_FORM = {
  label: '',
  xPct: 50,
  yPct: 50,
  description: '',
  orderIndex: 0,
};

function toFormFromMarker(marker) {
  if (!marker) return EMPTY_MARKER_FORM;
  return {
    label: marker.label || '',
    xPct: Number(marker.x_pct ?? 50),
    yPct: Number(marker.y_pct ?? 50),
    description: marker.description || '',
    orderIndex: Number(marker.order_index || 0),
  };
}

function toMarkerPayload(form, eventDraft, appearanceForm) {
  return {
    label: String(form.label || '').trim(),
    xPct: Number(form.xPct),
    yPct: Number(form.yPct),
    eventType: String(eventDraft?.eventType || 'question').trim(),
    description: String(form.description || '').trim(),
    orderIndex: Number(form.orderIndex) || 0,
    eventConfig: eventDraft?.eventConfig || defaultEventConfigForQuestion(),
    ...appearanceToPayload(appearanceForm),
  };
}

function MarkerListVisual({ marker }) {
  const appearance = resolveMarkerAppearance(marker);
  if (appearance.displayMode === 'emoji' && appearance.emoji) {
    return (
      <span className="gl-markers-list__visual foretmap-emoji-text-mixed" aria-hidden>
        {appearance.emoji}
        {' '}
      </span>
    );
  }
  if (appearance.displayMode === 'icon' && appearance.iconUrl) {
    return (
      <img
        className="gl-markers-list__visual gl-markers-list__visual--icon"
        src={appearance.iconUrl}
        alt=""
        aria-hidden
      />
    );
  }
  return null;
}

export function GLChapterMapStudio({
  chapterId,
  chapterSlug,
  chapterTitle,
  chapterBiomes = [],
  mapImageUrl,
  mapImageFrame,
  markers,
  onReload,
  onError,
  onInfo,
  zoneMusicEnabled = false,
}) {
  const mapGestures = useGlPctMapGestures();
  const [isAddMode, setIsAddMode] = useState(false);
  const [selectedMarkerId, setSelectedMarkerId] = useState(null);
  const [markerForm, setMarkerForm] = useState(EMPTY_MARKER_FORM);
  const [appearanceForm, setAppearanceForm] = useState({ ...EMPTY_APPEARANCE_FORM });
  const [eventDraft, setEventDraft] = useState({
    eventType: 'question',
    eventConfig: defaultEventConfigForQuestion(),
  });
  const [editableMarkers, setEditableMarkers] = useState([]);
  const [dragState, setDragState] = useState(null);
  const [saving, setSaving] = useState(false);

  const imageStyle = useMemo(
    () => glImageFrameToStyle(normalizeGlImageFrame(mapImageFrame, 'chapter-map')),
    [mapImageFrame]
  );

  const {
    zones,
    error: zonesError,
    createZone,
    updateZone,
    deleteZone,
    fetchMediaLibrary,
    uploadMediaLibrary,
    removeMediaLibrary,
  } = useGLKingdomZones(chapterId, { zoneMusicEnabled });

  const { previewUrl, stopAll } = useGLZoneMusic({
    enabled: zoneMusicEnabled,
    userMuted: false,
    activeZone: null,
  });

  useEffect(() => {
    if (!zoneMusicEnabled) stopAll();
    return () => stopAll();
  }, [zoneMusicEnabled, stopAll]);

  const handlePreviewZoneMusic = useCallback((url, volume) => {
    if (!zoneMusicEnabled || !url) return;
    previewUrl(url, volume);
  }, [zoneMusicEnabled, previewUrl]);

  const zoneEditor = useGLKingdomZoneEditor({
    zones,
    canManage: true,
    zoneMusicEnabled,
    onCreateZone: createZone,
    onUpdateZone: updateZone,
    onDeleteZone: deleteZone,
    onPreviewZoneMusic: handlePreviewZoneMusic,
  });

  const {
    zoneEditActive,
    handleMapClick: handleZoneMapClick,
    mapCursor: zoneMapCursor,
    selectZone,
    mode: zoneMode,
  } = zoneEditor;

  const fetchMediaLibraryWithInfo = useCallback(async () => {
    const items = await fetchMediaLibrary();
    return items;
  }, [fetchMediaLibrary]);

  const uploadMediaLibraryWithInfo = useCallback(async (mediaData) => {
    await uploadMediaLibrary(mediaData);
    onInfo?.('Média ajouté à la bibliothèque');
  }, [uploadMediaLibrary, onInfo]);

  const removeMediaLibraryWithInfo = useCallback(async (relativePath) => {
    await removeMediaLibrary(relativePath);
    onInfo?.('Média supprimé de la bibliothèque');
  }, [removeMediaLibrary, onInfo]);

  useEffect(() => {
    setEditableMarkers(Array.isArray(markers) ? markers : []);
  }, [markers]);

  useEffect(() => {
    if (selectedMarkerId == null) return;
    if (!editableMarkers.some((m) => Number(m.id) === Number(selectedMarkerId))) {
      setSelectedMarkerId(null);
      setMarkerForm(EMPTY_MARKER_FORM);
      setAppearanceForm({ ...EMPTY_APPEARANCE_FORM });
    }
  }, [editableMarkers, selectedMarkerId]);

  const selectedMarker = useMemo(
    () => editableMarkers.find((marker) => Number(marker.id) === Number(selectedMarkerId)) || null,
    [editableMarkers, selectedMarkerId]
  );

  useEffect(() => {
    if (!dragState || !mapGestures?.toImagePct || zoneEditActive) return undefined;
    const onMove = (event) => {
      const pct = mapGestures.toImagePct(event.clientX, event.clientY);
      if (!pct) return;
      setEditableMarkers((prev) => prev.map((marker) => (
        Number(marker.id) === Number(dragState.markerId)
          ? { ...marker, x_pct: pct.x, y_pct: pct.y }
          : marker
      )));
      setMarkerForm((prev) => ({ ...prev, xPct: pct.x, yPct: pct.y }));
    };
    const onUp = async () => {
      const marker = editableMarkers.find((item) => Number(item.id) === Number(dragState.markerId));
      setDragState(null);
      if (!marker) return;
      try {
        await apiGL(`/api/gl/chapters/admin/markers/${dragState.markerId}`, 'PUT', {
          xPct: Number(marker.x_pct),
          yPct: Number(marker.y_pct),
        });
        onInfo?.('Position du repère mise à jour');
        await onReload?.(chapterSlug);
      } catch (err) {
        onError?.(err.message || 'Déplacement impossible');
        await onReload?.(chapterSlug);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragState, mapGestures, editableMarkers, onError, onInfo, onReload, chapterSlug, zoneEditActive]);

  useEffect(() => {
    if (zoneEditActive) {
      setIsAddMode(false);
      setDragState(null);
    }
  }, [zoneEditActive]);

  function setField(key, value) {
    setMarkerForm((prev) => ({ ...prev, [key]: value }));
  }

  function selectMarker(marker) {
    if (zoneEditActive) return;
    setIsAddMode(false);
    setSelectedMarkerId(Number(marker.id));
    setMarkerForm(toFormFromMarker(marker));
    setAppearanceForm(appearanceFormFromMarker(marker));
  }

  function resetForm() {
    setSelectedMarkerId(null);
    setMarkerForm(EMPTY_MARKER_FORM);
    setAppearanceForm({ ...EMPTY_APPEARANCE_FORM });
    setEventDraft({
      eventType: 'question',
      eventConfig: defaultEventConfigForQuestion(),
    });
  }

  function handleEventDraftChange(nextDraft) {
    setEventDraft(nextDraft);
    const defaults = appearanceDefaultsForEventType(nextDraft?.eventType, appearanceForm);
    if (defaults) {
      setAppearanceForm((prev) => ({
        ...prev,
        displayMode: defaults.displayMode,
        emoji: defaults.emoji ?? prev.emoji,
        iconUrl: defaults.iconUrl ?? '',
      }));
    }
  }

  async function submitMarker(event) {
    event.preventDefault();
    if (!chapterId) return;
    const payload = toMarkerPayload(markerForm, eventDraft, appearanceForm);
    if (!payload.label) {
      onError?.('Le label du repère est requis');
      return;
    }
    setSaving(true);
    try {
      if (selectedMarkerId != null && !isAddMode) {
        await apiGL(`/api/gl/chapters/admin/markers/${selectedMarkerId}`, 'PUT', payload);
        onInfo?.('Repère mis à jour');
      } else {
        await apiGL(`/api/gl/chapters/admin/${chapterId}/markers`, 'POST', payload);
        onInfo?.('Repère ajouté');
      }
      setIsAddMode(false);
      resetForm();
      await onReload?.(chapterSlug);
    } catch (err) {
      onError?.(err.message || 'Enregistrement du repère impossible');
    } finally {
      setSaving(false);
    }
  }

  async function deleteMarker() {
    if (selectedMarkerId == null) return;
    if (typeof window !== 'undefined' && !window.confirm('Supprimer ce repère ?')) return;
    try {
      await apiGL(`/api/gl/chapters/admin/markers/${selectedMarkerId}`, 'DELETE');
      onInfo?.('Repère supprimé');
      setIsAddMode(false);
      resetForm();
      await onReload?.(chapterSlug);
    } catch (err) {
      onError?.(err.message || 'Suppression du repère impossible');
    }
  }

  const handleMapClick = useCallback((pct, event) => {
    if (zoneEditActive) {
      handleZoneMapClick(pct, event);
      return;
    }
    if (!isAddMode) return;
    if (event.target.closest('.gl-board-marker')) return;
    setSelectedMarkerId(null);
    setMarkerForm((prev) => ({
      ...prev,
      xPct: Number(pct.x.toFixed(2)),
      yPct: Number(pct.y.toFixed(2)),
    }));
  }, [zoneEditActive, handleZoneMapClick, isAddMode]);

  const mapCursor = zoneEditActive ? zoneMapCursor : (isAddMode ? 'crosshair' : 'default');

  const toggleMarkerAddMode = () => {
    if (zoneMode === 'draw') {
      zoneEditor.cancelDrawMode();
    }
    resetForm();
    setIsAddMode((prev) => !prev);
  };

  const handleDeleteZone = useCallback(async (zoneId) => {
    try {
      await deleteZone(zoneId);
      onInfo?.('Zone supprimée');
    } catch (err) {
      onError?.(err.message || 'Suppression de la zone impossible');
    }
  }, [deleteZone, onInfo, onError]);

  return (
    <section className="gl-chapter-map-studio">
      {zonesError ? <p className="gl-error">{zonesError}</p> : null}

      <GLKingdomZoneSidePanels
        zoneEditor={zoneEditor}
        zoneMusicEnabled={zoneMusicEnabled}
        onDeleteZone={handleDeleteZone}
        fetchMediaLibrary={fetchMediaLibraryWithInfo}
        uploadMediaLibrary={uploadMediaLibraryWithInfo}
        removeMediaLibrary={removeMediaLibraryWithInfo}
        variant="toolbars"
        showZonesHeading={false}
      />

      <div className="gl-map-editor-toolbar gl-map-editor-toolbar--markers">
        <button
          type="button"
          className={isAddMode ? 'is-active' : ''}
          disabled={zoneEditActive}
          onClick={toggleMarkerAddMode}
        >
          {isAddMode ? 'Annuler ajout' : 'Ajouter un repère'}
        </button>
      </div>

      <GLPctMapCanvas
        imageUrl={mapImageUrl}
        imageAlt={chapterTitle || 'Carte du chapitre (édition)'}
        mapGestures={mapGestures}
        imageStyle={imageStyle}
        className="gl-kingdom-map gl-chapter-map-studio__canvas"
        imageClassName="gl-kingdom-map-image"
        cursor={mapCursor}
        onMapClick={handleMapClick}
      >
        <GLKingdomZoneMapOverlay
          zoneEditor={zoneEditor}
          mapGestures={mapGestures}
          onZonePolygonClick={(zoneId) => selectZone(zoneId)}
        />
        <GLBoardMarkers
          markers={editableMarkers}
          selectedMarkerId={selectedMarkerId}
          onMarkerClick={(marker) => selectMarker(marker)}
          onMarkerPointerDown={(event, marker) => {
            if (isAddMode || zoneEditActive) return;
            event.preventDefault();
            selectMarker(marker);
            setDragState({ markerId: marker.id });
          }}
        />
      </GLPctMapCanvas>

      <p className="gl-hint">
        Dessinez une zone par clics successifs (minimum 3 points), ou placez des repères sur la même carte.
        {zoneMusicEnabled ? ' Associez une piste audio par zone pour l’ambiance sur la carte de jeu (onglet Cartes).' : ''}
      </p>

      <h4 className="gl-chapter-map-studio__subtitle">Repères</h4>
      <ul className="gl-markers-list">
        {editableMarkers.map((marker) => (
          <li
            key={marker.id}
            data-marker-id={marker.id}
            className={Number(marker.id) === Number(selectedMarkerId) ? 'is-selected' : ''}
          >
            <button
              type="button"
              className="gl-marker-row-btn"
              disabled={zoneEditActive}
              onClick={() => selectMarker(marker)}
            >
              <MarkerListVisual marker={marker} />
              <strong>{marker.label}</strong>
              {' '}
              —
              x:
              {Number(marker.x_pct).toFixed(1)}
              %, y:
              {Number(marker.y_pct).toFixed(1)}
              %
            </button>
          </li>
        ))}
        {editableMarkers.length === 0 ? (
          <li className="gl-empty gl-hint">Aucun repère. Activez « Ajouter un repère » puis cliquez sur la carte.</li>
        ) : null}
      </ul>

      <form className="gl-form" onSubmit={submitMarker}>
        <label>
          Label
          <input value={markerForm.label} onChange={(event) => setField('label', event.target.value)} required />
        </label>
        <label>
          x (%)
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={markerForm.xPct}
            onChange={(event) => setField('xPct', event.target.value)}
            readOnly={isAddMode}
          />
        </label>
        <label>
          y (%)
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={markerForm.yPct}
            onChange={(event) => setField('yPct', event.target.value)}
            readOnly={isAddMode}
          />
        </label>
        <label>
          Description
          <input value={markerForm.description} onChange={(event) => setField('description', event.target.value)} />
        </label>

        <GLMarkerEventEditor
          marker={selectedMarker}
          chapterBiomes={chapterBiomes}
          onChange={handleEventDraftChange}
        />

        <GLMarkerAppearanceEditor
          value={appearanceForm}
          onChange={setAppearanceForm}
          eventType={eventDraft?.eventType}
          fetchMediaLibrary={fetchMediaLibraryWithInfo}
          uploadMediaLibrary={uploadMediaLibraryWithInfo}
          removeMediaLibrary={removeMediaLibraryWithInfo}
        />

        <label>
          Ordre
          <input type="number" value={markerForm.orderIndex} onChange={(event) => setField('orderIndex', event.target.value)} />
        </label>
        <div className="gl-inline-actions">
          <GLButton type="submit" disabled={saving || zoneEditActive} loading={saving}>
            {selectedMarker ? 'Enregistrer le repère' : 'Ajouter le repère'}
          </GLButton>
          {selectedMarker ? (
            <GLButton type="button" variant="danger" onClick={deleteMarker} disabled={zoneEditActive}>
              Supprimer
            </GLButton>
          ) : null}
        </div>
      </form>

      <GLKingdomZoneSidePanels
        zoneEditor={zoneEditor}
        zoneMusicEnabled={zoneMusicEnabled}
        onDeleteZone={handleDeleteZone}
        fetchMediaLibrary={fetchMediaLibraryWithInfo}
        uploadMediaLibrary={uploadMediaLibraryWithInfo}
        removeMediaLibrary={removeMediaLibraryWithInfo}
        variant="panels"
      />
    </section>
  );
}
