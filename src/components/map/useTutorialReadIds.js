/**
 * Tutoriels déjà lus par la personne connectée (accusés de lecture) : rechargés quand la
 * liste des tutoriels change ou quand la session change (`foretmap_session_changed`).
 *
 * Extrait de `MapViewImpl` (`src/components/map-views.jsx`, étape B4 de l'audit du
 * 25/09/2026, § 3.3 ligne 5 — patron O6), sans changement de comportement.
 *
 * @returns {[Set<number>, Function]} identifiants lus, et leur setter (accusé local)
 */
import { useEffect, useState } from 'react';
import { fetchTutorialReadIds } from '../TutorialReadAcknowledge';

export function useTutorialReadIds(tutorials) {
  const [tutorialReadIds, setTutorialReadIds] = useState(() => new Set());
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const ids = await fetchTutorialReadIds();
      if (!cancelled) setTutorialReadIds(new Set(ids));
    };
    load();
    if (typeof window !== 'undefined') {
      window.addEventListener('foretmap_session_changed', load);
      return () => {
        cancelled = true;
        window.removeEventListener('foretmap_session_changed', load);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [tutorials]);
  return [tutorialReadIds, setTutorialReadIds];
}
