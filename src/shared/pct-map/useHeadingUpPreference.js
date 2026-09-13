import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Préférence appareil pour le mode « Orienter » (heading-up).
 * Le réglage admin / le flag carte restent des gardes externes (`allowed`).
 *
 * @param {object} options
 * @param {string} options.storageKey clé localStorage (ex. `plan:heading-up`)
 * @param {boolean} [options.allowed=false] autorisé par admin + carte
 */
export function useHeadingUpPreference({ storageKey, allowed = false } = {}) {
  const key = String(storageKey || '').trim();

  const read = useCallback(() => {
    if (!key || typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(key) === '1';
    } catch {
      return false;
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
        if (on) window.localStorage.setItem(key, '1');
        else window.localStorage.removeItem(key);
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

export default useHeadingUpPreference;
