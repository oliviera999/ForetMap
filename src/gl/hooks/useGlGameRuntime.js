import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { withAppBase } from '../../services/api.js';
import { apiGL } from '../services/apiGL.js';
import { registerSkipMarkerArrival } from '../utils/glMarkerArrivalSkip.js';
import { GL_MODULE_DEFAULTS, normalizeGlModules, isModuleEnabled } from '../constants/modules.js';
import { toGameViewModel } from '../utils/glAppShellHelpers.js';
import {
  GL_DEFAULT_GAMEPLAY,
  computeCanRequestAction,
  computeCanSpellCast,
} from '../utils/glGameplayRules.js';
import {
  resolveBoardMovementConfig,
  sortMarkersByPath,
  targetMarkerAfterDice,
} from '../utils/glBoardPath.js';
import { buildSpellCastResultViewModel } from '../utils/glSpellCastRules.js';

/**
 * Runtime de partie GL, extrait d'AppGL (audit §3.5) sans changement de comportement :
 * - état de partie (gameState, partie active, équipe sélectionnée) et données de
 *   référence (chapitres, classes, modules, config, profil, chapitre invité) ;
 * - chargement initial (chapitres/config/profil/classes, variante invité) et
 *   rechargements ciblés (reloadGame, reloadProfile, reloadGameplaySettings, reloadClasses) ;
 * - socket temps réel (import dynamique de socket.io-client, cleanup identique) ;
 * - dés / déplacements / tours et droits gameplay dérivés.
 *
 * Les toasts restent possédés par AppGL (useGlToasts) : leurs setters sont injectés
 * (setters useState, références stables), tout comme setError (bandeau global) et
 * les drapeaux de vue staff (dérivés de glViewMode, orchestré par AppGL).
 *
 * Zéro JSX : le hook retourne exactement ce qu'AppGL consomme pour le rendu.
 */
export function useGlGameRuntime({
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
}) {
  const [chapters, setChapters] = useState([]);
  const [classes, setClasses] = useState([]);
  const [activeGameId, setActiveGameId] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [gameplaySettings, setGameplaySettings] = useState(GL_DEFAULT_GAMEPLAY);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [mapNextTurnBusy, setMapNextTurnBusy] = useState(false);
  const [modules, setModules] = useState(GL_MODULE_DEFAULTS);
  const [glProfile, setGlProfile] = useState(null);
  const [glConfig, setGlConfig] = useState({});
  const [guestChapter, setGuestChapter] = useState(null);
  const [spellCastResult, setSpellCastResult] = useState(null);
  const lastShownSpellCastEventIdRef = useRef(null);

  const boardMovement = useMemo(
    () => resolveBoardMovementConfig(gameState?.game || {}),
    [gameState?.game],
  );
  const canMoveMascotFree = isMjMapControls && !boardMovement.isNumberedPath;
  const virtualDiceEnabled = isModuleEnabled(modules, 'virtualDiceEnabled');
  const canDiceAdvancePath =
    isMjMapControls &&
    boardMovement.isNumberedPath &&
    virtualDiceEnabled &&
    Boolean(gameState?.game?.id);
  const turnsEnabled = !!gameplaySettings.turnsEnabled;
  const currentRoundNumber = Number(gameState?.game?.current_round_number) || 0;

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
  }, [token, isAdmin, updateSession, isGuest, setError]);

  const reloadClasses = useCallback(
    async (preloaded) => {
      if (!isAdmin) return;
      if (Array.isArray(preloaded)) {
        setClasses(preloaded);
        return;
      }
      try {
        const data = await apiGL('/api/gl/admin/classes');
        setClasses(Array.isArray(data) ? data : []);
      } catch (_) {
        // conserve silencieusement la liste précédente
      }
    },
    [isAdmin],
  );

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
  }, [activeGameId, isGuest, setError]);

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
    let cancelled = false;
    let socket = null;
    // Import dynamique : socket.io-client (chunk `socket-io`) n'est nécessaire qu'une fois
    // une partie active — il reste ainsi hors du chargement initial de la page GL.
    (async () => {
      const { io } = await import('socket.io-client');
      if (cancelled) return;
      socket = io(withAppBase(''), {
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
        } else if (type === 'round_start') {
          const roundNumber =
            evt?.payload?.roundNumber != null ? Number(evt.payload.roundNumber) : null;
          if (roundNumber != null) setRoundToast({ roundNumber, ts: Date.now() });
        } else if (type === 'spell_cast') {
          showSpellCastResult({ event: evt });
        } else if (type === 'spell_cast_rejected') {
          const spellName = String(
            evt?.payload?.spellName || evt?.payload?.spellCode || 'sortilège',
          );
          setSpellRejectedToast({ spellName, ts: Date.now() });
        } else if (type === 'move' && evt?.payload?.skipDestinationEffects) {
          const targetMarkerId =
            evt?.payload?.markerId != null ? Number(evt.payload.markerId) : null;
          const moveTeamId = evt?.teamId != null ? Number(evt.teamId) : null;
          if (moveTeamId != null && targetMarkerId != null) {
            registerSkipMarkerArrival(moveTeamId, targetMarkerId);
          }
        }
        reloadGame();
      });
    })();
    return () => {
      cancelled = true;
      if (socket) socket.close();
    };
    // Les setters issus de useGlToasts sont des setters useState : références stables.
  }, [
    token,
    activeGameId,
    reloadGame,
    showSpellCastResult,
    isGuest,
    setNarrationToast,
    setTurnToast,
    setRoundToast,
    setSpellRejectedToast,
  ]);

  function resolveTargetTeamId() {
    const teams = Array.isArray(gameState?.teams) ? gameState.teams : [];
    const fallbackTeamId = teams.length > 0 ? Number(teams[0].id) : null;
    return selectedTeamId != null ? Number(selectedTeamId) : fallbackTeamId;
  }

  const activeDiceTeamId = useMemo(() => {
    if (isMjMapControls) {
      const teams = Array.isArray(gameState?.teams) ? gameState.teams : [];
      const fallbackTeamId = teams.length > 0 ? Number(teams[0].id) : null;
      return selectedTeamId != null ? Number(selectedTeamId) : fallbackTeamId;
    }
    if (auth?.teamId != null) return Number(auth.teamId);
    return null;
  }, [isMjMapControls, selectedTeamId, gameState?.teams, auth?.teamId]);

  const activeDiceTeam = useMemo(() => {
    if (activeDiceTeamId == null) return null;
    return (
      (gameState?.teams || []).find((team) => Number(team.id) === Number(activeDiceTeamId)) || null
    );
  }, [activeDiceTeamId, gameState?.teams]);

  const activeTeamHasRolledDice = activeDiceTeam?.hasRolledDiceThisRound === true;

  const canRollDiceThisRound = useMemo(() => {
    if (!virtualDiceEnabled || !gameState?.game?.id) return false;
    if (!turnsEnabled) return true;
    if (currentRoundNumber <= 0) return false;
    if (activeDiceTeamId == null) return false;
    return !activeTeamHasRolledDice;
  }, [
    virtualDiceEnabled,
    gameState?.game?.id,
    turnsEnabled,
    currentRoundNumber,
    activeDiceTeamId,
    activeTeamHasRolledDice,
  ]);

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

  /** Joueur (mode classique, acteur = joueurs) : déplace sa propre mascotte sur un repère. */
  async function movePlayerMascotToMarker(marker) {
    if (!gameState?.game?.id || !marker?.id || auth?.teamId == null) return;
    try {
      await apiGL(`/api/gl/games/${gameState.game.id}/teams/${Number(auth.teamId)}/move`, 'POST', {
        markerId: marker.id,
      });
      await reloadGame();
    } catch (err) {
      setError(err.message || 'Déplacement impossible');
    }
  }

  /** Joueur (mode classique, acteur = joueurs) : déplacement libre de sa propre mascotte. */
  async function movePlayerMascotToPct(point) {
    if (!gameState?.game?.id || !point || auth?.teamId == null) return;
    try {
      await apiGL(`/api/gl/games/${gameState.game.id}/teams/${Number(auth.teamId)}/move`, 'POST', {
        xp: point.xp,
        yp: point.yp,
      });
      await reloadGame();
    } catch (err) {
      setError(err.message || 'Déplacement impossible');
    }
  }

  /** MJ — mode repères numérotés : avance l'équipe active du score obtenu aux dés. */
  async function handleDiceRollAdvance(roll) {
    if (!canDiceAdvancePath || !gameState?.game?.id) return;
    const teamId = resolveTargetTeamId();
    if (teamId == null) return;
    const teams = Array.isArray(gameState?.teams) ? gameState.teams : [];
    const team = teams.find((item) => Number(item.id) === Number(teamId));
    const sortedMarkers = sortMarkersByPath(gameState?.markers || []);
    const target = targetMarkerAfterDice(
      sortedMarkers,
      team,
      roll?.total,
      boardMovement.startIndex,
    );
    if (!target?.marker) return;
    await moveMascotToMarker(target.marker);
  }

  /** Rafraîchit l'état après un jet joueur (sans avancement automatique). */
  async function refreshAfterDiceRoll() {
    await reloadGame();
  }

  /** Enregistre le jet de dés côté serveur (1× par équipe et par tour). */
  async function recordDiceRoll(roll) {
    if (!turnsEnabled || !gameState?.game?.id) return true;
    const teamId = activeDiceTeamId;
    if (teamId == null) {
      setError('Choisissez une équipe avant de lancer les dés.');
      return false;
    }
    try {
      await apiGL(`/api/gl/games/${gameState.game.id}/teams/${teamId}/dice-roll`, 'POST', {
        values: roll?.values,
        total: roll?.total,
      });
      return true;
    } catch (err) {
      setError(err.message || 'Lancer les dés impossible');
      return false;
    }
  }

  /** MJ : lance un nouveau tour global depuis la carte. */
  async function startNextGameRoundFromMap() {
    if (!showStaffAdminUi || !gameState?.game?.id || !turnsEnabled) return;
    setMapNextTurnBusy(true);
    try {
      const data = await apiGL(`/api/gl/games/${gameState.game.id}/turn/next`, 'POST');
      await reloadGame();
      if (data?.roundNumber != null) {
        setRoundToast({ roundNumber: Number(data.roundNumber), ts: Date.now() });
      }
      setError('');
    } catch (err) {
      setError(err.message || 'Lancement du tour impossible');
    } finally {
      setMapNextTurnBusy(false);
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

  const currentTeamId = useMemo(() => {
    const value = gameState?.game?.current_team_id;
    return value != null ? Number(value) : null;
  }, [gameState]);

  // Mode classique : le joueur déplace lui-même sa mascotte (1×/tour) si le réglage l'autorise.
  const myTeamHasMovedThisRound = useMemo(() => {
    const myId = auth?.teamId != null ? Number(auth.teamId) : null;
    if (myId == null) return false;
    const myTeam = (gameState?.teams || []).find((team) => Number(team.id) === myId);
    return myTeam?.hasMovedThisRound === true;
  }, [auth, gameState]);

  const canPlayerMoveMascot =
    showsPlayerChrome &&
    !isMjMapControls &&
    gameplaySettings.mascotMoveActor === 'players' &&
    auth?.teamId != null &&
    gameState?.game?.status === 'live' &&
    !boardMovement.isNumberedPath &&
    !myTeamHasMovedThisRound;

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

  return {
    // Données de référence & état de partie
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
    // Rechargements
    reloadGame,
    reloadGameplaySettings,
    reloadProfile,
    reloadClasses,
    // Résultat de sort (socket temps réel / assistant de lancement)
    spellCastResult,
    setSpellCastResult,
    showSpellCastResult,
    // Dérivés plateau / tours / dés
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
    // Droits gameplay dérivés
    canPlayerMoveMascot,
    canRequestAction,
    markerArrivalEnabled,
    canSpellCast,
    // Actions gameplay
    moveMascotToPct,
    moveMascotToMarker,
    movePlayerMascotToMarker,
    movePlayerMascotToPct,
    handleDiceRollAdvance,
    refreshAfterDiceRoll,
    recordDiceRoll,
    startNextGameRoundFromMap,
    submitPlayerActionRequest,
    joinSelectedTeam,
  };
}
