import React, { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { io } from 'socket.io-client';
import { withAppBase } from '../services/api.js';
import { useGLSession } from './hooks/useGLSession.js';
import { apiGL } from './services/apiGL.js';
import { GL_TAB_STORAGE_KEY } from './constants/app-runtime.js';
import { GL_MODULE_DEFAULTS, normalizeGlModules, isModuleEnabled } from './constants/modules.js';
import {
  readStoredGlTab,
  isGlAdminRole,
  defaultTabForGlAuth,
  toGameViewModel,
  parseGlOauthHash,
  filterGlTabs,
} from './utils/glAppShellHelpers.js';
import {
  GL_DEFAULT_GAMEPLAY,
  computeCanRequestAction,
  computeCanSpellCast,
  computePlayerVitality,
  findPlayerMascotId,
} from './utils/glGameplayRules.js';
import { resolvePlateauMapVisibility } from './utils/glPlateauMapVisibility.js';
import { markerBackgroundStyleFromSettings } from './utils/glMarkerBackgrounds.js';
import { GLAuthView } from './components/GLAuthView.jsx';
import { GLTopBar, GL_TAB_ID_PREFIX, GL_TABPANEL_ID_PREFIX } from './components/GLTopBar.jsx';
import { useGlCompactNav } from './hooks/useGlCompactNav.js';
import { useGLOverlays } from './hooks/useGLOverlays.js';
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
// Vues d'onglet chargees a la demande (lazy) : restent hors du chunk gl initial.
// Vues staff/admin (rarement chargees par un joueur) + onglets secondaires souvent module-gated.
const GLHistoryView = lazy(() =>
  import('./components/GLHistoryView.jsx').then((m) => ({ default: m.GLHistoryView })),
);
const GLUsersAdminView = lazy(() =>
  import('./components/GLUsersAdminView.jsx').then((m) => ({ default: m.GLUsersAdminView })),
);
const GLContentsAdminView = lazy(() =>
  import('./components/GLContentsAdminView.jsx').then((m) => ({ default: m.GLContentsAdminView })),
);
const GLSettingsView = lazy(() =>
  import('./components/GLSettingsView.jsx').then((m) => ({ default: m.GLSettingsView })),
);
const GLMascotsAdminView = lazy(() =>
  import('./components/GLMascotsAdminView.jsx').then((m) => ({ default: m.GLMascotsAdminView })),
);
const GLGameMasterConsole = lazy(() =>
  import('./components/GLGameMasterConsole.jsx').then((m) => ({ default: m.GLGameMasterConsole })),
);
import { useGLMascotStateMachine } from './hooks/useGLMascotStateMachine.js';
import { useGLNotificationCenter } from './hooks/useGLNotificationCenter.js';
const GLForumView = lazy(() =>
  import('./components/GLForumView.jsx').then((m) => ({ default: m.GLForumView })),
);
const GLMarketView = lazy(() =>
  import('./components/GLMarketView.jsx').then((m) => ({ default: m.GLMarketView })),
);
const GLTutorialsView = lazy(() =>
  import('./components/GLTutorialsView.jsx').then((m) => ({ default: m.GLTutorialsView })),
);
const GLJournalView = lazy(() =>
  import('./components/GLJournalView.jsx').then((m) => ({ default: m.GLJournalView })),
);
const GLPlayerJournalView = lazy(() =>
  import('./components/GLPlayerJournalView.jsx').then((m) => ({ default: m.GLPlayerJournalView })),
);
import { GLNotificationsCenter } from './components/GLNotificationsCenter.jsx';
import { GLButton } from './components/ui/GLButton.jsx';
import { GLAppBanners } from './components/GLAppBanners.jsx';
import { GLGuestDemoBoard } from './components/GLGuestDemoBoard.jsx';
import { GLTabHelpPanel } from './components/GLTabHelpPanel.jsx';
import { GLProfileModal } from './components/GLProfileModal.jsx';
import { GLStatsView } from './components/GLStatsView.jsx';
import { GLPasswordResetGate } from './components/GLPasswordResetGate.jsx';
import { useGLBrandTheme } from './hooks/useGLBrandTheme.js';
import { GLMascotCatalogProvider } from './context/GLMascotCatalogContext.jsx';
import { GlMapOverlaySettingsProvider } from './context/GlMapOverlaySettingsContext.jsx';
import { MusicPlayer } from './components/MusicPlayer.jsx';
import { loadGlAssetRuntime } from './assets/index.js';
import { pickZoneAtPct } from '../utils/glZoneAtPct.js';
import { getRuntimeFeuilletZonesForPlateau } from './data/glFeuilletZonesBundle.js';
import { isFeuilletZoneEditMode } from './utils/glFeuilletZoneEditMode.js';
import { useGLZoneMusic, readStoredMuted, writeStoredMuted } from './hooks/useGLZoneMusic.js';
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
import { isGlGuest } from './utils/glGuestMode.js';

export function AppGL() {
  const { session, auth, token, updateSession, logout } = useGLSession();
  const isGuest = isGlGuest(auth);
  const compactNav = useGlCompactNav();
  const learningProgress = useGlLearningProgress(isGuest ? null : token);
  const [tab, setTab] = useState(() => readStoredGlTab());
  const [chapters, setChapters] = useState([]);
  const [classes, setClasses] = useState([]);
  const [activeGameId, setActiveGameId] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [gameplaySettings, setGameplaySettings] = useState(GL_DEFAULT_GAMEPLAY);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [narrationToast, setNarrationToast] = useState(null); // { text, ts }
  const [turnToast, setTurnToast] = useState(null); // { teamId, ts }
  const [error, setError] = useState('');
  const [oauthNotice, setOauthNotice] = useState(null);
  const [modules, setModules] = useState(GL_MODULE_DEFAULTS);
  const [glProfile, setGlProfile] = useState(null);
  const [glConfig, setGlConfig] = useState({});
  const [guestChapter, setGuestChapter] = useState(null);
  const { showProfile, setShowProfile, showPlayerStats, setShowPlayerStats } = useGLOverlays();
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

  const { brand: glBrand, style: glBrandStyle } = useGLBrandTheme(
    glConfig?.brand,
    themeChapter?.theme,
  );

  const glAppStyle = useMemo(
    () => ({
      ...glBrandStyle,
      ...markerBackgroundStyleFromSettings(gameplaySettings),
    }),
    [glBrandStyle, gameplaySettings],
  );

  const chapterBiomeSlugs = useMemo(() => {
    const biomes = gameState?.game?.chapter_biomes;
    if (!Array.isArray(biomes)) return [];
    return biomes.map((b) => b.slug).filter(Boolean);
  }, [gameState?.game?.chapter_biomes]);

  const glossaryLinkItems = useGlGlossaryLinkIndex(token, chapterBiomeSlugs);
  const loreGlossaryLinkItems = useGlLoreGlossaryLinkIndex(isGuest ? null : token);

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
    const trimmed = String(code || '')
      .trim()
      .toUpperCase();
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

  const isAdmin = isGlAdminRole(auth);
  const appVersion = useAppVersion();
  const isImpersonating = !!auth?.impersonating;
  const isStaff = isGlStaffAuth(auth);
  const isStaffPlayerPreview = isStaff && glViewMode === 'player';
  const showStaffAdminUi = isAdmin && !isStaffPlayerPreview;
  const isMjMapControls = showStaffAdminUi;
  const showsPlayerChrome = !isAdmin || isStaffPlayerPreview;
  const impersonationBanner = useMemo(
    () => (isImpersonating ? glImpersonationBannerCopy(auth?.impersonatedBy) : null),
    [isImpersonating, auth?.impersonatedBy],
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

  const plateauMapVisibility = useMemo(
    () =>
      resolvePlateauMapVisibility({
        gameplaySettings,
        chapter: gameState?.game,
      }),
    [gameplaySettings, gameState?.game],
  );

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
    const oauthResult = parseGlOauthHash(hashRaw);
    if (!oauthResult) return;

    const cleanUrl = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState({}, document.title, cleanUrl);

    if (oauthResult.kind === 'error') {
      setOauthNotice({ error: oauthResult.code });
      return;
    }
    if (oauthResult.kind === 'session') {
      updateSession({ token: oauthResult.token, auth: oauthResult.auth });
      setTab(defaultTabForGlAuth(oauthResult.auth));
      setOauthNotice({ success: true });
      setError('');
      return;
    }
    setOauthNotice({ error: 'oauth_invalid_payload' });
  }, [updateSession]);
  const tabs = useMemo(
    () =>
      filterGlTabs({
        modules,
        vitalityEnabled: gameplaySettings.vitalityEnabled,
        showStaffAdminUi,
        isGuest,
      }),
    [showStaffAdminUi, modules, gameplaySettings.vitalityEnabled, isGuest],
  );

  useEffect(() => {
    try {
      localStorage.setItem(GL_TAB_STORAGE_KEY, tab);
    } catch (_) {
      // noop
    }
  }, [tab]);

  useEffect(() => {
    if (!tabs.some((current) => current.id === tab)) {
      setTab(defaultTabForGlAuth(auth));
    }
  }, [tabs, tab, auth]);

  const reloadGameplaySettings = useCallback(async () => {
    if (!token || isGuest) return;
    try {
      const data = await apiGL('/api/gl/gameplay-settings');
      const next = data?.settings || {};
      setGameplaySettings({ ...GL_DEFAULT_GAMEPLAY, ...next });
    } catch (_) {
      // toggles silencieusement défaut
    }
  }, [token, isGuest]);

  const reloadProfile = useCallback(async () => {
    if (!token || isGuest) return;
    try {
      const data = await apiGL('/api/gl/auth/me');
      setGlProfile(data?.profile || null);
      if (data?.auth) {
        updateSession({ auth: data.auth });
        const nextGameId =
          data.auth.gameId != null
            ? Number(data.auth.gameId)
            : data.profile?.activeGameId != null
              ? Number(data.profile.activeGameId)
              : null;
        if (!isAdmin && nextGameId != null && Number.isFinite(nextGameId) && nextGameId > 0) {
          setActiveGameId(nextGameId);
        }
      }
      setError('');
    } catch (err) {
      setError(err.message || 'Chargement profil impossible');
    }
  }, [token, isAdmin, updateSession, isGuest]);

  const applyGlImpersonation = useCallback(
    (payload) => {
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
    },
    [updateSession],
  );

  const stopGlImpersonation = useCallback(async () => {
    try {
      const payload = await apiGL('/api/gl/auth/admin/impersonate/stop', 'POST');
      if (!payload?.authToken || !payload?.auth) {
        setError('Réponse serveur invalide');
        return;
      }
      setGlViewMode('native');
      updateSession({ token: payload.authToken, auth: payload.auth });
      setTab(defaultTabForGlAuth(payload.auth));
      setError('');
    } catch (err) {
      setError(err.message || 'Impossible de quitter la prise de contrôle');
    }
  }, [updateSession]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    if (isGuest) {
      Promise.all([
        apiGL('/api/gl/chapters').catch(() => []),
        apiGL('/api/gl/auth/config').catch(() => ({})),
      ]).then(async ([chaptersData, configData]) => {
        if (cancelled) return;
        setChapters(Array.isArray(chaptersData) ? chaptersData : []);
        setModules(normalizeGlModules(configData?.modules));
        setGlConfig(configData || {});
        const first = Array.isArray(chaptersData) ? chaptersData[0] : null;
        if (first?.slug) {
          try {
            const detail = await apiGL(`/api/gl/chapters/${encodeURIComponent(first.slug)}`);
            if (!cancelled) setGuestChapter(detail?.chapter || null);
          } catch {
            if (!cancelled) setGuestChapter(null);
          }
        } else if (!cancelled) {
          setGuestChapter(null);
        }
      });
      return () => {
        cancelled = true;
      };
    }
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
        const nextGameId =
          profileData.auth.gameId != null
            ? Number(profileData.auth.gameId)
            : profileData.profile?.activeGameId != null
              ? Number(profileData.profile.activeGameId)
              : null;
        if (!isAdmin && nextGameId != null && Number.isFinite(nextGameId) && nextGameId > 0) {
          setActiveGameId(nextGameId);
        }
      }
    });
    reloadGameplaySettings();
    return () => {
      cancelled = true;
    };
  }, [token, reloadGameplaySettings, isAdmin, updateSession, isGuest]);

  useEffect(() => {
    const nextTitle = String(glConfig?.title || '').trim();
    if (!nextTitle) return;
    document.title = nextTitle;
  }, [glConfig?.title]);

  useEffect(() => {
    if (isGuest) return;
    if (isAdmin) return;
    if (activeGameId) return;
    const hintedGameId = auth?.gameId != null ? Number(auth.gameId) : null;
    if (hintedGameId != null && Number.isFinite(hintedGameId) && hintedGameId > 0) {
      setActiveGameId(hintedGameId);
    }
  }, [isAdmin, activeGameId, auth?.gameId, isGuest]);

  const reloadGame = useCallback(async () => {
    if (isGuest || !activeGameId) return;
    try {
      const data = await apiGL(`/api/gl/games/${activeGameId}`);
      setGameState(toGameViewModel(data));
      setError('');
    } catch (err) {
      setError(err.message || 'Chargement partie impossible');
    }
  }, [activeGameId, isGuest]);

  const showSpellCastResult = useCallback((source) => {
    const vm = buildSpellCastResultViewModel(source);
    if (!vm.eventId || vm.eventId === lastShownSpellCastEventIdRef.current) return;
    lastShownSpellCastEventIdRef.current = vm.eventId;
    setSpellCastResult(vm);
  }, []);

  useEffect(() => {
    if (isGuest) return;
    reloadGame();
  }, [reloadGame, isGuest]);

  useEffect(() => {
    if (isGuest || !token || !activeGameId) return undefined;
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
  }, [token, activeGameId, reloadGame, showSpellCastResult, isGuest]);

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
        payload: {
          markerId: marker.id,
          markerLabel: marker.label,
          xp: marker.x_pct,
          yp: marker.y_pct,
        },
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
        const nextGameId =
          me.auth.gameId != null ? Number(me.auth.gameId) : Number(gameState.game.id);
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

  const canRequestAction = useMemo(
    () =>
      !isGuest &&
      computeCanRequestAction({ showStaffAdminUi, gameplaySettings, auth, currentTeamId }),
    [isGuest, showStaffAdminUi, gameplaySettings, auth, currentTeamId],
  );

  const markerArrivalEnabled = useMemo(() => {
    if (showStaffAdminUi) return true;
    return !gameplaySettings.qcmMjOnly;
  }, [showStaffAdminUi, gameplaySettings.qcmMjOnly]);

  const canSpellCast = useMemo(
    () =>
      !isGuest &&
      computeCanSpellCast({
        modules,
        gameplaySettings,
        gameState,
        auth,
        currentTeamId,
        showsPlayerChrome,
        showStaffAdminUi,
      }),
    [
      isGuest,
      modules,
      gameplaySettings,
      gameState,
      auth,
      currentTeamId,
      showsPlayerChrome,
      showStaffAdminUi,
    ],
  );

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

  const playerMascotId = useMemo(
    () => findPlayerMascotId({ showsPlayerChrome, auth, teams: gameState?.teams }),
    [showsPlayerChrome, auth, gameState],
  );

  const playerVitality = useMemo(
    () =>
      computePlayerVitality({
        showsPlayerChrome,
        vitalityEnabled: gameplaySettings.vitalityEnabled,
        auth,
        gameState,
        profile: glProfile,
      }),
    [showsPlayerChrome, gameplaySettings.vitalityEnabled, auth, gameState, glProfile],
  );

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

  const effectiveGameState = useMemo(() => {
    if (!isGuest) return gameState;
    if (!guestChapter) return null;
    return {
      game: {
        biotope_markdown: guestChapter.biotope_markdown,
        biocenose_markdown: guestChapter.biocenose_markdown,
        chapter_biomes: guestChapter.biomes || [],
        chapter_plateau_number: guestChapter.plateau_number ?? 1,
      },
    };
  }, [isGuest, gameState, guestChapter]);

  const quitGuestMode = useCallback(() => {
    logout();
    setGameState(null);
    setActiveGameId(null);
    setGlProfile(null);
    setShowProfile(false);
    setGlViewMode('native');
    setTab('world');
    setError('');
  }, [logout, setShowProfile]);

  if (!session?.token) {
    return (
      <div className="gl-app gl-app--guest" style={glAppStyle}>
        <GLAuthView
          config={glConfig}
          oauthNotice={oauthNotice}
          appVersion={appVersion}
          onLogin={(data) => {
            updateSession({ token: data.authToken, auth: data.auth });
            setTab(defaultTabForGlAuth(data?.auth));
            setError('');
            setOauthNotice(null);
          }}
        />
      </div>
    );
  }

  return (
    <GlMapOverlaySettingsProvider>
    <GLMascotCatalogProvider token={isGuest ? null : token}>
      <div
        className={`gl-app${compactNav ? ' gl-app--has-bottom-nav' : ''}${isGuest ? ' gl-app--discovery' : ''}`}
        style={glAppStyle}
      >
        <GLPasswordResetGate
          open={!isGuest && !isAdmin && auth?.passwordMustReset === true}
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
          onOpenStats={showsPlayerChrome && !isGuest ? () => setShowPlayerStats(true) : undefined}
          canSwitchGlPlayerView={isStaff && !isGuest}
          glViewMode={glViewMode}
          onGlViewModeNative={() => {
            setGlViewMode('native');
            setTab(defaultTabForGlAuth(auth));
          }}
          onGlViewModePlayer={() => {
            setGlViewMode('player');
            setTab('maps');
          }}
          onLogout={isGuest ? quitGuestMode : () => {
            logout();
            setGameState(null);
            setActiveGameId(null);
            setGlProfile(null);
            setShowProfile(false);
            setGlViewMode('native');
          }}
          isGuestMode={isGuest}
          showVersion={showStaffAdminUi}
          appVersion={appVersion}
        />

        <GLAppBanners
          error={error}
          isGuestMode={isGuest}
          onQuitGuest={quitGuestMode}
          onGuestLogin={quitGuestMode}
          isStaffPlayerPreview={isStaffPlayerPreview}
          impersonationBanner={isImpersonating ? impersonationBanner : null}
          impersonatedDisplayName={auth?.displayName}
          onStopImpersonation={stopGlImpersonation}
          narrationText={narrationToast?.text}
          turnTeamLabel={turnToast ? turnToastTeam?.name || `équipe #${turnToast.teamId}` : null}
        />

        <main className="gl-main" id="gl-main-content">
          <div
            className="gl-main-inner fade-in"
            role="tabpanel"
            id={`${GL_TABPANEL_ID_PREFIX}-${tab}`}
            aria-labelledby={`${GL_TAB_ID_PREFIX}-${tab}`}
          >
            <Suspense fallback={<div className="gl-tab-loading" aria-busy="true" />}>
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
              {tab === 'discovery' && isGuest ? (
                <GLGuestDemoBoard onExitGuest={quitGuestMode} brandThemeStyle={glBrandStyle} />
              ) : null}
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
                    showPlateauMarkers={plateauMapVisibility.markersVisible}
                    showPlateauZones={plateauMapVisibility.zonesVisible}
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
                  gameState={effectiveGameState}
                  glossaryLinkItems={glossaryLinkItems}
                  onOpenGlossaryTerm={openGlossaryPopover}
                />
              )}
              {tab === 'biocenose' && (
                <GLBiocenoseView
                  gameState={effectiveGameState}
                  onOpenGlossaryTerm={openGlossaryPopover}
                  learningProgress={isGuest ? null : learningProgress}
                  glossaryLinkItems={glossaryLinkItems}
                  loreCarnetEnabled={false}
                />
              )}
              {tab === 'glossary' && (
                <GLGlossaryView
                  gameState={effectiveGameState}
                  focusCode={glossaryFocusCode}
                  activeTermCode={glossaryPopoverCode}
                  onOpenPopover={openGlossaryPopover}
                  onFocusHandled={clearGlossaryFocus}
                  learningProgress={isGuest ? null : learningProgress}
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
                <GLUsersAdminView auth={auth} onImpersonationApplied={applyGlImpersonation} />
              )}
              {tab === 'contents' && showStaffAdminUi && (
                <GLContentsAdminView
                  auth={auth}
                  onNavigateTab={setTab}
                  glossaryLinkItems={glossaryLinkItems}
                  loreGlossaryLinkItems={loreGlossaryLinkItems}
                  onOpenGlossaryTerm={openGlossaryPopover}
                  onOpenLoreTerm={openLoreGlossaryPopover}
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
              {tab === 'market' &&
                isModuleEnabled(modules, 'marketEnabled') &&
                gameplaySettings.vitalityEnabled &&
                showsPlayerChrome && (
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
              {isModuleEnabled(modules, 'helpEnabled') && tab !== 'my-journal' ? (
                <GLTabHelpPanel tab={tab} defaultOpen={false} />
              ) : null}
              {isModuleEnabled(modules, 'notificationsEnabled') && !isGuest ? (
                <GLNotificationsCenter
                  items={notifications.items}
                  unreadCount={notifications.unreadCount}
                  onMarkAllRead={notifications.markAllRead}
                  onClear={notifications.clear}
                />
              ) : null}
            </Suspense>
          </div>
        </main>
        {showStaffAdminUi ? (
          <footer className="gl-app-footer" aria-label="Version de l’application">
            Version {appVersion != null ? appVersion : '…'}
          </footer>
        ) : null}
        <GLProfileModal
          open={!isGuest && showProfile}
          onClose={() => setShowProfile(false)}
          auth={auth}
          profile={glProfile}
          config={glConfig}
          onReloadProfile={reloadProfile}
          onOpenStats={
            showsPlayerChrome
              ? () => {
                  setShowProfile(false);
                  setShowPlayerStats(true);
                }
              : null
          }
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
    </GlMapOverlaySettingsProvider>
  );
}
