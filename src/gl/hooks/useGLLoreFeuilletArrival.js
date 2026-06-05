import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { findZoneTriggeredOnMove } from '../../utils/glZoneContentDetect.js';
import { MAP_VIEW_MASCOT_MOVE_MS } from '../../utils/mapViewMascotMotion.js';

const PRESENT_DEDUPE_MS = 3000;

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
  const prevPctByTeamRef = useRef(new Map());
  const recentPresentRef = useRef({ key: '', at: 0 });
  const [discovery, setDiscovery] = useState(null);
  const pendingTimerRef = useRef(null);

  const closeDiscovery = useCallback(() => {
    setDiscovery(null);
  }, []);

  const presentFeuillet = useCallback(async (zone, teamId, feuillet) => {
    if (!gameId || !zone?.id || teamId == null || !feuillet?.feuilletCode) return;
    const dedupeKey = presentationKey(teamId, zone.id, feuillet.feuilletCode);
    const { key, at } = recentPresentRef.current;
    if (key === dedupeKey && Date.now() - at < PRESENT_DEDUPE_MS) return;
    recentPresentRef.current = { key: dedupeKey, at: Date.now() };

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
  }, [gameId]);

  const handleZoneArrival = useCallback(async (zone, teamId) => {
    if (!gameId || !zone?.id || teamId == null) return;
    try {
      const data = await apiGL(`/api/gl/lore/games/${gameId}/zones/${zone.id}/feuillets`);
      const items = Array.isArray(data?.items) ? data.items : [];
      if (!items.length) return;
      await presentFeuillet(zone, teamId, items[0]);
    } catch {
      /* feuillets optionnels */
    }
  }, [gameId, presentFeuillet]);

  const scheduleOnMove = useCallback((prev, next, teamId) => {
    if (!enabled || !gameId || teamId == null || qcmOpen) return undefined;
    const zone = findZoneTriggeredOnMove(prev, next, kingdomZones);
    if (!zone) return undefined;
    const delay = Math.max(0, Number(moveDelayMs) || 0);
    if (pendingTimerRef.current) window.clearTimeout(pendingTimerRef.current);
    pendingTimerRef.current = window.setTimeout(() => {
      pendingTimerRef.current = null;
      handleZoneArrival(zone, Number(teamId));
    }, delay);
    return () => {
      if (pendingTimerRef.current) {
        window.clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
    };
  }, [enabled, gameId, kingdomZones, moveDelayMs, qcmOpen, handleZoneArrival]);

  useEffect(() => () => {
    if (pendingTimerRef.current) window.clearTimeout(pendingTimerRef.current);
  }, []);

  const handlePositionChange = useCallback((pct) => {
    if (!enabled || watchTeamId == null || !pct) return undefined;
    const teamKey = Number(watchTeamId);
    const prev = prevPctByTeamRef.current.get(teamKey);
    if (!prevPctByTeamRef.current.has(teamKey)) {
      prevPctByTeamRef.current.set(teamKey, { xp: pct.xp, yp: pct.yp });
      return undefined;
    }
    if (prev.xp === pct.xp && prev.yp === pct.yp) return undefined;
    const cleanup = scheduleOnMove(prev, pct, teamKey);
    prevPctByTeamRef.current.set(teamKey, { xp: pct.xp, yp: pct.yp });
    return cleanup;
  }, [enabled, watchTeamId, scheduleOnMove]);

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
