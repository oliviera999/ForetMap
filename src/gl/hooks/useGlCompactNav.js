import { useEffect, useState } from 'react';

const COMPACT_MQL = '(max-width: 639px)';

export function useGlCompactNav() {
  const [compact, setCompact] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(COMPACT_MQL).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mql = window.matchMedia(COMPACT_MQL);
    const onChange = (event) => setCompact(event.matches);
    mql.addEventListener('change', onChange);
    setCompact(mql.matches);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return compact;
}
