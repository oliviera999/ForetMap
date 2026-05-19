import React, { useState } from 'react';
import VisitMapMascotRenderer from '../../components/VisitMapMascotRenderer.jsx';
import { VISIT_MASCOT_STATE } from '../../utils/visitMascotState.js';

export function GLGameBoard({
  chapter,
  markers,
  teams,
  onMarkerClick,
  onPlayerActionRequest,
  canMoveMascot,
  canRequestAction,
  selectedTeamId,
  currentTeamId,
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
      <div className="gl-board">
        <img src={imageUrl} alt={chapter?.title || 'Carte du chapitre'} className="gl-board-image" />
        {Array.isArray(markers) && markers.map((marker) => (
          <button
            key={marker.id}
            type="button"
            className="gl-board-marker"
            style={{ left: `${marker.x_pct}%`, top: `${marker.y_pct}%` }}
            title={marker.label}
            data-marker-id={marker.id}
            onClick={() => handleMarkerClick(marker)}
          >
            {marker.label}
          </button>
        ))}
        {Array.isArray(teams) && teams.map((team) => {
          const isSelected = selectedTeamId != null && Number(selectedTeamId) === Number(team.id);
          const isCurrentTurn = currentTeamId != null && Number(currentTeamId) === Number(team.id);
          const classes = ['gl-board-team'];
          if (isSelected) classes.push('is-selected');
          if (isCurrentTurn) classes.push('is-current-turn');
          return (
            <div
              key={team.id}
              className={classes.join(' ')}
              style={{
                left: `${Number(team.position_x_pct || 50)}%`,
                top: `${Number(team.position_y_pct || 50)}%`,
                borderColor: team.color || '#22c55e',
              }}
              title={team.name}
              data-team-id={team.id}
              data-team-mascot={team.mascot_id || ''}
            >
              <div className="gl-board-team-label">{team.name}</div>
              <div className="gl-board-team-mascot">
                <VisitMapMascotRenderer mascotState={VISIT_MASCOT_STATE.IDLE} mascotId={team.mascot_id} />
              </div>
            </div>
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
