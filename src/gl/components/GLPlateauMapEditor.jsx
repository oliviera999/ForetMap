import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { translateFeuilletZoneToPoint } from '../../shared/pct-map/pctPolygon.js';
import { buildFeuilletZonesExportJson } from '../utils/glFeuilletZoneExport.js';
import {
  buildFeuilletZoneNumberMap,
  sortFeuilletZonesForDisplay,
} from '../utils/glFeuilletZoneNumbers.js';
import { useGlPlateauClickPlacement } from '../hooks/useGlPlateauClickPlacement.js';
import { GLFeuilletZoneOverlay } from './GLFeuilletZoneOverlay.jsx';
import { GLButton } from './ui/GLButton.jsx';

const GLPlateauMapEditorContext = createContext(null);

function useGLPlateauMapEditorContext() {
  const ctx = useContext(GLPlateauMapEditorContext);
  if (!ctx) {
    throw new Error('Composant plateau éditeur utilisé hors GLPlateauMapEditorProvider');
  }
  return ctx;
}

function useGLPlateauMapEditorState({
  zones = [],
  onZonesChange,
  markers = [],
  editableMarkers = null,
  onEditableMarkersChange,
  onMarkerSave,
  presentedZoneIds = [],
  mapGestures,
  plateauNumber = null,
  showMarkers = true,
  showZones = true,
  panelTitle = 'Édition plateau',
  onPlacementReady,
}) {
  const [selectedZoneId, setSelectedZoneId] = useState(zones[0]?.zoneId || null);
  const [info, setInfo] = useState('');
  const [dragState, setDragState] = useState(null);
  const [markerInfo, setMarkerInfo] = useState('');

  const displayMarkers = editableMarkers ?? markers;

  const zonesInDisplayOrder = useMemo(() => sortFeuilletZonesForDisplay(zones), [zones]);

  const zoneNumbers = useMemo(
    () => buildFeuilletZoneNumberMap(zonesInDisplayOrder, 1),
    [zonesInDisplayOrder],
  );

  const initialPlacementTarget = useMemo(() => {
    const zoneId = zones[0]?.zoneId;
    if (!showZones || !zoneId) return null;
    return { kind: 'feuilletZone', zoneId: String(zoneId) };
  }, [showZones, zones]);

  const handleFeuilletZoneMove = useCallback(
    (zoneId, pct) => {
      const target = { x: pct.x ?? pct.xp, y: pct.y ?? pct.yp };
      onZonesChange?.(
        zones.map((zone) =>
          zone.zoneId === zoneId ? translateFeuilletZoneToPoint(zone, target) : zone,
        ),
      );
    },
    [zones, onZonesChange],
  );

  const handleMarkerMove = useCallback(
    async (markerId, pct) => {
      const x = Number((pct.x ?? pct.xp).toFixed(2));
      const y = Number((pct.y ?? pct.yp).toFixed(2));
      onEditableMarkersChange?.(
        displayMarkers.map((marker) =>
          Number(marker.id) === Number(markerId) ? { ...marker, x_pct: x, y_pct: y } : marker,
        ),
      );
      if (!onMarkerSave) return;
      try {
        await onMarkerSave(markerId, x, y);
        setMarkerInfo('Position du repère mise à jour');
      } catch (err) {
        setMarkerInfo(err?.message || 'Déplacement du repère impossible');
      }
    },
    [displayMarkers, onEditableMarkersChange, onMarkerSave],
  );

  const placement = useGlPlateauClickPlacement({
    initialTarget: initialPlacementTarget,
    onFeuilletZoneMove: showZones ? handleFeuilletZoneMove : undefined,
    onMarkerMove: showMarkers ? handleMarkerMove : undefined,
  });

  const selectedZone = useMemo(
    () => zones.find((z) => z.zoneId === selectedZoneId) || null,
    [zones, selectedZoneId],
  );

  useEffect(() => {
    onPlacementReady?.({
      handleMapClick: placement.handleMapClick,
      mapCursor: placement.mapCursor,
      selectedMarkerId: placement.selectedMarkerId,
      selectMarker: placement.selectMarker,
    });
  }, [
    onPlacementReady,
    placement.handleMapClick,
    placement.mapCursor,
    placement.selectedMarkerId,
    placement.selectMarker,
  ]);

  useEffect(() => {
    if (!showZones) return;
    if (selectedZoneId && zones.some((z) => z.zoneId === selectedZoneId)) return;
    const firstId = zones[0]?.zoneId || null;
    setSelectedZoneId(firstId);
    if (firstId) placement.selectFeuilletZone(firstId);
  }, [zones, selectedZoneId, showZones, placement]);

  const selectFeuilletZone = useCallback(
    (zoneId) => {
      setSelectedZoneId(zoneId);
      placement.selectMarker(null);
      placement.selectFeuilletZone(zoneId);
    },
    [placement],
  );

  const selectMarker = useCallback(
    (markerId) => {
      setSelectedZoneId(null);
      placement.selectFeuilletZone(null);
      placement.selectMarker(markerId);
    },
    [placement],
  );

  const handlePointerDown = useCallback(
    (event, zoneId) => {
      if (!mapGestures?.toImagePct) return;
      event.preventDefault();
      event.stopPropagation();
      const startPct = mapGestures.toImagePct(event.clientX, event.clientY);
      if (!startPct) return;
      const zone = zones.find((z) => z.zoneId === zoneId);
      if (!zone) return;
      selectFeuilletZone(zoneId);
      setDragState({
        zoneId,
        startXp: startPct.xp,
        startYp: startPct.yp,
        originCentreXp: zone.centreXp,
        originCentreYp: zone.centreYp,
        originPoints: zone.points.map((p) => ({ x: p.x, y: p.y })),
      });
    },
    [mapGestures, zones, selectFeuilletZone],
  );

  const handlePointerMove = useCallback(
    (event) => {
      if (!dragState || !mapGestures?.toImagePct) return;
      const pct = mapGestures.toImagePct(event.clientX, event.clientY);
      if (!pct) return;
      const dx = pct.xp - dragState.startXp;
      const dy = pct.yp - dragState.startYp;
      onZonesChange?.(
        zones.map((zone) => {
          if (zone.zoneId !== dragState.zoneId) return zone;
          const nextPoints = dragState.originPoints.map((p) => ({
            x: p.x + dx,
            y: p.y + dy,
          }));
          return {
            ...zone,
            points: nextPoints,
            centreXp: dragState.originCentreXp + dx,
            centreYp: dragState.originCentreYp + dy,
            centre: {
              x: dragState.originCentreXp + dx,
              y: dragState.originCentreYp + dy,
            },
          };
        }),
      );
    },
    [dragState, mapGestures, onZonesChange, zones],
  );

  const handlePointerUp = useCallback(() => {
    setDragState(null);
  }, []);

  const exportJson = useMemo(() => buildFeuilletZonesExportJson(zones), [zones]);

  const copyExport = useCallback(async () => {
    const text = JSON.stringify(exportJson, null, 1);
    try {
      await navigator.clipboard.writeText(text);
      setInfo('JSON copié dans le presse-papiers');
    } catch {
      setInfo('Copie impossible — utilisez le téléchargement');
    }
  }, [exportJson]);

  const downloadExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(exportJson, null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'zones_feuillets.json';
    anchor.click();
    URL.revokeObjectURL(url);
    setInfo('Téléchargement lancé');
  }, [exportJson]);

  const activeFeuilletZoneId = placement.selectedFeuilletZoneId ?? selectedZoneId;

  return {
    zones,
    presentedZoneIds,
    showMarkers,
    showZones,
    panelTitle,
    plateauNumber,
    displayMarkers,
    zonesInDisplayOrder,
    zoneNumbers,
    selectedZone,
    info,
    markerInfo,
    dragState,
    activeFeuilletZoneId,
    placement,
    selectFeuilletZone,
    selectMarker,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    copyExport,
    downloadExport,
  };
}

export function GLPlateauMapEditorProvider({ children, ...props }) {
  const value = useGLPlateauMapEditorState(props);
  return (
    <GLPlateauMapEditorContext.Provider value={value}>
      {children}
    </GLPlateauMapEditorContext.Provider>
  );
}

export function GLPlateauMapEditorMapLayer() {
  const {
    zones,
    presentedZoneIds,
    showZones,
    zoneNumbers,
    activeFeuilletZoneId,
    dragState,
    selectFeuilletZone,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  } = useGLPlateauMapEditorContext();

  return (
    <>
      <div className="gl-plateau-edit-banner" role="status">
        Mode édition plateau — sélectionnez un élément puis cliquez sur la carte (ou glissez la
        poignée d’une zone).
      </div>

      {showZones ? (
        <div
          className="gl-feuillet-zone-editor-layer"
          onPointerMove={dragState ? handlePointerMove : undefined}
          onPointerUp={dragState ? handlePointerUp : undefined}
          onPointerLeave={dragState ? handlePointerUp : undefined}
        >
          <GLFeuilletZoneOverlay
            zones={zones}
            presentedZoneIds={presentedZoneIds}
            editMode
            selectedZoneId={activeFeuilletZoneId}
            zoneNumbers={zoneNumbers}
            onZoneSelect={selectFeuilletZone}
          />
          {zones.map((zone) => {
            const zoneNumber = zoneNumbers.get(String(zone.zoneId));
            return (
              <button
                key={`handle-${zone.zoneId}`}
                type="button"
                className={`gl-feuillet-zone-handle${activeFeuilletZoneId === zone.zoneId ? ' is-selected' : ''}`}
                style={{
                  left: `${zone.centreXp}%`,
                  top: `${zone.centreYp}%`,
                }}
                title={
                  zoneNumber != null
                    ? `Zone ${zoneNumber} — ${zone.titre || zone.zoneId}`
                    : `${zone.zoneId} — ${zone.titre}`
                }
                aria-label={
                  zoneNumber != null
                    ? `Déplacer zone ${zoneNumber} — ${zone.titre || zone.zoneId}`
                    : `Déplacer ${zone.titre || zone.zoneId}`
                }
                onPointerDown={(event) => handlePointerDown(event, zone.zoneId)}
              >
                {zoneNumber != null ? (
                  <span className="gl-feuillet-zone-handle__number" aria-hidden>
                    {zoneNumber}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </>
  );
}

export function GLPlateauMapEditorPanel() {
  const {
    panelTitle,
    plateauNumber,
    zones,
    showZones,
    showMarkers,
    displayMarkers,
    zonesInDisplayOrder,
    zoneNumbers,
    presentedZoneIds,
    activeFeuilletZoneId,
    selectedZone,
    info,
    markerInfo,
    placement,
    selectFeuilletZone,
    selectMarker,
    copyExport,
    downloadExport,
  } = useGLPlateauMapEditorContext();

  return (
    <aside className="gl-plateau-edit-panel" aria-label={panelTitle}>
      <h4>{panelTitle}</h4>
      {plateauNumber ? (
        <p className="gl-hint">
          Plateau {plateauNumber}
          {showZones ? ` — ${zones.length} zone(s)` : ''}
          {showMarkers ? ` — ${displayMarkers.length} repère(s)` : ''}
        </p>
      ) : (
        <p className="gl-hint">Configurez le numéro de plateau sur le chapitre.</p>
      )}
      <p className="gl-hint">Sélectionnez un élément puis cliquez sur la carte pour le déplacer.</p>
      {info ? <p className="gl-hint">{info}</p> : null}
      {markerInfo ? <p className="gl-hint">{markerInfo}</p> : null}

      {showZones ? (
        <>
          <h5 className="gl-plateau-edit-panel__subtitle">Zones feuillets</h5>
          <ul className="gl-plateau-edit-list">
            {zonesInDisplayOrder.map((zone) => {
              const isRead = presentedZoneIds.includes(zone.zoneId);
              const zoneNumber = zoneNumbers.get(String(zone.zoneId));
              return (
                <li key={zone.zoneId}>
                  <button
                    type="button"
                    className={activeFeuilletZoneId === zone.zoneId ? 'is-active' : ''}
                    onClick={() => selectFeuilletZone(zone.zoneId)}
                  >
                    {zoneNumber != null ? (
                      <span className="gl-markers-list__path-number" aria-hidden>
                        {zoneNumber}
                      </span>
                    ) : null}
                    <span className="gl-plateau-edit-list__label">{zone.titre || zone.zoneId}</span>
                    <span className="gl-plateau-edit-state">{isRead ? 'lue' : 'non lue'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {selectedZone ? (
            <p className="gl-hint gl-plateau-edit-coords">
              {selectedZone.zoneId} — centre {selectedZone.centreXp.toFixed(2)} % /{' '}
              {selectedZone.centreYp.toFixed(2)} %
            </p>
          ) : null}
          <div className="gl-plateau-edit-actions">
            <GLButton type="button" variant="secondary" onClick={copyExport}>
              Copier JSON
            </GLButton>
            <GLButton type="button" onClick={downloadExport}>
              Télécharger JSON
            </GLButton>
          </div>
        </>
      ) : null}

      {showMarkers ? (
        <>
          <h5 className="gl-plateau-edit-panel__subtitle">Repères</h5>
          <ul className="gl-plateau-edit-list">
            {displayMarkers.map((marker) => (
              <li key={marker.id}>
                <button
                  type="button"
                  className={
                    Number(placement.selectedMarkerId) === Number(marker.id) ? 'is-active' : ''
                  }
                  onClick={() => selectMarker(marker.id)}
                >
                  <span>{marker.label || `Repère ${marker.id}`}</span>
                  <span className="gl-plateau-edit-coords-inline">
                    {Number(marker.x_pct).toFixed(1)} % / {Number(marker.y_pct).toFixed(1)} %
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </aside>
  );
}

/** Éditeur complet (calque carte + panneau sous la carte) — pratique pour les tests isolés. */
export function GLPlateauMapEditor(props) {
  return (
    <GLPlateauMapEditorProvider {...props}>
      <div className="gl-plateau-map-editor">
        <div className="gl-plateau-map-editor__map-slot">
          <GLPlateauMapEditorMapLayer />
        </div>
        <GLPlateauMapEditorPanel />
      </div>
    </GLPlateauMapEditorProvider>
  );
}
