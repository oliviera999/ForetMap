import { useCallback, useEffect, useState } from 'react';
import { apiGL, getGlSession } from '../services/apiGL.js';
import { isGlProjection } from '../utils/glGuestMode.js';

/**
 * Badges individuels d'un joueur G&L (`GET /api/gl/rewards/me`) : `rewards`, `progress`,
 * `catalogue`, `families`, `tiers` (Fil, Nœud, Étoffe). `markSeen` pose `seen_at`
 * (`POST /api/gl/rewards/me/seen`) après la célébration.
 *
 * Privé : jamais chargé depuis une session de **projection** (vidéoprojecteur, jeton
 * `gl_guest` + claim `projection`) ni quand le module `rewards_enabled` est éteint.
 */
export function useGlRewards({ enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState('');

  const projection = isGlProjection(getGlSession()?.auth);
  const active = enabled && !projection;

  const reload = useCallback(async () => {
    if (!active) {
      setData(null);
      setLoading(false);
      return null;
    }
    setLoading(true);
    setError('');
    try {
      const payload = await apiGL('/api/gl/rewards/me');
      const ok = payload && typeof payload === 'object' && Array.isArray(payload.catalogue);
      setData(ok ? payload : null);
      return ok ? payload : null;
    } catch (err) {
      // 503 (module éteint) ou 403 (compte staff) : le panneau se tait, sans erreur brute.
      setData(null);
      setError(err?.status === 503 || err?.status === 403 ? '' : err?.message || '');
      return null;
    } finally {
      setLoading(false);
    }
  }, [active]);

  useEffect(() => {
    reload();
  }, [reload]);

  const markSeen = useCallback(() => {
    if (!active) return Promise.resolve();
    return apiGL('/api/gl/rewards/me/seen', 'POST').catch(() => {});
  }, [active]);

  return { data, loading, error, reload, markSeen, projection };
}
