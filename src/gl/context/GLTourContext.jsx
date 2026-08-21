import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';

import { GuidedTourOverlay } from '../../shared/components/GuidedTourOverlay.jsx';
import { useGuidedTour } from '../../shared/hooks/useGuidedTour.js';
import { createTourRegistryApi } from '../../shared/tour/tourRegistryCore.js';
import {
  GL_DISCOVERY_TOURS,
  GL_RELAUNCH_STEP,
  GL_WELCOME_TOUR_KEY,
} from '../constants/glDiscoveryTour.js';
import { useGlNarrator } from '../hooks/useGlNarrator.js';

/**
 * Visite guidée **Gnomes & Licornes** : même moteur et même overlay que ForetMap
 * (`src/shared/`), registre et mémoire propres au produit.
 *
 * La clé de stockage est distincte de celle de ForetMap : un élève qui a fait le tour
 * de la carte du verger n'a pas pour autant vu le plateau du royaume.
 */
const GL_SEEN_STORAGE_KEY = 'gl_discovery_seen_v1';

/** Délai avant l'auto-démarrage : laisse l'onglet finir de se peindre. */
const AUTO_START_DELAY_MS = 650;

const glTours = createTourRegistryApi(GL_DISCOVERY_TOURS, {
  sharedStepKeys: [GL_RELAUNCH_STEP.key],
});

const GLTourContext = createContext({
  startTour: () => false,
  stopTour: () => {},
  hasSeenTour: () => true,
  hasTour: () => false,
  isActive: false,
});

export function GLTourProvider({ tab, isStaff = false, enabled = false, children }) {
  const getSteps = useCallback((tabKey) => glTours.getSteps(tabKey, isStaff), [isStaff]);
  const tour = useGuidedTour({ getSteps, storageKey: GL_SEEN_STORAGE_KEY });
  const { startTour, hasSeenTour, isActive } = tour;
  const timerRef = useRef(0);

  // Le nom du locuteur ne s'affiche que si le narrateur est allumé et nommé (§9.4).
  const { narrator } = useGlNarrator();
  const speakerName = narrator && narrator.enabled !== false ? narrator.speakerName || '' : '';

  /*
   * Auto-démarrage. Deux cas, dans cet ordre :
   *
   * 1. **Première connexion** — OLU se présente (parcours `welcome`, bulles centrées).
   *    Il passe avant tout parcours d'onglet : se faire présenter la carte par quelqu'un
   *    qu'on n'a pas encore rencontré met la charrue avant les bœufs.
   * 2. **Première découverte d'un onglet** — le parcours de l'onglet affiché.
   *
   * Les deux partagent la même mémoire : l'accueil vu une fois ne revient plus, et
   * l'onglet ouvert dans la foulée garde son propre parcours pour la fois suivante.
   */
  useEffect(() => {
    clearTimeout(timerRef.current);
    if (!enabled || !tab) return undefined;
    if (isActive) return undefined;
    const target = hasSeenTour(GL_WELCOME_TOUR_KEY) ? tab : GL_WELCOME_TOUR_KEY;
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
      hasTour: (tabKey) => glTours.hasTour(tabKey, isStaff),
      resetSeen: tour.resetSeen,
      isActive: tour.isActive,
    }),
    [tour.startTour, tour.stopTour, tour.hasSeenTour, tour.resetSeen, tour.isActive, isStaff],
  );

  return (
    <GLTourContext.Provider value={value}>
      {children}
      <GuidedTourOverlay
        active={tour.active}
        isStaff={isStaff}
        speakerName={speakerName}
        narrator={narrator}
        onNext={tour.nextStep}
        onPrev={tour.prevStep}
        onStop={tour.stopTour}
      />
    </GLTourContext.Provider>
  );
}

/** Accès à l'API de visite guidée GL (relance, état). */
export function useGLTour() {
  return useContext(GLTourContext);
}

export { GL_SEEN_STORAGE_KEY };
