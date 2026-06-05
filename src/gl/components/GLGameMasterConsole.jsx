import React, { useCallback, useEffect, useMemo, useState, Suspense, lazy } from 'react';
import { apiGL } from '../services/apiGL.js';
import { GLGameRosterPanel } from './admin/GLGameRosterPanel.jsx';
import { GLBadge } from './ui/GLBadge.jsx';
import { GLButton } from './ui/GLButton.jsx';
import { GLDataList } from './ui/GLDataList.jsx';
import { GLField } from './ui/GLField.jsx';
import { GLInput } from './ui/GLInput.jsx';
import { GLSelect } from './ui/GLSelect.jsx';
import { GLTextarea } from './ui/GLTextarea.jsx';
import { GLImageInlineInsertControls } from './GLImageInlineInsertControls.jsx';
import { useGLMascotCatalog } from '../context/GLMascotCatalogContext.jsx';
import {
  canEditGameChapter,
  canEditGameClass,
  formatGameStatus,
  gameLifecycleAction,
  gameStatusTone,
} from '../utils/glGameStatus.js';

const GLGameMasterConsoleParties = lazy(() => import('./mj/GLGameMasterConsoleParties.jsx'));
const GLGameMasterConsoleTeams = lazy(() => import('./mj/GLGameMasterConsoleTeams.jsx'));
const GLGameMasterConsoleLive = lazy(() => import('./mj/GLGameMasterConsoleLive.jsx'));

function MjSectionFallback() {
  return <p className="gl-hint">Chargement de la section…</p>;
}

function formatTimestamp(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleTimeString();
  } catch (_) {
    return '';
  }
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
  const [editGameForm, setEditGameForm] = useState({
    name: '',
    chapterId: '',
    classId: '',
    zoneContentRetrigger: '',
  });
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
    [classes]
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
    if (selectedTeamId != null && teams.some((team) => Number(team.id) === Number(selectedTeamId))) {
      return Number(selectedTeamId);
    }
    return teams.length > 0 ? Number(teams[0].id) : null;
  }, [selectedTeamId, teams]);

  const mascotOptions = useMemo(
    () => (Array.isArray(mascotCatalog) ? mascotCatalog : []),
    [mascotCatalog]
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

  const defaultMascotByType = useCallback((type) => {
    const list = mascotOptions;
    if (!list.length) return type === 'unicorn' ? 'gl-licorne-aube' : 'gl-gnome-mousse';
    const preferred = list.find((item) => item.source === 'gl' && item.type === type);
    if (preferred?.id) return preferred.id;
    const fallback = list.find((item) => item.type === type);
    if (fallback?.id) return fallback.id;
    return list[0]?.id || '';
  }, [mascotOptions]);

  useEffect(() => {
    if (!mascotOptions.length) return;
    const current = String(teamForm.mascotId || '').trim();
    const exists = mascotOptions.some((item) => item.id === current);
    if (exists) return;
    setTeamForm((prev) => ({ ...prev, mascotId: defaultMascotByType(prev.type) }));
  }, [mascotOptions, teamForm.mascotId, defaultMascotByType, teamForm.type]);

  useEffect(() => {
    if (!game?.id) return;
    setEditGameForm({
      name: game.name || '',
      chapterId: game.chapter_id != null ? String(game.chapter_id) : '',
      classId: game.class_id != null ? String(game.class_id) : '',
      zoneContentRetrigger: game.zone_content_retrigger != null ? String(game.zone_content_retrigger) : '',
    });
  }, [game?.id, game?.name, game?.chapter_id, game?.class_id, game?.zone_content_retrigger]);

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
          : 'Choisissez une classe avant de créer la partie.'
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
    event.preventDefault();
    if (!game?.id) return;
    setBusy(true);
    setActionError('');
    try {
      const payload = { name: editGameForm.name };
      if (canEditGameChapter(gameStatus) && editGameForm.chapterId) {
        payload.chapterId = Number(editGameForm.chapterId);
      }
      if (canEditGameClass(gameStatus) && editGameForm.classId) {
        payload.classId = Number(editGameForm.classId);
      }
      payload.zoneContentRetrigger = editGameForm.zoneContentRetrigger || null;
      const updated = await apiGL(`/api/gl/games/${game.id}`, 'PUT', payload);
      onGameStateChange(updated);
      showSuccess('Partie mise à jour.');
      await loadGames();
    } catch (err) {
      showFailure(err.message || 'Mise à jour de partie impossible');
    } finally {
      setBusy(false);
    }
  }

  async function removeGame(gameId) {
    const ok = window.confirm('Supprimer cette partie ? (autorisé uniquement pour brouillon/terminée)');
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
      const statusLabel = nextStatus === 'start'
        ? 'live'
        : nextStatus === 'end'
          ? 'ended'
          : 'paused';
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
    event.preventDefault();
    if (!game?.id) {
      showFailure('Créez ou chargez une partie.');
      return;
    }
    setBusy(true);
    setActionError('');
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
    } catch (err) {
      showFailure(err.message || 'Sauvegarde équipe impossible');
    } finally {
      setBusy(false);
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
        <GLButton type="button" size="sm" variant="danger" onClick={() => removeGame(item.id)} disabled={busy}>
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
          <td><GLBadge tone={gameStatusTone(item.status)}>{formatGameStatus(item.status)}</GLBadge></td>
          <td>{item.teamsCount}</td>
          <td className="gl-admin-actions-cell">{rowActions}</td>
        </>
      ),
      mobileCells: (
        <>
          <div className="gl-data-card-row"><span className="gl-data-card-label">Partie</span><strong>{item.name}</strong></div>
          <div className="gl-data-card-row"><span className="gl-data-card-label">Classe</span><span>{item.className || item.classId}</span></div>
          <div className="gl-data-card-row"><span className="gl-data-card-label">Statut</span><GLBadge tone={gameStatusTone(item.status)}>{formatGameStatus(item.status)}</GLBadge></div>
          <div className="gl-data-card-row"><span className="gl-data-card-label">Équipes</span><span>{item.teamsCount}</span></div>
          <div className="gl-data-card-actions">{rowActions}</div>
        </>
      ),
    };
  });

  const teamListRows = teams.map((team) => {
    const rowActions = (
      <>
        <GLButton type="button" size="sm" variant="secondary" onClick={() => startEditTeam(team)} disabled={busy}>
          Modifier
        </GLButton>
        <GLButton type="button" size="sm" variant="danger" onClick={() => removeTeam(team)} disabled={busy}>
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
          <div className="gl-data-card-row"><span className="gl-data-card-label">Nom</span><strong>{team.name}</strong></div>
          <div className="gl-data-card-row"><span className="gl-data-card-label">Type</span><span>{team.type}</span></div>
          <div className="gl-data-card-row"><span className="gl-data-card-label">Mascotte</span><span>{team.mascot_id || '—'}</span></div>
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
        <div className={`gl-active-game-banner is-status-${String(gameStatus || 'draft').toLowerCase()}`}>
          <div className="gl-active-game-banner-head">
            <div>
              <h3 className="gl-active-game-banner-title">{game.name || `Partie #${game.id}`}</h3>
              <div className="gl-active-game-banner-meta">
                <span>#{game.id}</span>
                <span>{activeClassLabel}</span>
                <span>{activeChapterTitle}</span>
                <span>{teams.length} équipe{teams.length > 1 ? 's' : ''}</span>
              </div>
            </div>
            <GLBadge tone={gameStatusTone(gameStatus)}>{formatGameStatus(gameStatus)}</GLBadge>
          </div>
          <div className="gl-inline-actions">
            <GLButton
              type="button"
              size="sm"
              onClick={() => setStatus('start')}
              disabled={busy || !gameLifecycleAction(gameStatus, 'start')}
            >
              Démarrer
            </GLButton>
            <GLButton
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setStatus('pause')}
              disabled={busy || !gameLifecycleAction(gameStatus, 'pause')}
            >
              Pause
            </GLButton>
            <GLButton
              type="button"
              size="sm"
              variant="danger"
              onClick={() => setStatus('end')}
              disabled={busy || !gameLifecycleAction(gameStatus, 'end')}
            >
              Terminer
            </GLButton>
          </div>
          <form className="gl-form" onSubmit={saveGameEdits}>
            <div className="gl-admin-grid-2">
              <GLField label="Nom de partie">
                <GLInput
                  value={editGameForm.name}
                  onChange={(event) => setEditGameForm((prev) => ({ ...prev, name: event.target.value }))}
                  required
                />
              </GLField>
              <GLField label="Chapitre">
                <GLSelect
                  value={editGameForm.chapterId}
                  onChange={(event) => setEditGameForm((prev) => ({ ...prev, chapterId: event.target.value }))}
                  disabled={!canEditGameChapter(gameStatus)}
                >
                  <option value="">Choisir</option>
                  {chapters.map((chapter) => (
                    <option key={chapter.id} value={chapter.id}>{chapter.title}</option>
                  ))}
                </GLSelect>
              </GLField>
              <GLField label="Classe">
                <GLSelect
                  value={editGameForm.classId}
                  onChange={(event) => setEditGameForm((prev) => ({ ...prev, classId: event.target.value }))}
                  disabled={!canEditGameClass(gameStatus)}
                >
                  <option value="">Choisir</option>
                  {activeClasses.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.school ? ` (${item.school})` : ''}
                    </option>
                  ))}
                </GLSelect>
              </GLField>
              <GLField label="Popover zones (cette partie)">
                <GLSelect
                  value={editGameForm.zoneContentRetrigger}
                  onChange={(event) => setEditGameForm((prev) => ({
                    ...prev,
                    zoneContentRetrigger: event.target.value,
                  }))}
                >
                  <option value="">Hériter des réglages globaux</option>
                  <option value="every_arrival">À chaque entrée ou traversée</option>
                  <option value="once_per_team">Une fois par équipe et zone</option>
                  <option value="once_per_game">Une fois par zone (toute la partie)</option>
                </GLSelect>
              </GLField>
            </div>
            {!canEditGameChapter(gameStatus) ? (
              <p className="gl-hint">Chapitre modifiable uniquement en brouillon ou pause.</p>
            ) : null}
            {!canEditGameClass(gameStatus) ? (
              <p className="gl-hint">Classe modifiable uniquement en brouillon (sans joueurs assignés).</p>
            ) : null}
            <GLButton type="submit" disabled={busy}>Enregistrer la partie</GLButton>
          </form>
        </div>
      ) : null}

      <nav className="gl-subtabs" aria-label="Sections console MJ">
        <button
          type="button"
          className={mjSection === 'parties' ? 'is-active' : ''}
          onClick={() => setMjSection('parties')}
        >
          Parties
        </button>
        <button
          type="button"
          className={mjSection === 'teams' ? 'is-active' : ''}
          onClick={() => setMjSection('teams')}
        >
          Équipes &amp; effectifs
        </button>
        <button
          type="button"
          className={mjSection === 'live' ? 'is-active' : ''}
          onClick={() => setMjSection('live')}
        >
          Jeu en direct
        </button>
      </nav>

      {mjSection === 'parties' && (
        <div className="gl-gameplay-block">
          <h3>Parties</h3>
          <div className="gl-mj-create-toggle">
            <GLButton
              type="button"
              variant="secondary"
              onClick={() => setShowCreateForm((value) => !value)}
            >
              {showCreateForm ? 'Masquer le formulaire' : 'Nouvelle partie'}
            </GLButton>
          </div>
          {showCreateForm ? (
            <form onSubmit={createGame} className="gl-form">
              <GLField label="Nom de partie">
                <GLInput value={createName} onChange={(event) => setCreateName(event.target.value)} />
              </GLField>
              <GLField label="Classe">
                <GLSelect value={createClassId} onChange={(event) => setCreateClassId(event.target.value)}>
                  <option value="">Choisir</option>
                  {activeClasses.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.school ? ` (${item.school})` : ''}
                    </option>
                  ))}
                </GLSelect>
              </GLField>
              {activeClasses.length === 0 ? (
                <p className="gl-hint">
                  Aucune classe active. Créez-en une dans l’onglet « Gestion utilisateurs ».
                </p>
              ) : null}
              <GLField label="Chapitre">
                <GLSelect value={createChapterId} onChange={(event) => setCreateChapterId(event.target.value)}>
                  <option value="">Choisir</option>
                  {chapters.map((chapter) => (
                    <option key={chapter.id} value={chapter.id}>{chapter.title}</option>
                  ))}
                </GLSelect>
              </GLField>
              <GLButton type="submit" disabled={busy}>Créer une partie</GLButton>
            </form>
          ) : null}

          <div className="gl-toolbar">
            <GLField label="Classe">
              <GLSelect value={gamesClassFilter} onChange={(event) => setGamesClassFilter(event.target.value)}>
                <option value="">Toutes</option>
                {activeClasses.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </GLSelect>
            </GLField>
            <GLField label="Statut">
              <GLSelect value={gamesStatusFilter} onChange={(event) => setGamesStatusFilter(event.target.value)}>
                <option value="">Tous</option>
                <option value="draft">Brouillon</option>
                <option value="live">En cours</option>
                <option value="paused">Pause</option>
                <option value="ended">Terminée</option>
              </GLSelect>
            </GLField>
            <GLButton type="button" variant="secondary" size="sm" onClick={loadGames} disabled={busy}>
              Rafraîchir
            </GLButton>
          </div>

          <GLDataList
            columns={[
              { key: 'id', label: 'ID' },
              { key: 'name', label: 'Partie' },
              { key: 'class', label: 'Classe' },
              { key: 'status', label: 'Statut' },
              { key: 'teams', label: 'Équipes' },
              { key: 'actions', label: 'Actions' },
            ]}
            emptyLabel="Aucune partie."
            rows={gameListRows}
          />
        </div>
      )}

      {mjSection === 'teams' && (
        game?.id ? (
          <>
            <div className="gl-gameplay-block">
              <h3>Équipes de la partie « {game.name} » (#{game.id})</h3>
              <div className="gl-inline-actions">
                <GLButton type="button" size="sm" onClick={() => addTeam('gnome')} disabled={busy}>
                  Ajouter équipe Gnome
                </GLButton>
                <GLButton type="button" size="sm" variant="secondary" onClick={() => addTeam('unicorn')} disabled={busy}>
                  Ajouter équipe Licorne
                </GLButton>
              </div>

              <form className="gl-form" onSubmit={upsertTeam}>
                <h4>{editingTeamId ? 'Modifier une équipe' : 'Nouvelle équipe'}</h4>
                <div className="gl-admin-grid-2">
                  <GLField label="Nom">
                    <GLInput
                      value={teamForm.name}
                      onChange={(event) => setTeamForm((prev) => ({ ...prev, name: event.target.value }))}
                      required
                    />
                  </GLField>
                  <GLField label="Type">
                    <GLSelect
                      value={teamForm.type}
                      onChange={(event) => {
                        const nextType = event.target.value;
                        setTeamForm((prev) => ({ ...prev, type: nextType, mascotId: defaultMascotByType(nextType) }));
                      }}
                    >
                      <option value="gnome">Gnome</option>
                      <option value="unicorn">Licorne</option>
                    </GLSelect>
                  </GLField>
                  <GLField label="Mascotte">
                    <GLSelect
                      value={teamForm.mascotId}
                      onChange={(event) => setTeamForm((prev) => ({ ...prev, mascotId: event.target.value }))}
                      disabled={selectableMascots.length === 0}
                    >
                      {selectableMascots.length === 0 ? (
                        <option value="">Chargement du catalogue…</option>
                      ) : null}
                      {selectableMascots.map((mascot) => (
                        <option key={mascot.id} value={mascot.id}>
                          {mascot.label}
                          {mascot.source === 'foretmap' ? ' (ForetMap)' : ''}
                        </option>
                      ))}
                    </GLSelect>
                  </GLField>
                  <GLField label="Couleur">
                    <GLInput
                      value={teamForm.color}
                      onChange={(event) => setTeamForm((prev) => ({ ...prev, color: event.target.value }))}
                      placeholder="#22c55e"
                    />
                  </GLField>
                </div>
                <div className="gl-inline-actions">
                  <GLButton type="submit" disabled={busy}>{editingTeamId ? 'Enregistrer équipe' : 'Créer équipe'}</GLButton>
                  {editingTeamId ? (
                    <GLButton type="button" variant="secondary" onClick={resetTeamEditing} disabled={busy}>
                      Annuler édition
                    </GLButton>
                  ) : null}
                </div>
              </form>

              {teams.length > 0 ? (
                <GLDataList
                  columns={[
                    { key: 'name', label: 'Nom' },
                    { key: 'type', label: 'Type' },
                    { key: 'mascot', label: 'Mascotte' },
                    { key: 'color', label: 'Couleur' },
                    { key: 'actions', label: 'Actions' },
                  ]}
                  emptyLabel="Aucune équipe."
                  rows={teamListRows}
                />
              ) : (
                <p className="gl-hint">Aucune équipe pour cette partie.</p>
              )}
            </div>

            <GLGameRosterPanel
              gameId={game.id}
              teams={teams}
              refreshKey={rosterRefreshKey}
              vitalityEnabled={vitalityEnabled}
              canImpersonate={canImpersonate}
              onImpersonationApplied={onImpersonationApplied}
              onRosterChanged={async () => {
                await onReloadGame?.();
                setRosterRefreshKey((value) => value + 1);
              }}
            />
          </>
        ) : (
          <div className="gl-empty-state">
            <span className="gl-empty-state-icon foretmap-emoji-text-mixed" aria-hidden="true">🎲</span>
            <p>Sélectionnez ou créez une partie dans l’onglet « Parties ».</p>
            <GLButton type="button" variant="secondary" onClick={() => setMjSection('parties')}>
              Aller aux parties
            </GLButton>
          </div>
        )
      )}

      {mjSection === 'live' && (
        game?.id ? (
          <>
            {teams.length > 0 && (
              <div className="gl-team-selector gl-gameplay-block">
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
                        <span
                          className="gl-team-chip-color"
                          style={{ backgroundColor: team.color || '#22c55e' }}
                          aria-hidden="true"
                        />
                        <span>{team.name}</span>
                        {team.mascot_id ? <span className="gl-team-chip-mascot">{team.mascot_id}</span> : null}
                        {isCurrentTurn ? <span className="gl-team-chip-badge">Tour</span> : null}
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
                  Équipe courante :{' '}
                  <strong>
                    {currentTeamId != null
                      ? (teams.find((team) => Number(team.id) === currentTeamId)?.name || `#${currentTeamId}`)
                      : 'aucune'}
                  </strong>
                </p>
                <GLButton type="button" onClick={nextTurn} disabled={busy}>Tour suivant</GLButton>
              </div>
            )}

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
                <GLButton type="submit" disabled={busy}>Envoyer la narration</GLButton>
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
                            <GLField label="Score à attribuer en cas d’acceptation">
                              <GLInput
                                type="number"
                                value={resolveDeltas[action.id] ?? 0}
                                onChange={(event) =>
                                  setResolveDeltas((prev) => ({ ...prev, [action.id]: Number(event.target.value) }))
                                }
                              />
                            </GLField>
                          )}
                          <div className="gl-inline-actions">
                            <GLButton type="button" size="sm" onClick={() => resolveAction(action.id, 'accepted')} disabled={busy}>
                              Accepter
                            </GLButton>
                            <GLButton type="button" size="sm" variant="danger" onClick={() => resolveAction(action.id, 'refused')} disabled={busy}>
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
                    onClick={() => applyTeamVitality({ healthDelta: teamHealthDelta, powerDelta: teamPowerDelta })}
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

            {!turnsEnabled && !narrationEnabled && !playerActionsEnabled && !scoringEnabled && !vitalityEnabled ? (
              <div className="gl-empty-state">
                <span className="gl-empty-state-icon foretmap-emoji-text-mixed" aria-hidden="true">⚙️</span>
                <p>Aucun module de jeu en direct activé. Configurez-les dans l’onglet Réglages.</p>
              </div>
            ) : null}
          </>
        ) : (
          <div className="gl-empty-state">
            <span className="gl-empty-state-icon foretmap-emoji-text-mixed" aria-hidden="true">🎲</span>
            <p>Sélectionnez ou créez une partie dans l’onglet « Parties ».</p>
            <GLButton type="button" variant="secondary" onClick={() => setMjSection('parties')}>
              Aller aux parties
            </GLButton>
          </div>
        )
      )}
    </section>
  );
}
