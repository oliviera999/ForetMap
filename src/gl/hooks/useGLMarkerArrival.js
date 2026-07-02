import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { isQuestionMarker } from '../utils/glMarkerEventConfig.js';
import { shouldPresentMarkerOnArrival } from '../utils/glMarkerEffects.js';
import { MAP_VIEW_MASCOT_MOVE_MS } from '../../utils/mapViewMascotMotion.js';
import {
  consumeSkipMarkerArrival,
  registerSkipMarkerArrival,
  shouldSkipMarkerArrival,
} from '../utils/glMarkerArrivalSkip.js';

const PRESENT_DEDUPE_MS = 3000;

function presentationKey(teamId, markerId) {
  return `${Number(teamId)}:${Number(markerId)}`;
}

/**
 * Détecte l'arrivée d'une équipe sur un repère et déclenche QCM ou effets plateau.
 */
export function useGLMarkerArrival({
  teams = [],
  markers = [],
  gameId,
  watchTeamId,
  enabled = true,
  moveDelayMs = MAP_VIEW_MASCOT_MOVE_MS,
  onEffectAutoMove = null,
}) {
  const prevMarkerByTeamRef = useRef(new Map());
  const recentPresentRef = useRef({ key: '', at: 0 });
  const [questionPopover, setQuestionPopover] = useState(null);
  const [effectPopover, setEffectPopover] = useState(null);
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

  const presentQuestionAtMarker = useCallback(
    async (marker, options = {}) => {
      if (!gameId || !marker?.id) return;
      const teamId =
        options.teamId != null
          ? Number(options.teamId)
          : watchTeamId != null
            ? Number(watchTeamId)
            : null;
      if (!options.force && wasRecentPresentation(teamId, marker.id)) return;

      const excludeCodes = options.excludeCodes || excludeCodesRef.current || [];
      markRecentPresentation(teamId, marker.id);
      setEffectPopover(null);
      setQuestionPopover({
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
        setQuestionPopover({
          marker,
          teamId,
          loading: false,
          error: '',
          presentation: data?.presentation || null,
          questionCode: data?.questionCode || null,
          qcmSet: data?.qcmSet || data?.presentation?.qcmSet || null,
          result: null,
        });
      } catch (err) {
        if (err?.status === 409 || err?.status === 404) {
          setQuestionPopover(null);
          return;
        }
        setQuestionPopover({
          marker,
          teamId,
          loading: false,
          error: err.message || 'Présentation impossible',
          presentation: null,
          questionCode: null,
          result: null,
        });
      }
    },
    [gameId, watchTeamId, wasRecentPresentation, markRecentPresentation],
  );

  const presentEffectAtMarker = useCallback(
    async (marker, options = {}) => {
      if (!gameId || !marker?.id) return;
      const teamId =
        options.teamId != null
          ? Number(options.teamId)
          : watchTeamId != null
            ? Number(watchTeamId)
            : null;
      if (!options.force && wasRecentPresentation(teamId, marker.id)) return;

      markRecentPresentation(teamId, marker.id);
      setQuestionPopover(null);
      setEffectPopover({
        marker,
        teamId,
        loading: true,
        error: '',
        arrival: null,
      });
      try {
        const body = {};
        if (teamId != null) body.teamId = teamId;
        const data = await apiGL(
          `/api/gl/games/${gameId}/markers/${marker.id}/present-arrival`,
          'POST',
          body,
        );
        if (data?.autoMove?.applied && data.autoMove.targetMarkerId != null) {
          registerSkipMarkerArrival(teamId, data.autoMove.targetMarkerId);
          await onEffectAutoMove?.(data.autoMove, { teamId, originMarker: marker });
        }
        setEffectPopover({
          marker,
          teamId,
          loading: false,
          error: '',
          arrival: data,
          vitality: data?.vitality || null,
          autoMove: data?.autoMove || null,
        });
      } catch (err) {
        setEffectPopover({
          marker,
          teamId,
          loading: false,
          error: err.message || 'Présentation impossible',
          arrival: null,
        });
      }
    },
    [gameId, watchTeamId, wasRecentPresentation, markRecentPresentation, onEffectAutoMove],
  );

  const presentAtMarker = useCallback(
    async (marker, options = {}) => {
      if (isQuestionMarker(marker)) {
        await presentQuestionAtMarker(marker, options);
        return;
      }
      if (shouldPresentMarkerOnArrival(marker)) {
        await presentEffectAtMarker(marker, options);
      }
    },
    [presentQuestionAtMarker, presentEffectAtMarker],
  );

  const schedulePresentOnArrival = useCallback(
    (marker, teamId, options = {}) => {
      if (!enabled || !gameId || !marker?.id) return undefined;
      const isQ = isQuestionMarker(marker);
      const isEffect = shouldPresentMarkerOnArrival(marker);
      if (!isQ && !isEffect) return undefined;
      const resolvedTeamId =
        teamId != null ? Number(teamId) : watchTeamId != null ? Number(watchTeamId) : null;
      if (resolvedTeamId == null) return undefined;
      if (shouldSkipMarkerArrival(resolvedTeamId, marker.id)) return undefined;
      const delay = Math.max(0, Number(options.moveDelayMs ?? moveDelayMs) || 0);
      const timer = window.setTimeout(() => {
        presentAtMarker(marker, {
          teamId: resolvedTeamId,
          force: options.force === true,
        });
      }, delay);
      return () => window.clearTimeout(timer);
    },
    [enabled, gameId, watchTeamId, moveDelayMs, presentAtMarker],
  );

  const closeQuestionPopover = useCallback(() => {
    setQuestionPopover(null);
    excludeCodesRef.current = [];
  }, []);

  const closeEffectPopover = useCallback(() => {
    setEffectPopover(null);
  }, []);

  const closePopover = useCallback(() => {
    closeQuestionPopover();
    closeEffectPopover();
  }, [closeQuestionPopover, closeEffectPopover]);

  const reshuffle = useCallback(async () => {
    if (!questionPopover?.marker) return;
    if (questionPopover.questionCode) {
      excludeCodesRef.current = [...excludeCodesRef.current, questionPopover.questionCode];
    }
    await presentQuestionAtMarker(questionPopover.marker, {
      teamId: questionPopover.teamId,
      excludeCodes: excludeCodesRef.current,
      force: true,
    });
  }, [questionPopover, presentQuestionAtMarker]);

  const setResult = useCallback((result) => {
    setQuestionPopover((prev) => (prev ? { ...prev, result } : prev));
  }, []);

  useEffect(() => {
    if (!enabled || watchTeamId == null || !gameId) return undefined;
    const team = (Array.isArray(teams) ? teams : []).find(
      (t) => Number(t.id) === Number(watchTeamId),
    );
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
    if (!marker) return undefined;
    if (consumeSkipMarkerArrival(Number(watchTeamId), markerId)) return undefined;
    if (!isQuestionMarker(marker) && !shouldPresentMarkerOnArrival(marker)) return undefined;

    return schedulePresentOnArrival(marker, Number(watchTeamId));
  }, [teams, markers, watchTeamId, enabled, gameId, schedulePresentOnArrival]);

  return {
    popover: questionPopover,
    effectPopover,
    presentAtMarker,
    schedulePresentOnArrival,
    closePopover,
    closeQuestionPopover,
    closeEffectPopover,
    reshuffle,
    setResult,
  };
}
