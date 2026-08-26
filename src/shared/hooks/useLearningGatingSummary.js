import { useCallback, useEffect, useState } from 'react';

/** Plafond aligné sur celui du serveur (`SUMMARY_MAX_REFS`). */
export const GATING_SUMMARY_MAX_REFS = 60;

/**
 * Résumé du contrôle de compréhension pour une LISTE de ressources — commun aux deux
 * applications.
 *
 * Sert à prévenir le lecteur AVANT qu'il ne clique : un bouton « Marquer comme lu » ne
 * laissait rien deviner, et l'épreuve ne se révélait qu'une fois la fenêtre ouverte. Un
 * appel par ressource aurait multiplié les requêtes sur une page de quinze contenus ; la
 * route `…/gating/summary` en prend une liste.
 *
 * Silencieux par construction : sans session, ou si l'appel échoue, la liste s'affiche
 * exactement comme avant. Une annonce est un confort, pas un verrou — le contrôle réel
 * reste fait au moment de la validation, côté serveur.
 *
 * Seuls le client HTTP, le chemin de base et l'événement de changement de session
 * diffèrent entre les deux produits : ils sont injectés.
 *
 * @param {object} params
 * @param {(path: string) => Promise<any>} params.request client HTTP du produit.
 * @param {string} params.basePath ex. `/api/learning/gating/summary`.
 * @param {string} params.resourceType type de ressource affiché.
 * @param {Array<number|string>} [params.refs] identifiants des ressources affichées.
 * @param {boolean} [params.enabled] faux → aucun appel (pas de session, module éteint…).
 * @param {string|null} [params.sessionEventName] événement window déclenchant un rechargement.
 * @returns {{ summaries: Map<string, object>, refresh: () => Promise<void> }}
 */
export function useLearningGatingSummary({
  request,
  basePath,
  resourceType,
  refs = [],
  enabled = true,
  sessionEventName = null,
}) {
  const [summaries, setSummaries] = useState(() => new Map());

  // Clé stable : la référence du tableau change à chaque rendu de la liste, et
  // rechargerait pour rien (même écueil que `useTutorialReadIds`).
  const refsKey = (Array.isArray(refs) ? refs : [])
    .map((r) => String(r))
    .filter(Boolean)
    .slice(0, GATING_SUMMARY_MAX_REFS)
    .join(',');

  const load = useCallback(async () => {
    if (!enabled || !refsKey || !resourceType || typeof request !== 'function') {
      setSummaries(new Map());
      return;
    }
    try {
      const params = new URLSearchParams({ resourceType, resourceRefs: refsKey });
      const res = await request(`${basePath}?${params.toString()}`);
      const next = new Map();
      for (const item of Array.isArray(res?.items) ? res.items : []) {
        if (item?.resource_ref != null) next.set(String(item.resource_ref), item);
      }
      setSummaries(next);
    } catch (_) {
      setSummaries(new Map()); // annonce absente plutôt qu'écran cassé
    }
  }, [request, basePath, resourceType, refsKey, enabled]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (cancelled) return;
      await load();
    };
    run();
    if (sessionEventName && typeof window !== 'undefined') {
      window.addEventListener(sessionEventName, run);
      return () => {
        cancelled = true;
        window.removeEventListener(sessionEventName, run);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [load, sessionEventName]);

  return { summaries, refresh: load };
}
