import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AutoSaveStatus } from '../../shared/components/AutoSaveStatus.jsx';
import { useDebouncedAutoSave } from '../../shared/hooks/useDebouncedAutoSave.js';
import { apiGL } from '../services/apiGL.js';
import { useGlPctMapGestures } from '../hooks/useGlPctMapGestures.js';
import { GLPctMapCanvas } from './GLPctMapCanvas.jsx';
import { GLBoardMarkers } from './GLBoardMarkers.jsx';
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
import { GLChapterMarkerListVisual } from './GLChapterMarkerListVisual.jsx';

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
  return <GLChapterMarkerListVisual marker={marker} />;
}

export function GLChapterMapEditor({
  chapterId,
  chapterSlug,
  chapterBiomes = [],
  mapImageUrl,
  mapImageFrame,
  markers,
  onReload,
  onError,
  onInfo,
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
    [mapImageFrame],
  );

  const fetchMediaLibrary = useCallback(async () => {
    const data = await apiGL('/api/gl/admin/media-library?limit=400');
    return Array.isArray(data?.items) ? data.items : [];
  }, []);

  const uploadMediaLibrary = useCallback(
    async (mediaData) => {
      await apiGL('/api/gl/admin/media-library', 'POST', { media_data: mediaData });
      onInfo?.('Média ajouté à la bibliothèque');
    },
    [onInfo],
  );

  const removeMediaLibrary = useCallback(
    async (relativePath) => {
      await apiGL('/api/gl/admin/media-library', 'DELETE', { relative_path: relativePath });
      onInfo?.('Média supprimé de la bibliothèque');
    },
    [onInfo],
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
    if (!dragState || !mapGestures?.toImagePct) return undefined;
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
  }, [dragState, mapGestures, editableMarkers, onError, onInfo, onReload, chapterSlug]);

  function setField(key, value) {
    setMarkerForm((prev) => ({ ...prev, [key]: value }));
  }

  function selectMarker(marker) {
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
    event?.preventDefault?.();
  }

  const markerDraft = useMemo(
    () => ({ markerForm, eventDraft, appearanceForm }),
    [markerForm, eventDraft, appearanceForm],
  );

  const persistMarker = useCallback(async () => {
    if (!chapterId) return markerDraft;
    const payload = toMarkerPayload(markerForm, eventDraft, appearanceForm);
    if (!payload.label) throw new Error('Le label du repère est requis');
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
      return markerDraft;
    } catch (err) {
      onError?.(err.message || 'Enregistrement du repère impossible');
      throw err;
    } finally {
      setSaving(false);
    }
  }, [
    chapterId,
    markerForm,
    eventDraft,
    appearanceForm,
    selectedMarkerId,
    isAddMode,
    onInfo,
    onError,
    onReload,
    chapterSlug,
    markerDraft,
  ]);

  const { status: markerSaveStatus, error: markerSaveError } = useDebouncedAutoSave({
    value: markerDraft,
    resetKey: selectedMarkerId ?? (isAddMode ? 'add' : 'none'),
    enabled:
      Boolean(chapterId) &&
      (selectedMarkerId != null || isAddMode) &&
      String(markerForm.label || '').trim().length > 0,
    onSave: persistMarker,
  });

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

  return (
    <section className="gl-chapter-map-editor">
      <div className="gl-map-editor-toolbar">
        <button
          type="button"
          className={isAddMode ? 'is-active' : ''}
          onClick={() => {
            resetForm();
            setIsAddMode((prev) => !prev);
          }}
        >
          {isAddMode ? 'Annuler ajout' : 'Ajouter un repère'}
        </button>
      </div>

      <GLPctMapCanvas
        imageUrl={mapImageUrl}
        imageAlt="Carte du chapitre (édition)"
        mapGestures={mapGestures}
        imageStyle={imageStyle}
        cursor={isAddMode ? 'crosshair' : 'default'}
        onMapClick={(pct, event) => {
          if (!isAddMode) return;
          if (event.target.closest('.gl-board-marker')) return;
          setSelectedMarkerId(null);
          setMarkerForm((prev) => ({
            ...prev,
            xPct: Number(pct.x.toFixed(2)),
            yPct: Number(pct.y.toFixed(2)),
          }));
        }}
      >
        <GLBoardMarkers
          markers={editableMarkers}
          selectedMarkerId={selectedMarkerId}
          onMarkerClick={(marker) => selectMarker(marker)}
          onMarkerPointerDown={(event, marker) => {
            if (isAddMode) return;
            event.preventDefault();
            selectMarker(marker);
            setDragState({ markerId: marker.id });
          }}
        />
      </GLPctMapCanvas>

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
              onClick={() => selectMarker(marker)}
            >
              <MarkerListVisual marker={marker} />
              <strong>{marker.label}</strong> — x:
              {Number(marker.x_pct).toFixed(1)}
              %, y:
              {Number(marker.y_pct).toFixed(1)}%
            </button>
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

        <GLMarkerEventEditor
          marker={selectedMarker}
          chapterBiomes={chapterBiomes}
          onChange={handleEventDraftChange}
        />

        <GLMarkerAppearanceEditor
          value={appearanceForm}
          onChange={setAppearanceForm}
          eventType={eventDraft?.eventType}
          fetchMediaLibrary={fetchMediaLibrary}
          uploadMediaLibrary={uploadMediaLibrary}
          removeMediaLibrary={removeMediaLibrary}
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
          <AutoSaveStatus status={markerSaveStatus} error={markerSaveError} className="gl-hint" />
          {selectedMarker ? (
            <GLButton type="button" variant="danger" onClick={deleteMarker}>
              Supprimer
            </GLButton>
          ) : null}
        </div>
      </form>
    </section>
  );
}
