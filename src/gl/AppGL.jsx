import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { withAppBase } from '../services/api.js';
import { useGLSession } from './hooks/useGLSession.js';
import { apiGL } from './services/apiGL.js';
import { GL_TAB_STORAGE_KEY, GL_PLAYER_TABS, GL_ADMIN_EXTRA_TABS, GL_VALID_TABS } from './constants/app-runtime.js';
import { GLAuthView } from './components/GLAuthView.jsx';
import { GLTopBar } from './components/GLTopBar.jsx';
import { GLWorldView } from './components/GLWorldView.jsx';
import { GLRulesView } from './components/GLRulesView.jsx';
import { GLSpellsView } from './components/GLSpellsView.jsx';
import { GLMapView } from './components/GLMapView.jsx';
import { GLBiotopeView } from './components/GLBiotopeView.jsx';
import { GLBiocenoseView } from './components/GLBiocenoseView.jsx';
import { GLHistoryView } from './components/GLHistoryView.jsx';
import { GLUsersAdminView } from './components/GLUsersAdminView.jsx';
import { GLContentsAdminView } from './components/GLContentsAdminView.jsx';
import { GLSettingsView } from './components/GLSettingsView.jsx';
import { GLMascotsAdminView } from './components/GLMascotsAdminView.jsx';
import { GLGameMasterConsole } from './components/GLGameMasterConsole.jsx';

const DEFAULT_GAMEPLAY = {
  turnsEnabled: false,
  narrationEnabled: false,
  playerActionsEnabled: false,
  scoringEnabled: false,
};

function readStoredTab() {
  try {
    const raw = String(localStorage.getItem(GL_TAB_STORAGE_KEY) || '').trim();
    if (GL_VALID_TABS.has(raw)) return raw;
  } catch (_) {
    // noop
  }
  return 'world';
}

function isAdminRole(auth) {
  return auth?.userType === 'gl_admin';
}

function toGameViewModel(raw) {
  if (!raw) return null;
  const game = raw?.game || null;
  const teams = Array.isArray(raw?.teams) ? raw.teams : [];
  const markers = Array.isArray(raw?.markers) ? raw.markers : [];
  const scores = raw?.scores || {};
  const pendingActions = Array.isArray(raw?.pendingActions) ? raw.pendingActions : [];
  return { game, teams, markers, scores, pendingActions, events: raw?.events || [] };
}

export function AppGL() {
  const { session, auth, token, updateSession, logout } = useGLSession();
  const [tab, setTab] = useState(() => readStoredTab());
  const [chapters, setChapters] = useState([]);
  const [activeGameId, setActiveGameId] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [gameplaySettings, setGameplaySettings] = useState(DEFAULT_GAMEPLAY);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [narrationToast, setNarrationToast] = useState(null); // { text, ts }
  const [turnToast, setTurnToast] = useState(null); // { teamId, ts }
  const [error, setError] = useState('');

  const isAdmin = isAdminRole(auth);
  const tabs = useMemo(
    () => (isAdmin ? [...GL_PLAYER_TABS, ...GL_ADMIN_EXTRA_TABS] : GL_PLAYER_TABS),
    [isAdmin]
  );

  useEffect(() => {
    try {
      localStorage.setItem(GL_TAB_STORAGE_KEY, tab);
    } catch (_) {
      // noop
    }
  }, [tab]);

  const reloadGameplaySettings = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiGL('/api/gl/gameplay-settings');
      const next = data?.settings || {};
      setGameplaySettings({ ...DEFAULT_GAMEPLAY, ...next });
    } catch (_) {
      // toggles silencieusement défaut
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    Promise.all([
      apiGL('/api/gl/chapters').catch(() => []),
    ]).then(([chaptersData]) => {
      if (cancelled) return;
      setChapters(Array.isArray(chaptersData) ? chaptersData : []);
    });
    reloadGameplaySettings();
    return () => {
      cancelled = true;
    };
  }, [token, reloadGameplaySettings]);

  const reloadGame = useCallback(async () => {
    if (!activeGameId) return;
    try {
      const data = await apiGL(`/api/gl/games/${activeGameId}`);
      setGameState(toGameViewModel(data));
      setError('');
    } catch (err) {
      setError(err.message || 'Chargement partie impossible');
    }
  }, [activeGameId]);

  useEffect(() => {
    reloadGame();
  }, [reloadGame]);

  useEffect(() => {
    if (!token || !activeGameId) return undefined;
    const socket = io(withAppBase(''), {
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      auth: { token },
    });
    socket.on('connect', () => {
      socket.emit('subscribe:gl-game', { gameId: activeGameId });
    });
    socket.on('gl:game:event', (evt) => {
      if (Number(evt?.gameId) !== Number(activeGameId)) return;
      const type = String(evt?.eventType || '');
      if (type === 'narration') {
        const text = String(evt?.payload?.text || '').trim();
        if (text) setNarrationToast({ text, ts: Date.now() });
      } else if (type === 'turn_change') {
        const nextTeamId = evt?.payload?.teamId != null ? Number(evt.payload.teamId) : null;
        if (nextTeamId != null) setTurnToast({ teamId: nextTeamId, ts: Date.now() });
      }
      reloadGame();
    });
    return () => {
      socket.close();
    };
  }, [token, activeGameId, reloadGame]);

  useEffect(() => {
    if (!narrationToast) return undefined;
    const id = setTimeout(() => setNarrationToast(null), 6000);
    return () => clearTimeout(id);
  }, [narrationToast]);

  useEffect(() => {
    if (!turnToast) return undefined;
    const id = setTimeout(() => setTurnToast(null), 4000);
    return () => clearTimeout(id);
  }, [turnToast]);

  /** MJ : déplace la mascotte de l'équipe active sélectionnée vers le marker cliqué. */
  async function moveMascotToMarker(marker) {
    if (!isAdmin || !gameState?.game?.id || !marker?.id) return;
    const teams = Array.isArray(gameState.teams) ? gameState.teams : [];
    const fallbackTeamId = teams.length > 0 ? Number(teams[0].id) : null;
    const teamId = selectedTeamId != null ? Number(selectedTeamId) : fallbackTeamId;
    if (teamId == null) return;
    try {
      await apiGL(`/api/gl/games/${gameState.game.id}/events`, 'POST', {
        teamId,
        eventType: 'move',
        payload: { markerId: marker.id, markerLabel: marker.label },
      });
      await reloadGame();
    } catch (err) {
      setError(err.message || 'Déplacement impossible');
    }
  }

  /** Joueur : soumet une demande d'action (validée par le MJ). */
  async function submitPlayerActionRequest({ marker, actionType }) {
    if (!gameState?.game?.id) return;
    try {
      await apiGL(`/api/gl/games/${gameState.game.id}/actions`, 'POST', {
        actionType: String(actionType || 'explore'),
        payload: {
          markerId: marker?.id || null,
          markerLabel: marker?.label || null,
        },
      });
    } catch (err) {
      setError(err.message || 'Demande d’action refusée');
    }
  }

  const turnToastTeam = useMemo(() => {
    if (!turnToast?.teamId || !gameState?.teams) return null;
    return gameState.teams.find((team) => Number(team.id) === Number(turnToast.teamId)) || null;
  }, [turnToast, gameState]);

  const currentTeamId = useMemo(() => {
    const value = gameState?.game?.current_team_id;
    return value != null ? Number(value) : null;
  }, [gameState]);

  const canRequestAction = useMemo(() => {
    if (isAdmin || !gameplaySettings.playerActionsEnabled) return false;
    const myTeamId = auth?.teamId != null ? Number(auth.teamId) : null;
    if (myTeamId == null) return false;
    if (gameplaySettings.turnsEnabled && currentTeamId != null && currentTeamId !== myTeamId) return false;
    return true;
  }, [isAdmin, gameplaySettings, auth, currentTeamId]);

  const playerMascotId = useMemo(() => {
    if (isAdmin) return null;
    const myTeamId = auth?.teamId != null ? Number(auth.teamId) : null;
    if (myTeamId == null || !Array.isArray(gameState?.teams)) return null;
    const team = gameState.teams.find((t) => Number(t.id) === myTeamId);
    return team?.mascot_id || null;
  }, [isAdmin, auth, gameState]);

  if (!session?.token) {
    return (
      <GLAuthView
        onLogin={(data) => {
          updateSession({ token: data.authToken, auth: data.auth });
          setTab('world');
          setError('');
        }}
      />
    );
  }

  return (
    <div className="gl-app">
      <GLTopBar
        tabs={tabs}
        activeTab={tab}
        onTabChange={setTab}
        auth={auth}
        playerMascotId={playerMascotId}
        onLogout={() => {
          logout();
          setGameState(null);
          setActiveGameId(null);
        }}
      />

      {error ? <div className="gl-error-banner">{error}</div> : null}

      {narrationToast ? (
        <div className="gl-narration-banner" role="status">
          <strong>Narration du MJ :</strong> {narrationToast.text}
        </div>
      ) : null}

      {turnToast ? (
        <div className="gl-turn-toast" role="status">
          C’est au tour de <strong>{turnToastTeam?.name || `équipe #${turnToast.teamId}`}</strong>.
        </div>
      ) : null}

      <main className="gl-main">
        {tab === 'world' && <GLWorldView auth={auth} />}
        {tab === 'rules' && <GLRulesView auth={auth} />}
        {tab === 'spells' && <GLSpellsView auth={auth} />}
        {tab === 'maps' && (
          <GLMapView
            gameState={gameState}
            onMoveMascot={moveMascotToMarker}
            onPlayerActionRequest={submitPlayerActionRequest}
            canMoveMascot={isAdmin}
            canRequestAction={canRequestAction}
            selectedTeamId={selectedTeamId}
            currentTeamId={currentTeamId}
          />
        )}
        {tab === 'biotope' && <GLBiotopeView gameState={gameState} />}
        {tab === 'biocenose' && <GLBiocenoseView gameState={gameState} />}
        {tab === 'history' && <GLHistoryView gameState={gameState} />}
        {tab === 'users' && isAdmin && <GLUsersAdminView />}
        {tab === 'contents' && isAdmin && <GLContentsAdminView auth={auth} />}
        {tab === 'settings' && isAdmin && <GLSettingsView />}
        {tab === 'mascots' && isAdmin && (
          <GLMascotsAdminView gameState={gameState} onReloadGame={reloadGame} />
        )}
        {tab === 'mj' && isAdmin && (
          <GLGameMasterConsole
            chapters={chapters}
            gameState={gameState}
            gameplaySettings={gameplaySettings}
            selectedTeamId={selectedTeamId}
            onSelectTeam={setSelectedTeamId}
            onGameStateChange={(state) => {
              const vm = toGameViewModel(state);
              setGameState(vm);
              const nextId = vm?.game?.id ? Number(vm.game.id) : null;
              setActiveGameId(nextId);
              reloadGameplaySettings();
            }}
            onReloadGame={async () => {
              await reloadGame();
              await reloadGameplaySettings();
            }}
          />
        )}
      </main>
    </div>
  );
}
