import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { withAppBase } from '../../shared/appBase.js';
import { DEFAULT_PUBLIC_SETTINGS, mergePublicSettings } from '../../utils/appPublicSettings.js';

const GlMapOverlaySettingsContext = createContext({
  mapSettings: DEFAULT_PUBLIC_SETTINGS.map,
  reload: async () => {},
});

export function GlMapOverlaySettingsProvider({ children }) {
  const [mapSettings, setMapSettings] = useState(DEFAULT_PUBLIC_SETTINGS.map);

  const reload = useMemo(
    () => async () => {
      try {
        const res = await fetch(withAppBase('/api/settings/public'));
        if (!res.ok) return;
        const data = await res.json();
        const merged = mergePublicSettings(DEFAULT_PUBLIC_SETTINGS, data?.settings || {});
        setMapSettings(merged.map || DEFAULT_PUBLIC_SETTINGS.map);
      } catch (_) {
        /* garde les valeurs par défaut */
      }
    },
    [],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo(() => ({ mapSettings, reload }), [mapSettings, reload]);

  return (
    <GlMapOverlaySettingsContext.Provider value={value}>
      {children}
    </GlMapOverlaySettingsContext.Provider>
  );
}

/** Réglages carte publics (ratio repères/plateau partagé ForetMap + GL). */
export function useGlMapOverlaySettings() {
  return useContext(GlMapOverlaySettingsContext);
}
