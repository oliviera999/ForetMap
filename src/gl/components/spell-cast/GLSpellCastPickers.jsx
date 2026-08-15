import React from 'react';
import { GLButton } from '../ui/GLButton.jsx';
import { glSpellCasterKindBadge, GL_TEAM_TYPE_LABELS } from '../../utils/glSpellFieldLabels.js';

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
        {chapterSpells.map((s) => {
          const casterBadge = glSpellCasterKindBadge(s.caster_kind);
          return (
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
              {casterBadge ? <span className="gl-badge">{casterBadge}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Corps de l'étape « team » : choix de l'équipe qui lance le sortilège.
 * Composant feuille prop-driven : la sélection remonte via `onSelectTeam(id)`.
 *
 * @param {Array} teams équipes sélectionnables (déjà filtrées par peuple si le sort est restreint)
 * @param {number|null} selectedTeamId
 * @param {boolean} busy
 * @param {string} casterKind restriction de peuple du sort ('any' | 'gnome' | 'unicorn')
 * @param {(teamId:number)=>void} onSelectTeam
 */
export function GLSpellCastTeamPicker({
  teams = [],
  selectedTeamId,
  busy = false,
  casterKind = 'any',
  onSelectTeam,
}) {
  const casterBadge = glSpellCasterKindBadge(casterKind);
  return (
    <div className="gl-spell-cast-panel__body">
      <p className="gl-hint">Quelle équipe lance ce sortilège ?</p>
      {casterBadge ? (
        <p className="gl-hint">
          <span className="gl-badge">{casterBadge}</span>
        </p>
      ) : null}
      {teams.length === 0 ? (
        <p className="gl-hint">
          {casterBadge
            ? 'Aucune équipe du peuple requis n’est disponible pour vous dans cette partie.'
            : 'Aucune équipe disponible pour vous dans cette partie.'}
        </p>
      ) : (
        <div className="gl-spell-cast-teams">
          {teams.map((team) => {
            const typeLabel = GL_TEAM_TYPE_LABELS[String(team.type || '')] || null;
            return (
              <GLButton
                key={team.id}
                type="button"
                variant={Number(selectedTeamId) === Number(team.id) ? 'primary' : 'secondary'}
                disabled={busy}
                onClick={() => onSelectTeam?.(team.id)}
              >
                {team.name || `Équipe ${team.id}`}
                {typeLabel ? ` · ${typeLabel}` : ''}
              </GLButton>
            );
          })}
        </div>
      )}
    </div>
  );
}
