import React, { useEffect, useMemo, useState } from 'react';
import { apiGL } from '../services/apiGL.js';

function formatTimestamp(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleTimeString();
  } catch (_) {
    return '';
  }
}

export function GLGameMasterConsole({
  chapters,
  gameState,
  onGameStateChange,
  onReloadGame,
  gameplaySettings,
  selectedTeamId,
  onSelectTeam,
}) {
  const [name, setName] = useState('Partie découverte');
  const [chapterId, setChapterId] = useState('');
  const [classId, setClassId] = useState('1');
  const [eventLog, setEventLog] = useState('');
  const [narration, setNarration] = useState('');
  const [scoreDelta, setScoreDelta] = useState(1);
  const [scoreReason, setScoreReason] = useState('');
  const [resolveDeltas, setResolveDeltas] = useState({});

  const teams = Array.isArray(gameState?.teams) ? gameState.teams : [];
  const game = gameState?.game || null;
  const scores = gameState?.scores || {};
  const pendingActions = Array.isArray(gameState?.pendingActions) ? gameState.pendingActions : [];
  const currentTeamId = game?.current_team_id != null ? Number(game.current_team_id) : null;

  const flags = gameplaySettings || {};
  const turnsEnabled = !!flags.turnsEnabled;
  const narrationEnabled = !!flags.narrationEnabled;
  const playerActionsEnabled = !!flags.playerActionsEnabled;
  const scoringEnabled = !!flags.scoringEnabled;

  const effectiveSelectedTeamId = useMemo(() => {
    if (selectedTeamId != null && teams.some((team) => Number(team.id) === Number(selectedTeamId))) {
      return Number(selectedTeamId);
    }
    return teams.length > 0 ? Number(teams[0].id) : null;
  }, [selectedTeamId, teams]);

  useEffect(() => {
    if (selectedTeamId !== effectiveSelectedTeamId && effectiveSelectedTeamId != null) {
      onSelectTeam?.(effectiveSelectedTeamId);
    }
  }, [effectiveSelectedTeamId, selectedTeamId, onSelectTeam]);

  async function createGame(event) {
    event.preventDefault();
    const payload = {
      name,
      chapterId: Number(chapterId),
      classId: Number(classId),
    };
    const created = await apiGL('/api/gl/games', 'POST', payload);
    onGameStateChange(created);
    setEventLog('Partie créée.');
  }

  async function setStatus(nextStatus) {
    if (!game?.id) return;
    await apiGL(`/api/gl/games/${game.id}/${nextStatus}`, 'POST');
    await onReloadGame?.();
    setEventLog(`Statut: ${nextStatus}`);
  }

  async function addTeam(type) {
    if (!game?.id) return;
    const label = type === 'gnome' ? 'Equipe Gnomes' : 'Equipe Licornes';
    const mascotId = type === 'gnome' ? 'gnome-foret-rive' : 'tan-bird-spritesheet';
    await apiGL(`/api/gl/games/${game.id}/teams`, 'POST', {
      name: `${label} ${Date.now().toString().slice(-3)}`,
      type,
      mascotId,
      color: type === 'gnome' ? '#65a30d' : '#a855f7',
    });
    await onReloadGame?.();
    setEventLog(`Equipe ${type} ajoutée.`);
  }

  async function nextTurn() {
    if (!game?.id) return;
    try {
      await apiGL(`/api/gl/games/${game.id}/turn/next`, 'POST');
      await onReloadGame?.();
      setEventLog('Tour suivant.');
    } catch (err) {
      setEventLog(err.message || 'Tour suivant impossible');
    }
  }

  async function sendNarration(event) {
    event.preventDefault();
    if (!game?.id) return;
    const text = String(narration || '').trim();
    if (!text) return;
    try {
      await apiGL(`/api/gl/games/${game.id}/events`, 'POST', {
        eventType: 'narration',
        teamId: effectiveSelectedTeamId,
        payload: { text },
      });
      setNarration('');
      await onReloadGame?.();
      setEventLog('Narration envoyée.');
    } catch (err) {
      setEventLog(err.message || 'Narration impossible');
    }
  }

  async function applyScoreDelta(delta) {
    if (!game?.id || effectiveSelectedTeamId == null) return;
    try {
      await apiGL(`/api/gl/games/${game.id}/events`, 'POST', {
        eventType: 'score',
        teamId: effectiveSelectedTeamId,
        payload: { delta: Number(delta), reason: scoreReason || null },
      });
      setScoreReason('');
      await onReloadGame?.();
      setEventLog(`Score ${delta > 0 ? '+' : ''}${delta}`);
    } catch (err) {
      setEventLog(err.message || 'Score impossible');
    }
  }

  async function resolveAction(actionId, decision) {
    if (!game?.id) return;
    const delta = scoringEnabled ? Number(resolveDeltas[actionId] || 0) : 0;
    try {
      await apiGL(`/api/gl/games/${game.id}/actions/${actionId}/resolve`, 'POST', {
        decision,
        scoreDelta: delta,
      });
      setResolveDeltas((prev) => {
        const next = { ...prev };
        delete next[actionId];
        return next;
      });
      await onReloadGame?.();
      setEventLog(`Action ${decision === 'accepted' ? 'acceptée' : 'refusée'}.`);
    } catch (err) {
      setEventLog(err.message || 'Résolution impossible');
    }
  }

  return (
    <section className="gl-panel gl-mj-console">
      <h2>Console MJ</h2>

      <form onSubmit={createGame} className="gl-form">
        <label>
          Nom de partie
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Classe ID
          <input value={classId} onChange={(event) => setClassId(event.target.value)} />
        </label>
        <label>
          Chapitre
          <select value={chapterId} onChange={(event) => setChapterId(event.target.value)}>
            <option value="">Choisir</option>
            {chapters.map((chapter) => (
              <option key={chapter.id} value={chapter.id}>{chapter.title}</option>
            ))}
          </select>
        </label>
        <button type="submit">Créer une partie</button>
      </form>

      <div className="gl-inline-actions">
        <button type="button" onClick={() => setStatus('start')}>Démarrer</button>
        <button type="button" onClick={() => setStatus('pause')}>Pause</button>
        <button type="button" onClick={() => setStatus('end')}>Terminer</button>
      </div>
      <div className="gl-inline-actions">
        <button type="button" onClick={() => addTeam('gnome')}>Ajouter équipe Gnome</button>
        <button type="button" onClick={() => addTeam('unicorn')}>Ajouter équipe Licorne</button>
      </div>

      {teams.length > 0 && (
        <div className="gl-team-selector">
          <h3>Équipe active (déplacement / score / narration)</h3>
          <div className="gl-team-selector-list">
            {teams.map((team) => {
              const isSelected = effectiveSelectedTeamId === Number(team.id);
              const isCurrentTurn = turnsEnabled && currentTeamId === Number(team.id);
              return (
                <button
                  key={team.id}
                  type="button"
                  className={`gl-team-chip${isSelected ? ' is-selected' : ''}${isCurrentTurn ? ' is-current-turn' : ''}`}
                  onClick={() => onSelectTeam?.(Number(team.id))}
                  style={{ borderColor: team.color || '#22c55e' }}
                >
                  <span>{team.name}</span>
                  {isCurrentTurn ? <span className="gl-team-chip-badge">Tour</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {turnsEnabled && (
        <div className="gl-gameplay-block">
          <h3>Tour de jeu</h3>
          <p>
            Équipe courante :{' '}
            <strong>
              {currentTeamId != null
                ? (teams.find((team) => Number(team.id) === currentTeamId)?.name || `#${currentTeamId}`)
                : 'aucune'}
            </strong>
          </p>
          <button type="button" onClick={nextTurn}>Tour suivant</button>
        </div>
      )}

      {narrationEnabled && (
        <form className="gl-gameplay-block" onSubmit={sendNarration}>
          <h3>Narration MJ</h3>
          <textarea
            rows={3}
            value={narration}
            placeholder="Texte affiché en bandeau aux joueurs..."
            onChange={(event) => setNarration(event.target.value)}
          />
          <button type="submit">Envoyer la narration</button>
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
                    <div>Type : <code>{action.actionType}</code></div>
                    {action.payload && Object.keys(action.payload).length > 0 && (
                      <pre className="gl-pending-action-payload">{JSON.stringify(action.payload, null, 2)}</pre>
                    )}
                    {scoringEnabled && (
                      <label>
                        Score à attribuer en cas d’acceptation
                        <input
                          type="number"
                          value={resolveDeltas[action.id] ?? 0}
                          onChange={(event) =>
                            setResolveDeltas((prev) => ({ ...prev, [action.id]: Number(event.target.value) }))
                          }
                        />
                      </label>
                    )}
                    <div className="gl-inline-actions">
                      <button type="button" onClick={() => resolveAction(action.id, 'accepted')}>Accepter</button>
                      <button type="button" onClick={() => resolveAction(action.id, 'refused')}>Refuser</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
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
                  <span className="gl-scoreboard-team" style={{ borderColor: team.color || '#22c55e' }}>
                    {team.name}
                  </span>
                  <span className="gl-scoreboard-score">{entry.score || 0}</span>
                  {entry.lastReason ? <span className="gl-hint">{entry.lastReason}</span> : null}
                </li>
              );
            })}
          </ul>
          <div className="gl-inline-actions">
            <input
              type="number"
              value={scoreDelta}
              onChange={(event) => setScoreDelta(Number(event.target.value) || 0)}
              style={{ width: 72 }}
            />
            <input
              type="text"
              value={scoreReason}
              placeholder="Motif (optionnel)"
              onChange={(event) => setScoreReason(event.target.value)}
            />
            <button type="button" onClick={() => applyScoreDelta(scoreDelta)}>Appliquer à l’équipe active</button>
          </div>
        </div>
      )}

      {eventLog ? <p className="gl-event-log">{eventLog}</p> : null}
    </section>
  );
}
