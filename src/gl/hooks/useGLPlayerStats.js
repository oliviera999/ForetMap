import { useCallback, useEffect, useState } from 'react';
import { apiGL } from '../services/apiGL.js';

/**
 * Charge les statistiques joueur GL (perso ou classe).
 */
export function useGLPlayerStats({ mode = 'self', classId = null, enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    if (!enabled) {
      setData(null);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const path =
        mode === 'class'
          ? `/api/gl/stats/class${classId ? `?class_id=${encodeURIComponent(classId)}` : ''}`
          : '/api/gl/stats/me';
      const payload = await apiGL(path);
      setData(payload);
    } catch (err) {
      setData(null);
      setError(err?.message || 'Impossible de charger les statistiques.');
    } finally {
      setLoading(false);
    }
  }, [mode, classId, enabled]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload };
}
