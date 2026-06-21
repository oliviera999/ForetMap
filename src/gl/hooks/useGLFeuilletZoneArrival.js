import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { findZoneTriggeredOnMoveGeneric } from '../../utils/glMapZoneDetect.js';
import { MAP_VIEW_MASCOT_MOVE_MS } from '../../utils/mapViewMascotMotion.js';

const PRESENT_DEDUPE_MS = 3000;

function presentationKey(teamId, zoneId) {
  return `${Number(teamId)}:${String(zoneId)}`;
}

const feuilletZoneDetectOptions = (isEligible) => ({
  getZonePoints: (zone) => zone.points,
  isZoneEligible: isEligible,
});

/**
 * Détecte la traversée d'une zone feuillet et déclenche le popover (une fois par équipe).
 */
export function useGLFeuilletZoneArrival({
  feuilletZones = [],
  gameId,
  watchTeamId,
  presentedZoneIds = [],
  enabled = true,
  moveDelayMs = MAP_VIEW_MASCOT_MOVE_MS,
  qcmOpen = false,
  loreCarnetEnabled = false,
}) {
  const prevPctByTeamRef = useRef(new Map());
  const recentPresentRef = useRef({ key: '', at: 0 });
  const [popover, setPopover] = useState(null);
  const pendingTimerRef = useRef(null);
  const presentedSet = useRef(new Set(presentedZoneIds.map(String)));

  useEffect(() => {
    presentedSet.current = new Set(presentedZoneIds.map(String));
  }, [presentedZoneIds]);

  const closePopover = useCallback(() => {
    setPopover(null);
  }, []);

  const markPresentedLocal = useCallback((zoneId) => {
    presentedSet.current.add(String(zoneId));
  }, []);

  const isZoneEligible = useCallback((zone) => {
    if (!zone?.zoneId) return false;
    return !presentedSet.current.has(String(zone.zoneId));
  }, []);

  const presentFeuilletZone = useCallback(
    async (zone, teamId) => {
      if (!gameId || !zone?.zoneId || teamId == null) return;
      const dedupeKey = presentationKey(teamId, zone.zoneId);
      const { key, at } = recentPresentRef.current;
      if (key === dedupeKey && Date.now() - at < PRESENT_DEDUPE_MS) return;
      recentPresentRef.current = { key: dedupeKey, at: Date.now() };

      setPopover({
        zone,
        teamId,
        loading: true,
        error: '',
        titre: zone.titre,
        popover: zone.popover,
        coutGemme: zone.coutGemme,
        gainCoeur: zone.gainCoeur,
        vitality: null,
      });

      try {
        const data = await apiGL(
          `/api/gl/games/${gameId}/feuillet-zones/${encodeURIComponent(zone.zoneId)}/present`,
          'POST',
          { teamId },
        );
        markPresentedLocal(zone.zoneId);
        setPopover({
          zone: data?.zone ? { ...zone, ...data.zone } : zone,
          teamId,
          loading: false,
          error: '',
          titre: data?.zone?.titre || zone.titre,
          popover: data?.zone?.popover || zone.popover,
          coutGemme: data?.zone?.coutGemme ?? zone.coutGemme,
          gainCoeur: data?.zone?.gainCoeur ?? zone.gainCoeur,
          vitality: data?.vitality || null,
        });

        if (loreCarnetEnabled && zone.feuilletCode) {
          apiGL(
            `/api/gl/lore/games/${gameId}/feuillets/${encodeURIComponent(zone.feuilletCode)}/present`,
            'POST',
            { teamId },
          ).catch(() => {
            /* carnet optionnel */
          });
        }
      } catch (err) {
        if (err?.status === 409) {
          markPresentedLocal(zone.zoneId);
          setPopover(null);
          return;
        }
        setPopover({
          zone,
          teamId,
          loading: false,
          error: err.message || 'Présentation impossible',
          titre: zone.titre,
          popover: zone.popover,
          coutGemme: zone.coutGemme,
          gainCoeur: zone.gainCoeur,
          vitality: null,
        });
      }
    },
    [gameId, loreCarnetEnabled, markPresentedLocal],
  );

  const scheduleOnMove = useCallback(
    (prev, next, teamId) => {
      if (!enabled || !gameId || teamId == null || qcmOpen || !feuilletZones.length)
        return undefined;
      const zone = findZoneTriggeredOnMoveGeneric(
        prev,
        next,
        feuilletZones,
        feuilletZoneDetectOptions(isZoneEligible),
      );
      if (!zone) return undefined;
      const delay = Math.max(0, Number(moveDelayMs) || 0);
      if (pendingTimerRef.current) window.clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = window.setTimeout(() => {
        pendingTimerRef.current = null;
        presentFeuilletZone(zone, Number(teamId));
      }, delay);
      return () => {
        if (pendingTimerRef.current) {
          window.clearTimeout(pendingTimerRef.current);
          pendingTimerRef.current = null;
        }
      };
    },
    [enabled, gameId, feuilletZones, moveDelayMs, qcmOpen, isZoneEligible, presentFeuilletZone],
  );

  useEffect(
    () => () => {
      if (pendingTimerRef.current) window.clearTimeout(pendingTimerRef.current);
    },
    [],
  );

  const handlePositionChange = useCallback(
    (pct) => {
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
    },
    [enabled, watchTeamId, scheduleOnMove],
  );

  return {
    popover,
    closePopover,
    handlePositionChange,
    markPresentedLocal,
  };
}
