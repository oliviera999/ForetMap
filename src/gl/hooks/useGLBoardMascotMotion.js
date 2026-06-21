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

function clampPctBounds(xp, yp) {
  return {
    xp: Math.max(0, Math.min(100, Number(xp) || 0)),
    yp: Math.max(0, Math.min(100, Number(yp) || 0)),
  };
}

function teamPct(team, boardHeightPx) {
  const xp = Number(team?.position_x_pct ?? 50);
  const yp = Number(team?.position_y_pct ?? 50);
  const onMarker = team?.position_marker_id != null;
  if (onMarker) return clampPctBounds(xp, yp);
  return clampMapMascotPctForViewport(xp, yp, boardHeightPx);
}

function markerPct(marker) {
  return clampPctBounds(Number(marker?.x_pct), Number(marker?.y_pct));
}

/**
 * Positions animées des mascottes sur le plateau GL (même logique que la visite ForetMap).
 */
export function useGLBoardMascotMotion({
  teams = [],
  boardHeightPx = 0,
  prefersReducedMotion = false,
}) {
  const positionsRef = useRef(new Map());
  const [positions, setPositions] = useState(() => new Map());
  const [motionByTeam, setMotionByTeam] = useState(() => new Map());
  const animatingRef = useRef(new Set());
  const moveTimeoutRef = useRef(new Map());
  const happyTimeoutRef = useRef(new Map());
  const transientTimeoutRef = useRef(new Map());
  const pathChainRef = useRef(new Map());

  useEffect(() => {
    const list = Array.isArray(teams) ? teams : [];
    const nextPos = new Map(positionsRef.current);
    setMotionByTeam((prev) => {
      const nextMotion = new Map(prev);
      for (const team of list) {
        const id = Number(team.id);
        if (animatingRef.current.has(id)) continue;
        nextPos.set(id, teamPct(team, boardHeightPx));
        const onMarker = team?.position_marker_id != null;
        if (!nextMotion.has(id)) {
          nextMotion.set(id, {
            walking: false,
            happy: false,
            faceRight: true,
            transientState: '',
            snapCenter: onMarker,
          });
        } else if (onMarker) {
          nextMotion.set(id, { ...nextMotion.get(id), snapCenter: true });
        }
      }
      return nextMotion;
    });
    positionsRef.current = nextPos;
    setPositions(new Map(nextPos));
  }, [teams, boardHeightPx]);

  useEffect(
    () => () => {
      for (const id of moveTimeoutRef.current.values()) clearTimeout(id);
      for (const id of happyTimeoutRef.current.values()) clearTimeout(id);
      for (const id of transientTimeoutRef.current.values()) clearTimeout(id);
      moveTimeoutRef.current.clear();
      happyTimeoutRef.current.clear();
      transientTimeoutRef.current.clear();
      pathChainRef.current.clear();
    },
    [],
  );

  const patchMotion = useCallback((teamId, patch) => {
    setMotionByTeam((prev) => {
      const next = new Map(prev);
      const id = Number(teamId);
      const cur = next.get(id) || {
        walking: false,
        happy: false,
        faceRight: true,
        transientState: '',
        snapCenter: false,
      };
      next.set(id, { ...cur, ...patch });
      return next;
    });
  }, []);

  const triggerTransient = useCallback(
    (teamId, state, durationMs) => {
      const wanted = String(state || '').trim();
      if (!wanted || wanted === VISIT_MASCOT_STATE.IDLE) return;
      const id = Number(teamId);
      const prev = transientTimeoutRef.current.get(id);
      if (prev) clearTimeout(prev);
      patchMotion(id, { transientState: wanted });
      transientTimeoutRef.current.set(
        id,
        window.setTimeout(
          () => {
            transientTimeoutRef.current.delete(id);
            patchMotion(id, { transientState: '' });
          },
          Math.max(300, Number(durationMs) || 900),
        ),
      );
    },
    [patchMotion],
  );

  const moveTeamTo = useCallback(
    (teamId, xp, yp, { triggerHappy = false, arrival = '', keepAnimating = false } = {}) => {
      const id = Number(teamId);
      if (!Number.isFinite(id) || id <= 0) return false;
      if (!Number.isFinite(xp) || !Number.isFinite(yp)) return false;

      const onMarker = arrival === 'marker';
      const target = onMarker
        ? clampPctBounds(xp, yp)
        : clampMapMascotPctForViewport(xp, yp, boardHeightPx);
      const prev = positionsRef.current.get(id) || DEFAULT_PCT;
      const dist = Math.hypot(target.xp - prev.xp, target.yp - prev.yp);

      animatingRef.current.add(id);

      if (dist < 0.08) {
        positionsRef.current.set(id, target);
        setPositions(new Map(positionsRef.current));
        patchMotion(id, { walking: false, snapCenter: onMarker });
        if (!keepAnimating) animatingRef.current.delete(id);
        return onMarker;
      }

      const dx = target.xp - prev.xp;
      if (Math.abs(dx) > 0.12) {
        patchMotion(id, { faceRight: dx > 0 });
      }

      positionsRef.current.set(id, target);
      setPositions(new Map(positionsRef.current));

      const prevMove = moveTimeoutRef.current.get(id);
      if (prevMove) clearTimeout(prevMove);

      if (prefersReducedMotion) {
        patchMotion(id, { walking: false, snapCenter: onMarker });
        if (!keepAnimating) animatingRef.current.delete(id);
      } else {
        patchMotion(id, { walking: true, snapCenter: false });
        const moveTransient = pickMapMascotMoveTransient(dist);
        if (moveTransient) {
          triggerTransient(id, moveTransient.state, moveTransient.durationMs);
        }
        if (onMarker) {
          triggerTransient(id, VISIT_MASCOT_STATE.INSPECT, MAP_VIEW_MASCOT_INSPECT_TRANSIENT_MS);
        }
        moveTimeoutRef.current.set(
          id,
          window.setTimeout(() => {
            moveTimeoutRef.current.delete(id);
            patchMotion(id, { walking: false, snapCenter: onMarker });
            if (!keepAnimating) animatingRef.current.delete(id);
          }, MAP_VIEW_MASCOT_MOVE_MS),
        );
      }

      if (triggerHappy && !prefersReducedMotion) {
        const prevHappy = happyTimeoutRef.current.get(id);
        if (prevHappy) clearTimeout(prevHappy);
        patchMotion(id, { happy: true });
        happyTimeoutRef.current.set(
          id,
          window.setTimeout(() => {
            happyTimeoutRef.current.delete(id);
            patchMotion(id, { happy: false });
          }, MAP_VIEW_MASCOT_HAPPY_MS),
        );
      }

      return true;
    },
    [boardHeightPx, patchMotion, prefersReducedMotion, triggerTransient],
  );

  const moveTeamAlongPath = useCallback(
    (teamId, markers, { triggerHappy = false } = {}) =>
      new Promise((resolve) => {
        const id = Number(teamId);
        const list = Array.isArray(markers) ? markers : [];
        if (!Number.isFinite(id) || id <= 0 || !list.length) {
          resolve(false);
          return;
        }

        const chainId = (pathChainRef.current.get(id) || 0) + 1;
        pathChainRef.current.set(id, chainId);
        animatingRef.current.add(id);

        const runStep = (index) => {
          if (pathChainRef.current.get(id) !== chainId) {
            resolve(false);
            return;
          }

          const marker = list[index];
          const { xp, yp } = markerPct(marker);
          const isLast = index === list.length - 1;
          moveTeamTo(id, xp, yp, {
            triggerHappy: isLast && triggerHappy,
            arrival: 'marker',
            keepAnimating: !isLast,
          });

          const delay = prefersReducedMotion ? 0 : MAP_VIEW_MASCOT_MOVE_MS;
          window.setTimeout(() => {
            if (pathChainRef.current.get(id) !== chainId) {
              resolve(false);
              return;
            }
            if (isLast) {
              animatingRef.current.delete(id);
              resolve(true);
            } else {
              runStep(index + 1);
            }
          }, delay);
        };

        runStep(0);
      }),
    [moveTeamTo, prefersReducedMotion],
  );

  const getPositionForTeam = useCallback(
    (teamId) => {
      const id = Number(teamId);
      return positions.get(id) || positionsRef.current.get(id) || DEFAULT_PCT;
    },
    [positions],
  );

  const getMotionForTeam = useCallback(
    (teamId) => {
      const id = Number(teamId);
      return (
        motionByTeam.get(id) || {
          walking: false,
          happy: false,
          faceRight: true,
          transientState: '',
          snapCenter: false,
        }
      );
    },
    [motionByTeam],
  );

  return {
    getPositionForTeam,
    getMotionForTeam,
    moveTeamTo,
    moveTeamAlongPath,
  };
}
