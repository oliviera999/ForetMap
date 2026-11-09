import { useCallback, useEffect, useState } from 'react';
import { apiGL } from '../services/apiGL.js';

/**
 * « Tenir à deux » — lecture du tour (`GET /api/gl/games/:id/tenir/tour`) et actions du moteur.
 * La vérité est côté serveur : chaque action recharge (`refresh`) puis appelle `onChanged`
 * (reloadGame) — la prod est en long-polling, aucun état dérivé n'est conservé côté client.
 */
export function useGlTenirTour({ gameId, enabled = true, onChanged = null }) {
  const [tour, setTour] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!gameId || !enabled) return null;
    try {
      const data = await apiGL(`/api/gl/games/${gameId}/tenir/tour`);
      setTour(data);
      setError('');
      return data;
    } catch (err) {
      setError(err.message || 'Tour indisponible');
      return null;
    }
  }, [gameId, enabled]);

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
        await onChanged?.();
        return result;
      } catch (err) {
        setError(err.message || 'Action impossible');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [refresh, onChanged],
  );

  const post = useCallback(
    (path, body = {}) => run(() => apiGL(`/api/gl/games/${gameId}/tenir${path}`, 'POST', body)),
    [gameId, run],
  );
  const put = useCallback(
    (path, body = {}) => run(() => apiGL(`/api/gl/games/${gameId}/tenir${path}`, 'PUT', body)),
    [gameId, run],
  );

  return {
    tour,
    error,
    busy,
    refresh,
    ouvrir: () => post('/tour/ouvrir'),
    phase: (phase, extra = {}) => post('/tour/phase', { phase, ...extra }),
    equipeSuivante: () => post('/tour/equipe-suivante'),
    absences: (playerIds) => post('/tour/absences', { playerIds }),
    fouilleFenetre: (teamId, ouverte) => post('/tour/fouille-fenetre', { teamId, ouverte }),
    lancer: (body) => post('/lancer', body),
    // Relance : l'équipe garde son jet, la case restée en suspens s'applique.
    garderJet: (teamId = null) => post('/arrivee/garder', teamId != null ? { teamId } : {}),
    validerSaisie: (saisieId) => post(`/des/${saisieId}/valider`),
    refuserSaisie: (saisieId) => post(`/des/${saisieId}/refuser`),
    teamSpirit: (bilans) => put('/tour/team-spirit', { bilans }),
    lumiereChoix: (palier, choix, libelle) => post('/lumiere/choix', { palier, choix, libelle }),
    oluCorrige: (teamId) => post('/tour/olu-corrige', { teamId }),
    retrait: (playerId, entree, motif) => post('/retrait', { playerId, entree, motif }),
    peripetiePasser: (id, teamId) => post('/peripetie/passer', { id, teamId }),
    projectionToken: () => run(() => apiGL(`/api/gl/games/${gameId}/projection-token`, 'POST', {})),
  };
}
