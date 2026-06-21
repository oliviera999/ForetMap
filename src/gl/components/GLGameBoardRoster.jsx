import React, { useMemo } from 'react';
import { GLVitalityCounts } from './GLVitalityDisplay.jsx';
import { buildMapRosterGroups, formatPlayerLabel } from '../utils/glSpellCastRules.js';

function resolvePlayerVitality(player, vitalityEnabled, vitalityByPlayerId) {
  if (!vitalityEnabled) return null;
  if (player?.healthPoints != null || player?.powerPoints != null) {
    return {
      health: Number(player.healthPoints) || 0,
      power: Number(player.powerPoints) || 0,
    };
  }
  const fromGame = vitalityByPlayerId?.[Number(player?.playerId)];
  if (fromGame) {
    return {
      health: Number(fromGame.health) || 0,
      power: Number(fromGame.power) || 0,
    };
  }
  return { health: 0, power: 0 };
}

export function GLGameBoardRoster({
  teams = [],
  roster = [],
  vitalityEnabled = false,
  vitalityByPlayerId = null,
  currentTeamId = null,
  selectedTeamId = null,
  playerId = null,
}) {
  const groups = useMemo(() => buildMapRosterGroups(teams, roster), [teams, roster]);

  if (!groups.length) return null;

  return (
    <aside
      className="gl-map-layout__roster gl-map-roster"
      data-testid="gl-map-roster"
      aria-label="Équipes et joueurs"
    >
      <h3 className="gl-map-roster__title">Équipes</h3>
      <div className="gl-map-roster__groups">
        {groups.map((group) => {
          const isCurrentTurn =
            currentTeamId != null && Number(currentTeamId) === Number(group.teamId);
          const isSelected =
            selectedTeamId != null && Number(selectedTeamId) === Number(group.teamId);
          const groupClasses = ['gl-map-roster-group'];
          if (isCurrentTurn) groupClasses.push('is-current-turn');
          if (isSelected) groupClasses.push('is-selected');

          return (
            <section
              key={group.teamId}
              className={groupClasses.join(' ')}
              data-testid={`gl-map-roster-team-${group.teamId}`}
            >
              <header className="gl-map-roster-group__head">
                <span
                  className="gl-map-roster-group__color"
                  style={{ '--gl-team-color': group.teamColor || '#94a3b8' }}
                  aria-hidden
                />
                <h4 className="gl-map-roster-group__title">{group.teamName}</h4>
                {isCurrentTurn ? (
                  <span className="gl-map-roster-group__turn-badge">Tour</span>
                ) : null}
              </header>
              {group.players.length === 0 ? (
                <p className="gl-map-roster-group__empty gl-hint">Aucun joueur dans cette équipe</p>
              ) : (
                <ul className="gl-map-roster-group__players">
                  {group.players.map((player) => {
                    const isSelf = playerId != null && Number(playerId) === Number(player.playerId);
                    const vitality = resolvePlayerVitality(
                      player,
                      vitalityEnabled,
                      vitalityByPlayerId,
                    );
                    return (
                      <li
                        key={player.playerId}
                        className={`gl-map-roster-player${isSelf ? ' is-self' : ''}`}
                      >
                        <span className="gl-map-roster-player__name">
                          {formatPlayerLabel(player)}
                          {isSelf ? (
                            <span className="gl-map-roster-player__you"> (vous)</span>
                          ) : null}
                        </span>
                        {vitality ? (
                          <GLVitalityCounts
                            health={vitality.health}
                            power={vitality.power}
                            className="gl-map-roster-player__vitality"
                          />
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </aside>
  );
}
