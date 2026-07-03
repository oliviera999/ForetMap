import { useCallback, useEffect, useState } from 'react';
import { fetchTutorialReadIds } from '../components/TutorialReadAcknowledge';

/**
 * IDs des tutoriels marqués « lus » par l'utilisateur connecté.
 *
 * Mutualise le motif répété dans `TasksView` et `TutorialsView` : fetch initial,
 * refetch sur `foretmap_session_changed` (changement de session), et cleanup
 * (flag `cancelled` + désabonnement). Le refetch lié à la liste des tutoriels
 * dépend d'une clé stable (ids joints) et non de la référence du tableau,
 * qui changeait à chaque poll global et refetchait pour rien.
 *
 * @param {Array<{id:number|string}>} tutorials liste courante (optionnelle)
 * @returns {{ readIds: Set<number>, markRead: (id:number) => void }}
 */
export function useTutorialReadIds(tutorials = []) {
  const [readIds, setReadIds] = useState(() => new Set());
  const tutorialsKey = Array.isArray(tutorials) ? tutorials.map((t) => t?.id).join(',') : '';

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const ids = await fetchTutorialReadIds();
      if (!cancelled) setReadIds(new Set(ids));
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
  }, [tutorialsKey]);

  /** Marque localement un tutoriel comme lu (après acquittement réussi côté API). */
  const markRead = useCallback((id) => {
    setReadIds((prev) => new Set([...prev, id]));
  }, []);

  return { readIds, markRead };
}
