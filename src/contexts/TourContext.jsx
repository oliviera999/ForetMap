import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { useDiscoveryTour } from '../hooks/useDiscoveryTour.js';
import { DiscoveryTour } from '../components/DiscoveryTour.jsx';

/**
 * Contexte du mode visite/découverte.
 *
 * Le `TourProvider` détient l'état du parcours (hook `useDiscoveryTour`), rend
 * l'overlay `DiscoveryTour` et déclenche l'auto-démarrage à la première ouverture
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
  const tour = useDiscoveryTour({ isTeacher });
  const { startTour, hasSeenTour, isActive } = tour;
  const timerRef = useRef(0);

  // Auto-démarrage à la première découverte d'un onglet.
  useEffect(() => {
    clearTimeout(timerRef.current);
    if (!enabled || !tab) return undefined;
    if (isActive) return undefined;
    if (hasSeenTour(tab)) return undefined;
    timerRef.current = setTimeout(() => {
      startTour(tab);
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
      <DiscoveryTour
        active={tour.active}
        isTeacher={isTeacher}
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
