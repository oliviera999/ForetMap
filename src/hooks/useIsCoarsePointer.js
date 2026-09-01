import { useEffect, useState } from 'react';

/**
 * Détection partagée du pointeur grossier (tablette / mobile), suivie dans le temps.
 * Même requête média que la carte ForetMap et la Visite — permet à GL d'appliquer
 * le même multiplicateur tactile aux libellés de plateau.
 */
export function useIsCoarsePointer() {
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia('(pointer: coarse)');
    const update = () => setIsCoarsePointer(Boolean(media.matches));
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);
  return isCoarsePointer;
}
