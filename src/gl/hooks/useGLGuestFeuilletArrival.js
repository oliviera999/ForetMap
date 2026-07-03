import { useCallback, useEffect, useRef, useState } from 'react';
import { findZoneTriggeredOnMoveGeneric } from '../utils/glMapZoneDetect.js';
import { MAP_VIEW_MASCOT_MOVE_MS } from '../../utils/mapViewMascotMotion.js';
import { useGLRecentPresentation, useGLZonePresence } from './useGLZonePresence.js';

function presentationKey(teamId, zoneId) {
  return `${Number(teamId)}:${String(zoneId)}`;
}

const feuilletZoneDetectOptions = (isEligible) => ({
  getZonePoints: (zone) => zone.points,
  isZoneEligible: isEligible,
});

/**
 * Détection traversée zone feuillet — Mode Découverte (aucun appel réseau).
 */
export function useGLGuestFeuilletArrival({
  feuilletZones = [],
  watchTeamId,
  presentedZoneIds = [],
  enabled = true,
  moveDelayMs = MAP_VIEW_MASCOT_MOVE_MS,
  onZonePresented,
}) {
  const { wasRecentPresentation, markRecentPresentation } = useGLRecentPresentation();
  const [popover, setPopover] = useState(null);
  const presentedSet = useRef(new Set(presentedZoneIds.map(String)));

  useEffect(() => {
    presentedSet.current = new Set(presentedZoneIds.map(String));
  }, [presentedZoneIds]);

  const closePopover = useCallback(() => {
    setPopover(null);
  }, []);

  const markPresentedLocal = useCallback((zoneId) => {
    presentedSet.current.add(String(zoneId));
  }, []);

  const isZoneEligible = useCallback((zone) => {
    if (!zone?.zoneId) return false;
    return !presentedSet.current.has(String(zone.zoneId));
  }, []);

  const presentFeuilletZone = useCallback(
    (zone, teamId) => {
      if (!zone?.zoneId || teamId == null) return;
      const dedupeKey = presentationKey(teamId, zone.zoneId);
      if (wasRecentPresentation(dedupeKey)) return;
      markRecentPresentation(dedupeKey);

      markPresentedLocal(zone.zoneId);
      setPopover({
        zone,
        teamId,
        loading: false,
        error: '',
        titre: zone.titre,
        popover: zone.popover,
        coutGemme: zone.coutGemme,
        gainCoeur: zone.gainCoeur,
        vitality: null,
      });
      onZonePresented?.(zone);
    },
    [markPresentedLocal, onZonePresented, wasRecentPresentation, markRecentPresentation],
  );

  const resolveZoneOnMove = useCallback(
    (prev, next) => {
      if (!feuilletZones.length) return null;
      return findZoneTriggeredOnMoveGeneric(
        prev,
        next,
        feuilletZones,
        feuilletZoneDetectOptions(isZoneEligible),
      );
    },
    [feuilletZones, isZoneEligible],
  );

  const { handlePositionChange } = useGLZonePresence({
    enabled,
    watchTeamId,
    resolveZoneOnMove,
    moveDelayMs,
    onEnter: presentFeuilletZone,
  });

  return {
    popover,
    closePopover,
    handlePositionChange,
    markPresentedLocal,
  };
}
