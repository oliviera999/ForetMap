import React, { useCallback, useMemo, useState } from 'react';
import { buildFeuilletZonesExportJson } from '../utils/glFeuilletZoneExport.js';
import { GLPlateauMapEditor } from './GLPlateauMapEditor.jsx';

/**
 * @deprecated Préférer GLPlateauMapEditor (showMarkers={false}).
 */
export function GLFeuilletZoneEditor({
  zones = [],
  onZonesChange,
  presentedZoneIds = [],
  mapGestures,
  plateauNumber = null,
  onPlacementReady,
}) {
  return (
    <GLPlateauMapEditor
      zones={zones}
      onZonesChange={onZonesChange}
      presentedZoneIds={presentedZoneIds}
      mapGestures={mapGestures}
      plateauNumber={plateauNumber}
      showMarkers={false}
      showZones
      panelTitle="Zones feuillets — édition"
      onPlacementReady={onPlacementReady}
    />
  );
}

export { buildFeuilletZonesExportJson };
