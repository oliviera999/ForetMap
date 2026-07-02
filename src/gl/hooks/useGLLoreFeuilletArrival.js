import { useCallback, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { findZoneTriggeredOnMove } from '../utils/glZoneContentDetect.js';
import { MAP_VIEW_MASCOT_MOVE_MS } from '../../utils/mapViewMascotMotion.js';
import { useGLRecentPresentation, useGLZonePresence } from './useGLZonePresence.js';

function presentationKey(teamId, zoneId, feuilletCode) {
  return `${Number(teamId)}:${Number(zoneId)}:${feuilletCode || ''}`;
}

/**
 * Détecte l'entrée en zone et propose les feuillets Sélène associés.
 */
export function useGLLoreFeuilletArrival({
  kingdomZones = [],
  gameId,
  watchTeamId,
  enabled = true,
  moveDelayMs = MAP_VIEW_MASCOT_MOVE_MS,
  qcmOpen = false,
}) {
  const { wasRecentPresentation, markRecentPresentation } = useGLRecentPresentation();
  const [discovery, setDiscovery] = useState(null);

  const closeDiscovery = useCallback(() => {
    setDiscovery(null);
  }, []);

  const presentFeuillet = useCallback(
    async (zone, teamId, feuillet) => {
      if (!gameId || !zone?.id || teamId == null || !feuillet?.feuilletCode) return;
      const dedupeKey = presentationKey(teamId, zone.id, feuillet.feuilletCode);
      if (wasRecentPresentation(dedupeKey)) return;
      markRecentPresentation(dedupeKey);

      setDiscovery({
        zone,
        teamId,
        feuillet,
        loading: true,
        error: '',
      });
      try {
        const data = await apiGL(
          `/api/gl/lore/games/${gameId}/feuillets/${encodeURIComponent(feuillet.feuilletCode)}/present`,
          'POST',
          { teamId, kingdomZoneId: zone.id },
        );
        setDiscovery({
          zone,
          teamId,
          feuillet: data?.feuillet || feuillet,
          loading: false,
          error: '',
        });
      } catch (err) {
        if (err?.status === 409) {
          setDiscovery(null);
          return;
        }
        setDiscovery({
          zone,
          teamId,
          feuillet,
          loading: false,
          error: err.message || 'Présentation impossible',
        });
      }
    },
    [gameId, wasRecentPresentation, markRecentPresentation],
  );

  const handleZoneArrival = useCallback(
    async (zone, teamId) => {
      if (!gameId || !zone?.id || teamId == null) return;
      try {
        const data = await apiGL(`/api/gl/lore/games/${gameId}/zones/${zone.id}/feuillets`);
        const items = Array.isArray(data?.items) ? data.items : [];
        if (!items.length) return;
        await presentFeuillet(zone, teamId, items[0]);
      } catch {
        /* feuillets optionnels */
      }
    },
    [gameId, presentFeuillet],
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
    onEnter: handleZoneArrival,
  });

  const markRead = useCallback(async () => {
    if (!discovery?.feuillet?.feuilletCode || !gameId || discovery.teamId == null) return;
    try {
      await apiGL(
        `/api/gl/lore/games/${gameId}/feuillets/${encodeURIComponent(discovery.feuillet.feuilletCode)}/read`,
        'POST',
        { teamId: discovery.teamId },
      );
    } catch {
      /* non bloquant */
    }
  }, [discovery, gameId]);

  return {
    discovery,
    closeDiscovery,
    handlePositionChange,
    markRead,
  };
}
