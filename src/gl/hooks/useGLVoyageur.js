import { useCallback, useEffect, useState } from 'react';
import { apiGL } from '../services/apiGL.js';

/**
 * Données du Seuil (`GET /api/gl/voyageur/me`) : niveau à deux regards, expédition en cours,
 * grimoire personnel, Lettre et Mentorat de l'élève. `castSpell` / `loadTargets` pilotent les
 * sortilèges du voyageur ; `ecrireLettre` / `retenterMentorat` rejouent, sans repayer, les deux
 * sorts payés pendant la partie ; `gesteParure` pose ou range une parure de la garde-robe (M19).
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
      // Flair `{ x, y }` envoie un objet ; les autres une cible texte.
      const body = target && typeof target === 'object' ? target : { target };
      const result = await apiGL(
        `/api/gl/voyageur/spells/${encodeURIComponent(code)}/cast`,
        'POST',
        body,
      );
      await reload();
      return result;
    },
    [reload],
  );

  /** Lettre (M23) : écrire ou réécrire sa page, sans rien repayer. */
  const ecrireLettre = useCallback(
    async (lettreId, { amorce = null, titre, texte }) => {
      const result = await apiGL(`/api/gl/voyageur/lettre/${lettreId}`, 'PUT', {
        amorce,
        titre,
        texte,
      });
      await reload();
      return result;
    },
    [reload],
  );

  /** Mentorat (M23) : retenter après un « pas encore », sans rien repayer. */
  const retenterMentorat = useCallback(
    async (mentoratId) => {
      const result = await apiGL(`/api/gl/voyageur/mentorat/${mentoratId}/retenter`, 'POST', {});
      await reload();
      return result;
    },
    [reload],
  );

  /** Garde-robe (M19) : poser une de ses parures sur la mascotte de son équipe, ou la ranger. */
  const gesteParure = useCallback(
    async (code, action) => {
      const result = await apiGL(
        `/api/gl/voyageur/garde-robe/${encodeURIComponent(code)}/${action === 'ranger' ? 'ranger' : 'poser'}`,
        'POST',
        {},
      );
      await reload();
      return result;
    },
    [reload],
  );

  return {
    data,
    loading,
    error,
    errorStatus,
    gesteParure,
    reload,
    loadTargets,
    castSpell,
    ecrireLettre,
    retenterMentorat,
  };
}
