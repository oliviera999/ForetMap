import { useCallback, useEffect, useState } from 'react';
import { apiGL } from '../services/apiGL.js';

/**
 * Données du Seuil (`GET /api/gl/voyageur/me`) : niveau à deux regards, expédition en cours,
 * grimoire personnel. `castSpell` / `loadTargets` pilotent les sortilèges du voyageur.
 */
export function useGLVoyageur({ enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState('');
  const [errorStatus, setErrorStatus] = useState(null);

  const reload = useCallback(async () => {
    if (!enabled) {
      setData(null);
      setLoading(false);
      return null;
    }
    setLoading(true);
    setError('');
    setErrorStatus(null);
    try {
      const payload = await apiGL('/api/gl/voyageur/me');
      setData(payload);
      return payload;
    } catch (err) {
      setError(err?.message || 'Impossible de charger le Seuil.');
      setErrorStatus(err?.status ?? null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    reload();
  }, [reload]);

  const loadTargets = useCallback(
    (code) => apiGL(`/api/gl/voyageur/spells/${encodeURIComponent(code)}/targets`),
    [],
  );

  const castSpell = useCallback(
    async (code, target) => {
      const result = await apiGL(
        `/api/gl/voyageur/spells/${encodeURIComponent(code)}/cast`,
        'POST',
        { target },
      );
      await reload();
      return result;
    },
    [reload],
  );

  return { data, loading, error, errorStatus, reload, loadTargets, castSpell };
}
