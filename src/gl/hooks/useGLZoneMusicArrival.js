import { useEffect, useRef } from 'react';
import { detectZoneMusicOnTeamMove } from '../utils/glZoneAtPct.js';
import { useGLTeamPositionTracker } from './useGLZonePresence.js';

function teamPositionPct(team) {
  return {
    xp: Number(team?.position_x_pct ?? 50),
    yp: Number(team?.position_y_pct ?? 50),
  };
}

/**
 * Détecte l'entrée d'une équipe dans une zone musicale (déplacement réel, pas changement d'équipe observée).
 */
export function useGLZoneMusicArrival({
  teams = [],
  kingdomZones = [],
  enabled = false,
  onZoneMusicEnter,
}) {
  const { trackTeamPosition, resetTracking } = useGLTeamPositionTracker();
  const onZoneMusicEnterRef = useRef(onZoneMusicEnter);

  useEffect(() => {
    onZoneMusicEnterRef.current = onZoneMusicEnter;
  }, [onZoneMusicEnter]);

  useEffect(() => {
    if (!enabled) {
      resetTracking();
      return undefined;
    }

    const list = Array.isArray(teams) ? teams : [];
    for (const team of list) {
      const teamId = Number(team.id);
      if (!Number.isFinite(teamId)) continue;

      const nextPct = teamPositionPct(team);
      const prevPct = trackTeamPosition(teamId, nextPct);
      if (!prevPct) continue;

      const zone = detectZoneMusicOnTeamMove(prevPct, nextPct, kingdomZones);
      if (zone) {
        onZoneMusicEnterRef.current?.(zone);
      }
    }

    return undefined;
  }, [teams, kingdomZones, enabled, trackTeamPosition, resetTracking]);
}
