import React, { useEffect, useMemo, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { useGlPctMapGestures } from '../hooks/useGlPctMapGestures.js';
import { GLPctMapCanvas } from './GLPctMapCanvas.jsx';
import { GLBoardMarkers } from './GLBoardMarkers.jsx';
import { glImageFrameToStyle, normalizeGlImageFrame } from '../../utils/glImageFrame.js';

const EMPTY_MARKER_FORM = {
  label: '',
  xPct: 50,
  yPct: 50,
  eventType: '',
  description: '',
  orderIndex: 0,
};

function toFormFromMarker(marker) {
  if (!marker) return EMPTY_MARKER_FORM;
  return {
    label: marker.label || '',
    xPct: Number(marker.x_pct ?? 50),
    yPct: Number(marker.y_pct ?? 50),
    eventType: marker.event_type || '',
    description: marker.description || '',
    orderIndex: Number(marker.order_index || 0),
  };
}

function toMarkerPayload(form) {
  return {
    label: String(form.label || '').trim(),
    xPct: Number(form.xPct),
    yPct: Number(form.yPct),
    eventType: String(form.eventType || '').trim(),
    description: String(form.description || '').trim(),
    orderIndex: Number(form.orderIndex) || 0,
  };
}

export function GLChapterMapEditor({
  chapterId,
  chapterSlug,
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
  const [editableMarkers, setEditableMarkers] = useState([]);
  const [dragState, setDragState] = useState(null);
  const [saving, setSaving] = useState(false);
  const imageStyle = useMemo(
    () => glImageFrameToStyle(normalizeGlImageFrame(mapImageFrame, 'chapter-map')),
    [mapImageFrame]
  );

  useEffect(() => {
    setEditableMarkers(Array.isArray(markers) ? markers : []);
  }, [markers]);

  useEffect(() => {
    if (selectedMarkerId == null) return;
    if (!editableMarkers.some((m) => Number(m.id) === Number(selectedMarkerId))) {
      setSelectedMarkerId(null);
      setMarkerForm(EMPTY_MARKER_FORM);
    }
  }, [editableMarkers, selectedMarkerId]);

  const selectedMarker = useMemo(
    () => editableMarkers.find((marker) => Number(marker.id) === Number(selectedMarkerId)) || null,
    [editableMarkers, selectedMarkerId]
  );

  useEffect(() => {
    if (!dragState || !mapGestures?.toImagePct) return undefined;
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
  }, [dragState, mapGestures, editableMarkers, onError, onInfo, onReload, chapterSlug]);

  function setField(key, value) {
    setMarkerForm((prev) => ({ ...prev, [key]: value }));
  }

  function selectMarker(marker) {
    setIsAddMode(false);
    setSelectedMarkerId(Number(marker.id));
    setMarkerForm(toFormFromMarker(marker));
  }

  async function submitMarker(event) {
    event.preventDefault();
    if (!chapterId) return;
    const payload = toMarkerPayload(markerForm);
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
      setSelectedMarkerId(null);
      setMarkerForm(EMPTY_MARKER_FORM);
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
      setSelectedMarkerId(null);
      setIsAddMode(false);
      setMarkerForm(EMPTY_MARKER_FORM);
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
            setSelectedMarkerId(null);
            setMarkerForm(EMPTY_MARKER_FORM);
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
            <button type="button" className="gl-marker-row-btn" onClick={() => selectMarker(marker)}>
              <strong>{marker.label}</strong> — x:{Number(marker.x_pct).toFixed(1)}%, y:{Number(marker.y_pct).toFixed(1)}%
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
          Type d'événement
          <input
            value={markerForm.eventType}
            onChange={(event) => setField('eventType', event.target.value)}
            placeholder="quiz, story, start..."
          />
        </label>
        <label>
          Description
          <input value={markerForm.description} onChange={(event) => setField('description', event.target.value)} />
        </label>
        <label>
          Ordre
          <input type="number" value={markerForm.orderIndex} onChange={(event) => setField('orderIndex', event.target.value)} />
        </label>
        <div className="gl-inline-actions">
          <button type="submit" disabled={saving}>
            {selectedMarker ? 'Enregistrer le repère' : 'Ajouter le repère'}
          </button>
          {selectedMarker ? (
            <button type="button" className="gl-danger" onClick={deleteMarker}>
              Supprimer
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
