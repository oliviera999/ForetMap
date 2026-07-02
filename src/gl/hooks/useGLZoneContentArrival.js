import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { findZoneTriggeredOnMove } from '../utils/glZoneContentDetect.js';
import { MAP_VIEW_MASCOT_MOVE_MS } from '../../utils/mapViewMascotMotion.js';

const PRESENT_DEDUPE_MS = 3000;

function presentationKey(teamId, zoneId) {
  return `${Number(teamId)}:${Number(zoneId)}`;
}

/**
 * Détecte l'entrée ou la traversée d'une zone avec contenu et déclenche le popover.
 */
export function useGLZoneContentArrival({
  kingdomZones = [],
  gameId,
  watchTeamId,
  enabled = true,
  moveDelayMs = MAP_VIEW_MASCOT_MOVE_MS,
  qcmOpen = false,
}) {
  const prevPctByTeamRef = useRef(new Map());
  const recentPresentRef = useRef({ key: '', at: 0 });
  const [popover, setPopover] = useState(null);
  const pendingTimerRef = useRef(null);

  const wasRecentPresentation = useCallback((teamId, zoneId, windowMs = PRESENT_DEDUPE_MS) => {
    const { key, at } = recentPresentRef.current;
    return key === presentationKey(teamId, zoneId) && Date.now() - at < windowMs;
  }, []);

  const markRecentPresentation = useCallback((teamId, zoneId) => {
    recentPresentRef.current = {
      key: presentationKey(teamId, zoneId),
      at: Date.now(),
    };
  }, []);

  const closePopover = useCallback(() => {
    setPopover(null);
  }, []);

  const presentZoneContent = useCallback(
    async (zone, teamId) => {
      if (!gameId || !zone?.id || teamId == null) return;
      if (wasRecentPresentation(teamId, zone.id)) return;

      markRecentPresentation(teamId, zone.id);
      setPopover({
        zone,
        teamId,
        loading: true,
        error: '',
        popoverMarkdown: null,
        popoverImages: [],
      });
      try {
        const data = await apiGL(
          `/api/gl/games/${gameId}/zones/${zone.id}/present-content`,
          'POST',
          { teamId },
        );
        setPopover({
          zone: data?.zone || zone,
          teamId,
          loading: false,
          error: '',
          popoverMarkdown: data?.popoverMarkdown ?? null,
          popoverImages: Array.isArray(data?.popoverImages) ? data.popoverImages : [],
        });
      } catch (err) {
        if (err?.status === 409) {
          setPopover(null);
          return;
        }
        setPopover({
          zone,
          teamId,
          loading: false,
          error: err.message || 'Présentation impossible',
          popoverMarkdown: null,
          popoverImages: [],
        });
      }
    },
    [gameId, wasRecentPresentation, markRecentPresentation],
  );

  const schedulePresentOnMove = useCallback(
    (prev, next, teamId) => {
      if (!enabled || !gameId || teamId == null || qcmOpen) return undefined;
      const zone = findZoneTriggeredOnMove(prev, next, kingdomZones);
      if (!zone) return undefined;
      const delay = Math.max(0, Number(moveDelayMs) || 0);
      if (pendingTimerRef.current) window.clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = window.setTimeout(() => {
        pendingTimerRef.current = null;
        presentZoneContent(zone, Number(teamId));
      }, delay);
      return () => {
        if (pendingTimerRef.current) {
          window.clearTimeout(pendingTimerRef.current);
          pendingTimerRef.current = null;
        }
      };
    },
    [enabled, gameId, kingdomZones, moveDelayMs, qcmOpen, presentZoneContent],
  );

  useEffect(
    () => () => {
      if (pendingTimerRef.current) window.clearTimeout(pendingTimerRef.current);
    },
    [],
  );

  const handlePositionChange = useCallback(
    (pct) => {
      if (!enabled || watchTeamId == null || !pct) return undefined;
      const teamKey = Number(watchTeamId);
      const prev = prevPctByTeamRef.current.get(teamKey);
      if (!prevPctByTeamRef.current.has(teamKey)) {
        prevPctByTeamRef.current.set(teamKey, { xp: pct.xp, yp: pct.yp });
        return undefined;
      }
      if (prev.xp === pct.xp && prev.yp === pct.yp) return undefined;
      const cleanup = schedulePresentOnMove(prev, pct, teamKey);
      prevPctByTeamRef.current.set(teamKey, { xp: pct.xp, yp: pct.yp });
      return cleanup;
    },
    [enabled, watchTeamId, schedulePresentOnMove],
  );

  return {
    popover,
    closePopover,
    handlePositionChange,
  };
}
