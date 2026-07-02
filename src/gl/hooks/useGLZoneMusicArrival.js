import { useEffect, useRef } from 'react';
import { detectZoneMusicOnTeamMove } from '../utils/glZoneAtPct.js';

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
  const prevPctByTeamRef = useRef(new Map());
  const onZoneMusicEnterRef = useRef(onZoneMusicEnter);

  useEffect(() => {
    onZoneMusicEnterRef.current = onZoneMusicEnter;
  }, [onZoneMusicEnter]);

  useEffect(() => {
    if (!enabled) {
      prevPctByTeamRef.current.clear();
      return undefined;
    }

    const list = Array.isArray(teams) ? teams : [];
    for (const team of list) {
      const teamId = Number(team.id);
      if (!Number.isFinite(teamId)) continue;

      const nextPct = teamPositionPct(team);
      const prevPct = prevPctByTeamRef.current.get(teamId);

      if (!prevPctByTeamRef.current.has(teamId)) {
        prevPctByTeamRef.current.set(teamId, nextPct);
        continue;
      }

      const zone = detectZoneMusicOnTeamMove(prevPct, nextPct, kingdomZones);
      prevPctByTeamRef.current.set(teamId, nextPct);

      if (zone) {
        onZoneMusicEnterRef.current?.(zone);
      }
    }

    return undefined;
  }, [teams, kingdomZones, enabled]);
}
