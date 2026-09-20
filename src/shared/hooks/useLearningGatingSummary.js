import { useCallback, useEffect, useState } from 'react';
import { LEARNING_GATING_CHANGED_EVENT } from '../utils/learningGatingEvents.js';
import { chunkIds, IDS_BATCH_SIZE_DEFAULT, IDS_DEBOUNCE_MS_DEFAULT } from '../utils/chunkIds.js';

/**
 * Taille d’un lot HTTP pour le résumé de conditionnement — alignée serveur
 * (`SUMMARY_MAX_REFS`). Ce n’est plus un plafond global : le client enchaîne les lots.
 *
 * (docs/AUDIT_CHARGE_BIODIVERSITE_2026-09.md B4 ; plan charge biodiv 1A).
 */
export const GATING_SUMMARY_MAX_REFS = IDS_BATCH_SIZE_DEFAULT;

/**
 * Résumé du contrôle de compréhension pour une LISTE de ressources — commun aux deux
 * applications.
 *
 * Sert à prévenir le lecteur AVANT qu'il ne clique : un bouton « Marquer comme lu » ne
 * laissait rien deviner, et l'épreuve ne se révélait qu'une fois la fenêtre ouverte. Un
 * appel par ressource aurait multiplié les requêtes sur une page de quinze contenus ; la
 * route `…/gating/summary` en prend une liste (bornée à 200 côté serveur). Au-delà, le
 * client découpe en lots et fusionne.
 *
 * Silencieux par construction : sans session, ou si l'appel échoue, la liste s'affiche
 * exactement comme avant. Une annonce est un confort, pas un verrou — le contrôle réel
 * reste fait au moment de la validation, côté serveur.
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

  // Clé stable : la référence du tableau change à chaque rendu de la liste.
  // Plus de troncature globale : tous les refs partent, découpés en lots au fetch.
  const refsKey = (Array.isArray(refs) ? refs : [])
    .map((r) => String(r))
    .filter(Boolean)
    .join(',');

  const load = useCallback(async () => {
    if (!enabled || !refsKey || !resourceType || typeof request !== 'function') {
      setSummaries(new Map());
      return;
    }
    try {
      const allRefs = refsKey.split(',').filter(Boolean);
      const next = new Map();
      for (const batch of chunkIds(allRefs, GATING_SUMMARY_MAX_REFS)) {
        const params = new URLSearchParams({
          resourceType,
          resourceRefs: batch.join(','),
        });
        const res = await request(`${basePath}?${params.toString()}`);
        for (const item of Array.isArray(res?.items) ? res.items : []) {
          if (item?.resource_ref != null) next.set(String(item.resource_ref), item);
        }
      }
      setSummaries(next);
    } catch (_) {
      setSummaries(new Map());
    }
  }, [request, basePath, resourceType, refsKey, enabled]);

  useEffect(() => {
    let cancelled = false;
    let timer = null;
    const run = async () => {
      if (cancelled) return;
      await load();
    };
    // Debounce quand la clé change (filtres) ; immédiat au premier montage / session.
    timer = setTimeout(run, refsKey ? IDS_DEBOUNCE_MS_DEFAULT : 0);
    if (typeof window === 'undefined') {
      return () => {
        cancelled = true;
        if (timer) clearTimeout(timer);
      };
    }
    const onEvent = () => {
      if (timer) clearTimeout(timer);
      run();
    };
    const names = [LEARNING_GATING_CHANGED_EVENT, sessionEventName].filter(Boolean);
    for (const name of names) window.addEventListener(name, onEvent);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      for (const name of names) window.removeEventListener(name, onEvent);
    };
  }, [load, sessionEventName, refsKey]);

  return { summaries, refresh: load };
}
