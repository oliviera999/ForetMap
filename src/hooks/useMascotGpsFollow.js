import { useCallback, useEffect, useState } from 'react';
import { useGeolocation } from './useGeolocation.js';
import { geoToPct, isPctWithinMap, isValidAnchors } from '../utils/mapGeoTransform.js';

/** Au-delà de cette précision (mètres), la position est jugée trop imprécise pour bouger la mascotte. */
const DEFAULT_ACCURACY_THRESHOLD_M = 50;
/** Marge (% du plan) tolérée hors des bords avant de considérer la position « hors zone ». */
const OUT_OF_BOUNDS_MARGIN_PCT = 5;

/**
 * Suivi GPS de la mascotte : convertit la position du capteur en position % du plan
 * (transformation affine `georef`) et appelle `moveTo`. Le suivi est désactivé tant que
 * l'utilisateur ne l'a pas activé via `toggle()`. La position reste 100 % côté client.
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
 *   feedback: 'ok'|'out_of_bounds'|'low_accuracy'|null,
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

  const available = !!gpsEnabled && isValidAnchors(georef) && geo.supported;

  const toggle = useCallback(() => {
    setActive((prev) => {
      const next = !prev;
      if (next) geo.start();
      else geo.stop();
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
    const { lat, lng, accuracy } = geo.position;
    if (Number.isFinite(accuracy) && accuracy > accuracyThresholdM) {
      setFeedback('low_accuracy');
      return;
    }
    const pct = geoToPct(lat, lng, georef);
    if (!pct || !isPctWithinMap(pct, OUT_OF_BOUNDS_MARGIN_PCT)) {
      setFeedback('out_of_bounds');
      return;
    }
    setFeedback('ok');
    moveTo(pct.xp, pct.yp);
  }, [geo.position, active, available, georef, accuracyThresholdM, moveTo]);

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
