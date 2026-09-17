import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Acquisition de la position GPS de l'appareil via `navigator.geolocation`.
 *
 * - Détection « module présent » (`supported`) : permet de masquer l'UI GPS quand
 *   le navigateur n'a pas de capteur de géolocalisation.
 * - Le suivi (`watchPosition`) ne démarre que lorsque `start()` est appelé, et
 *   s'arrête proprement (`clearWatch`) au `stop()` ou au démontage — pas de fuite.
 * - Le `stop()` purge la dernière position et l'erreur : une réactivation repart
 *   d'un état neuf au lieu de rejouer un point périmé (audit C3).
 * - La position reste **100 % côté client** : elle n'est jamais envoyée au serveur.
 *
 * Les mesures portent aussi, quand le capteur les donne, la **vitesse** et la **route suivie**
 * (`coords.speed` / `coords.heading`) : c'est la seule source qui dise vers où l'on se *dirige*,
 * là où la boussole dit seulement vers où l'appareil est *tourné*. Toutes deux valent `null` à
 * l'arrêt ou sur un capteur qui ne les calcule pas.
 *
 * @typedef {{ lat: number, lng: number, accuracy: number, timestamp: number,
 *   speed: number|null, heading: number|null }} GeoPosition
 * `maximumAge` est volontairement court (1 s) : en navigation, une mesure vieille de cinq
 * secondes place la personne cinq mètres en arrière, et le suivi de carte part en saccades pour
 * rattraper un retard qui n'existe pas.
 *
 * @param {{ enableHighAccuracy?: boolean, maximumAge?: number, timeout?: number }} [options]
 * @returns {{
 *   supported: boolean,
 *   status: 'idle'|'prompt'|'granted'|'denied'|'unavailable',
 *   position: GeoPosition|null,
 *   error: string|null,
 *   start: () => void,
 *   stop: () => void,
 * }}
 */
export function useGeolocation({
  enableHighAccuracy = true,
  maximumAge = 1000,
  timeout = 15000,
} = {}) {
  const supported = typeof navigator !== 'undefined' && !!navigator.geolocation;

  const [status, setStatus] = useState(supported ? 'idle' : 'unavailable');
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const watchIdRef = useRef(null);

  const clearActiveWatch = () => {
    if (watchIdRef.current != null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
  };

  const stop = useCallback(() => {
    clearActiveWatch();
    setStatus(supported ? 'idle' : 'unavailable');
    setPosition(null);
    setError(null);
  }, [supported]);

  const start = useCallback(() => {
    if (!supported) {
      setStatus('unavailable');
      return;
    }
    if (watchIdRef.current != null) return;
    setError(null);
    setStatus('prompt');
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setStatus('granted');
        setError(null);
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
          speed: Number.isFinite(pos.coords.speed) ? pos.coords.speed : null,
          heading: Number.isFinite(pos.coords.heading) ? pos.coords.heading : null,
        });
      },
      (err) => {
        if (err && err.code === err.PERMISSION_DENIED) {
          setStatus('denied');
          setError('Autorisation de localisation refusée.');
        } else if (err && err.code === err.POSITION_UNAVAILABLE) {
          setError('Position indisponible (signal GPS faible ?).');
        } else if (err && err.code === err.TIMEOUT) {
          setError('Délai dépassé pour obtenir la position.');
        } else {
          setError('Erreur de géolocalisation.');
        }
      },
      { enableHighAccuracy, maximumAge, timeout },
    );
  }, [supported, enableHighAccuracy, maximumAge, timeout]);

  useEffect(() => () => clearActiveWatch(), []);

  // Objet stable tant que rien ne change : les hooks consommateurs peuvent le mettre
  // en dépendance d'effet sans re-déclenchement à chaque rendu (audit C7).
  return useMemo(
    () => ({ supported, status, position, error, start, stop }),
    [supported, status, position, error, start, stop],
  );
}

export default useGeolocation;
