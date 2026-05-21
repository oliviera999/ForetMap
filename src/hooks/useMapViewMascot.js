import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { computeVisitMascotStartPct } from '../utils/visitMascotPlacement.js';
import { visitZoneCentroidPct } from '../utils/visitMapGeometry.js';
import { loadVisitMascotPositionPct, saveVisitMascotPositionPct } from '../utils/visitMascotPositionPersistence.js';
import { VISIT_MASCOT_STATE, pickMascotDialog } from '../utils/visitMascotState.js';
import {
  clampMapMascotPctForViewport,
  MAP_VIEW_MASCOT_DIALOG_MOVE_COOLDOWN_MS,
  MAP_VIEW_MASCOT_DIALOG_MS,
  MAP_VIEW_MASCOT_HAPPY_MS,
  MAP_VIEW_MASCOT_MOVE_MS,
} from '../utils/mapViewMascotMotion.js';
import useVisitMascotStateMachine from './useVisitMascotStateMachine.js';

/**
 * Comportement mascotte sur le plan carte forêt (déplacement, animations, bulles) — aligné visite.
 */
function useMapViewMascot({
  mapId,
  markers = [],
  fitHeightPx = 0,
  enabled = true,
  extraCatalogEntries = [],
  preferredMascotId = null,
  allowedMascotIds = [],
  defaultMascotId = '',
} = {}) {
  const [mascotPct, setMascotPct] = useState({ xp: 50, yp: 50 });
  const [faceRight, setFaceRight] = useState(true);
  const [walking, setWalking] = useState(false);
  const [happy, setHappy] = useState(false);
  const [dialog, setDialog] = useState('');
  const [dialogVisible, setDialogVisible] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const mascotPctRef = useRef({ xp: 50, yp: 50 });
  const moveTimeoutRef = useRef(null);
  const happyTimeoutRef = useRef(null);
  const dialogTimeoutRef = useRef(null);
  const moveDialogCooldownUntilRef = useRef(0);
  const startPlacedForMapRef = useRef(null);
  const detailAfterMoveTimeoutRef = useRef(null);

  const {
    visitMascotId: mascotId,
    visitMascotAnimationState: animationState,
    triggerMascotTransientState,
    resetMascotTransientState,
  } = useVisitMascotStateMachine({
    walking,
    happy,
    extraCatalogEntries,
    preferredMascotId,
    allowedMascotIds,
    defaultMascotId,
  });

  const showMascot = enabled && !!mascotId;

  useLayoutEffect(() => {
    startPlacedForMapRef.current = null;
  }, [mapId]);

  useLayoutEffect(() => {
    if (!showMascot) return;
    if (startPlacedForMapRef.current === mapId) return;
    startPlacedForMapRef.current = mapId;
    if (moveTimeoutRef.current) {
      clearTimeout(moveTimeoutRef.current);
      moveTimeoutRef.current = null;
    }
    setWalking(false);
    setHappy(false);
    const stored = loadVisitMascotPositionPct(mapId);
    const fallback = computeVisitMascotStartPct(mapId, markers);
    const start = stored ?? fallback;
    mascotPctRef.current = start;
    setMascotPct(start);
    saveVisitMascotPositionPct(mapId, start);
  }, [mapId, markers, showMascot]);

  useEffect(() => {
    mascotPctRef.current = mascotPct;
  }, [mascotPct]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setPrefersReducedMotion(!!mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => () => {
    if (moveTimeoutRef.current) clearTimeout(moveTimeoutRef.current);
    if (happyTimeoutRef.current) clearTimeout(happyTimeoutRef.current);
    if (dialogTimeoutRef.current) clearTimeout(dialogTimeoutRef.current);
    if (detailAfterMoveTimeoutRef.current) clearTimeout(detailAfterMoveTimeoutRef.current);
  }, []);

  const clearDetailAfterMove = useCallback(() => {
    if (detailAfterMoveTimeoutRef.current) {
      clearTimeout(detailAfterMoveTimeoutRef.current);
      detailAfterMoveTimeoutRef.current = null;
    }
  }, []);

  const showDialog = useCallback((eventKey, { force = false } = {}) => {
    const now = Date.now();
    if (!force && eventKey === 'move' && now < moveDialogCooldownUntilRef.current) return;
    const text = pickMascotDialog(eventKey);
    if (!text) return;
    if (eventKey === 'move') {
      moveDialogCooldownUntilRef.current = now + MAP_VIEW_MASCOT_DIALOG_MOVE_COOLDOWN_MS;
    }
    if (dialogTimeoutRef.current) clearTimeout(dialogTimeoutRef.current);
    setDialog(text);
    setDialogVisible(true);
    dialogTimeoutRef.current = window.setTimeout(() => {
      setDialogVisible(false);
      dialogTimeoutRef.current = null;
    }, MAP_VIEW_MASCOT_DIALOG_MS);
  }, []);

  const triggerHappy = useCallback(() => {
    if (happyTimeoutRef.current) {
      clearTimeout(happyTimeoutRef.current);
      happyTimeoutRef.current = null;
    }
    setHappy(true);
    happyTimeoutRef.current = window.setTimeout(() => {
      setHappy(false);
      happyTimeoutRef.current = null;
    }, MAP_VIEW_MASCOT_HAPPY_MS);
  }, []);

  const moveTo = useCallback(
    (xp, yp) => {
      if (!Number.isFinite(xp) || !Number.isFinite(yp)) return;
      const target = clampMapMascotPctForViewport(xp, yp, fitHeightPx);
      const nx = target.xp;
      const ny = target.yp;
      const prev = mascotPctRef.current;
      const dist = Math.hypot(nx - prev.xp, ny - prev.yp);
      if (dist < 0.08) return;

      const dx = nx - prev.xp;
      if (Math.abs(dx) > 0.12) setFaceRight(dx > 0);

      if (moveTimeoutRef.current) {
        clearTimeout(moveTimeoutRef.current);
        moveTimeoutRef.current = null;
      }

      if (prefersReducedMotion) {
        setWalking(false);
      } else {
        setWalking(true);
        if (dist > 15) {
          triggerMascotTransientState(VISIT_MASCOT_STATE.RUNNING, 1000);
          showDialog('running');
        } else if (dist > 9) {
          triggerMascotTransientState(VISIT_MASCOT_STATE.SURPRISE, 900);
          showDialog('surprise');
        }
        if (dist > 4) showDialog('move');
        moveTimeoutRef.current = window.setTimeout(() => {
          setWalking(false);
          moveTimeoutRef.current = null;
        }, MAP_VIEW_MASCOT_MOVE_MS);
      }

      mascotPctRef.current = { xp: nx, yp: ny };
      setMascotPct({ xp: nx, yp: ny });
      saveVisitMascotPositionPct(mapId, { xp: nx, yp: ny });
    },
    [mapId, fitHeightPx, prefersReducedMotion, showDialog, triggerMascotTransientState],
  );

  /**
   * Exécute une action (ex. ouvrir modale zone/repère) après la fin du déplacement mascotte.
   * @param {() => void} action
   * @param {{ xp: number, yp: number }} targetXpYp
   * @param {{ xp: number, yp: number }} moveFromPct position avant moveTo
   */
  const scheduleAfterMove = useCallback(
    (action, targetXpYp, moveFromPct) => {
      clearDetailAfterMove();
      const prev = moveFromPct && Number.isFinite(moveFromPct.xp) && Number.isFinite(moveFromPct.yp)
        ? moveFromPct
        : mascotPctRef.current;
      const target = clampMapMascotPctForViewport(
        targetXpYp.xp,
        targetXpYp.yp,
        fitHeightPx,
      );
      const dist = Math.hypot(target.xp - prev.xp, target.yp - prev.yp);
      const delay = dist < 0.08 || prefersReducedMotion ? 0 : MAP_VIEW_MASCOT_MOVE_MS;
      if (delay === 0) {
        action();
      } else {
        detailAfterMoveTimeoutRef.current = window.setTimeout(() => {
          detailAfterMoveTimeoutRef.current = null;
          action();
        }, delay);
      }
    },
    [clearDetailAfterMove, fitHeightPx, prefersReducedMotion],
  );

  const onZoneViewClick = useCallback(
    (zone, openZone) => {
      const fromPct = { ...mascotPctRef.current };
      const c = visitZoneCentroidPct(zone);
      if (c) moveTo(c.xp, c.yp);
      triggerMascotTransientState(VISIT_MASCOT_STATE.MAP_READ, 1200);
      showDialog('map_read');
      if (c) scheduleAfterMove(() => openZone(zone), c, fromPct);
      else openZone(zone);
    },
    [moveTo, scheduleAfterMove, showDialog, triggerMascotTransientState],
  );

  const onMarkerViewClick = useCallback(
    (marker, openMarker) => {
      const fromPct = { ...mascotPctRef.current };
      const xp = Number(marker.x_pct);
      const yp = Number(marker.y_pct);
      moveTo(xp, yp);
      triggerMascotTransientState(VISIT_MASCOT_STATE.INSPECT, 1200);
      showDialog('inspect');
      scheduleAfterMove(() => openMarker(marker), { xp, yp }, fromPct);
    },
    [moveTo, scheduleAfterMove, showDialog, triggerMascotTransientState],
  );

  const resetMotion = useCallback(() => {
    clearDetailAfterMove();
    if (moveTimeoutRef.current) {
      clearTimeout(moveTimeoutRef.current);
      moveTimeoutRef.current = null;
    }
    if (happyTimeoutRef.current) {
      clearTimeout(happyTimeoutRef.current);
      happyTimeoutRef.current = null;
    }
    if (dialogTimeoutRef.current) {
      clearTimeout(dialogTimeoutRef.current);
      dialogTimeoutRef.current = null;
    }
    setWalking(false);
    setHappy(false);
    setDialogVisible(false);
    resetMascotTransientState();
  }, [clearDetailAfterMove, resetMascotTransientState]);

  const renderPct = useMemo(
    () => clampMapMascotPctForViewport(mascotPct.xp, mascotPct.yp, fitHeightPx),
    [mascotPct.xp, mascotPct.yp, fitHeightPx],
  );

  const mascotClassName = useMemo(() => {
    const parts = ['visit-map-mascot'];
    if (walking) parts.push('visit-map-mascot--walking');
    if (happy) parts.push('visit-map-mascot--happy');
    if (prefersReducedMotion) parts.push('visit-map-mascot--reduced-motion');
    parts.push('map-view-forest-mascot');
    return parts.join(' ');
  }, [walking, happy, prefersReducedMotion]);

  return {
    mascotId,
    showMascot,
    animationState,
    renderPct,
    faceRight,
    mascotClassName,
    dialog,
    dialogVisible,
    moveTo,
    onZoneViewClick,
    onMarkerViewClick,
    triggerHappy,
    resetMotion,
    clearDetailAfterMove,
  };
}

export default useMapViewMascot;
