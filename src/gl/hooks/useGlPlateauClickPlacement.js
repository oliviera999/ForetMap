import { useCallback, useMemo, useState } from 'react';

const IGNORE_CLICK_SELECTORS =
  '.gl-board-marker, .gl-feuillet-zone-polygon, .gl-feuillet-zone-handle';

function isIgnoredMapClickTarget(event) {
  return Boolean(event?.target?.closest?.(IGNORE_CLICK_SELECTORS));
}

/**
 * Sélection + placement au clic pour zones feuillets et repères sur le plateau.
 */
export function useGlPlateauClickPlacement({
  onFeuilletZoneMove,
  onMarkerMove,
  initialTarget = null,
} = {}) {
  const [selectedTarget, setSelectedTarget] = useState(initialTarget);

  const selectFeuilletZone = useCallback((zoneId) => {
    if (!zoneId) {
      setSelectedTarget(null);
      return;
    }
    setSelectedTarget({ kind: 'feuilletZone', zoneId: String(zoneId) });
  }, []);

  const selectMarker = useCallback((markerId) => {
    if (markerId == null) {
      setSelectedTarget(null);
      return;
    }
    setSelectedTarget({ kind: 'marker', id: Number(markerId) });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedTarget(null);
  }, []);

  const handleMapClick = useCallback(
    (pct, event) => {
      if (!selectedTarget || isIgnoredMapClickTarget(event)) return false;
      if (selectedTarget.kind === 'feuilletZone') {
        onFeuilletZoneMove?.(selectedTarget.zoneId, pct);
        return true;
      }
      if (selectedTarget.kind === 'marker') {
        onMarkerMove?.(selectedTarget.id, pct);
        return true;
      }
      return false;
    },
    [selectedTarget, onFeuilletZoneMove, onMarkerMove],
  );

  const mapCursor = selectedTarget ? 'crosshair' : 'default';

  const selectedFeuilletZoneId =
    selectedTarget?.kind === 'feuilletZone' ? selectedTarget.zoneId : null;
  const selectedMarkerId = selectedTarget?.kind === 'marker' ? selectedTarget.id : null;

  return useMemo(
    () => ({
      selectedTarget,
      selectedFeuilletZoneId,
      selectedMarkerId,
      selectFeuilletZone,
      selectMarker,
      clearSelection,
      handleMapClick,
      mapCursor,
    }),
    [
      selectedTarget,
      selectedFeuilletZoneId,
      selectedMarkerId,
      selectFeuilletZone,
      selectMarker,
      clearSelection,
      handleMapClick,
      mapCursor,
    ],
  );
}
