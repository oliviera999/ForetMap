import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { withAppBase } from '../services/api.js';
import { useGLSession } from './hooks/useGLSession.js';
import { apiGL } from './services/apiGL.js';
import { GL_TAB_STORAGE_KEY, GL_PLAYER_TABS, GL_ADMIN_EXTRA_TABS, GL_VALID_TABS } from './constants/app-runtime.js';
import { GL_MODULE_DEFAULTS, normalizeGlModules, isModuleEnabled } from './constants/modules.js';
import { GLAuthView } from './components/GLAuthView.jsx';
import { GLTopBar, GL_TAB_ID_PREFIX, GL_TABPANEL_ID_PREFIX } from './components/GLTopBar.jsx';
import { useGlCompactNav } from './hooks/useGlCompactNav.js';
import { GLWorldView } from './components/GLWorldView.jsx';
import { GLRulesView } from './components/GLRulesView.jsx';
import { GLSpellsView } from './components/GLSpellsView.jsx';
import { GLMapView } from './components/GLMapView.jsx';
import { GLBiotopeView } from './components/GLBiotopeView.jsx';
import { GLBiocenoseView } from './components/GLBiocenoseView.jsx';
import { GLGlossaryView } from './components/GLGlossaryView.jsx';
import { GLGlossaryPopover } from './components/GLGlossaryPopover.jsx';
import { GLLoreGlossaryView } from './components/GLLoreGlossaryView.jsx';
import { GLLoreGlossaryPopover } from './components/GLLoreGlossaryPopover.jsx';
import { GLSeleneCarnetView } from './components/GLSeleneCarnetView.jsx';
import { DialogShell } from '../components/DialogShell.jsx';
import { GLSpellPopover } from './components/GLSpellPopover.jsx';
import { GLSpellCastWizard } from './components/GLSpellCastWizard.jsx';
import { GLSpellCastResultPopover } from './components/GLSpellCastResultPopover.jsx';
import { useGLSpellCast } from './hooks/useGLSpellCast.js';
import { buildSpellCastResultViewModel } from './utils/glSpellCastRules.js';
import { GLHistoryView } from './components/GLHistoryView.jsx';
import { GLUsersAdminView } from './components/GLUsersAdminView.jsx';
import { GLContentsAdminView } from './components/GLContentsAdminView.jsx';
import { GLSettingsView } from './components/GLSettingsView.jsx';
import { GLMascotsAdminView } from './components/GLMascotsAdminView.jsx';
import { GLGameMasterConsole } from './components/GLGameMasterConsole.jsx';
import { useGLMascotStateMachine } from './hooks/useGLMascotStateMachine.js';
import { useGLNotificationCenter } from './hooks/useGLNotificationCenter.js';
import { GLForumView } from './components/GLForumView.jsx';
import { GLMarketView } from './components/GLMarketView.jsx';
import { GLTutorialsView } from './components/GLTutorialsView.jsx';
import { GLJournalView } from './components/GLJournalView.jsx';
import { GLPlayerJournalView } from './components/GLPlayerJournalView.jsx';
import { GLNotificationsCenter } from './components/GLNotificationsCenter.jsx';
import { GLButton } from './components/ui/GLButton.jsx';
import { GLHelpPanel } from './components/GLHelpPanel.jsx';
import { GLProfileModal } from './components/GLProfileModal.jsx';
import { GLStatsView } from './components/GLStatsView.jsx';
import { GLPasswordResetGate } from './components/GLPasswordResetGate.jsx';
import { useGLBrandTheme } from './hooks/useGLBrandTheme.js';
import { GLMascotCatalogProvider } from './context/GLMascotCatalogContext.jsx';
import { MusicPlayer } from './components/MusicPlayer.jsx';
import { loadGlAssetRuntime } from './assets/index.js';
import { pickZoneAtPct } from '../utils/glZoneAtPct.js';
import { getRuntimeFeuilletZonesForPlateau } from './data/glFeuilletZonesBundle.js';
import { isFeuilletZoneEditMode } from './utils/glFeuilletZoneEditMode.js';
import { useGLZoneMusic, readStoredMuted, writeStoredMuted } from './hooks/useGLZoneMusic.js';
import { FixedToast } from '../shared/components/FixedToast.jsx';
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion.js';
import { useAppVersion } from '../hooks/useAppVersion.js';
import { useGlLearningProgress } from './hooks/useGlLearningProgress.js';
import { useGlGlossaryLinkIndex } from './hooks/useGlGlossaryLinkIndex.js';
import { useGlLoreGlossaryLinkIndex } from './hooks/useGlLoreGlossaryLinkIndex.js';
import {
  isGlStaffAuth,
  canGlStaffImpersonate,
  glImpersonationBannerCopy,
} from './utils/glStaffView.js';

const DEFAULT_GAMEPLAY = {
  turnsEnabled: false,
  narrationEnabled: false,
  playerActionsEnabled: false,
  scoringEnabled: false,
  vitalityEnabled: false,
  defaultHealthPoints: 3,
  defaultPowerPoints: 3,
  spellCastEnabled: false,
  spellCastContributionMode: 'both',
  spellCastTeamScope: 'any_team',
  spellCastMjOnly: false,
  qcmMjOnly: false,
};

function decodeBase64UrlJson(value) {
  try {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch (_) {
    return null;
  }
}

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

function defaultTabForAuth(auth) {
  return isAdminRole(auth) ? 'mj' : 'maps';
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
  const compactNav = useGlCompactNav();
  const learningProgress = useGlLearningProgress(token);
  const [tab, setTab] = useState(() => readStoredTab());
  const [chapters, setChapters] = useState([]);
  const [classes, setClasses] = useState([]);
  const [activeGameId, setActiveGameId] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [gameplaySettings, setGameplaySettings] = useState(DEFAULT_GAMEPLAY);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [narrationToast, setNarrationToast] = useState(null); // { text, ts }
  const [turnToast, setTurnToast] = useState(null); // { teamId, ts }
  const [error, setError] = useState('');
  const [oauthNotice, setOauthNotice] = useState(null);
  const [modules, setModules] = useState(GL_MODULE_DEFAULTS);
  const [glProfile, setGlProfile] = useState(null);
  const [glConfig, setGlConfig] = useState({});
  const [showProfile, setShowProfile] = useState(false);
  const [showPlayerStats, setShowPlayerStats] = useState(false);
  const [glossaryFocusCode, setGlossaryFocusCode] = useState(null);
  const [glossaryPopoverCode, setGlossaryPopoverCode] = useState(null);
  const [loreGlossaryPopoverCode, setLoreGlossaryPopoverCode] = useState(null);
  const [loreGlossaryFocusCode, setLoreGlossaryFocusCode] = useState(null);
  const [spellPopoverCode, setSpellPopoverCode] = useState(null);
  const [spellCastOpen, setSpellCastOpen] = useState(false);
  const [spellCastInitialCode, setSpellCastInitialCode] = useState(null);
  const [spellCastResult, setSpellCastResult] = useState(null);
  const lastShownSpellCastEventIdRef = useRef(null);
  const [kingdomZones, setKingdomZones] = useState([]);
  const [watchTeamPct, setWatchTeamPct] = useState(null);
  const [zoneMusicMuted, setZoneMusicMuted] = useState(() => readStoredMuted());
  const [glViewMode, setGlViewMode] = useState('native'); // native | player
  const prefersReducedMotion = usePrefersReducedMotion();

  const themeChapterId = useMemo(() => {
    if (gameState?.game?.chapter_id) return Number(gameState.game.chapter_id);
    return null;
  }, [gameState]);

  const themeChapter = useMemo(() => {
    if (!themeChapterId) return null;
    return chapters.find((c) => Number(c.id) === themeChapterId) || null;
  }, [chapters, themeChapterId]);

  const { brand: glBrand, style: glBrandStyle } = useGLBrandTheme(glConfig?.brand, themeChapter?.theme);

  const chapterBiomeSlugs = useMemo(() => {
    const biomes = gameState?.game?.chapter_biomes;
    if (!Array.isArray(biomes)) return [];
    return biomes.map((b) => b.slug).filter(Boolean);
  }, [gameState?.game?.chapter_biomes]);

  const glossaryLinkItems = useGlGlossaryLinkIndex(token, chapterBiomeSlugs);
  const loreGlossaryLinkItems = useGlLoreGlossaryLinkIndex(token);

  const openGlossaryPopover = useCallback((code) => {
    const trimmed = String(code || '').trim();
    setGlossaryPopoverCode(trimmed || null);
  }, []);

  const closeGlossaryPopover = useCallback(() => {
    setGlossaryPopoverCode(null);
  }, []);

  const openLoreGlossaryPopover = useCallback((code) => {
    const trimmed = String(code || '').trim();
    setLoreGlossaryPopoverCode(trimmed || null);
  }, []);

  const closeLoreGlossaryPopover = useCallback(() => {
    setLoreGlossaryPopoverCode(null);
  }, []);

  const openLoreGlossaryFullTab = useCallback(() => {
    setTab('lore-glossary');
    setLoreGlossaryFocusCode(loreGlossaryPopoverCode);
  }, [loreGlossaryPopoverCode]);

  const clearLoreGlossaryFocus = useCallback(() => {
    setLoreGlossaryFocusCode(null);
  }, []);

  const openSpellPopover = useCallback((code) => {
    const trimmed = String(code || '').trim().toUpperCase();
    setSpellPopoverCode(trimmed || null);
  }, []);

  const closeSpellPopover = useCallback(() => {
    setSpellPopoverCode(null);
  }, []);

  const openGlossaryFullTab = useCallback((code) => {
    const trimmed = String(code || '').trim();
    setGlossaryPopoverCode(null);
    setGlossaryFocusCode(trimmed || null);
    setTab('glossary');
  }, []);

  const clearGlossaryFocus = useCallback(() => {
    setGlossaryFocusCode(null);
  }, []);

  const isAdmin = isAdminRole(auth);
  const appVersion = useAppVersion();
  const isImpersonating = !!auth?.impersonating;
  const isStaff = isGlStaffAuth(auth);
  const isStaffPlayerPreview = isStaff && glViewMode === 'player';
  const showStaffAdminUi = isAdmin && !isStaffPlayerPreview;
  const isMjMapControls = showStaffAdminUi;
  const showsPlayerChrome = !isAdmin || isStaffPlayerPreview;
  const impersonationBanner = useMemo(
    () => (isImpersonating ? glImpersonationBannerCopy(auth?.impersonatedBy) : null),
    [isImpersonating, auth?.impersonatedBy]
  );
  const zoneMusicEnabled = isModuleEnabled(modules, 'zoneMusicEnabled');
  const virtualDiceEnabled = isModuleEnabled(modules, 'virtualDiceEnabled');
  const feuilletZoneEditMode = isFeuilletZoneEditMode() && showStaffAdminUi;
  const chapterPlateauNumber = gameState?.game?.chapter_plateau_number ?? null;
  const chapterMusicBiomeSlug = useMemo(() => {
    const fromList = chapterBiomeSlugs[0];
    if (fromList) return fromList;
    return gameState?.game?.biome || null;
  }, [chapterBiomeSlugs, gameState?.game?.biome]);

  useEffect(() => {
    if (!token) return undefined;
    loadGlAssetRuntime().catch(() => {});
    return undefined;
  }, [token]);
  const feuilletZones = useMemo(() => {
    if (chapterPlateauNumber == null) return [];
    return getRuntimeFeuilletZonesForPlateau(chapterPlateauNumber);
  }, [chapterPlateauNumber]);

  const activeZoneForMusic = useMemo(() => {
    if (!watchTeamPct) return null;
    return pickZoneAtPct(kingdomZones, watchTeamPct.xp, watchTeamPct.yp);
  }, [kingdomZones, watchTeamPct]);

  const zoneMusicRuntimeActive = tab === 'maps' && zoneMusicEnabled && Boolean(gameState?.game);

  const { unlock: unlockZoneMusic, stopAll: stopZoneMusic } = useGLZoneMusic({
    enabled: zoneMusicRuntimeActive,
    userMuted: zoneMusicMuted,
    activeZone: activeZoneForMusic,
    prefersReducedMotion,
  });

  useEffect(() => {
    if (zoneMusicRuntimeActive) return undefined;
    stopZoneMusic();
    return undefined;
  }, [zoneMusicRuntimeActive, stopZoneMusic]);

  const kingdomZonesRuntimeActive = tab === 'maps' && Boolean(gameState?.game?.chapter_id);

  useEffect(() => {
    if (!token || !kingdomZonesRuntimeActive) {
      setKingdomZones([]);
      return undefined;
    }
    const chapterId = gameState?.game?.chapter_id;
    if (!chapterId) {
      setKingdomZones([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await apiGL(`/api/gl/kingdom-map/zones?chapterId=${chapterId}`);
        if (!cancelled) {
          setKingdomZones(Array.isArray(data?.zones) ? data.zones : []);
        }
      } catch (_) {
        if (!cancelled) setKingdomZones([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, kingdomZonesRuntimeActive, gameState?.game?.chapter_id]);

  const handleWatchTeamPctChange = useCallback((pct) => {
    setWatchTeamPct(pct);
  }, []);

  const handleZoneMusicToggle = useCallback(() => {
    setZoneMusicMuted((prev) => {
      const next = !prev;
      writeStoredMuted(next);
      if (!next) unlockZoneMusic();
      return next;
    });
  }, [unlockZoneMusic]);

  useEffect(() => {
    const hashRaw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
    if (!hashRaw) return;
    const hashParams = new URLSearchParams(hashRaw);
    const oauthPayload = hashParams.get('oauth');
    const oauthError = hashParams.get('oauth_error');
    if (!oauthPayload && !oauthError) return;

    const cleanUrl = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState({}, document.title, cleanUrl);

    if (oauthError) {
      setOauthNotice({ error: oauthError });
      return;
    }
    const payload = decodeBase64UrlJson(oauthPayload);
    if (payload?.type === 'gl_staff' && payload?.token) {
      const nextAuth = payload.auth || null;
      updateSession({ token: payload.token, auth: nextAuth });
      setTab(defaultTabForAuth(nextAuth));
      setOauthNotice({ success: true });
      setError('');
      return;
    }
    if (payload?.type === 'gl_player' && payload?.token) {
      const nextAuth = payload.auth || null;
      updateSession({ token: payload.token, auth: nextAuth });
      setTab(defaultTabForAuth(nextAuth));
      setOauthNotice({ success: true });
      setError('');
      return;
    }
    setOauthNotice({ error: 'oauth_invalid_payload' });
  }, [updateSession]);
  const tabs = useMemo(() => {
    const playerTabs = GL_PLAYER_TABS.filter((tab) => {
      if (tab.id === 'history') return isModuleEnabled(modules, 'journalEnabled');
      if (tab.id === 'tutorials') return isModuleEnabled(modules, 'tutorialsEnabled');
      if (tab.id === 'forum') return isModuleEnabled(modules, 'forumEnabled');
      if (tab.id === 'market') {
        return isModuleEnabled(modules, 'marketEnabled') && !!gameplaySettings.vitalityEnabled;
      }
      if (tab.id === 'journal') return isModuleEnabled(modules, 'journalEnabled');
      if (tab.id === 'my-journal') return isModuleEnabled(modules, 'playerJournalEnabled');
      if (tab.id === 'selene-carnet') return isModuleEnabled(modules, 'loreCarnetEnabled');
      if (tab.id === 'lore-glossary') return isModuleEnabled(modules, 'loreGlossaryEnabled');
      return true;
    });
    const adminTabs = GL_ADMIN_EXTRA_TABS;
    return showStaffAdminUi ? [...playerTabs, ...adminTabs] : playerTabs;
  }, [showStaffAdminUi, modules, gameplaySettings.vitalityEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem(GL_TAB_STORAGE_KEY, tab);
    } catch (_) {
      // noop
    }
  }, [tab]);

  useEffect(() => {
    if (!tabs.some((current) => current.id === tab)) {
      setTab(defaultTabForAuth(auth));
    }
  }, [tabs, tab, auth]);

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

  const reloadProfile = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiGL('/api/gl/auth/me');
      setGlProfile(data?.profile || null);
      if (data?.auth) {
        updateSession({ auth: data.auth });
        const nextGameId = data.auth.gameId != null
          ? Number(data.auth.gameId)
          : (data.profile?.activeGameId != null ? Number(data.profile.activeGameId) : null);
        if (!isAdmin && nextGameId != null && Number.isFinite(nextGameId) && nextGameId > 0) {
          setActiveGameId(nextGameId);
        }
      }
      setError('');
    } catch (err) {
      setError(err.message || 'Chargement profil impossible');
    }
  }, [token, isAdmin, updateSession]);

  const applyGlImpersonation = useCallback((payload) => {
    if (!payload?.authToken || !payload?.auth) {
      setError('Réponse serveur invalide');
      return;
    }
    setGlViewMode('native');
    updateSession({ token: payload.authToken, auth: payload.auth });
    const nextGameId = payload.auth?.gameId != null ? Number(payload.auth.gameId) : null;
    if (Number.isFinite(nextGameId) && nextGameId > 0) {
      setActiveGameId(nextGameId);
    }
    setTab('maps');
    setError('');
  }, [updateSession]);

  const stopGlImpersonation = useCallback(async () => {
    try {
      const payload = await apiGL('/api/gl/auth/admin/impersonate/stop', 'POST');
      if (!payload?.authToken || !payload?.auth) {
        setError('Réponse serveur invalide');
        return;
      }
      setGlViewMode('native');
      updateSession({ token: payload.authToken, auth: payload.auth });
      setTab(defaultTabForAuth(payload.auth));
      setError('');
    } catch (err) {
      setError(err.message || 'Impossible de quitter la prise de contrôle');
    }
  }, [updateSession]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const classListPromise = isAdmin
      ? apiGL('/api/gl/admin/classes').catch(() => [])
      : Promise.resolve([]);
    Promise.all([
      apiGL('/api/gl/chapters').catch(() => []),
      apiGL('/api/gl/auth/config').catch(() => ({})),
      apiGL('/api/gl/auth/me').catch(() => ({})),
      classListPromise,
    ]).then(([chaptersData, configData, profileData, classesData]) => {
      if (cancelled) return;
      setChapters(Array.isArray(chaptersData) ? chaptersData : []);
      setClasses(Array.isArray(classesData) ? classesData : []);
      setModules(normalizeGlModules(configData?.modules));
      setGlConfig(configData || {});
      setGlProfile(profileData?.profile || null);
      if (profileData?.auth) {
        updateSession({ auth: profileData.auth });
        const nextGameId = profileData.auth.gameId != null
          ? Number(profileData.auth.gameId)
          : (profileData.profile?.activeGameId != null ? Number(profileData.profile.activeGameId) : null);
        if (!isAdmin && nextGameId != null && Number.isFinite(nextGameId) && nextGameId > 0) {
          setActiveGameId(nextGameId);
        }
      }
    });
    reloadGameplaySettings();
    return () => {
      cancelled = true;
    };
  }, [token, reloadGameplaySettings, isAdmin, updateSession]);

  useEffect(() => {
    const nextTitle = String(glConfig?.title || '').trim();
    if (!nextTitle) return;
    document.title = nextTitle;
  }, [glConfig?.title]);

  useEffect(() => {
    if (isAdmin) return;
    if (activeGameId) return;
    const hintedGameId = auth?.gameId != null ? Number(auth.gameId) : null;
    if (hintedGameId != null && Number.isFinite(hintedGameId) && hintedGameId > 0) {
      setActiveGameId(hintedGameId);
    }
  }, [isAdmin, activeGameId, auth?.gameId]);

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

  const showSpellCastResult = useCallback((source) => {
    const vm = buildSpellCastResultViewModel(source);
    if (!vm.eventId || vm.eventId === lastShownSpellCastEventIdRef.current) return;
    lastShownSpellCastEventIdRef.current = vm.eventId;
    setSpellCastResult(vm);
  }, []);

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
      } else if (type === 'spell_cast') {
        showSpellCastResult({ event: evt });
      }
      reloadGame();
    });
    return () => {
      socket.close();
    };
  }, [token, activeGameId, reloadGame, showSpellCastResult]);

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

  function resolveTargetTeamId() {
    const teams = Array.isArray(gameState?.teams) ? gameState.teams : [];
    const fallbackTeamId = teams.length > 0 ? Number(teams[0].id) : null;
    return selectedTeamId != null ? Number(selectedTeamId) : fallbackTeamId;
  }

  /** MJ : déplacement libre de la mascotte de l'équipe active sélectionnée. */
  async function moveMascotToPct(point) {
    if (!isMjMapControls || !gameState?.game?.id || !point) return;
    const teamId = resolveTargetTeamId();
    if (teamId == null) return;
    try {
      await apiGL(`/api/gl/games/${gameState.game.id}/events`, 'POST', {
        teamId,
        eventType: 'move',
        payload: { xp: point.xp, yp: point.yp },
      });
      await reloadGame();
    } catch (err) {
      setError(err.message || 'Déplacement impossible');
    }
  }

  /** MJ : déplace la mascotte de l'équipe active sélectionnée vers le marker cliqué. */
  async function moveMascotToMarker(marker) {
    if (!isMjMapControls || !gameState?.game?.id || !marker?.id) return;
    const teamId = resolveTargetTeamId();
    if (teamId == null) return;
    try {
      await apiGL(`/api/gl/games/${gameState.game.id}/events`, 'POST', {
        teamId,
        eventType: 'move',
        payload: { markerId: marker.id, markerLabel: marker.label, xp: marker.x_pct, yp: marker.y_pct },
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

  async function joinSelectedTeam() {
    if (showStaffAdminUi || !gameState?.game?.id) return;
    const teamId = resolveTargetTeamId();
    if (teamId == null) {
      setError('Choisissez une équipe avant de rejoindre.');
      return;
    }
    try {
      await apiGL(`/api/gl/games/${gameState.game.id}/join-team`, 'POST', { teamId });
      const me = await apiGL('/api/gl/auth/me');
      if (me?.auth) {
        updateSession({ auth: me.auth });
        const nextGameId = me.auth.gameId != null
          ? Number(me.auth.gameId)
          : Number(gameState.game.id);
        if (Number.isFinite(nextGameId) && nextGameId > 0) setActiveGameId(nextGameId);
      } else {
        updateSession({ auth: { ...auth, teamId, gameId: Number(gameState.game.id) } });
        setActiveGameId(Number(gameState.game.id));
      }
      await reloadGame();
      setError('');
    } catch (err) {
      setError(err.message || 'Impossible de rejoindre cette équipe');
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
    if (showStaffAdminUi || !gameplaySettings.playerActionsEnabled) return false;
    const myTeamId = auth?.teamId != null ? Number(auth.teamId) : null;
    if (myTeamId == null) return false;
    if (gameplaySettings.turnsEnabled && currentTeamId != null && currentTeamId !== myTeamId) return false;
    return true;
  }, [showStaffAdminUi, gameplaySettings, auth, currentTeamId]);

  const markerArrivalEnabled = useMemo(() => {
    if (showStaffAdminUi) return true;
    return !gameplaySettings.qcmMjOnly;
  }, [showStaffAdminUi, gameplaySettings.qcmMjOnly]);

  const canSpellCast = useMemo(() => {
    const moduleOn = isModuleEnabled(modules, 'spellCastEnabled')
      || gameplaySettings.spellCastEnabled === true;
    if (!moduleOn || !gameplaySettings.vitalityEnabled) return false;
    if (!gameState?.game?.id || gameState?.game?.status !== 'live') return false;
    if (gameplaySettings.spellCastMjOnly && !showStaffAdminUi) return false;
    if (gameplaySettings.turnsEnabled && currentTeamId != null) {
      const myTeamId = auth?.teamId != null ? Number(auth.teamId) : null;
      if (showsPlayerChrome && myTeamId != null && currentTeamId !== myTeamId) return false;
    }
    return true;
  }, [modules, gameplaySettings, gameState, auth, currentTeamId, showsPlayerChrome, showStaffAdminUi]);

  const spellCast = useGLSpellCast({
    token,
    gameId: gameState?.game?.id,
    enabled: canSpellCast && spellCastOpen,
    onCastComplete: async (data) => {
      if (data?.event) {
        showSpellCastResult({ event: data.event, draft: data.draft });
      }
      await reloadGame();
      await reloadProfile();
    },
  });

  const openSpellCastWizard = useCallback((code = null) => {
    setSpellCastInitialCode(code ? String(code).trim().toUpperCase() : null);
    setSpellCastOpen(true);
    if (code) setSpellPopoverCode(null);
  }, []);
  const mascotStateMachine = useGLMascotStateMachine({
    gameState,
    selectedTeamId,
    currentTeamId,
  });

  const playerMascotId = useMemo(() => {
    if (!showsPlayerChrome) return null;
    const myTeamId = auth?.teamId != null ? Number(auth.teamId) : null;
    if (myTeamId == null || !Array.isArray(gameState?.teams)) return null;
    const team = gameState.teams.find((t) => Number(t.id) === myTeamId);
    return team?.mascot_id || null;
  }, [showsPlayerChrome, auth, gameState]);

  const playerVitality = useMemo(() => {
    if (!showsPlayerChrome || !gameplaySettings.vitalityEnabled) return null;
    const playerId = auth?.userId != null ? Number(auth.userId) : null;
    if (playerId == null) return null;
    const fromGame = gameState?.vitality?.byPlayerId?.[playerId];
    if (fromGame) {
      return { health: fromGame.health, power: fromGame.power };
    }
    const profile = glProfile || {};
    if (profile.health_points != null || profile.power_points != null) {
      return {
        health: Number(profile.health_points) || 0,
        power: Number(profile.power_points) || 0,
      };
    }
    return null;
  }, [showsPlayerChrome, gameplaySettings.vitalityEnabled, auth, gameState, glProfile]);

  const notifications = useGLNotificationCenter();
  useEffect(() => {
    if (narrationToast) {
      notifications.push({
        category: 'narration',
        title: 'Narration du MJ',
        body: narrationToast.text,
        ts: narrationToast.ts,
      });
    }
  }, [narrationToast, notifications]);

  const activeChapter = useMemo(() => {
    if (gameState?.game?.chapter_id) {
      return chapters.find((c) => Number(c.id) === Number(gameState.game.chapter_id)) || null;
    }
    return chapters[0] || null;
  }, [chapters, gameState]);

  if (!session?.token) {
    return (
      <div className="gl-app gl-app--guest" style={glBrandStyle}>
      <GLAuthView
        config={glConfig}
        oauthNotice={oauthNotice}
        appVersion={appVersion}
        onLogin={(data) => {
          updateSession({ token: data.authToken, auth: data.auth });
          setTab(defaultTabForAuth(data?.auth));
          setError('');
          setOauthNotice(null);
        }}
      />
      </div>
    );
  }

  return (
    <GLMascotCatalogProvider token={token}>
    <div className={`gl-app${compactNav ? ' gl-app--has-bottom-nav' : ''}`} style={glBrandStyle}>
      <GLPasswordResetGate
        open={!isAdmin && auth?.passwordMustReset === true}
        onCompleted={() => {
          updateSession({ auth: { ...auth, passwordMustReset: false } });
        }}
      />
      <GLTopBar
        tabs={tabs}
        activeTab={tab}
        onTabChange={setTab}
        auth={auth}
        platformTitle={glConfig?.title}
        platformSubtitle={glConfig?.subtitle}
        brandLogoUrl={glBrand?.logoUrl}
        playerMascotId={playerMascotId}
        vitalityEnabled={!!gameplaySettings.vitalityEnabled}
        playerHealthPoints={playerVitality?.health}
        playerPowerPoints={playerVitality?.power}
        onOpenProfile={() => setShowProfile(true)}
        onOpenStats={showsPlayerChrome ? () => setShowPlayerStats(true) : undefined}
        canSwitchGlPlayerView={isStaff}
        glViewMode={glViewMode}
        onGlViewModeNative={() => {
          setGlViewMode('native');
          setTab(defaultTabForAuth(auth));
        }}
        onGlViewModePlayer={() => {
          setGlViewMode('player');
          setTab('maps');
        }}
        onLogout={() => {
          logout();
          setGameState(null);
          setActiveGameId(null);
          setGlProfile(null);
          setShowProfile(false);
          setGlViewMode('native');
        }}
        showVersion={showStaffAdminUi}
        appVersion={appVersion}
      />

      {error ? <div className="gl-error-banner">{error}</div> : null}

      {isStaffPlayerPreview ? (
        <div className="role-preview-banner fade-in" role="status">
          <span className="role-preview-banner__icon" aria-hidden>🎮</span>
          <div className="role-preview-banner__text">
            <strong>Vue joueur (aperçu)</strong>
            <span>
              Navigation limitée aux onglets joueur. Tes droits MJ/admin restent actifs côté serveur.
            </span>
          </div>
        </div>
      ) : null}

      {isImpersonating && impersonationBanner ? (
        <div className="role-preview-banner role-preview-banner--impersonation fade-in" role="status">
          <span className="role-preview-banner__icon" aria-hidden>👤</span>
          <div className="role-preview-banner__text" style={{ flex: '1 1 200px' }}>
            <strong>{impersonationBanner.title}</strong>
            <span>
              Tu navigues avec l’identité de <strong>{String(auth?.displayName || 'joueur')}</strong>.
              Les actions sont enregistrées pour ce compte.
            </span>
          </div>
          <div className="impersonation-banner-actions">
            <GLButton type="button" size="sm" onClick={() => { stopGlImpersonation(); }}>
              {impersonationBanner.stopLabel}
            </GLButton>
          </div>
        </div>
      ) : null}

      {narrationToast ? (
        <div className="gl-narration-banner fade-in" role="status">
          <strong>Narration du MJ :</strong> {narrationToast.text}
        </div>
      ) : null}

      {turnToast ? (
        <FixedToast className="fm-toast--turn gl-turn-toast">
          C’est au tour de <strong>{turnToastTeam?.name || `équipe #${turnToast.teamId}`}</strong>.
        </FixedToast>
      ) : null}

      <main className="gl-main" id="gl-main-content">
        <div
          className="gl-main-inner fade-in"
          role="tabpanel"
          id={`${GL_TABPANEL_ID_PREFIX}-${tab}`}
          aria-labelledby={`${GL_TAB_ID_PREFIX}-${tab}`}
        >
        {tab === 'world' && (
          <GLWorldView
            auth={auth}
            brandSlots={glBrand?.slots}
            onNavigateTab={setTab}
            glossaryLinkItems={glossaryLinkItems}
            onOpenGlossaryTerm={openGlossaryPopover}
          />
        )}
        {tab === 'rules' && (
          <GLRulesView
            auth={auth}
            brandSlots={glBrand?.slots}
            onNavigateTab={setTab}
            glossaryLinkItems={glossaryLinkItems}
            onOpenGlossaryTerm={openGlossaryPopover}
          />
        )}
        {tab === 'spells' && (
          <GLSpellsView
            gameState={gameState}
            brandSlots={glBrand?.slots}
            onOpenSpell={openSpellPopover}
            canSpellCast={canSpellCast}
            onLaunchSpell={openSpellCastWizard}
            glossaryLinkItems={glossaryLinkItems}
            onOpenGlossaryTerm={openGlossaryPopover}
          />
        )}
        {tab === 'maps' && (
          <>
            <GLMapView
              gameState={gameState}
              onMoveMascot={moveMascotToMarker}
              onMoveMascotToPct={moveMascotToPct}
              onPlayerActionRequest={submitPlayerActionRequest}
              onSelectTeam={setSelectedTeamId}
              onOpenGlossaryTerm={openGlossaryPopover}
              glossaryLinkItems={glossaryLinkItems}
              onOpenLoreTerm={openLoreGlossaryPopover}
              loreGlossaryLinkItems={loreGlossaryLinkItems}
              loreCarnetEnabled={isModuleEnabled(modules, 'loreCarnetEnabled')}
              onQcmAnswered={reloadGame}
              canMoveMascot={isMjMapControls}
              canRequestAction={canRequestAction}
              markerArrivalEnabled={markerArrivalEnabled}
              canSpellCast={canSpellCast}
              onLaunchSpell={() => openSpellCastWizard(null)}
              selectedTeamId={selectedTeamId}
              currentTeamId={currentTeamId}
              playerTeamId={auth?.teamId != null ? Number(auth.teamId) : null}
              mascotStateMachine={mascotStateMachine}
              kingdomZones={kingdomZones}
              zoneMusicEnabled={zoneMusicEnabled}
              zoneMusicMuted={zoneMusicMuted}
              onZoneMusicToggle={handleZoneMusicToggle}
              onWatchTeamPctChange={handleWatchTeamPctChange}
              onZoneMusicUnlock={unlockZoneMusic}
              brandThemeStyle={glBrandStyle}
              virtualDiceEnabled={virtualDiceEnabled}
              feuilletZones={feuilletZones}
              feuilletZoneEditMode={feuilletZoneEditMode}
            />
            {showsPlayerChrome && gameState?.game && auth?.teamId == null && (
              <section className="gl-panel">
                <h3>Rejoindre une équipe</h3>
                <p className="gl-hint" style={{ marginTop: 0 }}>
                  Sélectionnez une équipe sur la carte, puis confirmez l’affectation joueur.
                </p>
                <GLButton type="button" onClick={joinSelectedTeam}>
                  Rejoindre l’équipe sélectionnée
                </GLButton>
              </section>
            )}
          </>
        )}
        {tab === 'biotope' && (
          <GLBiotopeView
            gameState={gameState}
            glossaryLinkItems={glossaryLinkItems}
            onOpenGlossaryTerm={openGlossaryPopover}
          />
        )}
        {tab === 'biocenose' && (
          <GLBiocenoseView
            gameState={gameState}
            onOpenGlossaryTerm={openGlossaryPopover}
            learningProgress={learningProgress}
            glossaryLinkItems={glossaryLinkItems}
            loreCarnetEnabled={isModuleEnabled(modules, 'loreCarnetEnabled')}
          />
        )}
        {tab === 'glossary' && (
          <GLGlossaryView
            gameState={gameState}
            focusCode={glossaryFocusCode}
            activeTermCode={glossaryPopoverCode}
            onOpenPopover={openGlossaryPopover}
            onFocusHandled={clearGlossaryFocus}
            learningProgress={learningProgress}
          />
        )}
        {tab === 'lore-glossary' && isModuleEnabled(modules, 'loreGlossaryEnabled') && (
          <GLLoreGlossaryView
            focusCode={loreGlossaryFocusCode}
            activeTermCode={loreGlossaryPopoverCode}
            onOpenPopover={openLoreGlossaryPopover}
            onFocusHandled={clearLoreGlossaryFocus}
          />
        )}
        {tab === 'selene-carnet' && isModuleEnabled(modules, 'loreCarnetEnabled') && (
          <GLSeleneCarnetView
            gameState={gameState}
            glossaryLinkItems={glossaryLinkItems}
            loreGlossaryLinkItems={loreGlossaryLinkItems}
            onOpenGlossaryTerm={openGlossaryPopover}
            onOpenLoreTerm={openLoreGlossaryPopover}
            isMj={showStaffAdminUi}
          />
        )}
        {tab === 'history' && (
          <GLHistoryView
            gameState={gameState}
            glossaryLinkItems={glossaryLinkItems}
            onOpenGlossaryTerm={openGlossaryPopover}
          />
        )}
        {tab === 'stats' && showStaffAdminUi && (
          <GLStatsView
            mode="class"
            classes={classes}
            auth={auth}
            vitalityEnabled={!!gameplaySettings.vitalityEnabled}
          />
        )}
        {tab === 'users' && showStaffAdminUi && (
          <GLUsersAdminView
            auth={auth}
            onImpersonationApplied={applyGlImpersonation}
          />
        )}
        {tab === 'contents' && showStaffAdminUi && (
          <GLContentsAdminView
            auth={auth}
            onNavigateTab={setTab}
            glossaryLinkItems={glossaryLinkItems}
            onOpenGlossaryTerm={openGlossaryPopover}
          />
        )}
        {tab === 'settings' && showStaffAdminUi && <GLSettingsView />}
        {tab === 'mascots' && showStaffAdminUi && (
          <GLMascotsAdminView
            gameState={gameState}
            onReloadGame={reloadGame}
            mascotPacksEnabled={isModuleEnabled(modules, 'mascotPacksEnabled')}
          />
        )}
        {tab === 'mj' && showStaffAdminUi && (
          <GLGameMasterConsole
            chapters={chapters}
            classes={classes}
            gameState={gameState}
            gameplaySettings={gameplaySettings}
            selectedTeamId={selectedTeamId}
            onSelectTeam={setSelectedTeamId}
            canImpersonate={canGlStaffImpersonate(auth)}
            onImpersonationApplied={applyGlImpersonation}
            onGameStateChange={(state) => {
              const vm = toGameViewModel(state);
              setGameState(vm);
              const nextId = vm?.game?.id ? Number(vm.game.id) : null;
              setActiveGameId((prevId) => {
                if (Number(prevId) !== Number(nextId)) {
                  setSelectedTeamId(null);
                }
                return nextId;
              });
              reloadGameplaySettings();
            }}
            onReloadGame={async () => {
              await reloadGame();
              await reloadGameplaySettings();
            }}
            canSpellCast={canSpellCast}
            onLaunchSpell={openSpellCastWizard}
          />
        )}
        {tab === 'forum' && isModuleEnabled(modules, 'forumEnabled') && (
          <GLForumView canModerate={showStaffAdminUi} />
        )}
        {tab === 'market' && isModuleEnabled(modules, 'marketEnabled') && gameplaySettings.vitalityEnabled && showsPlayerChrome && (
          <GLMarketView
            token={token}
            classId={auth?.classId ?? glProfile?.class_id}
            playerId={auth?.userId}
            onTradeCompleted={() => {
              reloadProfile();
            }}
          />
        )}
        {tab === 'tutorials' && isModuleEnabled(modules, 'tutorialsEnabled') && (
          <GLTutorialsView
            canManage={showStaffAdminUi}
            learningProgress={learningProgress}
            glossaryLinkItems={glossaryLinkItems}
            onOpenGlossaryTerm={openGlossaryPopover}
          />
        )}
        {tab === 'journal' && isModuleEnabled(modules, 'journalEnabled') && (
          <GLJournalView
            gameId={activeGameId}
            token={token}
            canEmit={showStaffAdminUi}
            defaultTeamId={selectedTeamId}
            narrationEnabled={!!gameplaySettings.narrationEnabled}
          />
        )}
        {tab === 'my-journal' && isModuleEnabled(modules, 'playerJournalEnabled') && (
          <GLPlayerJournalView gameState={gameState} />
        )}
        {isModuleEnabled(modules, 'helpEnabled') ? (
          <GLHelpPanel helpKey={`tab:${tab}`} title="Aide GL" defaultOpen={false}>
            <p>
              Onglet courant&nbsp;: <strong>{tab}</strong>. Astuce&nbsp;: les modules visibles
              dépendent des réglages MJ. Désactive un module dans <strong>Réglages plateforme</strong>
              pour épurer la navigation joueur.
            </p>
          </GLHelpPanel>
        ) : null}
        {isModuleEnabled(modules, 'notificationsEnabled') ? (
          <GLNotificationsCenter
            items={notifications.items}
            unreadCount={notifications.unreadCount}
            onMarkAllRead={notifications.markAllRead}
            onClear={notifications.clear}
          />
        ) : null}
        </div>
      </main>
      {showStaffAdminUi ? (
        <footer className="gl-app-footer" aria-label="Version de l’application">
          Version {appVersion != null ? appVersion : '…'}
        </footer>
      ) : null}
      <GLProfileModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        auth={auth}
        profile={glProfile}
        config={glConfig}
        onReloadProfile={reloadProfile}
        onOpenStats={showsPlayerChrome ? () => {
          setShowProfile(false);
          setShowPlayerStats(true);
        } : null}
        onSessionUpdated={(payload) => {
          if (payload?.authToken || payload?.auth) {
            updateSession({
              token: payload?.authToken || token,
              auth: payload?.auth || auth,
            });
          }
          if (payload?.profile) setGlProfile(payload.profile);
        }}
      />
      {showPlayerStats && showsPlayerChrome ? (
        <DialogShell
          open={showPlayerStats}
          onClose={() => setShowPlayerStats(false)}
          overlayClassName="fm-modal-overlay gl-stats-modal-overlay"
          dialogClassName="fm-modal-panel gl-stats-modal-panel animate-pop fm-modal-panel--scroll-body"
          ariaLabel="Mes statistiques"
        >
          <GLStatsView
            mode="self"
            auth={auth}
            vitalityEnabled={!!gameplaySettings.vitalityEnabled}
            compact
            onClose={() => setShowPlayerStats(false)}
          />
        </DialogShell>
      ) : null}
      <GLGlossaryPopover
        open={!!glossaryPopoverCode}
        glossaryCode={glossaryPopoverCode}
        biomeSlugs={chapterBiomeSlugs}
        onClose={closeGlossaryPopover}
        onOpenFullGlossary={openGlossaryFullTab}
        showFullGlossaryLink={tab !== 'glossary'}
        learningProgress={learningProgress}
      />
      <GLLoreGlossaryPopover
        open={!!loreGlossaryPopoverCode}
        loreCode={loreGlossaryPopoverCode}
        onClose={closeLoreGlossaryPopover}
        onOpenFullGlossary={openLoreGlossaryFullTab}
      />
      <GLSpellPopover
        open={!!spellPopoverCode}
        spellCode={spellPopoverCode}
        onClose={closeSpellPopover}
        canLaunch={canSpellCast}
        onLaunchSpell={() => openSpellCastWizard(spellPopoverCode)}
      />
      <GLSpellCastResultPopover
        open={!!spellCastResult}
        result={spellCastResult}
        onClose={() => setSpellCastResult(null)}
      />
      <GLSpellCastWizard
        open={spellCastOpen}
        onClose={() => {
          setSpellCastOpen(false);
          setSpellCastInitialCode(null);
        }}
        spellCode={spellCastInitialCode}
        teams={gameState?.teams || []}
        gameId={gameState?.game?.id}
        playerId={auth?.userId != null ? Number(auth.userId) : null}
        playerTeamId={auth?.teamId != null ? Number(auth.teamId) : null}
        currentTeamId={currentTeamId}
        turnsEnabled={!!gameplaySettings.turnsEnabled}
        contributionMode={gameplaySettings.spellCastContributionMode || 'both'}
        teamScope={gameplaySettings.spellCastTeamScope || 'any_team'}
        isStaff={showStaffAdminUi}
        spellCast={spellCast}
        chapterSpells={gameState?.game?.chapter_spells || []}
        onPickSpell={(code) => setSpellCastInitialCode(code)}
      />
      <MusicPlayer
        enabled={Boolean(token && gameState?.game)}
        plateauNumber={chapterPlateauNumber}
        introActive={chapterPlateauNumber == null && Boolean(gameState?.game)}
        biomeSlug={chapterMusicBiomeSlug}
      />
    </div>
    </GLMascotCatalogProvider>
  );
}
