import { useCallback, useMemo, useState } from 'react';
import { safeLocalStorageGetItem, safeLocalStorageSetItem } from '../utils/browserStorage.js';
import { getDiscoverySteps } from '../constants/discoveryTour.js';

/**
 * Pilote le mode visite/découverte : mémorise les onglets déjà visités (pour ne
 * lancer le parcours qu'à la première découverte) et gère l'état d'exécution
 * (parcours actif, étape courante). Les composants de présentation (`DiscoveryTour`,
 * `HelpPanel`) consomment cette API via le `TourProvider`.
 *
 * La version (`_v1`) du suffixe de clé permet de relancer l'onboarding pour tous
 * après une refonte majeure des parcours.
 */
const SEEN_STORAGE_KEY = 'foretmap_discovery_seen_v1';

function readSeen() {
  try {
    const raw = safeLocalStorageGetItem(SEEN_STORAGE_KEY, null);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function persistSeen(next) {
  try {
    safeLocalStorageSetItem(SEEN_STORAGE_KEY, JSON.stringify(next || {}));
  } catch (_) {
    // Quota/accès indisponible : on ignore silencieusement.
  }
}

export function useDiscoveryTour({ isTeacher = false } = {}) {
  const [seen, setSeen] = useState(() => readSeen());
  // active = null | { tab, steps, index }
  const [active, setActive] = useState(null);

  const hasSeenTour = useCallback(
    (tabKey) => {
      if (!tabKey) return true;
      return !!seen?.[tabKey];
    },
    [seen],
  );

  const markTourSeen = useCallback((tabKey) => {
    if (!tabKey) return;
    setSeen((prev) => {
      if (prev?.[tabKey]) return prev;
      const next = { ...(prev || {}), [tabKey]: true };
      persistSeen(next);
      return next;
    });
  }, []);

  /**
   * Démarre le parcours d'un onglet. Les étapes dont la cible est absente du DOM
   * sont écartées, afin de ne présenter que les éléments réellement affichés.
   *
   * L'onglet est marqué « découvert » **dès le démarrage** (et persisté), pas
   * seulement à la fin : c'est bien la première découverte qui doit déclencher la
   * visite. Ainsi, quitter la page, recharger ou se reconnecter ne relance jamais
   * le parcours d'un onglet déjà présenté.
   * @returns {boolean} true si un parcours a effectivement démarré.
   */
  const startTour = useCallback(
    (tabKey, { force = false } = {}) => {
      if (!tabKey) return false;
      if (!force && seen?.[tabKey]) return false;
      // Marque immédiatement l'onglet comme vu (écriture localStorage hors updater).
      markTourSeen(tabKey);
      const allSteps = getDiscoverySteps(tabKey, isTeacher);
      const usable = allSteps.filter((step) => {
        if (!step.target) return true;
        try {
          return !!document.querySelector(step.target);
        } catch (_) {
          return false;
        }
      });
      if (usable.length === 0) return false;
      setActive({ tab: tabKey, steps: usable, index: 0 });
      return true;
    },
    [seen, isTeacher, markTourSeen],
  );

  // L'onglet est déjà marqué vu au démarrage : arrêter/terminer ne fait que fermer.
  const stopTour = useCallback(() => {
    setActive(null);
  }, []);

  const nextStep = useCallback(() => {
    setActive((prev) => {
      if (!prev) return prev;
      const nextIndex = prev.index + 1;
      if (nextIndex >= prev.steps.length) return null;
      return { ...prev, index: nextIndex };
    });
  }, []);

  const prevStep = useCallback(() => {
    setActive((prev) => {
      if (!prev) return prev;
      return { ...prev, index: Math.max(0, prev.index - 1) };
    });
  }, []);

  const goToStep = useCallback((index) => {
    setActive((prev) => {
      if (!prev) return prev;
      const clamped = Math.max(0, Math.min(prev.steps.length - 1, Number(index) || 0));
      return { ...prev, index: clamped };
    });
  }, []);

  const resetSeen = useCallback(() => {
    setSeen({});
    persistSeen({});
  }, []);

  return useMemo(
    () => ({
      active,
      isActive: !!active,
      hasSeenTour,
      markTourSeen,
      startTour,
      stopTour,
      nextStep,
      prevStep,
      goToStep,
      resetSeen,
    }),
    [
      active,
      hasSeenTour,
      markTourSeen,
      startTour,
      stopTour,
      nextStep,
      prevStep,
      goToStep,
      resetSeen,
    ],
  );
}
