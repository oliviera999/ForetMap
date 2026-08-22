import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { useDiscoveryTour } from '../hooks/useDiscoveryTour.js';
import { WELCOME_TOUR_KEY } from '../constants/discoveryTour.js';
import { GuidedTourOverlay } from '../shared/components/GuidedTourOverlay.jsx';
import { usePublicSettings } from './PublicSettingsContext.jsx';

/**
 * Contexte du mode visite/découverte.
 *
 * Le `TourProvider` détient l'état du parcours (hook `useDiscoveryTour`), rend
 * l'overlay partagé `GuidedTourOverlay` et déclenche l'auto-démarrage à la première ouverture
 * de chaque onglet. Les composants profonds (ex. `HelpPanel`) relancent le parcours
 * de leur page via `useTour().startTour(sectionId, { force: true })`.
 *
 * Valeur de repli (hors Provider) : API no-op pour ne casser ni les tests ni les
 * rendus isolés de `HelpPanel`.
 */
const TourContext = createContext({
  startTour: () => false,
  hasSeenTour: () => true,
  isActive: false,
});

// Laisse le contenu de l'onglet se monter avant de mesurer les cibles.
const AUTO_START_DELAY_MS = 650;

export function TourProvider({ tab, isTeacher = false, enabled = false, children }) {
  const publicSettings = usePublicSettings();
  // Surcharges éditoriales des parcours (`content.tour.registry`). Le corpus par
  // défaut reste dans le bundle : un registre absent ou illisible ne dégrade rien.
  const tourOverrides = publicSettings?.content?.tour?.registry || null;
  const tour = useDiscoveryTour({ isTeacher, tourOverrides });
  const { startTour, hasSeenTour, isActive } = tour;
  const timerRef = useRef(0);

  // Narrateur (OLU) : le nom de locuteur ne s'affiche que si l'interrupteur global
  // est actif et qu'un nom est renseigné (`content.help.narrator`, cf. §9.4).
  const narrator = publicSettings?.content?.help?.narrator || null;
  const speakerName = narrator && narrator.enabled !== false ? narrator.speakerName || '' : '';

  /*
   * Auto-démarrage. Deux cas, dans cet ordre :
   *
   * 1. **Première connexion** — OLU se présente (parcours `welcome`, bulles centrées).
   *    Il passe avant tout parcours d'onglet : se faire présenter la carte par quelqu'un
   *    qu'on n'a pas encore rencontré met la charrue avant les bœufs.
   * 2. **Première découverte d'un onglet** — le parcours de l'onglet affiché.
   *
   * Les deux partagent la mémoire `foretmap_discovery_seen_v1` : l'accueil vu une fois
   * ne revient plus, et l'onglet ouvert dans la foulée garde son parcours pour la fois
   * suivante.
   */
  useEffect(() => {
    clearTimeout(timerRef.current);
    if (!enabled || !tab) return undefined;
    if (isActive) return undefined;
    const target = hasSeenTour(WELCOME_TOUR_KEY) ? tab : WELCOME_TOUR_KEY;
    if (hasSeenTour(target)) return undefined;
    timerRef.current = setTimeout(() => {
      startTour(target);
    }, AUTO_START_DELAY_MS);
    return () => clearTimeout(timerRef.current);
  }, [tab, enabled, isActive, hasSeenTour, startTour]);

  const value = useMemo(
    () => ({
      startTour: tour.startTour,
      stopTour: tour.stopTour,
      hasSeenTour: tour.hasSeenTour,
      resetSeen: tour.resetSeen,
      isActive: tour.isActive,
    }),
    [tour.startTour, tour.stopTour, tour.hasSeenTour, tour.resetSeen, tour.isActive],
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      <GuidedTourOverlay
        active={tour.active}
        isStaff={isTeacher}
        speakerName={speakerName}
        narrator={narrator}
        onNext={tour.nextStep}
        onPrev={tour.prevStep}
        onStop={tour.stopTour}
      />
    </TourContext.Provider>
  );
}

/** Accès à l'API du mode visite (relance, état). */
export function useTour() {
  return useContext(TourContext);
}

export { TourContext };
