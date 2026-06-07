import React, { useCallback, useMemo, useState } from 'react';
import { pctPointToNorm, pctPointsToNormPolygon } from '../../utils/glNormMapCoords.js';
import { GLFeuilletZoneOverlay } from './GLFeuilletZoneOverlay.jsx';
import { GLButton } from './ui/GLButton.jsx';

function buildExportJson(zones) {
  return {
    format: 'coords normalisees 0-1, origine haut-gauche; superposer sur board_image; declenchement 1ere traversee',
    zones: zones.map((zone) => ({
      zone_id: zone.zoneId,
      plateau: zone.plateau,
      board_image: zone.boardImage || '',
      feuillet_code: zone.feuilletCode,
      titre: zone.titre,
      centre: pctPointToNorm({ x: zone.centreXp, y: zone.centreYp }),
      polygone: pctPointsToNormPolygon(zone.points),
      declenchement: 'traversee_unique',
      cout_gemme: zone.coutGemme,
      gain_coeur: zone.gainCoeur,
      popover: zone.popover,
    })),
  };
}

export function GLFeuilletZoneEditor({
  zones = [],
  onZonesChange,
  presentedZoneIds = [],
  mapGestures,
  plateauNumber = null,
}) {
  const [selectedZoneId, setSelectedZoneId] = useState(zones[0]?.zoneId || null);
  const [info, setInfo] = useState('');
  const [dragState, setDragState] = useState(null);

  const selectedZone = useMemo(
    () => zones.find((z) => z.zoneId === selectedZoneId) || null,
    [zones, selectedZoneId],
  );

  const handlePointerDown = useCallback((event, zoneId) => {
    if (!mapGestures?.toImagePct) return;
    event.preventDefault();
    event.stopPropagation();
    const startPct = mapGestures.toImagePct(event.clientX, event.clientY);
    if (!startPct) return;
    const zone = zones.find((z) => z.zoneId === zoneId);
    if (!zone) return;
    setSelectedZoneId(zoneId);
    setDragState({
      zoneId,
      startXp: startPct.xp,
      startYp: startPct.yp,
      originCentreXp: zone.centreXp,
      originCentreYp: zone.centreYp,
      originPoints: zone.points.map((p) => ({ x: p.x, y: p.y })),
    });
  }, [mapGestures, zones]);

  const handlePointerMove = useCallback((event) => {
    if (!dragState || !mapGestures?.toImagePct) return;
    const pct = mapGestures.toImagePct(event.clientX, event.clientY);
    if (!pct) return;
    const dx = pct.xp - dragState.startXp;
    const dy = pct.yp - dragState.startYp;
    onZonesChange?.(zones.map((zone) => {
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
    }));
  }, [dragState, mapGestures, onZonesChange, zones]);

  const handlePointerUp = useCallback(() => {
    setDragState(null);
  }, []);

  const exportJson = useMemo(() => buildExportJson(zones), [zones]);

  async function copyExport() {
    const text = JSON.stringify(exportJson, null, 1);
    try {
      await navigator.clipboard.writeText(text);
      setInfo('JSON copié dans le presse-papiers');
    } catch {
      setInfo('Copie impossible — utilisez le téléchargement');
    }
  }

  function downloadExport() {
    const blob = new Blob([JSON.stringify(exportJson, null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'zones_feuillets.json';
    anchor.click();
    URL.revokeObjectURL(url);
    setInfo('Téléchargement lancé');
  }

  return (
    <>
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
          selectedZoneId={selectedZoneId}
          onZoneSelect={setSelectedZoneId}
        />
        {zones.map((zone) => (
          <button
            key={`handle-${zone.zoneId}`}
            type="button"
            className={`gl-feuillet-zone-handle${selectedZoneId === zone.zoneId ? ' is-selected' : ''}`}
            style={{
              left: `${zone.centreXp}%`,
              top: `${zone.centreYp}%`,
            }}
            title={`${zone.zoneId} — ${zone.titre}`}
            aria-label={`Déplacer ${zone.titre || zone.zoneId}`}
            onPointerDown={(event) => handlePointerDown(event, zone.zoneId)}
          />
        ))}
      </div>

      <aside className="gl-feuillet-zone-debug-panel" aria-label="Debug zones feuillets">
        <h4>Zones feuillets — édition</h4>
        {plateauNumber ? (
          <p className="gl-hint">Plateau {plateauNumber} — {zones.length} zone(s)</p>
        ) : (
          <p className="gl-hint">Configurez le numéro de plateau sur le chapitre.</p>
        )}
        {info ? <p className="gl-hint">{info}</p> : null}
        <ul className="gl-feuillet-zone-debug-list">
          {zones.map((zone) => {
            const isRead = presentedZoneIds.includes(zone.zoneId);
            return (
              <li key={zone.zoneId}>
                <button
                  type="button"
                  className={selectedZoneId === zone.zoneId ? 'is-active' : ''}
                  onClick={() => setSelectedZoneId(zone.zoneId)}
                >
                  <span>{zone.titre || zone.zoneId}</span>
                  <span className="gl-feuillet-zone-debug-state">{isRead ? 'lue' : 'non lue'}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {selectedZone ? (
          <p className="gl-hint gl-feuillet-zone-debug-coords">
            {selectedZone.zoneId} — centre {selectedZone.centreXp.toFixed(2)} % / {selectedZone.centreYp.toFixed(2)} %
          </p>
        ) : null}
        <div className="gl-feuillet-zone-debug-actions">
          <GLButton type="button" variant="secondary" onClick={copyExport}>Copier JSON</GLButton>
          <GLButton type="button" onClick={downloadExport}>Télécharger JSON</GLButton>
        </div>
      </aside>
    </>
  );
}
