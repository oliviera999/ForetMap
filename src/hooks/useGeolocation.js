import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Acquisition de la position GPS de l'appareil via `navigator.geolocation`.
 *
 * - Détection « module présent » (`supported`) : permet de masquer l'UI GPS quand
 *   le navigateur n'a pas de capteur de géolocalisation.
 * - Le suivi (`watchPosition`) ne démarre que lorsque `start()` est appelé, et
 *   s'arrête proprement (`clearWatch`) au `stop()` ou au démontage — pas de fuite.
 * - La position reste **100 % côté client** : elle n'est jamais envoyée au serveur.
 *
 * @typedef {{ lat: number, lng: number, accuracy: number, timestamp: number }} GeoPosition
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
  maximumAge = 5000,
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

  return { supported, status, position, error, start, stop };
}

export default useGeolocation;
