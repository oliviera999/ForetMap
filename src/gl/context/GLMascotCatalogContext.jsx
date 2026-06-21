import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { buildGlMascotExtraCatalogEntries } from '../utils/glMascotCatalogExtras.js';

const GLMascotCatalogContext = createContext({
  mascots: [],
  extraCatalogEntries: [],
  reload: async () => {},
});

export function GLMascotCatalogProvider({ token, children }) {
  const [mascots, setMascots] = useState([]);

  const reload = useMemo(
    () => async () => {
      if (!token) {
        setMascots([]);
        return;
      }
      try {
        const data = await apiGL('/api/gl/mascots');
        setMascots(Array.isArray(data?.mascots) ? data.mascots : []);
      } catch (_) {
        setMascots([]);
      }
    },
    [token],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const extraCatalogEntries = useMemo(() => buildGlMascotExtraCatalogEntries(mascots), [mascots]);

  const value = useMemo(
    () => ({ mascots, extraCatalogEntries, reload }),
    [mascots, extraCatalogEntries, reload],
  );

  return (
    <GLMascotCatalogContext.Provider value={value}>{children}</GLMascotCatalogContext.Provider>
  );
}

export function useGLMascotCatalog() {
  return useContext(GLMascotCatalogContext);
}
