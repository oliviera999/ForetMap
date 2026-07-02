import { useCallback, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { findZoneTriggeredOnMove } from '../utils/glZoneContentDetect.js';
import { MAP_VIEW_MASCOT_MOVE_MS } from '../../utils/mapViewMascotMotion.js';
import { useGLRecentPresentation, useGLZonePresence } from './useGLZonePresence.js';

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
  const { wasRecentPresentation, markRecentPresentation } = useGLRecentPresentation();
  const [popover, setPopover] = useState(null);

  const closePopover = useCallback(() => {
    setPopover(null);
  }, []);

  const presentZoneContent = useCallback(
    async (zone, teamId) => {
      if (!gameId || !zone?.id || teamId == null) return;
      if (wasRecentPresentation(presentationKey(teamId, zone.id))) return;

      markRecentPresentation(presentationKey(teamId, zone.id));
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

  const resolveZoneOnMove = useCallback(
    (prev, next) => {
      if (!gameId || qcmOpen) return null;
      return findZoneTriggeredOnMove(prev, next, kingdomZones);
    },
    [gameId, qcmOpen, kingdomZones],
  );

  const { handlePositionChange } = useGLZonePresence({
    enabled,
    watchTeamId,
    resolveZoneOnMove,
    moveDelayMs,
    onEnter: presentZoneContent,
  });

  return {
    popover,
    closePopover,
    handlePositionChange,
  };
}
