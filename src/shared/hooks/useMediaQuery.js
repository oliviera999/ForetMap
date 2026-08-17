import { useEffect, useState } from 'react';

/**
 * Suit une media query CSS (partagé ForetMap + GL).
 *
 * Rend `false` au premier rendu, puis s'aligne juste après le montage : la valeur
 * ne dépend donc jamais de `window` pendant le rendu, et un environnement sans
 * `matchMedia` (tests, rendu hors navigateur) reste sur la valeur de repli plutôt
 * que de lever.
 *
 * @param {string} query media query (ex. `(max-width: 480px)`)
 * @returns {boolean}
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const mq = window.matchMedia(query);
    const apply = () => setMatches(Boolean(mq.matches));
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [query]);

  return matches;
}
