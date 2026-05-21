import React, { useEffect, useMemo, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { GLGameRosterPanel } from './admin/GLGameRosterPanel.jsx';

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
  classes = [],
  gameState,
  onGameStateChange,
  onReloadGame,
  gameplaySettings,
  selectedTeamId,
  onSelectTeam,
}) {
  const [name, setName] = useState('Partie découverte');
  const [chapterId, setChapterId] = useState('');
  const [classId, setClassId] = useState('');
  const [eventLog, setEventLog] = useState('');
  const [narration, setNarration] = useState('');
  const [scoreDelta, setScoreDelta] = useState(1);
  const [scoreReason, setScoreReason] = useState('');
  const [resolveDeltas, setResolveDeltas] = useState({});
  const [actionError, setActionError] = useState('');
  const [games, setGames] = useState([]);
  const [gamesStatusFilter, setGamesStatusFilter] = useState('');
  const [gamesClassFilter, setGamesClassFilter] = useState('');
  const [teamForm, setTeamForm] = useState({
    name: '',
    type: 'gnome',
    mascotId: 'gl-gnome-mousse',
    color: '#65a30d',
  });
  const [editingTeamId, setEditingTeamId] = useState(null);
  const [rosterRefreshKey, setRosterRefreshKey] = useState(0);

  const activeClasses = useMemo(
    () => (Array.isArray(classes) ? classes : []).filter((item) => Number(item.is_active) !== 0),
    [classes]
  );

  useEffect(() => {
    if (classId !== '' || activeClasses.length === 0) return;
    setClassId(String(activeClasses[0].id));
  }, [activeClasses, classId]);

  useEffect(() => {
    if (gamesClassFilter !== '' || activeClasses.length === 0) return;
    setGamesClassFilter(String(activeClasses[0].id));
  }, [activeClasses, gamesClassFilter]);

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

  async function loadGames() {
    try {
      const params = new URLSearchParams();
      if (gamesClassFilter) params.set('classId', gamesClassFilter);
      if (gamesStatusFilter) params.set('status', gamesStatusFilter);
      const query = params.toString();
      const rows = await apiGL(`/api/gl/games${query ? `?${query}` : ''}`);
      setGames(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setActionError(err.message || 'Chargement des parties impossible');
    }
  }

  useEffect(() => {
    loadGames();
  }, [gamesClassFilter, gamesStatusFilter]);

  useEffect(() => {
    if (selectedTeamId !== effectiveSelectedTeamId && effectiveSelectedTeamId != null) {
      onSelectTeam?.(effectiveSelectedTeamId);
    }
  }, [effectiveSelectedTeamId, selectedTeamId, onSelectTeam]);

  async function createGame(event) {
    event.preventDefault();
    setActionError('');
    if (!classId) {
      setActionError(
        activeClasses.length === 0
          ? 'Créez d’abord une classe active (onglet « Gestion utilisateurs »).'
          : 'Choisissez une classe avant de créer la partie.'
      );
      return;
    }
    if (!chapterId) {
      setActionError('Choisissez un chapitre avant de créer la partie.');
      return;
    }
    try {
      const payload = {
        name,
        chapterId: Number(chapterId),
        classId: Number(classId),
      };
      const created = await apiGL('/api/gl/games', 'POST', payload);
      onGameStateChange(created);
      setEventLog('Partie créée.');
      await loadGames();
      setRosterRefreshKey((value) => value + 1);
    } catch (err) {
      setActionError(err.message || 'Création de partie impossible');
    }
  }

  async function openGame(gameId) {
    setActionError('');
    try {
      const data = await apiGL(`/api/gl/games/${gameId}`);
      onGameStateChange(data);
      setEventLog(`Partie #${gameId} chargée.`);
      setRosterRefreshKey((value) => value + 1);
    } catch (err) {
      setActionError(err.message || 'Chargement de la partie impossible');
    }
  }

  async function removeGame(gameId) {
    const ok = window.confirm('Supprimer cette partie ? (autorisé uniquement pour brouillon/terminée)');
    if (!ok) return;
    setActionError('');
    try {
      await apiGL(`/api/gl/games/${gameId}`, 'DELETE');
      setEventLog(`Partie #${gameId} supprimée.`);
      await loadGames();
      if (Number(game?.id) === Number(gameId)) {
        onGameStateChange(null);
      }
    } catch (err) {
      setActionError(err.message || 'Suppression de partie impossible');
    }
  }

  async function setStatus(nextStatus) {
    if (!game?.id) {
      setActionError('Créez d’abord une partie.');
      return;
    }
    setActionError('');
    try {
      await apiGL(`/api/gl/games/${game.id}/${nextStatus}`, 'POST');
      await onReloadGame?.();
      setEventLog(`Statut: ${nextStatus}`);
    } catch (err) {
      setActionError(err.message || `Action « ${nextStatus} » impossible`);
    }
  }

  async function addTeam(type) {
    if (!game?.id) {
      setActionError('Créez d’abord une partie.');
      return;
    }
    setActionError('');
    try {
      const label = type === 'gnome' ? 'Equipe Gnomes' : 'Equipe Licornes';
      const mascotId = type === 'gnome' ? 'gl-gnome-mousse' : 'gl-licorne-aube';
      await apiGL(`/api/gl/games/${game.id}/teams`, 'POST', {
        name: `${label} ${Date.now().toString().slice(-3)}`,
        type,
        mascotId,
        color: type === 'gnome' ? '#65a30d' : '#a855f7',
      });
      await onReloadGame?.();
      setEventLog(`Equipe ${type} ajoutée.`);
    } catch (err) {
      setActionError(err.message || 'Ajout d’équipe impossible');
    }
  }

  async function upsertTeam(event) {
    event.preventDefault();
    if (!game?.id) {
      setActionError('Créez ou chargez une partie.');
      return;
    }
    setActionError('');
    try {
      if (editingTeamId) {
        await apiGL(`/api/gl/games/${game.id}/teams/${editingTeamId}`, 'PUT', {
          name: teamForm.name,
          type: teamForm.type,
          mascotId: teamForm.mascotId || null,
          color: teamForm.color || '#22c55e',
        });
        setEventLog('Équipe mise à jour.');
      } else {
        await apiGL(`/api/gl/games/${game.id}/teams`, 'POST', {
          name: teamForm.name,
          type: teamForm.type,
          mascotId: teamForm.mascotId || null,
          color: teamForm.color || '#22c55e',
        });
        setEventLog('Équipe créée.');
      }
      setEditingTeamId(null);
      setTeamForm({ name: '', type: 'gnome', mascotId: 'gl-gnome-mousse', color: '#65a30d' });
      await onReloadGame?.();
      await loadGames();
      setRosterRefreshKey((value) => value + 1);
    } catch (err) {
      setActionError(err.message || 'Sauvegarde équipe impossible');
    }
  }

  function startEditTeam(team) {
    setEditingTeamId(Number(team.id));
    setTeamForm({
      name: team.name || '',
      type: team.type || 'gnome',
      mascotId: team.mascot_id || '',
      color: team.color || '#22c55e',
    });
  }

  async function removeTeam(team) {
    const ok = window.confirm(`Supprimer l'équipe « ${team.name} » ?`);
    if (!ok) return;
    setActionError('');
    try {
      await apiGL(`/api/gl/games/${game.id}/teams/${team.id}`, 'DELETE');
      setEventLog(`Équipe ${team.name} supprimée.`);
      await onReloadGame?.();
      await loadGames();
      setRosterRefreshKey((value) => value + 1);
    } catch (err) {
      setActionError(err.message || 'Suppression équipe impossible');
    }
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
      {actionError ? <p className="gl-error">{actionError}</p> : null}

      <form onSubmit={createGame} className="gl-form">
        <label>
          Nom de partie
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Classe
          <select value={classId} onChange={(event) => setClassId(event.target.value)}>
            <option value="">Choisir</option>
            {activeClasses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.school ? ` (${item.school})` : ''}
              </option>
            ))}
          </select>
        </label>
        {activeClasses.length === 0 ? (
          <p className="gl-hint">
            Aucune classe active. Créez-en une dans l’onglet « Gestion utilisateurs ».
          </p>
        ) : null}
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

      <div className="gl-gameplay-block">
        <h3>Parties existantes</h3>
        <div className="gl-inline-actions">
          <label>
            Classe
            <select value={gamesClassFilter} onChange={(event) => setGamesClassFilter(event.target.value)}>
              <option value="">Toutes</option>
              {activeClasses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Statut
            <select value={gamesStatusFilter} onChange={(event) => setGamesStatusFilter(event.target.value)}>
              <option value="">Tous</option>
              <option value="draft">Brouillon</option>
              <option value="live">En cours</option>
              <option value="paused">Pause</option>
              <option value="ended">Terminée</option>
            </select>
          </label>
          <button type="button" className="gl-btn-secondary" onClick={loadGames}>Rafraîchir</button>
        </div>
        <div className="gl-admin-table-wrap">
          <table className="gl-admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Partie</th>
                <th>Classe</th>
                <th>Statut</th>
                <th>Équipes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {games.map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td>{item.name}</td>
                  <td>{item.className || item.classId}</td>
                  <td>{item.status}</td>
                  <td>{item.teamsCount}</td>
                  <td className="gl-admin-actions-cell">
                    <button type="button" onClick={() => openGame(item.id)}>Charger</button>
                    <button type="button" className="gl-btn-danger" onClick={() => removeGame(item.id)}>Supprimer</button>
                  </td>
                </tr>
              ))}
              {games.length === 0 ? (
                <tr>
                  <td colSpan={6}>Aucune partie.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="gl-inline-actions">
        <button type="button" onClick={() => setStatus('start')}>Démarrer</button>
        <button type="button" onClick={() => setStatus('pause')}>Pause</button>
        <button type="button" onClick={() => setStatus('end')}>Terminer</button>
      </div>
      <div className="gl-inline-actions">
        <button type="button" onClick={() => addTeam('gnome')}>Ajouter équipe Gnome</button>
        <button type="button" onClick={() => addTeam('unicorn')}>Ajouter équipe Licorne</button>
      </div>

      <form className="gl-form gl-gameplay-block" onSubmit={upsertTeam}>
        <h3>{editingTeamId ? 'Modifier une équipe' : 'Nouvelle équipe'}</h3>
        <div className="gl-admin-grid-2">
          <label>
            Nom
            <input
              value={teamForm.name}
              onChange={(event) => setTeamForm((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
          </label>
          <label>
            Type
            <select
              value={teamForm.type}
              onChange={(event) => setTeamForm((prev) => ({ ...prev, type: event.target.value }))}
            >
              <option value="gnome">Gnome</option>
              <option value="unicorn">Licorne</option>
            </select>
          </label>
          <label>
            Mascotte
            <input
              value={teamForm.mascotId}
              onChange={(event) => setTeamForm((prev) => ({ ...prev, mascotId: event.target.value }))}
              placeholder="gl-gnome-mousse"
            />
          </label>
          <label>
            Couleur
            <input
              value={teamForm.color}
              onChange={(event) => setTeamForm((prev) => ({ ...prev, color: event.target.value }))}
              placeholder="#22c55e"
            />
          </label>
        </div>
        <div className="gl-inline-actions">
          <button type="submit">{editingTeamId ? 'Enregistrer équipe' : 'Créer équipe'}</button>
          {editingTeamId ? (
            <button
              type="button"
              className="gl-btn-secondary"
              onClick={() => {
                setEditingTeamId(null);
                setTeamForm({ name: '', type: 'gnome', mascotId: 'gl-gnome-mousse', color: '#65a30d' });
              }}
            >
              Annuler édition
            </button>
          ) : null}
        </div>
      </form>

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
                  data-team-id={team.id}
                  data-team-mascot={team.mascot_id || ''}
                >
                  <span>{team.name}</span>
                  {team.mascot_id ? <span className="gl-team-chip-mascot">{team.mascot_id}</span> : null}
                  {isCurrentTurn ? <span className="gl-team-chip-badge">Tour</span> : null}
                </button>
              );
            })}
          </div>
          <p className="gl-hint">
            Pour assigner ou changer la mascotte d'une équipe, utiliser l'onglet « Gestion mascottes ».
          </p>
          <div className="gl-admin-table-wrap">
            <table className="gl-admin-table">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Type</th>
                  <th>Mascotte</th>
                  <th>Couleur</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((team) => (
                  <tr key={`table-${team.id}`}>
                    <td>{team.name}</td>
                    <td>{team.type}</td>
                    <td>{team.mascot_id || '—'}</td>
                    <td>{team.color || '—'}</td>
                    <td className="gl-admin-actions-cell">
                      <button type="button" onClick={() => startEditTeam(team)}>Modifier</button>
                      <button type="button" className="gl-btn-danger" onClick={() => removeTeam(team)}>Supprimer</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {game?.id ? (
        <GLGameRosterPanel
          gameId={game.id}
          teams={teams}
          refreshKey={rosterRefreshKey}
          onRosterChanged={async () => {
            await onReloadGame?.();
            setRosterRefreshKey((value) => value + 1);
          }}
        />
      ) : null}

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
