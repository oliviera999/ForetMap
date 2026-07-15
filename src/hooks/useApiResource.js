import { useCallback, useEffect, useRef, useState } from 'react';
import { AccountDeletedError } from '../services/api';

/**
 * Hook mutualisé pour charger une ressource distante.
 *
 * Généralise le trio `data / loading / error` + fetch + garde anti-course
 * réimplémenté dans ~30 vues (cf. audit §5.4). Le pattern de référence est le
 * helper `safeApi` d'`App.jsx` et la garde `loadSeqRef` d'`ObservationNotebook`
 * (`foretmap-views.jsx`) : chaque chargement reçoit un numéro de séquence, et
 * seule la réponse du chargement le plus récent est appliquée (les réponses
 * obsolètes — démontage ou changement de `deps` — sont ignorées).
 *
 * @param {() => Promise<any>} fetcher   Fonction asynchrone renvoyant la donnée
 *                                       (typiquement `() => api('/api/...')`).
 * @param {Array<any>}        deps       Dépendances : un changement relance le fetch.
 * @param {object}           [options]
 * @param {() => void}       [options.onForceLogout]  Appelé si le compte est supprimé
 *                                       (erreur `AccountDeletedError` ou `deleted: true`).
 * @returns {{ data: any, loading: boolean, error: (Error|null), reload: () => void }}
 */
export function useApiResource(fetcher, deps = [], { onForceLogout } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Numéro de la requête courante : invalide les setState d'un chargement
  // obsolète (démontage ou changement de `deps`), comme le flag `cancelled`
  // / la garde `loadSeqRef` des vues manuelles.
  const loadSeqRef = useRef(0);

  // Refs vers `fetcher` / `onForceLogout` pour ne pas les inclure dans les
  // dépendances de `load` : le déclencheur de rechargement est `deps` (fourni
  // par l'appelant), pas l'identité — souvent instable — de ces callbacks.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const onForceLogoutRef = useRef(onForceLogout);
  onForceLogoutRef.current = onForceLogout;

  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      // Réponse obsolète (un chargement plus récent a démarré) : on l'ignore.
      if (seq !== loadSeqRef.current) return;
      setData(result);
    } catch (err) {
      if (seq !== loadSeqRef.current) return;
      // Compte supprimé : déléguer la déconnexion à l'appelant s'il l'a fournie.
      if (err instanceof AccountDeletedError || err?.deleted === true) {
        onForceLogoutRef.current?.();
        return;
      }
      setError(err);
    } finally {
      // Ne pas retomber `loading` à false si une requête plus récente est en cours.
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Invalide le chargement en cours au démontage / changement de `deps`.
    return () => {
      loadSeqRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, reload: load };
}
