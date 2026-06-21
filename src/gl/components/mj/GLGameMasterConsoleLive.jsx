import React from 'react';
import { GLButton } from '../ui/GLButton.jsx';
import { GLField } from '../ui/GLField.jsx';
import { GLImageInlineInsertControls } from '../GLImageInlineInsertControls.jsx';
import { GLInput } from '../ui/GLInput.jsx';
import { GLTextarea } from '../ui/GLTextarea.jsx';

export default function GLGameMasterConsoleLive({
  game,
  teams,
  gameStatus,
  effectiveSelectedTeamId,
  currentTeamId,
  turnsEnabled,
  roundNumber,
  pendingSpellCasts = [],
  onResolveSpellCast,
  narrationEnabled,
  playerActionsEnabled,
  scoringEnabled,
  vitalityEnabled,
  canSpellCast,
  pendingActions,
  scores,
  narration,
  setNarration,
  narrationImageUrl,
  setNarrationImageUrl,
  scoreDelta,
  setScoreDelta,
  scoreReason,
  setScoreReason,
  teamHealthDelta,
  setTeamHealthDelta,
  teamPowerDelta,
  setTeamPowerDelta,
  resolveDeltas,
  setResolveDeltas,
  onSelectTeam,
  onLaunchSpell,
  nextTurn,
  sendNarration,
  applyScoreDelta,
  applyTeamVitality,
  resolveAction,
  showFailure,
  onGoToParties,
  busy,
  formatTimestamp,
}) {
  if (!game?.id) {
    return (
      <div className="gl-empty-state">
        <span className="gl-empty-state-icon foretmap-emoji-text-mixed" aria-hidden="true">
          🎲
        </span>
        <p>Sélectionnez ou créez une partie dans l’onglet « Parties ».</p>
        <GLButton type="button" variant="secondary" onClick={onGoToParties}>
          Aller aux parties
        </GLButton>
      </div>
    );
  }

  return (
    <>
      {teams.length > 0 && (
        <div className="gl-team-selector gl-gameplay-block">
          <h3>Équipe active (déplacement / score / narration)</h3>
          <div className="gl-team-selector-list">
            {teams.map((team) => {
              const isSelected = effectiveSelectedTeamId === Number(team.id);
              const hasMoved = turnsEnabled && team.hasMovedThisRound === true;
              return (
                <button
                  key={team.id}
                  type="button"
                  className={`gl-team-chip${isSelected ? ' is-selected' : ''}${hasMoved ? ' is-moved' : ''}`}
                  onClick={() => onSelectTeam?.(Number(team.id))}
                  style={{ borderColor: team.color || '#22c55e' }}
                  data-team-id={team.id}
                  data-team-mascot={team.mascot_id || ''}
                >
                  <span
                    className="gl-team-chip-color"
                    style={{ backgroundColor: team.color || '#22c55e' }}
                    aria-hidden="true"
                  />
                  <span>{team.name}</span>
                  {team.mascot_id ? (
                    <span className="gl-team-chip-mascot">{team.mascot_id}</span>
                  ) : null}
                  {hasMoved ? (
                    <span className="gl-team-chip-badge" title="Mascotte déplacée ce tour">
                      ✓ déplacée
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {canSpellCast && gameStatus === 'live' ? (
        <div className="gl-gameplay-block">
          <h3>Sortilèges</h3>
          <p className="gl-hint">
            Lancement collaboratif (toutes équipes) : répartissez gemmes et cœurs entre les joueurs.
          </p>
          <GLButton type="button" onClick={() => onLaunchSpell?.(null)} disabled={busy}>
            Lancer un sortilège
          </GLButton>
        </div>
      ) : null}

      {turnsEnabled && (
        <div className="gl-gameplay-block">
          <h3>Tour de jeu</h3>
          <p>
            Tour courant :{' '}
            <strong>
              {Number(roundNumber) > 0 ? `n°${roundNumber}` : 'aucun (pas encore lancé)'}
            </strong>
          </p>
          <p className="gl-hint">
            Toutes les équipes jouent simultanément. Lancer un nouveau tour réautorise le
            déplacement de chaque mascotte.
          </p>
          <GLButton type="button" onClick={nextTurn} disabled={busy}>
            {Number(roundNumber) > 0 ? 'Lancer le tour suivant' : 'Lancer le premier tour'}
          </GLButton>
        </div>
      )}

      {pendingSpellCasts.length > 0 ? (
        <div className="gl-gameplay-block gl-spell-approval-queue">
          <h3>Sortilèges à valider ({pendingSpellCasts.length})</h3>
          <p className="gl-hint">Les gemmes / cœurs ne sont débités qu&apos;après votre accord.</p>
          <ul className="gl-pending-actions">
            {pendingSpellCasts.map((draft) => {
              const team = teams.find((t) => Number(t.id) === Number(draft.teamId));
              const spellName = draft.spell?.nom || draft.spellCode;
              const cost = draft.required || draft.spell?.required || {};
              return (
                <li key={draft.id} className="gl-pending-action">
                  <div className="gl-pending-action-head">
                    <strong>
                      {draft.spell?.emoji ? `${draft.spell.emoji} ` : ''}
                      {spellName}
                    </strong>
                    <span className="gl-hint">{team?.name || `Équipe #${draft.teamId}`}</span>
                  </div>
                  <div className="gl-hint">
                    Coût : {Number(cost.gems) || 0} 💎 · {Number(cost.hearts) || 0} ❤️
                  </div>
                  <div className="gl-inline-actions">
                    <GLButton
                      type="button"
                      size="sm"
                      onClick={() => onResolveSpellCast?.(draft.id, 'accept')}
                      disabled={busy}
                    >
                      Valider
                    </GLButton>
                    <GLButton
                      type="button"
                      size="sm"
                      variant="danger"
                      onClick={() => onResolveSpellCast?.(draft.id, 'reject')}
                      disabled={busy}
                    >
                      Refuser
                    </GLButton>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {narrationEnabled && (
        <form className="gl-gameplay-block" onSubmit={sendNarration}>
          <h3>Narration MJ</h3>
          <GLTextarea
            rows={3}
            value={narration}
            placeholder="Texte affiché en bandeau aux joueurs..."
            onChange={(event) => setNarration(event.target.value)}
          />
          {narrationImageUrl ? (
            <p className="gl-hint">
              Illustration : <code>{narrationImageUrl}</code>{' '}
              <GLButton type="button" variant="secondary" onClick={() => setNarrationImageUrl('')}>
                Retirer
              </GLButton>
            </p>
          ) : null}
          <GLImageInlineInsertControls
            legend="Illustration (optionnelle)"
            intro="Image de la bibliothèque média, visible dans le journal de partie."
            onInsert={({ url }) => setNarrationImageUrl(String(url || '').trim())}
            onStatus={(msg, isErr) => {
              if (isErr) showFailure(msg);
            }}
          />
          <GLButton type="submit" disabled={busy}>
            Envoyer la narration
          </GLButton>
        </form>
      )}

      {playerActionsEnabled && (
        <div className="gl-gameplay-block">
          <h3>Demandes d’action des joueurs ({pendingActions.length})</h3>
          {pendingActions.length === 0 ? (
            <p className="gl-hint">Aucune demande en attente.</p>
          ) : (
            <ul className="gl-pending-actions">
              {pendingActions.map((action) => {
                const team = teams.find((t) => Number(t.id) === Number(action.teamId));
                return (
                  <li key={action.id} className="gl-pending-action">
                    <div className="gl-pending-action-head">
                      <strong>{team?.name || `Équipe #${action.teamId}`}</strong>
                      <span className="gl-hint">{formatTimestamp(action.createdAt)}</span>
                    </div>
                    <div>
                      Type : <code>{action.actionType}</code>
                    </div>
                    {action.payload && Object.keys(action.payload).length > 0 && (
                      <pre className="gl-pending-action-payload">
                        {JSON.stringify(action.payload, null, 2)}
                      </pre>
                    )}
                    {scoringEnabled && (
                      <GLField label="Score à attribuer en cas d’acceptation">
                        <GLInput
                          type="number"
                          value={resolveDeltas[action.id] ?? 0}
                          onChange={(event) =>
                            setResolveDeltas((prev) => ({
                              ...prev,
                              [action.id]: Number(event.target.value),
                            }))
                          }
                        />
                      </GLField>
                    )}
                    <div className="gl-inline-actions">
                      <GLButton
                        type="button"
                        size="sm"
                        onClick={() => resolveAction(action.id, 'accepted')}
                        disabled={busy}
                      >
                        Accepter
                      </GLButton>
                      <GLButton
                        type="button"
                        size="sm"
                        variant="danger"
                        onClick={() => resolveAction(action.id, 'refused')}
                        disabled={busy}
                      >
                        Refuser
                      </GLButton>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {vitalityEnabled && teams.length > 0 && (
        <div className="gl-gameplay-block gl-vitality-team-panel">
          <h3>Points de vie et de pouvoir (équipe active)</h3>
          <p className="gl-hint">
            Ajuste tous les joueurs assignés à l&apos;équipe sélectionnée sur la carte.
          </p>
          <div className="gl-inline-actions">
            <GLField label="Δ PV (❤️)">
              <GLInput
                type="number"
                value={teamHealthDelta}
                onChange={(event) => setTeamHealthDelta(Number(event.target.value) || 0)}
                style={{ width: 72 }}
              />
            </GLField>
            <GLField label="Δ PP (💎)">
              <GLInput
                type="number"
                value={teamPowerDelta}
                onChange={(event) => setTeamPowerDelta(Number(event.target.value) || 0)}
                style={{ width: 72 }}
              />
            </GLField>
            <GLButton
              type="button"
              disabled={busy || effectiveSelectedTeamId == null}
              onClick={() => applyTeamVitality({ healthDelta: teamHealthDelta, powerDelta: 0 })}
            >
              Appliquer PV à l&apos;équipe
            </GLButton>
            <GLButton
              type="button"
              variant="secondary"
              disabled={busy || effectiveSelectedTeamId == null}
              onClick={() => applyTeamVitality({ healthDelta: 0, powerDelta: teamPowerDelta })}
            >
              Appliquer PP à l&apos;équipe
            </GLButton>
            <GLButton
              type="button"
              variant="secondary"
              disabled={busy || effectiveSelectedTeamId == null}
              onClick={() =>
                applyTeamVitality({ healthDelta: teamHealthDelta, powerDelta: teamPowerDelta })
              }
            >
              Appliquer les deux
            </GLButton>
          </div>
        </div>
      )}

      {scoringEnabled && teams.length > 0 && (
        <div className="gl-gameplay-block">
          <h3>Tableau des scores</h3>
          <ul className="gl-scoreboard">
            {teams.map((team) => {
              const entry = scores[team.id] || { score: 0 };
              return (
                <li key={team.id} className="gl-scoreboard-row">
                  <span
                    className="gl-scoreboard-team"
                    style={{ borderColor: team.color || '#22c55e' }}
                  >
                    {team.name}
                  </span>
                  <span className="gl-scoreboard-score">{entry.score || 0}</span>
                  {entry.lastReason ? <span className="gl-hint">{entry.lastReason}</span> : null}
                </li>
              );
            })}
          </ul>
          <div className="gl-inline-actions">
            <GLInput
              type="number"
              value={scoreDelta}
              onChange={(event) => setScoreDelta(Number(event.target.value) || 0)}
              style={{ width: 72 }}
            />
            <GLInput
              type="text"
              value={scoreReason}
              placeholder="Motif (optionnel)"
              onChange={(event) => setScoreReason(event.target.value)}
            />
            <GLButton type="button" onClick={() => applyScoreDelta(scoreDelta)} disabled={busy}>
              Appliquer à l’équipe active
            </GLButton>
          </div>
        </div>
      )}

      {!turnsEnabled &&
      !narrationEnabled &&
      !playerActionsEnabled &&
      !scoringEnabled &&
      !vitalityEnabled ? (
        <div className="gl-empty-state">
          <span className="gl-empty-state-icon foretmap-emoji-text-mixed" aria-hidden="true">
            ⚙️
          </span>
          <p>Aucun module de jeu en direct activé. Configurez-les dans l’onglet Réglages.</p>
        </div>
      ) : null}
    </>
  );
}
