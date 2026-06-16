import React from 'react';
import { GLButton } from '../ui/GLButton.jsx';

/**
 * Corps de l'étape « spell » : grille de sortilèges du chapitre.
 * Composant feuille prop-driven : la sélection remonte via `onPick(code)`.
 *
 * @param {Array} chapterSpells sortilèges du chapitre
 * @param {(code:string)=>void} onPick
 */
export function GLSpellCastSpellPicker({ chapterSpells = [], onPick }) {
  return (
    <div className="gl-spell-cast-panel__body">
      <p className="gl-hint">Choisissez un sortilège du chapitre :</p>
      <div className="gl-spell-cast-spell-pick">
        {chapterSpells.map((s) => (
          <button
            key={s.spell_code}
            type="button"
            className="gl-spell-tile gl-spell-tile--pick"
            onClick={() => onPick?.(String(s.spell_code))}
          >
            <span className="gl-spell-tile__emoji" aria-hidden="true">
              {s.emoji || '✨'}
            </span>
            <span className="gl-spell-tile__name">{s.nom || s.spell_code}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Corps de l'étape « team » : choix de l'équipe qui lance le sortilège.
 * Composant feuille prop-driven : la sélection remonte via `onSelectTeam(id)`.
 *
 * @param {Array} teams équipes sélectionnables
 * @param {number|null} selectedTeamId
 * @param {boolean} busy
 * @param {(teamId:number)=>void} onSelectTeam
 */
export function GLSpellCastTeamPicker({ teams = [], selectedTeamId, busy = false, onSelectTeam }) {
  return (
    <div className="gl-spell-cast-panel__body">
      <p className="gl-hint">Quelle équipe lance ce sortilège ?</p>
      {teams.length === 0 ? (
        <p className="gl-hint">Aucune équipe disponible pour vous dans cette partie.</p>
      ) : (
        <div className="gl-spell-cast-teams">
          {teams.map((team) => (
            <GLButton
              key={team.id}
              type="button"
              variant={Number(selectedTeamId) === Number(team.id) ? 'primary' : 'secondary'}
              disabled={busy}
              onClick={() => onSelectTeam?.(team.id)}
            >
              {team.name || `Équipe ${team.id}`}
            </GLButton>
          ))}
        </div>
      )}
    </div>
  );
}
