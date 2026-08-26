import { useCallback, useEffect, useState } from 'react';
import { api, getAuthToken } from '../services/api';

/** Plafond aligné sur celui du serveur (SUMMARY_MAX_REFS). */
const MAX_REFS = 60;

/**
 * Résumé du contrôle de compréhension pour une liste de ressources.
 *
 * Sert à prévenir l'élève AVANT qu'il ne clique : le bouton « Marquer comme lu »
 * ne laissait rien deviner, et l'épreuve ne se révélait qu'une fois la fenêtre
 * ouverte. Un appel par ressource aurait multiplié les requêtes sur une page de
 * quinze tutoriels ; la route `/api/learning/gating/summary` en prend une liste.
 *
 * Silencieux par construction : sans session, ou si l'appel échoue, la carte
 * s'affiche exactement comme avant. Une annonce est un confort, pas un verrou —
 * le contrôle réel reste fait au moment de la validation, côté serveur.
 *
 * @param {string} resourceType 'tutorial' | 'plant'
 * @param {Array<number|string>} refs identifiants des ressources affichées
 * @returns {{ summaries: Map<string, object>, refresh: () => void }}
 */
export function useGatingSummary(resourceType, refs = []) {
  const [summaries, setSummaries] = useState(() => new Map());
  // Clé stable : la référence du tableau change à chaque rendu de la liste, et
  // rechargerait pour rien (même écueil que `useTutorialReadIds`).
  const refsKey = (Array.isArray(refs) ? refs : [])
    .map((r) => String(r))
    .filter(Boolean)
    .slice(0, MAX_REFS)
    .join(',');

  const load = useCallback(async () => {
    if (!refsKey || !resourceType) {
      setSummaries(new Map());
      return;
    }
    if (typeof getAuthToken === 'function' && !getAuthToken()) {
      setSummaries(new Map());
      return;
    }
    try {
      const params = new URLSearchParams({ resourceType, resourceRefs: refsKey });
      const res = await api(`/api/learning/gating/summary?${params.toString()}`);
      const next = new Map();
      for (const item of Array.isArray(res?.items) ? res.items : []) {
        if (item?.resource_ref != null) next.set(String(item.resource_ref), item);
      }
      setSummaries(next);
    } catch (_) {
      setSummaries(new Map()); // annonce absente plutôt qu'écran cassé
    }
  }, [resourceType, refsKey]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (cancelled) return;
      await load();
    };
    run();
    if (typeof window !== 'undefined') {
      window.addEventListener('foretmap_session_changed', run);
      return () => {
        cancelled = true;
        window.removeEventListener('foretmap_session_changed', run);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [load]);

  return { summaries, refresh: load };
}
