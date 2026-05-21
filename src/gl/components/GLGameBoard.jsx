import React, { useState } from 'react';
import { VISIT_MASCOT_STATE } from '../../utils/visitMascotState.js';
import { clampMapMascotPctForViewport } from '../../utils/mapViewMascotMotion.js';
import { GLMascotRenderer } from './GLMascotRenderer.jsx';
import { GLBoardMarkers } from './GLBoardMarkers.jsx';
import { glBoardPointToPct } from '../utils/glBoardPointToPct.js';

export function GLGameBoard({
  chapter,
  markers,
  teams,
  onMarkerClick,
  onBoardClick,
  onPlayerActionRequest,
  onSelectTeam,
  canMoveMascot,
  canRequestAction,
  selectedTeamId,
  currentTeamId,
  mascotStateMachine,
}) {
  const imageUrl = chapter?.map_image_url || '/maps/map-foret.svg';
  const [pendingMarker, setPendingMarker] = useState(null);
  const [actionType, setActionType] = useState('explore');

  function handleMarkerClick(marker) {
    if (canMoveMascot) {
      onMarkerClick?.(marker);
      return;
    }
    if (canRequestAction) {
      setPendingMarker(marker);
      return;
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

  return (
    <section className="gl-panel">
      <h2>{chapter?.title || 'Carte de jeu'}</h2>
      <div
        className="gl-board"
        onClick={(event) => {
          if (!canMoveMascot) return;
          const point = glBoardPointToPct(event, event.currentTarget);
          if (!point) return;
          const clamped = clampMapMascotPctForViewport(point.xp, point.yp, event.currentTarget.clientHeight || 0);
          onBoardClick?.(clamped);
        }}
      >
        <img src={imageUrl} alt={chapter?.title || 'Carte du chapitre'} className="gl-board-image" />
        <GLBoardMarkers markers={markers} onMarkerClick={handleMarkerClick} />
        {Array.isArray(teams) && teams.map((team) => {
          const isSelected = selectedTeamId != null && Number(selectedTeamId) === Number(team.id);
          const isCurrentTurn = currentTeamId != null && Number(currentTeamId) === Number(team.id);
          const classes = ['gl-board-team'];
          if (isSelected) classes.push('is-selected');
          if (isCurrentTurn) classes.push('is-current-turn');
          return (
            <button
              key={team.id}
              type="button"
              className={classes.join(' ')}
              style={{
                left: `${Number(team.position_x_pct || 50)}%`,
                top: `${Number(team.position_y_pct || 50)}%`,
                borderColor: team.color || '#22c55e',
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
              <div className="gl-board-team-label">{team.name}</div>
              <div className="gl-board-team-mascot">
                <GLMascotRenderer
                  mascotId={team.mascot_id}
                  mascotState={mascotStateMachine?.getStateForTeam?.(team.id) || VISIT_MASCOT_STATE.IDLE}
                  size={48}
                />
              </div>
            </button>
          );
        })}
      </div>

      {pendingMarker && (
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
      )}
    </section>
  );
}
