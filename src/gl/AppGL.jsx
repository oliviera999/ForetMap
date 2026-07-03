import React, { useCallback, useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { apiGL } from './services/apiGL.js';
import { useGLSession } from './hooks/useGLSession.js';
import { useGlSessionState } from './hooks/useGlSessionState.js';
import { useGlGameRuntime } from './hooks/useGlGameRuntime.js';
import { GL_TAB_STORAGE_KEY } from './constants/app-runtime.js';
import { isModuleEnabled } from './constants/modules.js';
import {
  readStoredGlTab,
  isGlAdminRole,
  defaultTabForGlAuth,
  toGameViewModel,
  parseGlOauthHash,
  filterGlTabs,
  resolveGlNavActiveTab,
  resolveGlMainTabChange,
  resolveGlNatureSubTab,
  resolveGlAdventureSubTab,
  resolveGlMondeSubTab,
  resolveGlJoueursSubTab,
  isGlTabVisibleInNav,
} from './utils/glAppShellHelpers.js';
import { computePlayerVitality, findPlayerMascotId } from './utils/glGameplayRules.js';
import { resolvePlateauMapVisibility } from './utils/glPlateauMapVisibility.js';
import { markerBackgroundStyleFromSettings } from './utils/glMarkerBackgrounds.js';
import { GLAuthView } from './components/GLAuthView.jsx';
import { GLTopBar, GL_TAB_ID_PREFIX, GL_TABPANEL_ID_PREFIX } from './components/GLTopBar.jsx';
import { useGlCompactNav } from './hooks/useGlCompactNav.js';
import { useGLOverlays } from './hooks/useGLOverlays.js';
import { GLMapView } from './components/GLMapView.jsx';
import { GLNatureView } from './components/GLNatureView.jsx';
import { GLAdventureView } from './components/GLAdventureView.jsx';
import { GLMondeView } from './components/GLMondeView.jsx';
import { GLJoueursView } from './components/GLJoueursView.jsx';
import { GLGlossaryPopover } from './components/GLGlossaryPopover.jsx';
import { GLLoreGlossaryPopover } from './components/GLLoreGlossaryPopover.jsx';
import { DialogShell } from '../components/DialogShell.jsx';
import { GLSpellPopover } from './components/GLSpellPopover.jsx';
import { GLSpellCastWizard } from './components/GLSpellCastWizard.jsx';
import { GLSpellCastResultPopover } from './components/GLSpellCastResultPopover.jsx';
import { useGLSpellCast } from './hooks/useGLSpellCast.js';
import { useGlToasts } from './hooks/useGlToasts.js';
// Vues d'onglet chargees a la demande (lazy) : restent hors du chunk gl initial.
// Vues staff/admin (rarement chargees par un joueur) + onglets secondaires souvent module-gated.
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
import { GLZoneMusicMuteButton } from './components/GLZoneMusicMuteButton.jsx';
import { loadGlAssetRuntime } from './assets/index.js';
import { getRuntimeFeuilletZonesForPlateau } from './data/glFeuilletZonesBundle.js';
import { pickZoneAtPct } from './utils/glZoneAtPct.js';
import { isFeuilletZoneEditMode } from './utils/glFeuilletZoneEditMode.js';
import { useGLZoneMusic, readStoredMuted, writeStoredMuted } from './hooks/useGLZoneMusic.js';
import { useGLZoneMusicArrival } from './hooks/useGLZoneMusicArrival.js';
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
  const {
    narrationToast,
    setNarrationToast,
    turnToast,
    setTurnToast,
    roundToast,
    setRoundToast,
    spellRejectedToast,
    setSpellRejectedToast,
  } = useGlToasts();
  const [error, setError] = useState('');
  const [oauthNotice, setOauthNotice] = useState(null);
  const { showProfile, setShowProfile, showPlayerStats, setShowPlayerStats } = useGLOverlays();
  const [glossaryFocusCode, setGlossaryFocusCode] = useState(null);
  const [glossaryPopoverCode, setGlossaryPopoverCode] = useState(null);
  const [loreGlossaryPopoverCode, setLoreGlossaryPopoverCode] = useState(null);
  const [loreGlossaryFocusCode, setLoreGlossaryFocusCode] = useState(null);
  // Cibles de « deep-link » depuis le carnet (« Voir » d'un élément importé) : on ouvre
  // l'élément précis dans sa vue (pas seulement l'onglet). null = aucune cible en attente.
  const [ecosystemFocusSlug, setEcosystemFocusSlug] = useState(null);
  const [tutorialFocusId, setTutorialFocusId] = useState(null);
  const [feuilletFocusCode, setFeuilletFocusCode] = useState(null);
  const [speciesFocusCode, setSpeciesFocusCode] = useState(null);
  const [spellPopoverCode, setSpellPopoverCode] = useState(null);
  const [spellCastOpen, setSpellCastOpen] = useState(false);
  const [spellCastInitialCode, setSpellCastInitialCode] = useState(null);
  const [kingdomZones, setKingdomZones] = useState([]);
  const [musicActiveZone, setMusicActiveZone] = useState(null);
  const [zoneMusicMuted, setZoneMusicMuted] = useState(() => readStoredMuted());
  const [glViewMode, setGlViewMode] = useState('native'); // native | player
  const prefersReducedMotion = usePrefersReducedMotion();

  const isAdmin = isGlAdminRole(auth);
  const appVersion = useAppVersion();
  const isImpersonating = !!auth?.impersonating;
  const isStaff = isGlStaffAuth(auth);
  const isStaffPlayerPreview = isStaff && glViewMode === 'player';
  const showStaffAdminUi = isAdmin && !isStaffPlayerPreview;
  const isMjMapControls = showStaffAdminUi;
  const showsPlayerChrome = !isAdmin || isStaffPlayerPreview;

  // Runtime de partie (état, chargement chapitres/config/profil, socket temps réel,
  // reloadGame, dés/déplacements/tours) — extrait d'AppGL, audit §3.5.
  const {
    chapters,
    classes,
    modules,
    glConfig,
    glProfile,
    setGlProfile,
    guestChapter,
    activeGameId,
    setActiveGameId,
    gameState,
    setGameState,
    gameplaySettings,
    selectedTeamId,
    setSelectedTeamId,
    mapNextTurnBusy,
    reloadGame,
    reloadGameplaySettings,
    reloadProfile,
    reloadClasses,
    spellCastResult,
    setSpellCastResult,
    showSpellCastResult,
    boardMovement,
    canMoveMascotFree,
    virtualDiceEnabled,
    turnsEnabled,
    currentRoundNumber,
    currentTeamId,
    canDiceAdvancePath,
    activeDiceTeam,
    activeTeamHasRolledDice,
    canRollDiceThisRound,
    canPlayerMoveMascot,
    canRequestAction,
    markerArrivalEnabled,
    canSpellCast,
    moveMascotToPct,
    moveMascotToMarker,
    movePlayerMascotToMarker,
    movePlayerMascotToPct,
    handleDiceRollAdvance,
    recordDiceRoll,
    startNextGameRoundFromMap,
    submitPlayerActionRequest,
    joinSelectedTeam,
  } = useGlGameRuntime({
    token,
    auth,
    isGuest,
    isAdmin,
    updateSession,
    setError,
    isMjMapControls,
    showStaffAdminUi,
    showsPlayerChrome,
    setNarrationToast,
    setTurnToast,
    setRoundToast,
    setSpellRejectedToast,
  });

  const { applyGlImpersonation, stopGlImpersonation } = useGlSessionState({
    updateSession,
    setError,
    setTab,
    setGlViewMode,
    setActiveGameId,
  });

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

  const clearEcosystemFocus = useCallback(() => setEcosystemFocusSlug(null), []);
  const clearTutorialFocus = useCallback(() => setTutorialFocusId(null), []);
  const clearFeuilletFocus = useCallback(() => setFeuilletFocusCode(null), []);
  const clearSpeciesFocus = useCallback(() => setSpeciesFocusCode(null), []);

  // Navigation « profonde » depuis le carnet : reçoit soit un id d'onglet (string, rétro-
  // compatible), soit une cible { tab, focusType, focusRef }. Pose la cible de focus puis
  // change d'onglet ; la vue destinataire ouvre l'élément via son useEffect de focus.
  const handleNavigateFromImport = useCallback((target) => {
    if (!target) return;
    const t = typeof target === 'string' ? { tab: target } : target;
    if (!t.tab) return;
    switch (t.focusType) {
      case 'glossary':
        setGlossaryPopoverCode(null);
        setGlossaryFocusCode(t.focusRef || null);
        break;
      case 'lore_glossary':
        setLoreGlossaryFocusCode(t.focusRef || null);
        break;
      case 'ecosystem':
        setEcosystemFocusSlug(t.focusRef || null);
        break;
      case 'tutorial':
        setTutorialFocusId(t.focusRef || null);
        break;
      case 'feuillet':
        setFeuilletFocusCode(t.focusRef || null);
        break;
      case 'species':
        setSpeciesFocusCode(t.focusRef || null);
        break;
      default:
        break;
    }
    setTab(t.tab);
  }, []);

  const joueursNavOptions = useMemo(
    () => ({
      vitalityEnabled: !!gameplaySettings.vitalityEnabled,
      includeMarket: showsPlayerChrome,
    }),
    [gameplaySettings.vitalityEnabled, showsPlayerChrome],
  );
  const handleTabChange = useCallback(
    (tabId) => {
      setTab(resolveGlMainTabChange(tabId, modules, joueursNavOptions));
    },
    [modules, joueursNavOptions],
  );
  const natureSubTab = resolveGlNatureSubTab(tab);
  const adventureSubTab = resolveGlAdventureSubTab(tab, modules);
  const mondeSubTab = resolveGlMondeSubTab(tab, modules);
  const joueursSubTab = resolveGlJoueursSubTab(tab, modules, joueursNavOptions);
  const impersonationBanner = useMemo(
    () => (isImpersonating ? glImpersonationBannerCopy(auth?.impersonatedBy) : null),
    [isImpersonating, auth?.impersonatedBy],
  );
  const zoneMusicEnabled = isModuleEnabled(modules, 'zoneMusicEnabled');
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

  const zoneMusicRuntimeActive = zoneMusicEnabled && Boolean(gameState?.game);

  const { unlock: unlockZoneMusic, stopAll: stopZoneMusic } = useGLZoneMusic({
    enabled: zoneMusicRuntimeActive,
    userMuted: zoneMusicMuted,
    activeZone: musicActiveZone,
    prefersReducedMotion,
  });

  const handleMusicZoneEnter = useCallback(
    (zone) => {
      if (!zone?.id) return;
      unlockZoneMusic();
      setMusicActiveZone((prev) => (prev?.id === zone.id ? prev : zone));
    },
    [unlockZoneMusic],
  );

  useGLZoneMusicArrival({
    teams: gameState?.teams || [],
    kingdomZones,
    enabled: zoneMusicRuntimeActive,
    onZoneMusicEnter: handleMusicZoneEnter,
  });

  useEffect(() => {
    if (zoneMusicRuntimeActive) return undefined;
    setMusicActiveZone(null);
    stopZoneMusic();
    return undefined;
  }, [zoneMusicRuntimeActive, stopZoneMusic]);

  const musicGameId = gameState?.game?.id ?? null;
  useEffect(() => {
    setMusicActiveZone(null);
    stopZoneMusic();
  }, [musicGameId, stopZoneMusic]);

  const kingdomZonesRuntimeActive = Boolean(gameState?.game?.chapter_id);

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

  const handleZoneMusicUnlock = useCallback(() => {
    unlockZoneMusic();
    setMusicActiveZone((prev) => {
      if (prev) return prev;
      for (const team of gameState?.teams || []) {
        const zone = pickZoneAtPct(
          kingdomZones,
          Number(team?.position_x_pct ?? 50),
          Number(team?.position_y_pct ?? 50),
        );
        if (zone) return zone;
      }
      return null;
    });
  }, [unlockZoneMusic, gameState?.teams, kingdomZones]);

  const handleZoneMusicToggle = useCallback(() => {
    setZoneMusicMuted((prev) => {
      const next = !prev;
      writeStoredMuted(next);
      if (!next) handleZoneMusicUnlock();
      return next;
    });
  }, [handleZoneMusicUnlock]);

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
    if (resolveGlNavActiveTab(tab) === 'adventure') {
      const normalized = resolveGlAdventureSubTab(tab, modules);
      if (tab !== normalized) {
        setTab(normalized);
        return;
      }
    }
    if (resolveGlNavActiveTab(tab) === 'monde-gl') {
      const normalized = resolveGlMondeSubTab(tab, modules);
      if (tab !== normalized) {
        setTab(normalized);
        return;
      }
    }
    if (resolveGlNavActiveTab(tab) === 'joueurs') {
      const normalized = resolveGlJoueursSubTab(tab, modules, joueursNavOptions);
      if (tab !== normalized) {
        setTab(normalized);
        return;
      }
    }
    if (!isGlTabVisibleInNav(tab, tabs, modules, joueursNavOptions)) {
      setTab(defaultTabForGlAuth(auth));
    }
  }, [tabs, tab, auth, modules, joueursNavOptions]);

  useEffect(() => {
    const nextTitle = String(glConfig?.title || '').trim();
    if (!nextTitle) return;
    document.title = nextTitle;
  }, [glConfig?.title]);

  const turnToastTeam = useMemo(() => {
    if (!turnToast?.teamId || !gameState?.teams) return null;
    return gameState.teams.find((team) => Number(team.id) === Number(turnToast.teamId)) || null;
  }, [turnToast, gameState]);

  const spellCast = useGLSpellCast({
    token,
    gameId: gameState?.game?.id,
    enabled: canSpellCast && spellCastOpen,
    onCastComplete: async (data) => {
      // Mode classique : si le sort est en attente de validation MJ, pas d'animation de lancement.
      if (data?.event && !data?.pending) {
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

  // Callbacks stables vers la console MJ (audit §3.2 : des arrows inline
  // cassaient toute mémoïsation aval du composant lazy).
  const onConsoleGameStateChange = useCallback(
    (state) => {
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
    },
    [setGameState, setActiveGameId, setSelectedTeamId, reloadGameplaySettings],
  );
  const onConsoleReloadGame = useCallback(async () => {
    await reloadGame();
    await reloadGameplaySettings();
  }, [reloadGame, reloadGameplaySettings]);

  const quitGuestMode = useCallback(() => {
    logout();
    setGameState(null);
    setActiveGameId(null);
    setGlProfile(null);
    setShowProfile(false);
    setGlViewMode('native');
    setTab('world');
    setError('');
    // Setters issus de useGlGameRuntime : setters useState, références stables.
  }, [logout, setShowProfile, setGameState, setActiveGameId, setGlProfile]);

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
            activeTab={resolveGlNavActiveTab(tab)}
            onTabChange={handleTabChange}
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
            onLogout={
              isGuest
                ? quitGuestMode
                : () => {
                    logout();
                    setGameState(null);
                    setActiveGameId(null);
                    setGlProfile(null);
                    setShowProfile(false);
                    setGlViewMode('native');
                  }
            }
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
            roundLabel={roundToast ? `n°${roundToast.roundNumber}` : null}
            spellRejectedText={spellRejectedToast?.spellName || null}
          />

          <main className="gl-main" id="gl-main-content">
            <div
              className="gl-main-inner fade-in"
              role="tabpanel"
              id={`${GL_TABPANEL_ID_PREFIX}-${resolveGlNavActiveTab(tab)}`}
              aria-labelledby={`${GL_TAB_ID_PREFIX}-${resolveGlNavActiveTab(tab)}`}
            >
              <Suspense fallback={<div className="gl-tab-loading" aria-busy="true" />}>
                {resolveGlNavActiveTab(tab) === 'monde-gl' ? (
                  <GLMondeView
                    activeSubTab={mondeSubTab}
                    onSubTabChange={setTab}
                    modules={modules}
                    auth={auth}
                    brandSlots={glBrand?.slots}
                    glossaryLinkItems={glossaryLinkItems}
                    onNavigateTab={setTab}
                    onOpenGlossaryTerm={openGlossaryPopover}
                    loreGlossaryFocusCode={loreGlossaryFocusCode}
                    loreGlossaryPopoverCode={loreGlossaryPopoverCode}
                    onOpenLoreGlossaryPopover={openLoreGlossaryPopover}
                    onLoreGlossaryFocusHandled={clearLoreGlossaryFocus}
                    tutorialFocusId={tutorialFocusId}
                    onTutorialFocusHandled={clearTutorialFocus}
                    canManageTutorials={showStaffAdminUi}
                    learningProgress={isGuest ? null : learningProgress}
                  />
                ) : null}
                {tab === 'discovery' && isGuest ? (
                  <GLGuestDemoBoard onExitGuest={quitGuestMode} brandThemeStyle={glBrandStyle} />
                ) : null}
                {resolveGlNavActiveTab(tab) === 'adventure' ? (
                  <GLAdventureView
                    activeSubTab={adventureSubTab}
                    onSubTabChange={setTab}
                    modules={modules}
                    gameState={gameState}
                    brandSlots={glBrand?.slots}
                    glossaryLinkItems={glossaryLinkItems}
                    loreGlossaryLinkItems={loreGlossaryLinkItems}
                    onOpenGlossaryTerm={openGlossaryPopover}
                    onOpenLoreTerm={openLoreGlossaryPopover}
                    onOpenSpell={openSpellPopover}
                    canSpellCast={canSpellCast}
                    onLaunchSpell={openSpellCastWizard}
                    feuilletFocusCode={feuilletFocusCode}
                    onFeuilletFocusHandled={clearFeuilletFocus}
                    isMj={showStaffAdminUi}
                  />
                ) : null}
                {tab === 'maps' && (
                  <>
                    <GLMapView
                      gameState={gameState}
                      onMoveMascot={
                        isMjMapControls
                          ? moveMascotToMarker
                          : canPlayerMoveMascot
                            ? movePlayerMascotToMarker
                            : undefined
                      }
                      onMoveMascotToPct={
                        isMjMapControls
                          ? moveMascotToPct
                          : canPlayerMoveMascot
                            ? movePlayerMascotToPct
                            : undefined
                      }
                      onPlayerActionRequest={submitPlayerActionRequest}
                      onSelectTeam={setSelectedTeamId}
                      onOpenGlossaryTerm={openGlossaryPopover}
                      glossaryLinkItems={glossaryLinkItems}
                      onOpenLoreTerm={openLoreGlossaryPopover}
                      loreGlossaryLinkItems={loreGlossaryLinkItems}
                      loreCarnetEnabled={isModuleEnabled(modules, 'loreCarnetEnabled')}
                      onQcmAnswered={reloadGame}
                      canMoveMascot={canMoveMascotFree || canPlayerMoveMascot}
                      boardMovement={boardMovement}
                      onDiceRollResult={canDiceAdvancePath ? handleDiceRollAdvance : null}
                      canRequestAction={canRequestAction}
                      markerArrivalEnabled={markerArrivalEnabled}
                      canSpellCast={canSpellCast}
                      onLaunchSpell={() => openSpellCastWizard(null)}
                      selectedTeamId={
                        canPlayerMoveMascot && selectedTeamId == null
                          ? Number(auth.teamId)
                          : selectedTeamId
                      }
                      currentTeamId={currentTeamId}
                      playerTeamId={auth?.teamId != null ? Number(auth.teamId) : null}
                      mascotStateMachine={mascotStateMachine}
                      kingdomZones={kingdomZones}
                      zoneMusicEnabled={zoneMusicEnabled}
                      zoneMusicMuted={zoneMusicMuted}
                      onZoneMusicToggle={handleZoneMusicToggle}
                      onZoneMusicUnlock={handleZoneMusicUnlock}
                      brandThemeStyle={glBrandStyle}
                      virtualDiceEnabled={virtualDiceEnabled}
                      turnsEnabled={turnsEnabled}
                      roundNumber={currentRoundNumber}
                      canManageTurn={showStaffAdminUi && turnsEnabled}
                      onNextTurn={startNextGameRoundFromMap}
                      nextTurnBusy={mapNextTurnBusy}
                      activeTeamRolled={turnsEnabled && activeTeamHasRolledDice}
                      activeTeamName={activeDiceTeam?.name || null}
                      canRollDice={canRollDiceThisRound}
                      disableDiceReroll={turnsEnabled}
                      onRecordDiceRoll={recordDiceRoll}
                      feuilletZones={feuilletZones}
                      feuilletZoneEditMode={feuilletZoneEditMode}
                      showPlateauMarkers={plateauMapVisibility.markersVisible}
                      showPlateauZones={plateauMapVisibility.zonesVisible}
                      showMarkerPathNumbers={plateauMapVisibility.markerNumbersVisible}
                      roster={gameState?.roster || []}
                      vitalityEnabled={!!gameplaySettings.vitalityEnabled}
                      vitalityByPlayerId={gameState?.vitality?.byPlayerId || null}
                      playerId={
                        auth?.userType === 'gl_player' && auth?.userId != null
                          ? Number(auth.userId)
                          : null
                      }
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
                {resolveGlNavActiveTab(tab) === 'nature' ? (
                  <GLNatureView
                    activeSubTab={natureSubTab}
                    onSubTabChange={setTab}
                    gameState={effectiveGameState}
                    glossaryLinkItems={glossaryLinkItems}
                    onOpenGlossaryTerm={openGlossaryPopover}
                    glossaryFocusCode={glossaryFocusCode}
                    glossaryPopoverCode={glossaryPopoverCode}
                    onGlossaryFocusHandled={clearGlossaryFocus}
                    ecosystemFocusSlug={ecosystemFocusSlug}
                    onEcosystemFocusHandled={clearEcosystemFocus}
                    speciesFocusCode={speciesFocusCode}
                    onSpeciesFocusHandled={clearSpeciesFocus}
                    learningProgress={isGuest ? null : learningProgress}
                    journalImportEnabled={
                      !isGuest && isModuleEnabled(modules, 'playerJournalEnabled')
                    }
                  />
                ) : null}
                {resolveGlNavActiveTab(tab) === 'joueurs' ? (
                  <GLJoueursView
                    activeSubTab={joueursSubTab}
                    onSubTabChange={setTab}
                    modules={modules}
                    vitalityEnabled={!!gameplaySettings.vitalityEnabled}
                    includeMarket={showsPlayerChrome}
                    showStaffAdminUi={showStaffAdminUi}
                    canModerateForum={showStaffAdminUi}
                    auth={auth}
                    classes={classes}
                    token={token}
                    classId={auth?.classId ?? glProfile?.class_id}
                    playerId={auth?.userId}
                    onTradeCompleted={reloadProfile}
                  />
                ) : null}
                {tab === 'users' && showStaffAdminUi && (
                  <GLUsersAdminView
                    auth={auth}
                    onImpersonationApplied={applyGlImpersonation}
                    onClassesChange={reloadClasses}
                  />
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
                    onGameStateChange={onConsoleGameStateChange}
                    onReloadGame={onConsoleReloadGame}
                    canSpellCast={canSpellCast}
                    onLaunchSpell={openSpellCastWizard}
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
                  <GLPlayerJournalView
                    gameState={gameState}
                    onNavigateTab={handleNavigateFromImport}
                  />
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
            glossaryLinkItems={glossaryLinkItems}
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
          {zoneMusicEnabled && zoneMusicRuntimeActive && tab !== 'maps' && musicActiveZone ? (
            <div className="gl-zone-music-global-dock" aria-hidden>
              <GLZoneMusicMuteButton
                visible
                muted={zoneMusicMuted}
                onToggle={handleZoneMusicToggle}
              />
            </div>
          ) : null}
        </div>
      </GLMascotCatalogProvider>
    </GlMapOverlaySettingsProvider>
  );
}
