import { useCallback, useEffect, useMemo, useState } from 'react';

import { fetchPlanContent } from '../planApi.js';
import { planPlacesFromContent } from '../utils/planPlaces.js';
import { PLAN_VARIANT } from '../utils/planVariants.js';

/** Identité stable pour « aucun signalement » (cf. `myReports`). */
const EMPTY_REPORTS = Object.freeze([]);

/**
 * Charge publique du plan (lot 4) : un seul appel au montage, pas de polling — le contenu
 * d'un plan d'établissement change quelques fois par an, et le produit doit rester utilisable
 * dans un couloir avec un réseau médiocre. `reload()` permet un rechargement explicite.
 *
 * @param {string} [mapId] carte demandée (`?map_id=`) ; vide = carte réglée côté serveur.
 * @param {string} [accessCode] code porté par un lien profond.
 * @param {object} [variant] variante de plan (`src/plan/utils/planVariants.js`).
 */
export function usePlanContent(mapId = '', accessCode = '', variant = PLAN_VARIANT) {
  const [content, setContent] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  /**
   * Le serveur refuse la charge tant que le lecteur n'a rien prouvé. Deux refus distincts :
   * `access_required` (plan public fermé par un code de diffusion) et `auth_required` (plan
   * des personnels : compte ForetMap, ou code si l'administrateur l'a activé). Le second
   * porte `code_available`, pour n'afficher la saisie du code que si elle mène quelque part.
   */
  const [accessRequired, setAccessRequired] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [codeAvailable, setCodeAvailable] = useState(false);

  const load = useCallback(
    async (signal) => {
      setLoading(true);
      try {
        const data = await fetchPlanContent(mapId, accessCode, variant);
        if (signal?.aborted) return;
        setContent(data);
        setError(null);
        setAccessRequired(false);
        setAuthRequired(false);
      } catch (err) {
        if (signal?.aborted) return;
        if (err?.status === 401 && err?.body?.auth_required) {
          setAuthRequired(true);
          setCodeAvailable(!!err.body.code_available);
          setError(null);
        } else if (err?.status === 401 && err?.body?.access_required) {
          setAccessRequired(true);
          setError(null);
        } else {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [mapId, accessCode, variant],
  );

  useEffect(() => {
    const controller = { aborted: false };
    load(controller);
    return () => {
      controller.aborted = true;
    };
  }, [load]);

  const places = useMemo(() => planPlacesFromContent(content), [content]);

  /**
   * Ce que ce lecteur a déjà signalé, servi avec la charge (`my_reports`). Identité stable :
   * un `|| []` posé dans le `return` fabriquerait un tableau neuf à chaque rendu.
   */
  const myReports = useMemo(() => content?.my_reports || EMPTY_REPORTS, [content]);

  /**
   * Ajoute localement un signalement qui vient de partir, plutôt que de recharger toute la
   * charge du plan pour une ligne : sur un téléphone dans un couloir, la seconde de
   * rechargement se voit, et l'auteur veut surtout constater que son message est parti.
   */
  const addMyReport = useCallback((report) => {
    if (!report?.id) return;
    setContent((prev) => {
      if (!prev) return prev;
      const others = (prev.my_reports || []).filter((item) => item.id !== report.id);
      return { ...prev, my_reports: [report, ...others] };
    });
  }, []);

  return {
    content,
    places,
    myReports,
    addMyReport,
    accessRequired,
    authRequired,
    codeAvailable,
    viewer: content?.viewer || null,
    routes: content?.routes || [],
    categories: content?.categories || [],
    settings: content?.settings || null,
    map: content?.map || null,
    loading,
    error,
    reload: useCallback(() => load(null), [load]),
  };
}
