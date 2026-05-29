import React, { useCallback, useEffect, useRef, useState } from 'react';
import { clampMapMascotPctForViewport } from '../../utils/mapViewMascotMotion.js';
import { GLBoardMarkers } from './GLBoardMarkers.jsx';
import { GLBoardMascot } from './GLBoardMascot.jsx';
import { GLQcmModal } from './GLQcmModal.jsx';
import { glBoardPointToPct } from '../utils/glBoardPointToPct.js';
import { useGLBoardMascotMotion } from '../hooks/useGLBoardMascotMotion.js';

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduced(Boolean(mq.matches));
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  return reduced;
}

export function GLGameBoard({
  chapter,
  markers,
  teams,
  gameId,
  biomeSlug,
  onMarkerClick,
  onBoardClick,
  onPlayerActionRequest,
  onSelectTeam,
  onOpenGlossaryTerm,
  onQcmAnswered,
  canMoveMascot,
  canRequestAction,
  selectedTeamId,
  currentTeamId,
  mascotStateMachine,
}) {
  const imageUrl = chapter?.map_image_url || '/maps/map-foret.svg';
  const [pendingMarker, setPendingMarker] = useState(null);
  const [actionType, setActionType] = useState('explore');
  const boardRef = useRef(null);
  const [boardHeightPx, setBoardHeightPx] = useState(0);
  const prefersReducedMotion = usePrefersReducedMotion();

  const {
    getPositionForTeam,
    getMotionForTeam,
    moveTeamTo,
  } = useGLBoardMascotMotion({
    teams,
    boardHeightPx,
    prefersReducedMotion,
  });

  useEffect(() => {
    const el = boardRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect?.height;
      if (Number.isFinite(h) && h > 0) setBoardHeightPx(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const resolveActiveTeamId = useCallback(() => {
    const list = Array.isArray(teams) ? teams : [];
    if (selectedTeamId != null) return Number(selectedTeamId);
    return list.length > 0 ? Number(list[0].id) : null;
  }, [teams, selectedTeamId]);

  const handleBoardMove = useCallback((xp, yp) => {
    const teamId = resolveActiveTeamId();
    if (teamId == null) return;
    moveTeamTo(teamId, xp, yp);
    onBoardClick?.({ xp, yp });
  }, [resolveActiveTeamId, moveTeamTo, onBoardClick]);

  const handleMarkerMove = useCallback((marker) => {
    const teamId = resolveActiveTeamId();
    if (teamId == null) return;
    const xp = Number(marker.x_pct);
    const yp = Number(marker.y_pct);
    moveTeamTo(teamId, xp, yp, { triggerHappy: true, arrival: 'marker' });
    onMarkerClick?.(marker);
  }, [resolveActiveTeamId, moveTeamTo, onMarkerClick]);

  function handleMarkerClick(marker) {
    if (canMoveMascot) {
      handleMarkerMove(marker);
      return;
    }
    if (canRequestAction) {
      if (String(marker?.event_type || '').toLowerCase() === 'quiz') {
        setPendingMarker(marker);
        return;
      }
      setPendingMarker(marker);
    }
  }

  const isQuizMarker = pendingMarker && String(pendingMarker?.event_type || '').toLowerCase() === 'quiz';

  function confirmActionRequest() {
    if (!pendingMarker) return;
    onPlayerActionRequest?.({
      marker: pendingMarker,
      actionType: String(actionType || 'explore'),
    });
    setPendingMarker(null);
  }

  const teamList = Array.isArray(teams) ? teams : [];

  return (
    <section className="gl-panel">
      <h2>{chapter?.title || 'Carte de jeu'}</h2>
      <div
        ref={boardRef}
        className="gl-board"
        onClick={(event) => {
          if (!canMoveMascot) return;
          const point = glBoardPointToPct(event, event.currentTarget);
          if (!point) return;
          const clamped = clampMapMascotPctForViewport(
            point.xp,
            point.yp,
            event.currentTarget.clientHeight || 0,
          );
          handleBoardMove(clamped.xp, clamped.yp);
        }}
      >
        <img src={imageUrl} alt={chapter?.title || 'Carte du chapitre'} className="gl-board-image" />
        <GLBoardMarkers markers={markers} onMarkerClick={handleMarkerClick} />

        {teamList.map((team) => {
          const position = getPositionForTeam(team.id);
          const motion = getMotionForTeam(team.id);
          const mascotState = mascotStateMachine?.getStateForTeam?.(team.id);
          return (
            <GLBoardMascot
              key={`mascot-${team.id}`}
              team={team}
              position={position}
              motion={motion}
              mascotState={mascotState}
              prefersReducedMotion={prefersReducedMotion}
              zIndex={6 + (selectedTeamId != null && Number(selectedTeamId) === Number(team.id) ? 2 : 0)}
            />
          );
        })}

        {teamList.map((team) => {
          const position = getPositionForTeam(team.id);
          const isSelected = selectedTeamId != null && Number(selectedTeamId) === Number(team.id);
          const isCurrentTurn = currentTeamId != null && Number(currentTeamId) === Number(team.id);
          const classes = ['gl-board-team-pin'];
          if (isSelected) classes.push('is-selected');
          if (isCurrentTurn) classes.push('is-current-turn');
          return (
            <button
              key={`pin-${team.id}`}
              type="button"
              className={classes.join(' ')}
              style={{
                left: `${position.xp}%`,
                top: `${position.yp}%`,
                '--gl-team-color': team.color || '#22c55e',
              }}
              title={team.name}
              aria-selected={isSelected}
              data-team-id={team.id}
              data-team-mascot={team.mascot_id || ''}
              onClick={(event) => {
                event.stopPropagation();
                onSelectTeam?.(Number(team.id));
              }}
            >
              <span className="gl-board-team-pin-label">{team.name}</span>
            </button>
          );
        })}
      </div>

      {pendingMarker && isQuizMarker ? (
        <GLQcmModal
          open
          marker={pendingMarker}
          biomeSlug={biomeSlug || chapter?.biome_slug}
          gameId={gameId}
          onClose={() => setPendingMarker(null)}
          onOpenGlossaryTerm={onOpenGlossaryTerm}
          onAnswered={onQcmAnswered}
        />
      ) : null}

      {pendingMarker && !isQuizMarker ? (
        <div className="gl-action-modal" role="dialog" aria-label="Proposer une action">
          <div className="gl-action-modal-body">
            <h3>Proposer une action sur « {pendingMarker.label} »</h3>
            <label>
              Type d’action
              <select value={actionType} onChange={(event) => setActionType(event.target.value)}>
                <option value="explore">Explorer</option>
                <option value="quiz">Répondre à un quiz</option>
                <option value="observe">Observer la biocénose</option>
                <option value="story">Avancer dans l’histoire</option>
              </select>
            </label>
            <div className="gl-inline-actions">
              <button type="button" onClick={confirmActionRequest}>Envoyer la demande</button>
              <button type="button" onClick={() => setPendingMarker(null)}>Annuler</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
