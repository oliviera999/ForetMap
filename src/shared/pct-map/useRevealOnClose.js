import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Durée du halo de fermeture, alignée sur `--motion-map-discover-halo` (`motion.css`) : c'est
 * le même halo bref que celui des lieux « à découvrir » de la visite.
 */
export const REVEAL_ON_CLOSE_MS = 2600;

/** Clé stable d'un lieu (`zone:12`, `marker:abc`), ou `''` s'il est incomplet. */
export function revealPlaceKey(kind, id) {
  if ((kind !== 'zone' && kind !== 'marker') || id == null || id === '') return '';
  return `${kind}:${String(id)}`;
}

/**
 * Halo bref sur le lieu dont on vient de **refermer la fiche** : une fois la fiche fermée, plus
 * rien ne dit sur la carte quel lieu l'on consultait, alors que la caméra est restée centrée
 * dessus. Le lieu respire une fois, puis la carte redevient calme.
 *
 * Générique : toute surface de `SharedMapStage` l'active par la prop `revealOnClose` (plan
 * e-nov d'abord). Passer d'une fiche à une autre ne déclenche rien ; ouvrir une fiche pendant
 * le halo l'éteint aussitôt. Sous « réduire les animations », la classe reste posée mais la
 * feuille de style ne l'anime pas.
 *
 * @param {{ kind?: string, id?: string|number }|null} selectedPlace lieu dont la fiche est
 *   ouverte (ou `null`).
 * @param {boolean} enabled
 * @returns {(kind: string, id: string|number) => boolean} ce lieu porte-t-il le halo ?
 */
export function useRevealOnClose(selectedPlace, enabled) {
  const key = enabled && selectedPlace ? revealPlaceKey(selectedPlace.kind, selectedPlace.id) : '';
  const previousRef = useRef(key);
  const [revealedKey, setRevealedKey] = useState('');

  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = key;
    if (key) {
      // Une fiche est ouverte (ou une autre a pris la place) : pas de halo pendant la lecture.
      setRevealedKey('');
      return undefined;
    }
    if (!previous) return undefined;
    setRevealedKey(previous);
    const timer = window.setTimeout(() => setRevealedKey(''), REVEAL_ON_CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [key]);

  return useCallback(
    (kind, id) => revealedKey !== '' && revealedKey === revealPlaceKey(kind, id),
    [revealedKey],
  );
}
