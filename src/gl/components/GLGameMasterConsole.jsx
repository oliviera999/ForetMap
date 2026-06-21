import React, { useCallback, useEffect, useMemo, useState, Suspense, lazy } from 'react';
import { apiGL } from '../services/apiGL.js';
import { AutoSaveStatus } from '../../shared/components/AutoSaveStatus.jsx';
import { useDebouncedAutoSave } from '../../shared/hooks/useDebouncedAutoSave.js';
import { GLBadge } from './ui/GLBadge.jsx';
import { GLButton } from './ui/GLButton.jsx';
import { useGLMascotCatalog } from '../context/GLMascotCatalogContext.jsx';
import { formatGameStatus, gameStatusTone } from '../utils/glGameStatus.js';
import {
  EMPTY_GAME_EDIT_FORM,
  buildGameEditPayload,
  formatGameTimestamp,
  gameToEditForm,
} from '../utils/glGameEditForm.js';

const GLGameMasterConsoleActiveGameBanner = lazy(
  () => import('./mj/GLGameMasterConsoleActiveGameBanner.jsx'),
);
const GLGameMasterConsoleParties = lazy(() => import('./mj/GLGameMasterConsoleParties.jsx'));
const GLGameMasterConsoleTeams = lazy(() => import('./mj/GLGameMasterConsoleTeams.jsx'));
const GLGameMasterConsoleLive = lazy(() => import('./mj/GLGameMasterConsoleLive.jsx'));

function MjSectionFallback() {
  return <p className="gl-hint">Chargement de la section…</p>;
}

const DEFAULT_TEAM_FORM = {
  name: '',
  type: 'gnome',
  mascotId: 'gl-gnome-mousse',
  color: '#65a30d',
};

export function GLGameMasterConsole({
  chapters,
  classes = [],
  gameState,
  onGameStateChange,
  onReloadGame,
  gameplaySettings,
  selectedTeamId,
  onSelectTeam,
  canImpersonate = false,
  onImpersonationApplied = null,
  canSpellCast = false,
  onLaunchSpell = null,
}) {
  const [mjSection, setMjSection] = useState('parties');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createName, setCreateName] = useState('Partie découverte');
  const [createChapterId, setCreateChapterId] = useState('');
  const [createClassId, setCreateClassId] = useState('');
  const [editGameForm, setEditGameForm] = useState({ ...EMPTY_GAME_EDIT_FORM });
  const [narration, setNarration] = useState('');
  const [narrationImageUrl, setNarrationImageUrl] = useState('');
  const [scoreDelta, setScoreDelta] = useState(1);
  const [scoreReason, setScoreReason] = useState('');
  const [teamHealthDelta, setTeamHealthDelta] = useState(1);
  const [teamPowerDelta, setTeamPowerDelta] = useState(1);
  const [resolveDeltas, setResolveDeltas] = useState({});
  const [actionError, setActionError] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [games, setGames] = useState([]);
  const [gamesStatusFilter, setGamesStatusFilter] = useState('');
  const [gamesClassFilter, setGamesClassFilter] = useState('');
  const [teamForm, setTeamForm] = useState({ ...DEFAULT_TEAM_FORM });
  const [editingTeamId, setEditingTeamId] = useState(null);
  const [rosterRefreshKey, setRosterRefreshKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const { mascots: mascotCatalog } = useGLMascotCatalog();

  const activeClasses = useMemo(
    () => (Array.isArray(classes) ? classes : []).filter((item) => Number(item.is_active) !== 0),
    [classes],
  );

  useEffect(() => {
    if (createClassId !== '' || activeClasses.length === 0) return;
    setCreateClassId(String(activeClasses[0].id));
  }, [activeClasses, createClassId]);

  useEffect(() => {
    if (gamesClassFilter !== '' || activeClasses.length === 0) return;
    setGamesClassFilter(String(activeClasses[0].id));
  }, [activeClasses, gamesClassFilter]);

  const teams = Array.isArray(gameState?.teams) ? gameState.teams : [];
  const game = gameState?.game || null;
  const scores = gameState?.scores || {};
  const pendingActions = Array.isArray(gameState?.pendingActions) ? gameState.pendingActions : [];
  const currentTeamId = game?.current_team_id != null ? Number(game.current_team_id) : null;
  const gameStatus = game?.status || '';

  const flags = gameplaySettings || {};
  const turnsEnabled = !!flags.turnsEnabled;
  const narrationEnabled = !!flags.narrationEnabled;
  const playerActionsEnabled = !!flags.playerActionsEnabled;
  const scoringEnabled = !!flags.scoringEnabled;
  const vitalityEnabled = !!flags.vitalityEnabled;

  const effectiveSelectedTeamId = useMemo(() => {
    if (
      selectedTeamId != null &&
      teams.some((team) => Number(team.id) === Number(selectedTeamId))
    ) {
      return Number(selectedTeamId);
    }
    return teams.length > 0 ? Number(teams[0].id) : null;
  }, [selectedTeamId, teams]);

  const mascotOptions = useMemo(
    () => (Array.isArray(mascotCatalog) ? mascotCatalog : []),
    [mascotCatalog],
  );

  const selectableMascots = useMemo(() => {
    const byType = mascotOptions.filter((item) => item.type === teamForm.type);
    const list = byType.length > 0 ? byType : mascotOptions;
    const current = String(teamForm.mascotId || '').trim();
    if (current && !list.some((item) => item.id === current)) {
      const fromCatalog = mascotOptions.find((item) => item.id === current);
      if (fromCatalog) return [fromCatalog, ...list];
      return [{ id: current, label: current }, ...list];
    }
    return list;
  }, [mascotOptions, teamForm.type, teamForm.mascotId]);

  const defaultMascotByType = useCallback(
    (type) => {
      const list = mascotOptions;
      if (!list.length) return type === 'unicorn' ? 'gl-licorne-aube' : 'gl-gnome-mousse';
      const preferred = list.find((item) => item.source === 'gl' && item.type === type);
      if (preferred?.id) return preferred.id;
      const fallback = list.find((item) => item.type === type);
      if (fallback?.id) return fallback.id;
      return list[0]?.id || '';
    },
    [mascotOptions],
  );

  useEffect(() => {
    if (!mascotOptions.length) return;
    const current = String(teamForm.mascotId || '').trim();
    const exists = mascotOptions.some((item) => item.id === current);
    if (exists) return;
    setTeamForm((prev) => ({ ...prev, mascotId: defaultMascotByType(prev.type) }));
  }, [mascotOptions, teamForm.mascotId, defaultMascotByType, teamForm.type]);

  useEffect(() => {
    if (!game?.id) return;
    setEditGameForm(gameToEditForm(game));
  }, [
    game?.id,
    game?.name,
    game?.chapter_id,
    game?.class_id,
    game?.zone_content_retrigger,
    game?.lore_feuillet_retrigger,
    game?.lore_effacement_enabled,
    game?.lore_gemme_costs_enabled,
    game?.lore_heart_rewards_enabled,
  ]);

  const persistGameEdits = useCallback(async () => {
    if (!game?.id) return editGameForm;
    try {
      const payload = buildGameEditPayload(editGameForm, gameStatus);
      const updated = await apiGL(`/api/gl/games/${game.id}`, 'PUT', payload);
      onGameStateChange(updated);
      showSuccess('Partie mise à jour.');
      await loadGames();
      const nextForm = gameToEditForm(updated?.game || updated);
      setEditGameForm(nextForm);
      return nextForm;
    } catch (err) {
      showFailure(err.message || 'Mise à jour de partie impossible');
      throw err;
    }
  }, [game?.id, editGameForm, gameStatus, onGameStateChange]);

  const {
    status: gameSaveStatus,
    error: gameSaveError,
  } = useDebouncedAutoSave({
    value: editGameForm,
    resetKey: game?.id,
    enabled: Boolean(game?.id),
    canSave: () => String(editGameForm.name || '').trim().length > 0,
    onSave: persistGameEdits,
  });

  const persistTeam = useCallback(async () => {
    if (!game?.id) return teamForm;
    try {
      if (editingTeamId) {
        await apiGL(`/api/gl/games/${game.id}/teams/${editingTeamId}`, 'PUT', {
          name: teamForm.name,
          type: teamForm.type,
          mascotId: teamForm.mascotId || null,
          color: teamForm.color || '#22c55e',
        });
        showSuccess('Équipe mise à jour.');
      } else {
        await apiGL(`/api/gl/games/${game.id}/teams`, 'POST', {
          name: teamForm.name,
          type: teamForm.type,
          mascotId: teamForm.mascotId || null,
          color: teamForm.color || '#22c55e',
        });
        showSuccess('Équipe créée.');
      }
      resetTeamEditing();
      await onReloadGame?.();
      await loadGames();
      setRosterRefreshKey((value) => value + 1);
      return { ...DEFAULT_TEAM_FORM, mascotId: defaultMascotByType('gnome') };
    } catch (err) {
      showFailure(err.message || 'Sauvegarde équipe impossible');
      throw err;
    }
  }, [game?.id, editingTeamId, teamForm, onReloadGame, defaultMascotByType]);

  const {
    status: teamSaveStatus,
    error: teamSaveError,
  } = useDebouncedAutoSave({
    value: teamForm,
    resetKey: editingTeamId ?? 'new-team',
    enabled: Boolean(game?.id) && String(teamForm.name || '').trim().length > 0,
    onSave: persistTeam,
  });

  useEffect(() => {
    if (!feedback) return undefined;
    const id = setTimeout(() => setFeedback(null), 5000);
    return () => clearTimeout(id);
  }, [feedback]);

  useEffect(() => {
    if (selectedTeamId !== effectiveSelectedTeamId && effectiveSelectedTeamId != null) {
      onSelectTeam?.(effectiveSelectedTeamId);
    }
  }, [effectiveSelectedTeamId, selectedTeamId, onSelectTeam]);

  const activeChapterTitle = useMemo(() => {
    if (game?.chapter_title) return game.chapter_title;
    const chapterId = game?.chapter_id;
    const match = chapters.find((item) => Number(item.id) === Number(chapterId));
    return match?.title || '—';
  }, [game, chapters]);

  const activeClassLabel = useMemo(() => {
    if (game?.class_name) return game.class_name;
    const match = activeClasses.find((item) => Number(item.id) === Number(game?.class_id));
    return match?.name || '—';
  }, [game, activeClasses]);

  function showSuccess(message) {
    setFeedback({ type: 'success', message });
    setActionError('');
  }

  function showFailure(message) {
    setActionError(message);
    setFeedback(null);
  }

  function resetTeamEditing() {
    setEditingTeamId(null);
    setTeamForm({
      ...DEFAULT_TEAM_FORM,
      mascotId: defaultMascotByType('gnome'),
    });
  }

  function resetForGameSwitch() {
    resetTeamEditing();
    onSelectTeam?.(null);
  }

  async function loadGames() {
    try {
      const params = new URLSearchParams();
      if (gamesClassFilter) params.set('classId', gamesClassFilter);
      if (gamesStatusFilter) params.set('status', gamesStatusFilter);
      const query = params.toString();
      const rows = await apiGL(`/api/gl/games${query ? `?${query}` : ''}`);
      setGames(Array.isArray(rows) ? rows : []);
    } catch (err) {
      showFailure(err.message || 'Chargement des parties impossible');
    }
  }

  useEffect(() => {
    loadGames();
  }, [gamesClassFilter, gamesStatusFilter]);

  async function createGame(event) {
    event.preventDefault();
    setActionError('');
    if (!createClassId) {
      showFailure(
        activeClasses.length === 0
          ? 'Créez d’abord une classe active (onglet « Gestion utilisateurs »).'
          : 'Choisissez une classe avant de créer la partie.',
      );
      return;
    }
    if (!createChapterId) {
      showFailure('Choisissez un chapitre avant de créer la partie.');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: createName,
        chapterId: Number(createChapterId),
        classId: Number(createClassId),
      };
      resetForGameSwitch();
      const created = await apiGL('/api/gl/games', 'POST', payload);
      onGameStateChange(created);
      showSuccess('Partie créée.');
      setShowCreateForm(false);
      await loadGames();
      setRosterRefreshKey((value) => value + 1);
    } catch (err) {
      showFailure(err.message || 'Création de partie impossible');
    } finally {
      setBusy(false);
    }
  }

  async function openGame(gameId) {
    setActionError('');
    setBusy(true);
    try {
      resetForGameSwitch();
      const data = await apiGL(`/api/gl/games/${gameId}`);
      onGameStateChange(data);
      showSuccess(`Partie #${gameId} chargée.`);
      setRosterRefreshKey((value) => value + 1);
    } catch (err) {
      showFailure(err.message || 'Chargement de la partie impossible');
    } finally {
      setBusy(false);
    }
  }

  async function saveGameEdits(event) {
    event?.preventDefault?.();
  }

  async function removeGame(gameId) {
    const ok = window.confirm(
      'Supprimer cette partie ? (autorisé uniquement pour brouillon/terminée)',
    );
    if (!ok) return;
    setActionError('');
    setBusy(true);
    try {
      await apiGL(`/api/gl/games/${gameId}`, 'DELETE');
      showSuccess(`Partie #${gameId} supprimée.`);
      await loadGames();
      if (Number(game?.id) === Number(gameId)) {
        resetForGameSwitch();
        onGameStateChange(null);
      }
    } catch (err) {
      showFailure(err.message || 'Suppression de partie impossible');
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(nextStatus) {
    if (!game?.id) {
      showFailure('Chargez d’abord une partie.');
      return;
    }
    setBusy(true);
    setActionError('');
    try {
      await apiGL(`/api/gl/games/${game.id}/${nextStatus}`, 'POST');
      await onReloadGame?.();
      await loadGames();
      const statusLabel =
        nextStatus === 'start' ? 'live' : nextStatus === 'end' ? 'ended' : 'paused';
      showSuccess(`Statut : ${formatGameStatus(statusLabel)}.`);
    } catch (err) {
      showFailure(err.message || `Action « ${nextStatus} » impossible`);
    } finally {
      setBusy(false);
    }
  }

  async function addTeam(type) {
    if (!game?.id) {
      showFailure('Chargez d’abord une partie.');
      return;
    }
    setBusy(true);
    setActionError('');
    try {
      const label = type === 'gnome' ? 'Equipe Gnomes' : 'Equipe Licornes';
      const mascotId = defaultMascotByType(type);
      await apiGL(`/api/gl/games/${game.id}/teams`, 'POST', {
        name: `${label} ${Date.now().toString().slice(-3)}`,
        type,
        mascotId,
        color: type === 'gnome' ? '#65a30d' : '#a855f7',
      });
      await onReloadGame?.();
      showSuccess(`Équipe ${type === 'gnome' ? 'Gnome' : 'Licorne'} ajoutée.`);
    } catch (err) {
      showFailure(err.message || 'Ajout d’équipe impossible');
    } finally {
      setBusy(false);
    }
  }

  async function upsertTeam(event) {
    event?.preventDefault?.();
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
    setBusy(true);
    setActionError('');
    try {
      await apiGL(`/api/gl/games/${game.id}/teams/${team.id}`, 'DELETE');
      showSuccess(`Équipe ${team.name} supprimée.`);
      await onReloadGame?.();
      await loadGames();
      setRosterRefreshKey((value) => value + 1);
    } catch (err) {
      showFailure(err.message || 'Suppression équipe impossible');
    } finally {
      setBusy(false);
    }
  }

  async function nextTurn() {
    if (!game?.id) return;
    setBusy(true);
    try {
      await apiGL(`/api/gl/games/${game.id}/turn/next`, 'POST');
      await onReloadGame?.();
      showSuccess('Tour suivant.');
    } catch (err) {
      showFailure(err.message || 'Tour suivant impossible');
    } finally {
      setBusy(false);
    }
  }

  async function sendNarration(event) {
    event.preventDefault();
    if (!game?.id) return;
    const text = String(narration || '').trim();
    if (!text) return;
    setBusy(true);
    try {
      const payload = { text };
      const imageUrl = String(narrationImageUrl || '').trim();
      if (imageUrl) payload.imageUrl = imageUrl;
      await apiGL(`/api/gl/games/${game.id}/events`, 'POST', {
        eventType: 'narration',
        teamId: effectiveSelectedTeamId,
        payload,
      });
      setNarration('');
      setNarrationImageUrl('');
      await onReloadGame?.();
      showSuccess('Narration envoyée.');
    } catch (err) {
      showFailure(err.message || 'Narration impossible');
    } finally {
      setBusy(false);
    }
  }

  async function applyScoreDelta(delta) {
    if (!game?.id || effectiveSelectedTeamId == null) return;
    setBusy(true);
    try {
      await apiGL(`/api/gl/games/${game.id}/events`, 'POST', {
        eventType: 'score',
        teamId: effectiveSelectedTeamId,
        payload: { delta: Number(delta), reason: scoreReason || null },
      });
      setScoreReason('');
      await onReloadGame?.();
      showSuccess(`Score ${delta > 0 ? '+' : ''}${delta}`);
    } catch (err) {
      showFailure(err.message || 'Score impossible');
    } finally {
      setBusy(false);
    }
  }

  async function applyTeamVitality({ healthDelta = 0, powerDelta = 0 }) {
    if (!game?.id || effectiveSelectedTeamId == null) return;
    const h = Number(healthDelta) || 0;
    const p = Number(powerDelta) || 0;
    if (h === 0 && p === 0) return;
    setBusy(true);
    try {
      const data = await apiGL(`/api/gl/games/${game.id}/vitality/team`, 'POST', {
        teamId: effectiveSelectedTeamId,
        healthDelta: h,
        powerDelta: p,
      });
      const count = Array.isArray(data?.results) ? data.results.length : 0;
      await onReloadGame?.();
      setRosterRefreshKey((value) => value + 1);
      showSuccess(`Points mis à jour pour ${count} joueur${count > 1 ? 's' : ''}.`);
    } catch (err) {
      showFailure(err.message || 'Mise à jour des points impossible');
    } finally {
      setBusy(false);
    }
  }

  async function resolveAction(actionId, decision) {
    if (!game?.id) return;
    const delta = scoringEnabled ? Number(resolveDeltas[actionId] || 0) : 0;
    setBusy(true);
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
      showSuccess(`Action ${decision === 'accepted' ? 'acceptée' : 'refusée'}.`);
    } catch (err) {
      showFailure(err.message || 'Résolution impossible');
    } finally {
      setBusy(false);
    }
  }

  const gameListRows = games.map((item) => {
    const isActiveRow = Number(game?.id) === Number(item.id);
    const rowActions = (
      <>
        <GLButton type="button" size="sm" onClick={() => openGame(item.id)} disabled={busy}>
          Ouvrir
        </GLButton>
        <GLButton
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            openGame(item.id);
            setMjSection('parties');
          }}
          disabled={busy}
        >
          Modifier
        </GLButton>
        <GLButton
          type="button"
          size="sm"
          variant="danger"
          onClick={() => removeGame(item.id)}
          disabled={busy}
        >
          Supprimer
        </GLButton>
      </>
    );
    return {
      key: item.id,
      rowClassName: isActiveRow ? 'is-active-row' : '',
      desktopCells: (
        <>
          <td>{item.id}</td>
          <td>{item.name}</td>
          <td>{item.className || item.classId}</td>
          <td>
            <GLBadge tone={gameStatusTone(item.status)}>{formatGameStatus(item.status)}</GLBadge>
          </td>
          <td>{item.teamsCount}</td>
          <td className="gl-admin-actions-cell">{rowActions}</td>
        </>
      ),
      mobileCells: (
        <>
          <div className="gl-data-card-row">
            <span className="gl-data-card-label">Partie</span>
            <strong>{item.name}</strong>
          </div>
          <div className="gl-data-card-row">
            <span className="gl-data-card-label">Classe</span>
            <span>{item.className || item.classId}</span>
          </div>
          <div className="gl-data-card-row">
            <span className="gl-data-card-label">Statut</span>
            <GLBadge tone={gameStatusTone(item.status)}>{formatGameStatus(item.status)}</GLBadge>
          </div>
          <div className="gl-data-card-row">
            <span className="gl-data-card-label">Équipes</span>
            <span>{item.teamsCount}</span>
          </div>
          <div className="gl-data-card-actions">{rowActions}</div>
        </>
      ),
    };
  });

  const teamListRows = teams.map((team) => {
    const rowActions = (
      <>
        <GLButton
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => startEditTeam(team)}
          disabled={busy}
        >
          Modifier
        </GLButton>
        <GLButton
          type="button"
          size="sm"
          variant="danger"
          onClick={() => removeTeam(team)}
          disabled={busy}
        >
          Supprimer
        </GLButton>
      </>
    );
    return {
      key: team.id,
      desktopCells: (
        <>
          <td>{team.name}</td>
          <td>{team.type}</td>
          <td>{team.mascot_id || '—'}</td>
          <td>{team.color || '—'}</td>
          <td className="gl-admin-actions-cell">{rowActions}</td>
        </>
      ),
      mobileCells: (
        <>
          <div className="gl-data-card-row">
            <span className="gl-data-card-label">Nom</span>
            <strong>{team.name}</strong>
          </div>
          <div className="gl-data-card-row">
            <span className="gl-data-card-label">Type</span>
            <span>{team.type}</span>
          </div>
          <div className="gl-data-card-row">
            <span className="gl-data-card-label">Mascotte</span>
            <span>{team.mascot_id || '—'}</span>
          </div>
          <div className="gl-data-card-actions">{rowActions}</div>
        </>
      ),
    };
  });

  return (
    <section className="gl-panel gl-mj-console fade-in">
      <h2>Console MJ</h2>

      {actionError ? <p className="gl-error-banner gl-mj-feedback">{actionError}</p> : null}
      {feedback?.type === 'success' ? (
        <p className="gl-success-banner gl-mj-feedback">{feedback.message}</p>
      ) : null}

      {game?.id ? (
        <Suspense fallback={<MjSectionFallback />}>
          <GLGameMasterConsoleActiveGameBanner
            game={game}
            gameStatus={gameStatus}
            activeClassLabel={activeClassLabel}
            activeChapterTitle={activeChapterTitle}
            teams={teams}
            chapters={chapters}
            activeClasses={activeClasses}
            editGameForm={editGameForm}
            setEditGameForm={setEditGameForm}
            setStatus={setStatus}
            saveGameEdits={saveGameEdits}
            gameSaveStatus={gameSaveStatus}
            gameSaveError={gameSaveError}
            busy={busy}
          />
        </Suspense>
      ) : null}

      <nav className="gl-subtabs" role="tablist" aria-label="Sections console MJ">
        <button
          type="button"
          role="tab"
          aria-selected={mjSection === 'parties'}
          className={mjSection === 'parties' ? 'is-active' : ''}
          onClick={() => setMjSection('parties')}
        >
          Parties
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mjSection === 'teams'}
          className={mjSection === 'teams' ? 'is-active' : ''}
          onClick={() => setMjSection('teams')}
        >
          Équipes &amp; effectifs
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mjSection === 'live'}
          className={mjSection === 'live' ? 'is-active' : ''}
          onClick={() => setMjSection('live')}
        >
          Jeu en direct
        </button>
      </nav>

      <Suspense fallback={<MjSectionFallback />}>
        {mjSection === 'parties' && (
          <GLGameMasterConsoleParties
            showCreateForm={showCreateForm}
            setShowCreateForm={setShowCreateForm}
            createName={createName}
            setCreateName={setCreateName}
            createClassId={createClassId}
            setCreateClassId={setCreateClassId}
            createChapterId={createChapterId}
            setCreateChapterId={setCreateChapterId}
            activeClasses={activeClasses}
            chapters={chapters}
            gamesClassFilter={gamesClassFilter}
            setGamesClassFilter={setGamesClassFilter}
            gamesStatusFilter={gamesStatusFilter}
            setGamesStatusFilter={setGamesStatusFilter}
            loadGames={loadGames}
            createGame={createGame}
            gameListRows={gameListRows}
            busy={busy}
          />
        )}
        {mjSection === 'teams' && (
          <GLGameMasterConsoleTeams
            game={game}
            teams={teams}
            teamForm={teamForm}
            setTeamForm={setTeamForm}
            editingTeamId={editingTeamId}
            selectableMascots={selectableMascots}
            defaultMascotByType={defaultMascotByType}
            addTeam={addTeam}
            upsertTeam={upsertTeam}
            resetTeamEditing={resetTeamEditing}
            teamListRows={teamListRows}
            rosterRefreshKey={rosterRefreshKey}
            vitalityEnabled={vitalityEnabled}
            canImpersonate={canImpersonate}
            onImpersonationApplied={onImpersonationApplied}
            onReloadGame={onReloadGame}
            setRosterRefreshKey={setRosterRefreshKey}
            onGoToParties={() => setMjSection('parties')}
            busy={busy}
            teamSaveStatus={teamSaveStatus}
            teamSaveError={teamSaveError}
          />
        )}
        {mjSection === 'live' && (
          <GLGameMasterConsoleLive
            game={game}
            teams={teams}
            gameStatus={gameStatus}
            effectiveSelectedTeamId={effectiveSelectedTeamId}
            currentTeamId={currentTeamId}
            turnsEnabled={turnsEnabled}
            narrationEnabled={narrationEnabled}
            playerActionsEnabled={playerActionsEnabled}
            scoringEnabled={scoringEnabled}
            vitalityEnabled={vitalityEnabled}
            canSpellCast={canSpellCast}
            pendingActions={pendingActions}
            scores={scores}
            narration={narration}
            setNarration={setNarration}
            narrationImageUrl={narrationImageUrl}
            setNarrationImageUrl={setNarrationImageUrl}
            scoreDelta={scoreDelta}
            setScoreDelta={setScoreDelta}
            scoreReason={scoreReason}
            setScoreReason={setScoreReason}
            teamHealthDelta={teamHealthDelta}
            setTeamHealthDelta={setTeamHealthDelta}
            teamPowerDelta={teamPowerDelta}
            setTeamPowerDelta={setTeamPowerDelta}
            resolveDeltas={resolveDeltas}
            setResolveDeltas={setResolveDeltas}
            onSelectTeam={onSelectTeam}
            onLaunchSpell={onLaunchSpell}
            nextTurn={nextTurn}
            sendNarration={sendNarration}
            applyScoreDelta={applyScoreDelta}
            applyTeamVitality={applyTeamVitality}
            resolveAction={resolveAction}
            showFailure={showFailure}
            onGoToParties={() => setMjSection('parties')}
            busy={busy}
            formatTimestamp={formatGameTimestamp}
          />
        )}
      </Suspense>
    </section>
  );
}
