import React from 'react';
import VisitMapMascotRenderer from '../../components/VisitMapMascotRenderer.jsx';
import { VISIT_MASCOT_STATE } from '../../utils/visitMascotState.js';

export function GLGameBoard({ chapter, markers, teams, onMarkerClick, canMoveMascot }) {
  const imageUrl = chapter?.map_image_url || '/maps/map-foret.svg';
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
            onClick={() => canMoveMascot && onMarkerClick?.(marker)}
          >
            {marker.label}
          </button>
        ))}
        {Array.isArray(teams) && teams.map((team) => (
          <div
            key={team.id}
            className="gl-board-team"
            style={{
              left: `${Number(team.position_x_pct || 50)}%`,
              top: `${Number(team.position_y_pct || 50)}%`,
              borderColor: team.color || '#22c55e',
            }}
            title={team.name}
          >
            <div className="gl-board-team-label">{team.name}</div>
            <div className="gl-board-team-mascot">
              <VisitMapMascotRenderer mascotState={VISIT_MASCOT_STATE.IDLE} mascotId={team.mascot_id} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
