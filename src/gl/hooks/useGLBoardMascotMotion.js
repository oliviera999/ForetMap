import { useCallback, useEffect, useRef, useState } from 'react';
import { VISIT_MASCOT_STATE } from '../../utils/visitMascotState.js';
import {
  MAP_VIEW_MASCOT_MOVE_MS,
  MAP_VIEW_MASCOT_HAPPY_MS,
  MAP_VIEW_MASCOT_INSPECT_TRANSIENT_MS,
  clampMapMascotPctForViewport,
  pickMapMascotMoveTransient,
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
  const transientTimeoutRef = useRef(new Map());

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
          nextMotion.set(id, {
            walking: false, happy: false, faceRight: true, transientState: '',
          });
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
    for (const id of transientTimeoutRef.current.values()) clearTimeout(id);
    moveTimeoutRef.current.clear();
    happyTimeoutRef.current.clear();
    transientTimeoutRef.current.clear();
  }, []);

  const patchMotion = useCallback((teamId, patch) => {
    setMotionByTeam((prev) => {
      const next = new Map(prev);
      const id = Number(teamId);
      const cur = next.get(id) || {
        walking: false, happy: false, faceRight: true, transientState: '',
      };
      next.set(id, { ...cur, ...patch });
      return next;
    });
  }, []);

  const triggerTransient = useCallback((teamId, state, durationMs) => {
    const wanted = String(state || '').trim();
    if (!wanted || wanted === VISIT_MASCOT_STATE.IDLE) return;
    const id = Number(teamId);
    const prev = transientTimeoutRef.current.get(id);
    if (prev) clearTimeout(prev);
    patchMotion(id, { transientState: wanted });
    transientTimeoutRef.current.set(id, window.setTimeout(() => {
      transientTimeoutRef.current.delete(id);
      patchMotion(id, { transientState: '' });
    }, Math.max(300, Number(durationMs) || 900)));
  }, [patchMotion]);

  const moveTeamTo = useCallback((teamId, xp, yp, { triggerHappy = false, arrival = '' } = {}) => {
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
      const moveTransient = pickMapMascotMoveTransient(dist);
      if (moveTransient) {
        triggerTransient(id, moveTransient.state, moveTransient.durationMs);
      }
      if (arrival === 'marker') {
        triggerTransient(id, VISIT_MASCOT_STATE.INSPECT, MAP_VIEW_MASCOT_INSPECT_TRANSIENT_MS);
      }
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
  }, [boardHeightPx, patchMotion, prefersReducedMotion, triggerTransient]);

  const getPositionForTeam = useCallback((teamId) => {
    const id = Number(teamId);
    return positions.get(id) || positionsRef.current.get(id) || DEFAULT_PCT;
  }, [positions]);

  const getMotionForTeam = useCallback((teamId) => {
    const id = Number(teamId);
    return motionByTeam.get(id) || {
      walking: false, happy: false, faceRight: true, transientState: '',
    };
  }, [motionByTeam]);

  return {
    getPositionForTeam,
    getMotionForTeam,
    moveTeamTo,
  };
}
