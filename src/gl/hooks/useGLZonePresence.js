import { useCallback, useEffect, useRef } from 'react';
import { MAP_VIEW_MASCOT_MOVE_MS } from '../../utils/mapViewMascotMotion.js';

/** Fenêtre de déduplication des présentations (anti double déclenchement). */
export const PRESENT_DEDUPE_MS = 3000;

/**
 * Déduplication courte des présentations : mémorise la dernière clé présentée
 * (clé opaque construite par le hook appelant) et la refuse pendant la fenêtre.
 * @param {number} [dedupeMs] fenêtre par défaut (PRESENT_DEDUPE_MS)
 */
export function useGLRecentPresentation(dedupeMs = PRESENT_DEDUPE_MS) {
  const recentPresentRef = useRef({ key: '', at: 0 });

  const wasRecentPresentation = useCallback(
    (key, windowMs = dedupeMs) => {
      const { key: recentKey, at } = recentPresentRef.current;
      return recentKey === key && Date.now() - at < windowMs;
    },
    [dedupeMs],
  );

  const markRecentPresentation = useCallback((key) => {
    recentPresentRef.current = { key, at: Date.now() };
  }, []);

  return { wasRecentPresentation, markRecentPresentation };
}

/**
 * Suivi des positions (% carte) par équipe. `trackTeamPosition` renvoie la
 * position précédente uniquement lors d'un déplacement réel : `null` au premier
 * passage (position de référence) ou si la position est identique.
 */
export function useGLTeamPositionTracker() {
  const prevPctByTeamRef = useRef(new Map());

  const trackTeamPosition = useCallback((teamId, pct) => {
    const map = prevPctByTeamRef.current;
    if (!map.has(teamId)) {
      map.set(teamId, { xp: pct.xp, yp: pct.yp });
      return null;
    }
    const prev = map.get(teamId);
    if (prev.xp === pct.xp && prev.yp === pct.yp) return null;
    map.set(teamId, { xp: pct.xp, yp: pct.yp });
    return prev;
  }, []);

  const resetTracking = useCallback(() => {
    prevPctByTeamRef.current.clear();
  }, []);

  return { trackTeamPosition, resetTracking };
}

/**
 * Noyau commun des hooks « arrival » : suit la position de l'équipe observée,
 * détecte l'entrée de zone via `resolveZoneOnMove` puis déclenche `onEnter`
 * après le délai d'animation de la mascotte (timer unique, remplacé à chaque
 * nouveau déclenchement et nettoyé au démontage).
 *
 * La déduplication reste dans la stratégie appelante (via
 * `useGLRecentPresentation`) car le format de clé et les gardes qui la
 * précèdent varient selon le hook.
 *
 * @param {object} options
 * @param {boolean} [options.enabled]
 * @param {number|string|null} options.watchTeamId équipe observée
 * @param {(prev, next, teamId) => object|null} options.resolveZoneOnMove
 *   détection d'entrée (gardes métier incluses) ; renvoie la zone ou null
 * @param {number} [options.moveDelayMs] délai avant déclenchement
 * @param {(zone, teamId: number) => void} options.onEnter stratégie de présentation
 */
export function useGLZonePresence({
  enabled = true,
  watchTeamId,
  resolveZoneOnMove,
  moveDelayMs = MAP_VIEW_MASCOT_MOVE_MS,
  onEnter,
}) {
  const { trackTeamPosition } = useGLTeamPositionTracker();
  const pendingTimerRef = useRef(null);

  const clearPendingTimer = useCallback(() => {
    if (pendingTimerRef.current) {
      window.clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
  }, []);

  const scheduleOnMove = useCallback(
    (prev, next, teamId) => {
      if (!enabled || teamId == null) return undefined;
      const zone = resolveZoneOnMove?.(prev, next, teamId);
      if (!zone) return undefined;
      const delay = Math.max(0, Number(moveDelayMs) || 0);
      clearPendingTimer();
      pendingTimerRef.current = window.setTimeout(() => {
        pendingTimerRef.current = null;
        onEnter?.(zone, Number(teamId));
      }, delay);
      return clearPendingTimer;
    },
    [enabled, resolveZoneOnMove, moveDelayMs, onEnter, clearPendingTimer],
  );

  useEffect(() => clearPendingTimer, [clearPendingTimer]);

  const handlePositionChange = useCallback(
    (pct) => {
      if (!enabled || watchTeamId == null || !pct) return undefined;
      const teamKey = Number(watchTeamId);
      const prev = trackTeamPosition(teamKey, pct);
      if (!prev) return undefined;
      return scheduleOnMove(prev, pct, teamKey);
    },
    [enabled, watchTeamId, trackTeamPosition, scheduleOnMove],
  );

  return { handlePositionChange };
}
