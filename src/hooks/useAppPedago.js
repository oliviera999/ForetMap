import { useCallback, useEffect, useMemo, useState } from 'react';
import { subscribeFresqueBoard } from '../services/fresqueRealtime.js';
import { readGlossaryTermMessage } from '../components/pedago/GlossaryPopover.jsx';
import { usePlantCatalogPreview } from './usePlantCatalogPreview';
import { usePedagoSession } from './usePedagoSession.js';

/**
 * Navigation pédagogique du shell `App` — extrait tel quel d'`App.jsx` (lot 6) : aperçu de
 * fiche plante, fiche rapide du glossaire (popover hors onglets), entrées ciblées des vues
 * pédagogiques (glossaire, quiz, clés, réseau trophique, fresque, itinéraire de carte),
 * séance pédagogique en cours (`usePedagoSession`) et props mémoïsées des vues Séances et
 * Fresque.
 *
 * Ordre des effets conservé : `usePlantCatalogPreview` → `usePedagoSession` → écoute des
 * messages « terme de glossaire » venus de l'iframe d'un tutoriel.
 *
 * @param {object} params
 * @param {object[]} params.plants Catalogue des plantes (aperçu de fiche).
 * @param {object[]} params.visibleMaps Cartes visibles du compte.
 * @param {(tab: string) => void} params.navigateTab Navigation utilisateur entre onglets.
 * @param {(mapId: string) => void} params.chooseMap Changement de plan demandé.
 * @param {object} params.access Droits dérivés (`useAppAccess`).
 * @param {boolean} params.pedagoAuthenticated Session ouverte (élève ou compte enseignant).
 * @param {(msg: string) => void} params.setToast Toast du shell.
 */
export function useAppPedago({
  plants,
  visibleMaps,
  navigateTab,
  chooseMap,
  access,
  pedagoAuthenticated,
  setToast,
}) {
  const {
    effectiveIsTeacher,
    hasPermission,
    canManageFoodWeb,
    idKeysAvailable,
    individualsAvailable,
    pedagoSessionsAvailable,
    fresqueAvailable,
    rewardsModuleEnabled,
  } = access;

  const { plantCatalogPreview, setPlantCatalogPreview, openPlantCatalogPreviewById } =
    usePlantCatalogPreview(plants);
  const [pedagoGlossaryCode, setPedagoGlossaryCode] = useState(null);
  const [pedagoQuizQuestionCode, setPedagoQuizQuestionCode] = useState(null);
  const [pedagoQuizNotionId, setPedagoQuizNotionId] = useState(null);
  const [pedagoQuizNotionNiveau, setPedagoQuizNotionNiveau] = useState(null);
  const [pedagoIdKeysInitialKey, setPedagoIdKeysInitialKey] = useState(null);
  const [foodWebHighlightPlantId, setFoodWebHighlightPlantId] = useState(null);
  const [pedagoEntry, setPedagoEntry] = useState(null);
  const [pedagoMapRouteRequest, setPedagoMapRouteRequest] = useState(null);
  // Code du terme affiché dans le popover de glossaire (fiche rapide, rendue hors des
  // onglets pour survivre à tout changement de vue — audit A1).
  const [glossaryPopoverCode, setGlossaryPopoverCode] = useState(null);

  /**
   * Geste par défaut sur un terme de glossaire (tutoriel, fiche plante, quiz, réseau
   * trophique) : ouvrir la fiche rapide **par-dessus** l'écran courant. L'élève ne perd
   * ni sa page de tutoriel, ni sa position de lecture.
   */
  const openGlossaryPopover = useCallback((code) => {
    const c = String(code || '').trim();
    if (!c) return;
    setGlossaryPopoverCode(c);
  }, []);

  const closeGlossaryPopover = useCallback(() => setGlossaryPopoverCode(null), []);

  /**
   * Chemin « fiche complète » : bascule sur l'onglet Glossaire et y sélectionne le terme.
   * Ce n'est plus le geste par défaut — seul le bouton dédié du popover y mène.
   */
  const openPedagoGlossaryTerm = useCallback(
    (code) => {
      const c = String(code || '').trim();
      setPedagoGlossaryCode(c || null);
      navigateTab('glossary');
      setPlantCatalogPreview(null);
    },
    [setPlantCatalogPreview, navigateTab],
  );

  const openPedagoQuizQuestion = useCallback(
    (code) => {
      const c = String(code || '')
        .trim()
        .toUpperCase();
      setPedagoQuizQuestionCode(c || null);
      navigateTab('quiz');
      setPlantCatalogPreview(null);
    },
    [setPlantCatalogPreview, navigateTab],
  );

  const openPedagoFoodWeb = useCallback(
    (plantId = null, mapId = null) => {
      const id = plantId != null ? Number(plantId) : null;
      const map = mapId != null ? String(mapId).trim() : '';
      if (map) chooseMap(map);
      setFoodWebHighlightPlantId(Number.isFinite(id) && id > 0 ? id : null);
      navigateTab('foodweb');
      setPlantCatalogPreview(null);
    },
    [setPlantCatalogPreview, navigateTab, chooseMap],
  );

  // Séance pédagogique en cours (état, exécution, étapes, fin, lien `?seance=`) : hook
  // dédié, partagé avec l'arbre par `PedagoSessionProvider`. Le shell ne fournit que les
  // cibles de navigation des étapes.
  const pedagoSession = usePedagoSession({
    available: pedagoSessionsAvailable,
    authenticated: pedagoAuthenticated,
    onToast: setToast,
    navigation: {
      navigateTab,
      setPlantCatalogPreview,
      openPlantCatalogPreviewById,
      openPedagoFoodWeb,
      chooseMap,
      idKeysAvailable,
      individualsAvailable,
      fresqueAvailable,
      setPedagoIdKeysInitialKey,
      setPedagoQuizQuestionCode,
      setPedagoQuizNotionId,
      setPedagoQuizNotionNiveau,
      setPedagoGlossaryCode,
      setPedagoEntry,
      setPedagoMapRouteRequest,
    },
  });
  const {
    activeSession: activePedagoSession,
    currentStep: pedagoSessionCurrentStep,
    runsVersion: pedagoRunsVersion,
    startSession: startPedagoSession,
  } = pedagoSession;

  const sessionsProps = useMemo(
    () => ({
      canManage: canManageFoodWeb,
      maps: visibleMaps,
      plants,
      activeSession: activePedagoSession,
      currentStep: pedagoSessionCurrentStep,
      onStartSession: startPedagoSession,
      isAuthenticated: pedagoAuthenticated,
      runsVersion: pedagoRunsVersion,
      rewardsEnabled: rewardsModuleEnabled,
    }),
    [
      canManageFoodWeb,
      visibleMaps,
      plants,
      activePedagoSession,
      pedagoSessionCurrentStep,
      startPedagoSession,
      pedagoAuthenticated,
      pedagoRunsVersion,
      rewardsModuleEnabled,
    ],
  );

  // Fresque du Climat (onglet « Fresque ») : suivi pour qui lit les stats de groupe ; l'action
  // de séance `open_fresque` dépose le jeu demandé dans `pedagoEntry.fresque`.
  const fresqueProps = useMemo(
    () => ({
      isTeacher: effectiveIsTeacher,
      canFollow: hasPermission('stats.read.group') || hasPermission('stats.read.all'),
      initialDeckId: pedagoEntry?.fresque?.deckId || null,
      entryNonce: pedagoEntry?.fresque?.nonce || null,
      subscribeBoard: subscribeFresqueBoard,
    }),
    [effectiveIsTeacher, hasPermission, pedagoEntry?.fresque?.deckId, pedagoEntry?.fresque?.nonce],
  );

  // Clic sur un terme auto-lié dans l'iframe d'un tutoriel : le message n'est accepté que
  // s'il vient de notre origine (audit A10 — un tutoriel `type = 'link'` affiche un site
  // tiers dans une iframe de la même page et pourrait sinon piloter la navigation).
  useEffect(() => {
    const onGlossaryMessage = (event) => {
      const code = readGlossaryTermMessage(event, window.location.origin);
      if (code) openGlossaryPopover(code);
    };
    window.addEventListener('message', onGlossaryMessage);
    return () => window.removeEventListener('message', onGlossaryMessage);
  }, [openGlossaryPopover]);

  const consumePedagoMapRouteRequest = useCallback(() => setPedagoMapRouteRequest(null), []);

  return {
    plantCatalogPreview,
    setPlantCatalogPreview,
    openPlantCatalogPreviewById,
    glossaryPopoverCode,
    openGlossaryPopover,
    closeGlossaryPopover,
    openPedagoGlossaryTerm,
    openPedagoQuizQuestion,
    openPedagoFoodWeb,
    pedagoGlossaryCode,
    setPedagoGlossaryCode,
    pedagoQuizQuestionCode,
    pedagoQuizNotionId,
    pedagoQuizNotionNiveau,
    pedagoIdKeysInitialKey,
    foodWebHighlightPlantId,
    pedagoEntry,
    pedagoMapRouteRequest,
    consumePedagoMapRouteRequest,
    pedagoSession,
    sessionsProps,
    fresqueProps,
  };
}
