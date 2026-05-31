import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { isQuestionMarker } from '../../utils/glMarkerEventConfig.js';
import { MAP_VIEW_MASCOT_MOVE_MS } from '../../utils/mapViewMascotMotion.js';

const PRESENT_DEDUPE_MS = 3000;

function presentationKey(teamId, markerId) {
  return `${Number(teamId)}:${Number(markerId)}`;
}

/**
 * Détecte l'arrivée d'une équipe sur un repère question et déclenche la présentation QCM.
 */
export function useGLMarkerArrival({
  teams = [],
  markers = [],
  gameId,
  watchTeamId,
  enabled = true,
  moveDelayMs = MAP_VIEW_MASCOT_MOVE_MS,
}) {
  const prevMarkerByTeamRef = useRef(new Map());
  const recentPresentRef = useRef({ key: '', at: 0 });
  const [popover, setPopover] = useState(null);
  const excludeCodesRef = useRef([]);

  const wasRecentPresentation = useCallback((teamId, markerId, windowMs = PRESENT_DEDUPE_MS) => {
    const { key, at } = recentPresentRef.current;
    return key === presentationKey(teamId, markerId) && Date.now() - at < windowMs;
  }, []);

  const markRecentPresentation = useCallback((teamId, markerId) => {
    recentPresentRef.current = {
      key: presentationKey(teamId, markerId),
      at: Date.now(),
    };
  }, []);

  const presentAtMarker = useCallback(async (marker, options = {}) => {
    if (!gameId || !marker?.id) return;
    const teamId = options.teamId != null ? Number(options.teamId) : (watchTeamId != null ? Number(watchTeamId) : null);
    if (!options.force && wasRecentPresentation(teamId, marker.id)) return;

    const excludeCodes = options.excludeCodes || excludeCodesRef.current || [];
    markRecentPresentation(teamId, marker.id);
    setPopover({
      marker,
      teamId,
      loading: true,
      error: '',
      presentation: null,
      questionCode: null,
      result: null,
    });
    try {
      const body = { excludeCodes };
      if (teamId != null) body.teamId = teamId;
      const data = await apiGL(
        `/api/gl/games/${gameId}/markers/${marker.id}/present-question`,
        'POST',
        body,
      );
      excludeCodesRef.current = [];
      setPopover({
        marker,
        teamId,
        loading: false,
        error: '',
        presentation: data?.presentation || null,
        questionCode: data?.questionCode || null,
        result: null,
      });
    } catch (err) {
      setPopover({
        marker,
        teamId,
        loading: false,
        error: err.message || 'Présentation impossible',
        presentation: null,
        questionCode: null,
        result: null,
      });
    }
  }, [gameId, watchTeamId, wasRecentPresentation, markRecentPresentation]);

  const schedulePresentOnArrival = useCallback((marker, teamId, options = {}) => {
    if (!enabled || !gameId || !marker?.id || !isQuestionMarker(marker)) return undefined;
    const resolvedTeamId = teamId != null ? Number(teamId) : (watchTeamId != null ? Number(watchTeamId) : null);
    if (resolvedTeamId == null) return undefined;
    const delay = Math.max(0, Number(options.moveDelayMs ?? moveDelayMs) || 0);
    const timer = window.setTimeout(() => {
      presentAtMarker(marker, {
        teamId: resolvedTeamId,
        force: options.force === true,
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [enabled, gameId, watchTeamId, moveDelayMs, presentAtMarker]);

  const closePopover = useCallback(() => {
    setPopover(null);
    excludeCodesRef.current = [];
  }, []);

  const reshuffle = useCallback(async () => {
    if (!popover?.marker) return;
    if (popover.questionCode) {
      excludeCodesRef.current = [...excludeCodesRef.current, popover.questionCode];
    }
    await presentAtMarker(popover.marker, {
      teamId: popover.teamId,
      excludeCodes: excludeCodesRef.current,
      force: true,
    });
  }, [popover, presentAtMarker]);

  const setResult = useCallback((result) => {
    setPopover((prev) => (prev ? { ...prev, result } : prev));
  }, []);

  useEffect(() => {
    if (!enabled || watchTeamId == null || !gameId) return undefined;
    const team = (Array.isArray(teams) ? teams : []).find((t) => Number(t.id) === Number(watchTeamId));
    if (!team) return undefined;

    const markerId = team.position_marker_id != null ? Number(team.position_marker_id) : null;
    const teamKey = Number(watchTeamId);
    const prev = prevMarkerByTeamRef.current.get(teamKey);
    if (!prevMarkerByTeamRef.current.has(teamKey)) {
      prevMarkerByTeamRef.current.set(teamKey, markerId);
      return undefined;
    }
    if (markerId === prev) return undefined;
    prevMarkerByTeamRef.current.set(teamKey, markerId);

    if (!markerId) return undefined;
    const marker = (Array.isArray(markers) ? markers : []).find((m) => Number(m.id) === markerId);
    if (!marker || !isQuestionMarker(marker)) return undefined;

    return schedulePresentOnArrival(marker, Number(watchTeamId));
  }, [teams, markers, watchTeamId, enabled, gameId, schedulePresentOnArrival]);

  return {
    popover,
    presentAtMarker,
    schedulePresentOnArrival,
    closePopover,
    reshuffle,
    setResult,
  };
}
