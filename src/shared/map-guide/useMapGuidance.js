import { useCallback, useMemo, useRef, useState } from 'react';

import { mapPlaceKey } from './mapGuidePlace.js';

/**
 * État du guidage « Y aller » : quel lieu est visé, et par quels gestes on le vise ou on
 * s'arrête. Partagé par le Plan Lyautey et la Visite ForetMap — les deux surfaces montrent la
 * même ligne droite depuis la position, la même distance, et s'arrêtent de la même façon.
 *
 * Le guidage ne vit **pas** dans la fiche du lieu : refermer la fiche l'arrêtait sans le dire,
 * alors que la fiche est précisément ce qui cache la carte au moment où l'on marche
 * (`docs/AUDIT_PLAN_NAVIGATION_2026-09-16-bis.md` B4 et B5). Seul `stop()` l'interrompt.
 *
 * @param {object} options
 * @param {Array<object>} [options.places] lieux `{ kind, id, … }` où retrouver la cible
 * @param {(place: object) => string} [options.placeKey] identité d'un lieu (défaut `kind:id`)
 * @param {(place: object) => void} [options.onGoTo] effet de bord au départ (journal d'usage,
 *   activation de la position, fermeture de la fiche…)
 * @param {() => void} [options.onStop] effet de bord à l'arrêt
 */
export function useMapGuidance({ places = [], placeKey = mapPlaceKey, onGoTo, onStop } = {}) {
  const [targetKey, setTargetKey] = useState('');

  // Identités stables : un appelant qui passe une fonction en ligne ne doit pas recréer les
  // gestionnaires à chaque rendu (ils descendent dans des composants mémoïsés).
  const placeKeyRef = useRef(placeKey);
  placeKeyRef.current = placeKey;
  const onGoToRef = useRef(onGoTo);
  onGoToRef.current = onGoTo;
  const onStopRef = useRef(onStop);
  onStopRef.current = onStop;

  const guidedPlace = useMemo(() => {
    if (!targetKey) return null;
    return (places || []).find((place) => placeKeyRef.current(place) === targetKey) || null;
  }, [targetKey, places]);

  const goTo = useCallback((place) => {
    const key = place ? placeKeyRef.current(place) : '';
    if (!key) return;
    setTargetKey(key);
    onGoToRef.current?.(place);
  }, []);

  const stop = useCallback(() => {
    setTargetKey('');
    onStopRef.current?.();
  }, []);

  const isTarget = useCallback(
    (place) => !!targetKey && !!place && placeKeyRef.current(place) === targetKey,
    [targetKey],
  );

  /** Changement de carte : la cible d'une autre carte n'a plus de sens (pas d'effet de bord). */
  const reset = useCallback(() => setTargetKey(''), []);

  return { targetKey, guidedPlace, goTo, stop, isTarget, reset };
}
