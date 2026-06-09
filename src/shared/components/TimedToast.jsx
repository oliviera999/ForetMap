import React, { useEffect } from 'react';
import { FixedToast } from './FixedToast.jsx';

/** Toast auto-dismiss (2,4 s) — remplace les implémentations locales dupliquées. */
export function TimedToast({ msg, onDone, durationMs = 2400 }) {
  useEffect(() => {
    const t = setTimeout(onDone, durationMs);
    return () => clearTimeout(t);
  }, [onDone, durationMs]);
  return <FixedToast>{msg}</FixedToast>;
}
