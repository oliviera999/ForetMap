import { useCallback, useEffect, useRef } from 'react';

/**
 * Garde anti-course pour un chargement manuel (`load = useCallback(async () => …)`).
 *
 * Audit du 13/09/2026, §2.5 : vingt-cinq écrans lançaient `api(...)` dans un effet sans
 * annulation. Quand les dépendances de `load` changent pendant un appel en vol (autre carte,
 * autre filtre, autre lieu), la réponse la plus ancienne peut arriver en dernier et écraser la
 * plus récente. `useApiResource` règle ce cas pour le trio data/loading/error ; ce hook couvre
 * les chargements qui posent plusieurs états à la fois et ne rentrent pas dans ce moule.
 *
 * Usage :
 *   const latest = useLatestRequest();
 *   const load = useCallback(async () => {
 *     const isCurrent = latest();
 *     const rows = await api('/api/x');
 *     if (!isCurrent()) return;   // réponse périmée (nouvel appel parti, ou démontage)
 *     setRows(rows);
 *   }, [latest, …]);
 *
 * @returns {() => () => boolean} `latest()` ouvre un appel et renvoie `isCurrent()`.
 */
export function useLatestRequest() {
  const seqRef = useRef(0);
  useEffect(
    () => () => {
      // Démontage : tout appel encore en vol devient périmé.
      seqRef.current += 1;
    },
    [],
  );
  return useCallback(() => {
    seqRef.current += 1;
    const id = seqRef.current;
    return () => id === seqRef.current;
  }, []);
}
