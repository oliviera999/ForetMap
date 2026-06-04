import React, { useEffect } from 'react';
import { useGlPctMapGestures } from '../hooks/useGlPctMapGestures.js';
import { useGLKingdomZoneEditor } from '../hooks/useGLKingdomZoneEditor.js';
import { GLPctMapCanvas } from './GLPctMapCanvas.jsx';
import { GLKingdomZoneMapOverlay } from './GLKingdomZoneMapOverlay.jsx';
import { GLKingdomZoneSidePanels } from './GLKingdomZoneSidePanels.jsx';

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
  const zoneEditor = useGLKingdomZoneEditor({
    zones,
    canManage,
    zoneMusicEnabled,
    onCreateZone,
    onUpdateZone,
    onDeleteZone,
    onPreviewZoneMusic,
  });

  const {
    selectedZone,
    isEditingShape,
    handleMapClick,
    mapCursor,
    selectZone,
  } = zoneEditor;

  useEffect(() => {
    if (isEditingShape) {
      onSelectedZoneChange?.(null);
      return;
    }
    onSelectedZoneChange?.(selectedZone);
  }, [selectedZone, isEditingShape, onSelectedZoneChange]);

  return (
    <>
      <GLKingdomZoneSidePanels
        zoneEditor={zoneEditor}
        canManage={canManage}
        zoneMusicEnabled={zoneMusicEnabled}
        onDeleteZone={onDeleteZone}
        fetchMediaLibrary={fetchMediaLibrary}
        uploadMediaLibrary={uploadMediaLibrary}
        removeMediaLibrary={removeMediaLibrary}
      />

      <GLPctMapCanvas
        imageUrl={imageUrl}
        imageAlt={chapterTitle || 'Carte du chapitre'}
        mapGestures={mapGestures}
        className="gl-kingdom-map"
        imageClassName="gl-kingdom-map-image"
        cursor={mapCursor}
        onMapClick={handleMapClick}
      >
        <GLKingdomZoneMapOverlay
          zoneEditor={zoneEditor}
          mapGestures={mapGestures}
          onZonePolygonClick={(zoneId) => selectZone(zoneId)}
        />
      </GLPctMapCanvas>
    </>
  );
}
