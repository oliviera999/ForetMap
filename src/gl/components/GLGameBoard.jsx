import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { clampMapMascotPctForViewport } from '../../utils/mapViewMascotMotion.js';
import { isQuestionMarker } from '../../utils/glMarkerEventConfig.js';
import { GLBoardMarkers } from './GLBoardMarkers.jsx';
import { GLBoardMascot } from './GLBoardMascot.jsx';
import { GLQcmPopover } from './GLQcmPopover.jsx';
import { GLPctMapCanvas } from './GLPctMapCanvas.jsx';
import { useGlPctMapGestures } from '../hooks/useGlPctMapGestures.js';
import { useGLBoardMascotMotion } from '../hooks/useGLBoardMascotMotion.js';
import { useGLMarkerArrival } from '../hooks/useGLMarkerArrival.js';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js';
import { GLZoneMusicMuteButton } from './GLZoneMusicMuteButton.jsx';

export function GLGameBoard({
  chapter,
  markers,
  teams,
  gameId,
  watchTeamId,
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
  zoneMusicEnabled = false,
  zoneMusicMuted = false,
  onZoneMusicToggle,
  onWatchTeamPctChange,
  onZoneMusicUnlock,
}) {
  const imageUrl = chapter?.map_image_url || '/maps/map-foret.svg';
  const [pendingMarker, setPendingMarker] = useState(null);
  const [actionType, setActionType] = useState('explore');
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [boardHeightPx, setBoardHeightPx] = useState(0);
  const boardHeightPxRef = useRef(0);
  const mapGestures = useGlPctMapGestures();
  const prefersReducedMotion = usePrefersReducedMotion();

  const {
    popover: questionPopover,
    closePopover,
    reshuffle,
    setResult,
    schedulePresentOnArrival,
  } = useGLMarkerArrival({
    teams,
    markers,
    gameId,
    watchTeamId,
    enabled: Boolean(gameId && watchTeamId != null),
  });

  const {
    getPositionForTeam,
    getMotionForTeam,
    moveTeamTo,
  } = useGLBoardMascotMotion({
    teams,
    boardHeightPx,
    prefersReducedMotion,
  });

  const qcmOpen = Boolean(questionPopover);

  const watchPosition = watchTeamId != null ? getPositionForTeam(watchTeamId) : null;

  useEffect(() => {
    if (watchTeamId == null || !watchPosition || typeof onWatchTeamPctChange !== 'function') return;
    onWatchTeamPctChange({ xp: watchPosition.xp, yp: watchPosition.yp });
  }, [watchTeamId, watchPosition?.xp, watchPosition?.yp, onWatchTeamPctChange]);

  useEffect(() => {
    if (!mapFullscreen || qcmOpen) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setMapFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mapFullscreen, qcmOpen]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const body = document.body;
    if (mapFullscreen) {
      body.classList.add('gl-map-fullscreen-active');
    } else {
      body.classList.remove('gl-map-fullscreen-active');
    }
    return () => {
      body.classList.remove('gl-map-fullscreen-active');
    };
  }, [mapFullscreen]);

  const resolveActiveTeamId = useCallback(() => {
    const list = Array.isArray(teams) ? teams : [];
    if (watchTeamId != null) return Number(watchTeamId);
    if (selectedTeamId != null) return Number(selectedTeamId);
    return list.length > 0 ? Number(list[0].id) : null;
  }, [teams, selectedTeamId, watchTeamId]);

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
    if (isQuestionMarker(marker)) {
      schedulePresentOnArrival(marker, teamId, { force: true });
    }
  }, [resolveActiveTeamId, moveTeamTo, onMarkerClick, schedulePresentOnArrival]);

  function handleMarkerClick(marker) {
    if (canMoveMascot) {
      handleMarkerMove(marker);
      return;
    }
    if (canRequestAction && !isQuestionMarker(marker)) {
      setPendingMarker(marker);
    }
  }

  function confirmActionRequest() {
    if (!pendingMarker) return;
    onPlayerActionRequest?.({
      marker: pendingMarker,
      actionType: String(actionType || 'explore'),
    });
    setPendingMarker(null);
  }

  const teamList = Array.isArray(teams) ? teams : [];

  const boardShellClass = mapFullscreen
    ? 'gl-board-shell gl-board-shell--fullscreen'
    : 'gl-board-shell';
  const boardClass = mapFullscreen ? 'gl-board gl-board--fullscreen' : 'gl-board';

  const boardShell = (
    <div className={boardShellClass} data-testid={mapFullscreen ? 'gl-map-fullscreen-layer' : undefined}>
      {mapFullscreen ? (
        <button
          type="button"
          className="gl-map-fullscreen-close"
          data-testid="gl-map-fullscreen-close"
          aria-label="Quitter le plein écran"
          onClick={() => setMapFullscreen(false)}
        >
          Fermer
        </button>
      ) : null}
      <GLPctMapCanvas
        imageUrl={imageUrl}
        imageAlt={chapter?.title || 'Carte du chapitre'}
        mapGestures={mapGestures}
        className={boardClass}
        onFitLayout={({ height }) => {
          if (!Number.isFinite(height) || height <= 0) return;
          boardHeightPxRef.current = height;
          setBoardHeightPx(height);
        }}
        onMapPointerDown={() => onZoneMusicUnlock?.()}
        onMapClick={(pct) => {
          onZoneMusicUnlock?.();
          if (!canMoveMascot) return;
          const clamped = clampMapMascotPctForViewport(
            pct.x,
            pct.y,
            boardHeightPxRef.current,
          );
          handleBoardMove(clamped.xp, clamped.yp);
        }}
      >
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
      </GLPctMapCanvas>

      <GLQcmPopover
        open={Boolean(questionPopover)}
        marker={questionPopover?.marker}
        gameId={gameId}
        teamId={questionPopover?.teamId ?? watchTeamId}
        presentation={questionPopover?.presentation}
        questionCode={questionPopover?.questionCode}
        loading={questionPopover?.loading}
        error={questionPopover?.error}
        result={questionPopover?.result}
        onClose={closePopover}
        onOpenGlossaryTerm={onOpenGlossaryTerm}
        onAnswered={onQcmAnswered}
        onReshuffle={reshuffle}
        onSubmitResult={setResult}
      />
    </div>
  );

  const boardShellNode = mapFullscreen && typeof document !== 'undefined' && document.body
    ? createPortal(boardShell, document.body)
    : boardShell;

  return (
    <section className={mapFullscreen ? 'gl-panel gl-panel--map-fullscreen-active' : 'gl-panel'}>
      {!mapFullscreen ? (
        <div className="gl-game-board-head">
          <h2>{chapter?.title || 'Carte de jeu'}</h2>
          <button
            type="button"
            className="gl-map-fullscreen-open"
            data-testid="gl-map-fullscreen-open"
            aria-label="Afficher la carte en plein écran"
            onClick={() => setMapFullscreen(true)}
          >
            <span aria-hidden>⛶</span> Plein écran
          </button>
        </div>
      ) : null}
      {boardShellNode}

      {zoneMusicEnabled ? (
        <GLZoneMusicMuteButton
          visible
          muted={zoneMusicMuted}
          onToggle={onZoneMusicToggle}
          className="gl-zone-music-toggle--board"
        />
      ) : null}

      {pendingMarker ? (
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
