import { useEffect, useState } from 'react';

import { api } from '../services/api.js';

/** Charge la version SemVer exposée par GET /api/version (package.json). */
export function useAppVersion() {
  const [appVersion, setAppVersion] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api('/api/version')
      .then((data) => {
        if (!cancelled) setAppVersion(data?.version ?? null);
      })
      .catch(() => {
        if (!cancelled) setAppVersion(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return appVersion;
}
