import { useCallback, useEffect, useMemo, useState } from 'react';
import { useGeolocation } from './useGeolocation.js';
import {
  applyGeoTransform,
  assessAnchorsGeoPlausibility,
  isPctWithinMap,
  solveAffineFromAnchors,
} from '../utils/mapGeoTransform.js';

/** Au-delà de cette précision (mètres), la position est jugée trop imprécise pour bouger la mascotte. */
const DEFAULT_ACCURACY_THRESHOLD_M = 50;
/** Marge (% du plan) tolérée hors des bords avant de considérer la position « hors zone ». */
const OUT_OF_BOUNDS_MARGIN_PCT = 5;

/**
 * Suivi GPS de la mascotte : convertit la position du capteur en position % du plan
 * (transformation affine `georef`) et appelle `moveTo`. Le suivi est désactivé tant que
 * l'utilisateur ne l'a pas activé via `toggle()`. La position reste 100 % côté client.
 *
 * La transformation est résolue une fois par jeu d'ancres (pas à chaque position), et
 * un calage géographiquement invraisemblable — hérité d'avant le contrôle serveur —
 * est signalé `bad_georef` plutôt que projeté n'importe où (audit C4/C6).
 *
 * @param {{
 *   georef: Array|null,
 *   gpsEnabled: boolean,
 *   moveTo: (xp: number, yp: number) => void,
 *   accuracyThresholdM?: number,
 * }} params
 * @returns {{
 *   supported: boolean,
 *   available: boolean,
 *   active: boolean,
 *   status: 'idle'|'prompt'|'granted'|'denied'|'unavailable',
 *   feedback: 'ok'|'out_of_bounds'|'low_accuracy'|'bad_georef'|null,
 *   accuracy: number|null,
 *   error: string|null,
 *   toggle: () => void,
 * }}
 */
export function useMascotGpsFollow({
  georef,
  gpsEnabled,
  moveTo,
  accuracyThresholdM = DEFAULT_ACCURACY_THRESHOLD_M,
}) {
  const geo = useGeolocation();
  const [active, setActive] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Transformation et plausibilité résolues une fois par jeu d'ancres.
  const georefState = useMemo(() => {
    const transform = solveAffineFromAnchors(georef);
    if (!transform) return null;
    return { transform, plausible: assessAnchorsGeoPlausibility(georef).ok };
  }, [georef]);

  const available = !!gpsEnabled && !!georefState && geo.supported;

  const toggle = useCallback(() => {
    setActive((prev) => {
      const next = !prev;
      if (next) {
        geo.start();
      } else {
        geo.stop();
        setFeedback(null);
      }
      return next;
    });
  }, [geo]);

  // Coupe le suivi si le plan perd son éligibilité GPS (changement de carte, calage retiré).
  useEffect(() => {
    if (!available && active) {
      setActive(false);
      setFeedback(null);
      geo.stop();
    }
  }, [available, active, geo]);

  // Applique chaque nouvelle position au déplacement de la mascotte.
  useEffect(() => {
    if (!active || !available || !geo.position) return;
    if (!georefState.plausible) {
      setFeedback('bad_georef');
      return;
    }
    const { lat, lng, accuracy } = geo.position;
    if (Number.isFinite(accuracy) && accuracy > accuracyThresholdM) {
      setFeedback('low_accuracy');
      return;
    }
    const pct = applyGeoTransform(georefState.transform, lat, lng);
    if (!pct) {
      setFeedback('bad_georef');
      return;
    }
    if (!isPctWithinMap(pct, OUT_OF_BOUNDS_MARGIN_PCT)) {
      setFeedback('out_of_bounds');
      return;
    }
    setFeedback('ok');
    moveTo(pct.xp, pct.yp);
  }, [geo.position, active, available, georefState, accuracyThresholdM, moveTo]);

  return {
    supported: geo.supported,
    available,
    active,
    status: geo.status,
    feedback: active ? feedback : null,
    accuracy: geo.position?.accuracy ?? null,
    error: geo.error,
    toggle,
  };
}

export default useMascotGpsFollow;
