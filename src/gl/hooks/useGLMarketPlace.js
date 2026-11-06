import { useCallback, useEffect, useState } from 'react';
import { apiGL } from '../services/apiGL.js';

/**
 * Marché v2 « Tenir à deux » : place publique (annonces), dons, comptoir des parures.
 * Complète `useGLMarketTrade` (échange à deux). Un 403 `MARCHE_RETRAIT` / `MARCHE_FERME`
 * bascule `blocked` : la vue affiche un écran neutre.
 */
export function useGLMarketPlace({ enabled, onChanged }) {
  const [annonces, setAnnonces] = useState([]);
  const [parures, setParures] = useState({ catalogue: [], portees: [] });
  const [blocked, setBlocked] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleError = useCallback((err) => {
    const code = err?.body?.code || err?.code;
    if (err?.status === 403 && (code === 'MARCHE_RETRAIT' || code === 'MARCHE_FERME')) {
      setBlocked(code);
      return;
    }
    setError(err?.message || 'Marché indisponible');
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const [a, p] = await Promise.all([
        apiGL('/api/gl/market/annonces'),
        apiGL('/api/gl/market/parures'),
      ]);
      setAnnonces(Array.isArray(a?.items) ? a.items : []);
      setParures({
        catalogue: Array.isArray(p?.catalogue) ? p.catalogue : [],
        portees: Array.isArray(p?.portees) ? p.portees : [],
      });
      setBlocked(null);
      setError('');
    } catch (err) {
      handleError(err);
    }
  }, [enabled, handleError]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const run = useCallback(
    async (fn) => {
      setBusy(true);
      setError('');
      try {
        const result = await fn();
        await refresh();
        onChanged?.();
        return result;
      } catch (err) {
        handleError(err);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [refresh, onChanged, handleError],
  );

  const createAnnonce = useCallback(
    (payload) => run(() => apiGL('/api/gl/market/annonces', 'POST', payload)),
    [run],
  );
  const deleteAnnonce = useCallback(
    (id) => run(() => apiGL(`/api/gl/market/annonces/${id}`, 'DELETE')),
    [run],
  );
  const repondreAnnonce = useCallback(
    (id) => run(() => apiGL(`/api/gl/market/annonces/${id}/repondre`, 'POST', {})),
    [run],
  );
  const donner = useCallback(
    (payload) => run(() => apiGL('/api/gl/market/dons', 'POST', payload)),
    [run],
  );
  const acheterParure = useCallback(
    (code, ressource) =>
      run(() =>
        apiGL(`/api/gl/market/parures/${encodeURIComponent(code)}/acheter`, 'POST', { ressource }),
      ),
    [run],
  );

  return {
    annonces,
    parures,
    blocked,
    error,
    busy,
    refresh,
    createAnnonce,
    deleteAnnonce,
    repondreAnnonce,
    donner,
    acheterParure,
  };
}
