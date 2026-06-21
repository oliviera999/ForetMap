import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getRuntimeFeuilletZonesForPlateau } from '../data/glFeuilletZonesBundle.js';
import { useGlPctMapGestures } from '../hooks/useGlPctMapGestures.js';
import { GLPctMapCanvas } from './GLPctMapCanvas.jsx';
import { GLPlateauMapEditor } from './GLPlateauMapEditor.jsx';
import { plateauBoardImg, GL_ASSET_PLACEHOLDER_URL } from '../assets/index.js';
import { resolveGlBoardImageUrl } from '../utils/glLegacyMediaUrl.js';
import { useGlAssetsReady } from './GLFeuilletIllustration.jsx';

/**
 * Éditeur autonome des zones feuillets (admin chapitres).
 */
export function GLFeuilletZonePlateauPanel({
  plateauNumber,
  mapImageUrl = null,
  mapImageFrame = null,
}) {
  const assetsReady = useGlAssetsReady();
  const mapGestures = useGlPctMapGestures();
  const initialZones = useMemo(
    () => getRuntimeFeuilletZonesForPlateau(plateauNumber),
    [plateauNumber],
  );
  const [zones, setZones] = useState(initialZones);
  const [placementHandlers, setPlacementHandlers] = useState({
    handleMapClick: null,
    mapCursor: 'default',
  });

  useEffect(() => {
    setZones(initialZones);
  }, [initialZones]);

  const conventionBoard = useMemo(() => {
    if (!assetsReady || !plateauNumber) return null;
    return plateauBoardImg(plateauNumber);
  }, [assetsReady, plateauNumber]);

  const imageUrl = useMemo(
    () =>
      resolveGlBoardImageUrl({
        mapImageUrl,
        conventionBoard,
        conventionChapter: null,
        placeholderUrl: GL_ASSET_PLACEHOLDER_URL,
      }),
    [mapImageUrl, conventionBoard],
  );

  const handlePlacementReady = useCallback((handlers) => {
    setPlacementHandlers(handlers);
  }, []);

  if (!plateauNumber || plateauNumber < 1 || plateauNumber > 5) {
    return (
      <p className="gl-hint">Renseignez un numéro de plateau narratif (1–5) pour éditer les zones feuillets.</p>
    );
  }

  return (
    <section className="gl-feuillet-zone-plateau-panel">
      <GLPctMapCanvas
        imageUrl={imageUrl}
        imageAlt={`Plateau ${plateauNumber} — zones feuillets`}
        mapGestures={mapGestures}
        className="gl-board gl-feuillet-zone-plateau-panel__canvas"
        cursor={placementHandlers.mapCursor}
        onMapClick={(pct, event) => placementHandlers.handleMapClick?.(pct, event)}
      >
        <GLPlateauMapEditor
          zones={zones}
          onZonesChange={setZones}
          mapGestures={mapGestures}
          plateauNumber={plateauNumber}
          showMarkers={false}
          showZones
          panelTitle="Zones feuillets — édition"
          onPlacementReady={handlePlacementReady}
        />
      </GLPctMapCanvas>
    </section>
  );
}
