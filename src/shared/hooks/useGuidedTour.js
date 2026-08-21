import { useCallback, useMemo, useState } from 'react';

import { safeLocalStorageGetItem, safeLocalStorageSetItem } from '../../utils/browserStorage.js';

/**
 * Moteur de **visite guidée**, partagé ForetMap / G&L.
 *
 * Mémorise les onglets déjà visités (pour ne lancer un parcours qu'à la première
 * découverte) et gère l'état d'exécution. Il ne connaît aucun contenu : le produit
 * fournit `getSteps` et sa propre clé de stockage, de sorte que ForetMap et GL ne
 * partagent jamais leur mémoire de progression.
 *
 * @param {object} options
 * @param {(tabKey: string) => Array} options.getSteps  étapes d'un parcours, déjà
 *   filtrées par rôle et surchargées par l'appelant.
 * @param {string} options.storageKey  clé localStorage propre au produit. Y faire
 *   figurer une version (`_v1`) permet de relancer l'onboarding pour tout le monde
 *   après une refonte des parcours.
 */
export function useGuidedTour({ getSteps, storageKey }) {
  const readSeen = useCallback(() => {
    try {
      const raw = safeLocalStorageGetItem(storageKey, null);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }, [storageKey]);

  const persistSeen = useCallback(
    (next) => {
      try {
        safeLocalStorageSetItem(storageKey, JSON.stringify(next || {}));
      } catch (_) {
        // Quota/accès indisponible : on ignore silencieusement.
      }
    },
    [storageKey],
  );

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

  const markTourSeen = useCallback(
    (tabKey) => {
      if (!tabKey) return;
      setSeen((prev) => {
        if (prev?.[tabKey]) return prev;
        const next = { ...(prev || {}), [tabKey]: true };
        persistSeen(next);
        return next;
      });
    },
    [persistSeen],
  );

  /**
   * Démarre le parcours d'un onglet. Les étapes dont la cible est absente du DOM
   * sont écartées, afin de ne présenter que les éléments réellement affichés — une
   * étape sans cible (`target: null`) est toujours conservée : elle s'affiche au
   * centre, ce dont se servent les séquences d'accueil.
   *
   * L'onglet est marqué « découvert » **dès le démarrage** (et persisté), pas
   * seulement à la fin : c'est bien la première découverte qui déclenche la visite.
   * Quitter la page, recharger ou se reconnecter ne relance donc jamais un parcours
   * déjà présenté.
   * @returns {boolean} true si un parcours a effectivement démarré.
   */
  const startTour = useCallback(
    (tabKey, { force = false } = {}) => {
      if (!tabKey) return false;
      if (!force && seen?.[tabKey]) return false;
      // Marque immédiatement l'onglet comme vu (écriture localStorage hors updater).
      markTourSeen(tabKey);
      const allSteps = getSteps(tabKey) || [];
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
    [seen, getSteps, markTourSeen],
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
  }, [persistSeen]);

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
