import React, { useEffect, useMemo, useState } from 'react';
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
  return { game, teams, markers, events: raw?.events || [] };
}

export function AppGL() {
  const { session, auth, token, updateSession, logout } = useGLSession();
  const [tab, setTab] = useState(() => readStoredTab());
  const [chapters, setChapters] = useState([]);
  const [activeGameId, setActiveGameId] = useState(null);
  const [gameState, setGameState] = useState(null);
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

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    Promise.all([
      apiGL('/api/gl/chapters').catch(() => []),
    ]).then(([chaptersData]) => {
      if (cancelled) return;
      setChapters(Array.isArray(chaptersData) ? chaptersData : []);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function reloadGame() {
    if (!activeGameId) return;
    try {
      const data = await apiGL(`/api/gl/games/${activeGameId}`);
      setGameState(toGameViewModel(data));
      setError('');
    } catch (err) {
      setError(err.message || 'Chargement partie impossible');
    }
  }

  useEffect(() => {
    reloadGame();
  }, [activeGameId]);

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
      if (Number(evt?.gameId) === Number(activeGameId)) {
        reloadGame();
      }
    });
    return () => {
      socket.close();
    };
  }, [token, activeGameId]);

  async function moveMascotToMarker(marker) {
    if (!isAdmin || !gameState?.game?.id || !marker?.id) return;
    const team = Array.isArray(gameState.teams) ? gameState.teams[0] : null;
    if (!team?.id) return;
    await apiGL(`/api/gl/games/${gameState.game.id}/events`, 'POST', {
      teamId: team.id,
      eventType: 'move',
      payload: { markerId: marker.id, markerLabel: marker.label },
    });
    await reloadGame();
  }

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
        onLogout={() => {
          logout();
          setGameState(null);
          setActiveGameId(null);
        }}
      />

      {error ? <div className="gl-error-banner">{error}</div> : null}

      <main className="gl-main">
        {tab === 'world' && <GLWorldView auth={auth} />}
        {tab === 'rules' && <GLRulesView auth={auth} />}
        {tab === 'spells' && <GLSpellsView auth={auth} />}
        {tab === 'maps' && (
          <GLMapView
            gameState={gameState}
            onMoveMascot={moveMascotToMarker}
            canMoveMascot={isAdmin}
          />
        )}
        {tab === 'biotope' && <GLBiotopeView gameState={gameState} />}
        {tab === 'biocenose' && <GLBiocenoseView gameState={gameState} />}
        {tab === 'history' && <GLHistoryView gameState={gameState} />}
        {tab === 'users' && isAdmin && <GLUsersAdminView />}
        {tab === 'contents' && isAdmin && <GLContentsAdminView auth={auth} />}
        {tab === 'settings' && isAdmin && <GLSettingsView />}
        {tab === 'mascots' && isAdmin && <GLMascotsAdminView />}
        {tab === 'mj' && isAdmin && (
          <GLGameMasterConsole
            chapters={chapters}
            gameState={gameState}
            onGameStateChange={(state) => {
              const vm = toGameViewModel(state);
              setGameState(vm);
              const nextId = vm?.game?.id ? Number(vm.game.id) : null;
              setActiveGameId(nextId);
            }}
            onReloadGame={reloadGame}
          />
        )}
      </main>
    </div>
  );
}
