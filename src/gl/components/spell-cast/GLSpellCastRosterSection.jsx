import React from 'react';
import { GLInput } from '../ui/GLInput.jsx';
import {
  canEditContributionRow,
  formatPlayerLabel,
  groupRosterByTeam,
} from '../../utils/glSpellCastRules.js';

/** Barre de progression d'une ressource (gemmes / cœurs). */
function ProgressBar({ label, current, required, emoji }) {
  if (!required || required <= 0) return null;
  const pct = Math.min(100, Math.round((current / required) * 100));
  return (
    <div className="gl-spell-cast-progress">
      <div className="gl-spell-cast-progress__label">
        <span>{label}</span>
        <span>
          {current}/{required} {emoji}
        </span>
      </div>
      <div className="gl-spell-cast-progress__track" aria-hidden="true">
        <div className="gl-spell-cast-progress__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Ligne joueur : identité + champs de contribution gemmes/cœurs. */
function RosterPlayerRow({
  player,
  row,
  required,
  editable,
  busy,
  onUpdateContrib,
  onContribBlur,
}) {
  return (
    <li className="gl-spell-cast-roster__row">
      <div className="gl-spell-cast-roster__identity">
        <strong>{formatPlayerLabel(player)}</strong>
        <span className="gl-spell-cast-roster__balance">
          ❤️
          {player.healthPoints} · 💎
          {player.powerPoints}
        </span>
      </div>
      <div className="gl-spell-cast-roster__inputs">
        {required.gems > 0 ? (
          <label className="gl-spell-cast-roster__field">
            <span className="gl-visually-hidden">Gemmes pour</span>
            <span aria-hidden="true">💎</span>
            <GLInput
              type="number"
              min={0}
              max={player.powerPoints}
              disabled={!editable || busy}
              value={row.gems}
              onChange={(e) => onUpdateContrib(player.playerId, 'gems', e.target.value)}
              onBlur={(e) => onContribBlur(player.playerId, 'gems', e.target.value)}
            />
          </label>
        ) : null}
        {required.hearts > 0 ? (
          <label className="gl-spell-cast-roster__field">
            <span className="gl-visually-hidden">Cœurs pour</span>
            <span aria-hidden="true">❤️</span>
            <GLInput
              type="number"
              min={0}
              max={player.healthPoints}
              disabled={!editable || busy}
              value={row.hearts}
              onChange={(e) => onUpdateContrib(player.playerId, 'hearts', e.target.value)}
              onBlur={(e) => onContribBlur(player.playerId, 'hearts', e.target.value)}
            />
          </label>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Corps de l'étape « fund » : barres de progression + roster groupé par équipe.
 * Composant feuille prop-driven : aucun état interne ni appel réseau ;
 * les contributions remontent via `onUpdateContrib` / `onContribBlur` (parent).
 *
 * @param {object} draft brouillon de lancement (roster)
 * @param {{gems:number, hearts:number}} required coût requis
 * @param {{gems:number, hearts:number}} totals totaux courants
 * @param {Array} localContribs contributions locales en cours d'édition
 * @param {string} contributionMode mode de contribution
 * @param {number} playerId joueur acteur
 * @param {boolean} isStaff
 * @param {boolean} busy
 * @param {(playerId:number, field:string, value:*)=>void} onUpdateContrib
 * @param {(playerId:number, field:string, value:*)=>void} onContribBlur
 */
export function GLSpellCastRosterSection({
  draft,
  required,
  totals,
  localContribs,
  contributionMode,
  playerId,
  isStaff,
  busy,
  onUpdateContrib,
  onContribBlur,
}) {
  const roster = draft?.roster || [];
  const rosterEmpty = draft && roster.length === 0;
  const rosterGroups = groupRosterByTeam(roster);

  return (
    <>
      <ProgressBar label="Gemmes" current={totals.gems} required={required.gems} emoji="💎" />
      <ProgressBar label="Cœurs" current={totals.hearts} required={required.hearts} emoji="❤️" />
      {rosterEmpty ? (
        <p className="gl-hint">
          Aucun joueur assigné aux équipes de cette partie. Assignez les joueurs depuis la console
          MJ (onglet Équipes / roster).
        </p>
      ) : (
        rosterGroups.map((group) => (
          <section key={group.teamId} className="gl-spell-cast-roster-group">
            <h3 className="gl-spell-cast-roster-group__title">{group.teamName}</h3>
            <ul className="gl-spell-cast-roster">
              {group.players.map((player) => {
                const row = localContribs.find(
                  (r) => Number(r.playerId) === Number(player.playerId),
                ) || { gems: 0, hearts: 0 };
                const editable = canEditContributionRow({
                  contributionMode,
                  actorPlayerId: playerId,
                  targetPlayerId: player.playerId,
                  isStaff,
                });
                return (
                  <RosterPlayerRow
                    key={player.playerId}
                    player={player}
                    row={row}
                    required={required}
                    editable={editable}
                    busy={busy}
                    onUpdateContrib={onUpdateContrib}
                    onContribBlur={onContribBlur}
                  />
                );
              })}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
