import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Préférence appareil pour l'affichage échelle + rose des vents.
 * Absent ou `1` → affiché ; `0` → masqué. Le réglage carte (`allowed`) reste une garde.
 *
 * @param {object} options
 * @param {string} options.storageKey clé localStorage (ex. `plan:scale-compass`)
 * @param {boolean} [options.allowed=false] autorisé par carte calée + flag admin
 */
export function useScaleCompassPreference({ storageKey, allowed = false } = {}) {
  const key = String(storageKey || '').trim();

  const read = useCallback(() => {
    if (!key || typeof window === 'undefined') return true;
    try {
      return window.localStorage.getItem(key) !== '0';
    } catch {
      return true;
    }
  }, [key]);

  const [userEnabled, setUserEnabled] = useState(read);

  useEffect(() => {
    setUserEnabled(read());
  }, [read]);

  const setEnabled = useCallback(
    (next) => {
      const on = !!next;
      setUserEnabled(on);
      if (!key || typeof window === 'undefined') return;
      try {
        if (on) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, '0');
      } catch {
        /* ignore quota / private mode */
      }
    },
    [key],
  );

  const toggle = useCallback(() => {
    setEnabled(!userEnabled);
  }, [setEnabled, userEnabled]);

  const effective = !!allowed && !!userEnabled;

  return useMemo(
    () => ({
      userEnabled: !!userEnabled,
      setEnabled,
      toggle,
      effective,
      allowed: !!allowed,
    }),
    [userEnabled, setEnabled, toggle, effective, allowed],
  );
}

export default useScaleCompassPreference;
