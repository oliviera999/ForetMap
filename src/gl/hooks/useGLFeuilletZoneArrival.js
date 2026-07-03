import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
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
 * Détecte la traversée d'une zone feuillet et déclenche le popover (une fois par équipe).
 */
export function useGLFeuilletZoneArrival({
  feuilletZones = [],
  gameId,
  watchTeamId,
  presentedZoneIds = [],
  presentedZonesReady = true,
  enabled = true,
  moveDelayMs = MAP_VIEW_MASCOT_MOVE_MS,
  qcmOpen = false,
  loreCarnetEnabled = false,
  onZonePresented,
}) {
  const { wasRecentPresentation, markRecentPresentation } = useGLRecentPresentation();
  const [popover, setPopover] = useState(null);
  const presentedSet = useRef(new Set(presentedZoneIds.map(String)));

  useEffect(() => {
    const merged = new Set(presentedZoneIds.map(String));
    for (const zoneId of presentedSet.current) merged.add(zoneId);
    presentedSet.current = merged;
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
    async (zone, teamId) => {
      if (!gameId || !zone?.zoneId || teamId == null) return;
      const dedupeKey = presentationKey(teamId, zone.zoneId);
      if (wasRecentPresentation(dedupeKey)) return;
      markRecentPresentation(dedupeKey);

      setPopover({
        zone,
        teamId,
        loading: true,
        error: '',
        titre: zone.titre,
        popover: zone.popover,
        coutGemme: zone.coutGemme,
        gainCoeur: zone.gainCoeur,
        vitality: null,
      });

      try {
        const data = await apiGL(
          `/api/gl/games/${gameId}/feuillet-zones/${encodeURIComponent(zone.zoneId)}/present`,
          'POST',
          { teamId },
        );
        markPresentedLocal(zone.zoneId);
        onZonePresented?.(zone.zoneId);
        setPopover({
          zone: data?.zone ? { ...zone, ...data.zone } : zone,
          teamId,
          loading: false,
          error: '',
          titre: data?.zone?.titre || zone.titre,
          popover: data?.zone?.popover || zone.popover,
          coutGemme: data?.zone?.coutGemme ?? zone.coutGemme,
          gainCoeur: data?.zone?.gainCoeur ?? zone.gainCoeur,
          vitality: data?.vitality || null,
        });

        if (loreCarnetEnabled && zone.feuilletCode) {
          apiGL(
            `/api/gl/lore/games/${gameId}/feuillets/${encodeURIComponent(zone.feuilletCode)}/present`,
            'POST',
            { teamId },
          ).catch(() => {
            /* carnet optionnel */
          });
        }
      } catch (err) {
        if (err?.status === 409) {
          markPresentedLocal(zone.zoneId);
          onZonePresented?.(zone.zoneId);
          setPopover(null);
          return;
        }
        setPopover({
          zone,
          teamId,
          loading: false,
          error: err.message || 'Présentation impossible',
          titre: zone.titre,
          popover: zone.popover,
          coutGemme: zone.coutGemme,
          gainCoeur: zone.gainCoeur,
          vitality: null,
        });
      }
    },
    [
      gameId,
      loreCarnetEnabled,
      markPresentedLocal,
      onZonePresented,
      wasRecentPresentation,
      markRecentPresentation,
    ],
  );

  const resolveZoneOnMove = useCallback(
    (prev, next) => {
      if (!gameId || qcmOpen || !feuilletZones.length || !presentedZonesReady) return null;
      return findZoneTriggeredOnMoveGeneric(
        prev,
        next,
        feuilletZones,
        feuilletZoneDetectOptions(isZoneEligible),
      );
    },
    [gameId, qcmOpen, feuilletZones, presentedZonesReady, isZoneEligible],
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
