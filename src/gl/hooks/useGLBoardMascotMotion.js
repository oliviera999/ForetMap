import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MAP_VIEW_MASCOT_MOVE_MS,
  MAP_VIEW_MASCOT_HAPPY_MS,
  clampMapMascotPctForViewport,
} from '../../utils/mapViewMascotMotion.js';

const DEFAULT_PCT = { xp: 50, yp: 50 };

function teamPct(team, boardHeightPx) {
  const xp = Number(team?.position_x_pct ?? 50);
  const yp = Number(team?.position_y_pct ?? 50);
  return clampMapMascotPctForViewport(xp, yp, boardHeightPx);
}

/**
 * Positions animées des mascottes sur le plateau GL (même logique que la visite ForetMap).
 */
export function useGLBoardMascotMotion({ teams = [], boardHeightPx = 0, prefersReducedMotion = false }) {
  const positionsRef = useRef(new Map());
  const [positions, setPositions] = useState(() => new Map());
  const [motionByTeam, setMotionByTeam] = useState(() => new Map());
  const animatingRef = useRef(new Set());
  const moveTimeoutRef = useRef(new Map());
  const happyTimeoutRef = useRef(new Map());

  useEffect(() => {
    const list = Array.isArray(teams) ? teams : [];
    const nextPos = new Map(positionsRef.current);
    setMotionByTeam((prev) => {
      const nextMotion = new Map(prev);
      for (const team of list) {
        const id = Number(team.id);
        if (animatingRef.current.has(id)) continue;
        nextPos.set(id, teamPct(team, boardHeightPx));
        if (!nextMotion.has(id)) {
          nextMotion.set(id, { walking: false, happy: false, faceRight: true });
        }
      }
      return nextMotion;
    });
    positionsRef.current = nextPos;
    setPositions(new Map(nextPos));
  }, [teams, boardHeightPx]);

  useEffect(() => () => {
    for (const id of moveTimeoutRef.current.values()) clearTimeout(id);
    for (const id of happyTimeoutRef.current.values()) clearTimeout(id);
    moveTimeoutRef.current.clear();
    happyTimeoutRef.current.clear();
  }, []);

  const patchMotion = useCallback((teamId, patch) => {
    setMotionByTeam((prev) => {
      const next = new Map(prev);
      const id = Number(teamId);
      const cur = next.get(id) || { walking: false, happy: false, faceRight: true };
      next.set(id, { ...cur, ...patch });
      return next;
    });
  }, []);

  const moveTeamTo = useCallback((teamId, xp, yp, { triggerHappy = false } = {}) => {
    const id = Number(teamId);
    if (!Number.isFinite(id) || id <= 0) return false;
    if (!Number.isFinite(xp) || !Number.isFinite(yp)) return false;

    const target = clampMapMascotPctForViewport(xp, yp, boardHeightPx);
    const prev = positionsRef.current.get(id) || DEFAULT_PCT;
    const dist = Math.hypot(target.xp - prev.xp, target.yp - prev.yp);
    if (dist < 0.08) return false;

    const dx = target.xp - prev.xp;
    if (Math.abs(dx) > 0.12) {
      patchMotion(id, { faceRight: dx > 0 });
    }

    animatingRef.current.add(id);
    positionsRef.current.set(id, target);
    setPositions(new Map(positionsRef.current));

    const prevMove = moveTimeoutRef.current.get(id);
    if (prevMove) clearTimeout(prevMove);

    if (prefersReducedMotion) {
      patchMotion(id, { walking: false });
      animatingRef.current.delete(id);
    } else {
      patchMotion(id, { walking: true });
      moveTimeoutRef.current.set(id, window.setTimeout(() => {
        moveTimeoutRef.current.delete(id);
        patchMotion(id, { walking: false });
        animatingRef.current.delete(id);
      }, MAP_VIEW_MASCOT_MOVE_MS));
    }

    if (triggerHappy && !prefersReducedMotion) {
      const prevHappy = happyTimeoutRef.current.get(id);
      if (prevHappy) clearTimeout(prevHappy);
      patchMotion(id, { happy: true });
      happyTimeoutRef.current.set(id, window.setTimeout(() => {
        happyTimeoutRef.current.delete(id);
        patchMotion(id, { happy: false });
      }, MAP_VIEW_MASCOT_HAPPY_MS));
    }

    return true;
  }, [boardHeightPx, patchMotion, prefersReducedMotion]);

  const getPositionForTeam = useCallback((teamId) => {
    const id = Number(teamId);
    return positions.get(id) || positionsRef.current.get(id) || DEFAULT_PCT;
  }, [positions]);

  const getMotionForTeam = useCallback((teamId) => {
    const id = Number(teamId);
    return motionByTeam.get(id) || { walking: false, happy: false, faceRight: true };
  }, [motionByTeam]);

  return {
    getPositionForTeam,
    getMotionForTeam,
    moveTeamTo,
  };
}
