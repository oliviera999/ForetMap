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
} from './GLMarkerAppearanceEditor.jsx';
import { glImageFrameToStyle, normalizeGlImageFrame } from '../../utils/glImageFrame.js';
import { defaultEventConfigForQuestion } from '../../utils/glMarkerEventConfig.js';
import { GLButton } from './ui/GLButton.jsx';
import { GLChapterMarkerListVisual } from './GLChapterMarkerListVisual.jsx';
import {
  EMPTY_MARKER_FORM,
  markerDuplicatePayloadFromMarker,
  toFormFromMarker,
  toMarkerPayload,
} from '../utils/glChapterMapStudioForm.js';
import { zoneDuplicateCreatePayloadFromZone } from '../hooks/useGLKingdomZoneEditor.js';

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
  const [effectsDraft, setEffectsDraft] = useState({ effects: null, eventMeta: null });
  const [editableMarkers, setEditableMarkers] = useState([]);
  const [dragState, setDragState] = useState(null);
  const [saving, setSaving] = useState(false);

  const imageStyle = useMemo(
    () => glImageFrameToStyle(normalizeGlImageFrame(mapImageFrame, 'chapter-map')),
    [mapImageFrame],
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

  const handlePreviewZoneMusic = useCallback(
    (url, volume) => {
      if (!zoneMusicEnabled || !url) return;
      previewUrl(url, volume);
    },
    [zoneMusicEnabled, previewUrl],
  );

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

  const uploadMediaLibraryWithInfo = useCallback(
    async (mediaData) => {
      await uploadMediaLibrary(mediaData);
      onInfo?.('Média ajouté à la bibliothèque');
    },
    [uploadMediaLibrary, onInfo],
  );

  const removeMediaLibraryWithInfo = useCallback(
    async (relativePath) => {
      await removeMediaLibrary(relativePath);
      onInfo?.('Média supprimé de la bibliothèque');
    },
    [removeMediaLibrary, onInfo],
  );

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
    [editableMarkers, selectedMarkerId],
  );

  useEffect(() => {
    if (!dragState || !mapGestures?.toImagePct || zoneEditActive) return undefined;
    const onMove = (event) => {
      const pct = mapGestures.toImagePct(event.clientX, event.clientY);
      if (!pct) return;
      setEditableMarkers((prev) =>
        prev.map((marker) =>
          Number(marker.id) === Number(dragState.markerId)
            ? { ...marker, x_pct: pct.x, y_pct: pct.y }
            : marker,
        ),
      );
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
  }, [
    dragState,
    mapGestures,
    editableMarkers,
    onError,
    onInfo,
    onReload,
    chapterSlug,
    zoneEditActive,
  ]);

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
    setEffectsDraft({
      effects: marker.event_config?.effects || null,
      eventMeta: marker.event_config?.eventMeta || null,
    });
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

  async function duplicateMarker(sourceMarker) {
    const marker = sourceMarker || selectedMarker;
    if (!chapterId || !marker) return;
    const payload = markerDuplicatePayloadFromMarker(marker);
    if (!payload?.label) {
      onError?.('Duplication du repère impossible');
      return;
    }
    setSaving(true);
    try {
      await apiGL(`/api/gl/chapters/admin/${chapterId}/markers`, 'POST', payload);
      onInfo?.('Repère dupliqué');
      setIsAddMode(false);
      resetForm();
      await onReload?.(chapterSlug);
    } catch (err) {
      onError?.(err.message || 'Duplication du repère impossible');
    } finally {
      setSaving(false);
    }
  }

  const handleMapClick = useCallback(
    (pct, event) => {
      if (zoneEditActive) {
        handleZoneMapClick(pct, event);
        return;
      }
      if (
        selectedMarkerId != null &&
        !isAddMode &&
        !event.target.closest('.gl-board-marker')
      ) {
        const x = Number(pct.x.toFixed(2));
        const y = Number(pct.y.toFixed(2));
        setEditableMarkers((prev) =>
          prev.map((marker) =>
            Number(marker.id) === Number(selectedMarkerId)
              ? { ...marker, x_pct: x, y_pct: y }
              : marker,
          ),
        );
        setMarkerForm((prev) => ({ ...prev, xPct: x, yPct: y }));
        (async () => {
          try {
            await apiGL(`/api/gl/chapters/admin/markers/${selectedMarkerId}`, 'PUT', {
              xPct: x,
              yPct: y,
            });
            onInfo?.('Position du repère mise à jour');
            await onReload?.(chapterSlug);
          } catch (err) {
            onError?.(err.message || 'Déplacement impossible');
            await onReload?.(chapterSlug);
          }
        })();
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
    },
    [
      zoneEditActive,
      handleZoneMapClick,
      isAddMode,
      selectedMarkerId,
      onInfo,
      onError,
      onReload,
      chapterSlug,
    ],
  );

  const mapCursor =
    zoneEditActive
      ? zoneMapCursor
      : isAddMode || selectedMarkerId != null
        ? 'crosshair'
        : 'default';

  const toggleMarkerAddMode = () => {
    if (zoneMode === 'draw') {
      zoneEditor.cancelDrawMode();
    }
    resetForm();
    setIsAddMode((prev) => !prev);
  };

  const handleDeleteZone = useCallback(
    async (zoneId) => {
      try {
        await deleteZone(zoneId);
        onInfo?.('Zone supprimée');
      } catch (err) {
        onError?.(err.message || 'Suppression de la zone impossible');
      }
    },
    [deleteZone, onInfo, onError],
  );

  const handleDuplicateZone = useCallback(
    async (zoneOrId) => {
      const source =
        typeof zoneOrId === 'object' && zoneOrId != null
          ? zoneOrId
          : zones.find((zone) => Number(zone.id) === Number(zoneOrId));
      if (!source) return;
      const payload = zoneDuplicateCreatePayloadFromZone(source);
      if (!payload) {
        onError?.('Duplication de la zone impossible');
        return;
      }
      try {
        await createZone(payload);
        onInfo?.('Zone dupliquée');
      } catch (err) {
        onError?.(err.message || 'Duplication de la zone impossible');
      }
    },
    [zones, createZone, onInfo, onError],
  );

  return (
    <section className="gl-chapter-map-studio">
      {zonesError ? <p className="gl-error">{zonesError}</p> : null}

      <GLKingdomZoneSidePanels
        zoneEditor={zoneEditor}
        zoneMusicEnabled={zoneMusicEnabled}
        onDeleteZone={handleDeleteZone}
        onDuplicateZone={handleDuplicateZone}
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
        Dessinez une zone par clics successifs (minimum 3 points), ou placez des repères sur la même
        carte. Sélectionnez un repère puis cliquez sur la carte pour le déplacer.
        {zoneMusicEnabled
          ? ' Associez une piste audio par zone pour l’ambiance sur la carte de jeu (onglet Cartes).'
          : ''}
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
              <GLChapterMarkerListVisual marker={marker} />
              <strong>{marker.label}</strong> — x:
              {Number(marker.x_pct).toFixed(1)}
              %, y:
              {Number(marker.y_pct).toFixed(1)}%
            </button>
            {!zoneEditActive ? (
              <GLButton
                type="button"
                size="sm"
                variant="secondary"
                disabled={saving}
                onClick={() => duplicateMarker(marker)}
                title="Dupliquer ce repère"
              >
                Dupliquer
              </GLButton>
            ) : null}
          </li>
        ))}
        {editableMarkers.length === 0 ? (
          <li className="gl-empty gl-hint">
            Aucun repère. Activez « Ajouter un repère » puis cliquez sur la carte.
          </li>
        ) : null}
      </ul>

      <form className="gl-form" onSubmit={submitMarker}>
        <label>
          Label
          <input
            value={markerForm.label}
            onChange={(event) => setField('label', event.target.value)}
            required
          />
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
          <input
            value={markerForm.description}
            onChange={(event) => setField('description', event.target.value)}
          />
        </label>
        <label>
          Sous-biome (slug catalogue)
          <input
            list="gl-chapter-biome-slugs"
            value={markerForm.sousBiomeSlug}
            onChange={(event) => setField('sousBiomeSlug', event.target.value)}
            placeholder="jungle_afc, savane…"
          />
          <datalist id="gl-chapter-biome-slugs">
            {(chapterBiomes || []).map((b) => (
              <option key={b.slug} value={b.slug}>
                {b.nom || b.slug}
              </option>
            ))}
          </datalist>
        </label>
        <label>
          Effet mécanique (résumé)
          <input
            value={markerForm.effetMecanique}
            onChange={(event) => setField('effetMecanique', event.target.value)}
            placeholder="Avance de 2 cases, +1 gemme…"
          />
        </label>

        <GLMarkerEventEditor
          marker={selectedMarker}
          chapterBiomes={chapterBiomes}
          onChange={handleEventDraftChange}
          effectsDraft={effectsDraft}
          onEffectsDraftChange={setEffectsDraft}
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
          <input
            type="number"
            value={markerForm.orderIndex}
            onChange={(event) => setField('orderIndex', event.target.value)}
          />
        </label>
        <div className="gl-inline-actions">
          <GLButton type="submit" disabled={saving || zoneEditActive} loading={saving}>
            {selectedMarker ? 'Enregistrer le repère' : 'Ajouter le repère'}
          </GLButton>
          {selectedMarker ? (
            <>
              <GLButton
                type="button"
                variant="secondary"
                onClick={() => duplicateMarker(selectedMarker)}
                disabled={zoneEditActive || saving}
                loading={saving}
              >
                Dupliquer
              </GLButton>
              <GLButton
                type="button"
                variant="danger"
                onClick={deleteMarker}
                disabled={zoneEditActive}
              >
                Supprimer
              </GLButton>
            </>
          ) : null}
        </div>
      </form>

      <GLKingdomZoneSidePanels
        zoneEditor={zoneEditor}
        zoneMusicEnabled={zoneMusicEnabled}
        onDeleteZone={handleDeleteZone}
        onDuplicateZone={handleDuplicateZone}
        fetchMediaLibrary={fetchMediaLibraryWithInfo}
        uploadMediaLibrary={uploadMediaLibraryWithInfo}
        removeMediaLibrary={removeMediaLibraryWithInfo}
        variant="panels"
      />
    </section>
  );
}
