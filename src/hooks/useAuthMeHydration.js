import { useEffect } from 'react';

import { api, getAuthClaims, getStoredSession } from '../services/api';

/** Compte désigné par le jeton courant (`userType:userId`), chaîne vide sans jeton. */
function currentAccountKey() {
  const claims = getAuthClaims();
  return claims ? `${claims.userType || ''}:${claims.userId ?? ''}` : '';
}

/**
 * Hydratation de la session via `/api/auth/me` au montage (extrait de App.jsx, O5).
 *
 * Encapsule l'unique effet inline d'App.jsx qui, une seule fois au montage (si
 * une session avec token existe), interroge `/api/auth/me` et fusionne la
 * réponse dans les états locaux via `mergeAuthMeResponse`. En cas d'absence /
 * d'invalidité de session, on conserve silencieusement les états locaux
 * existants (le `.catch` no-op de l'ancien effet).
 *
 * Concern autonome et faiblement couplé : aucun état n'est déplacé ni créé.
 * `api` et `getStoredSession` proviennent du service partagé et sont importés
 * directement ici ; seul `mergeAuthMeResponse` (callback d'App.jsx) est passé
 * en paramètre. Iso-comportement : même garde `if (!session?.token) return`,
 * même appel, même gestion d'erreur et même dépendance (`mergeAuthMeResponse`)
 * que l'ancien `useEffect`.
 *
 * @param {object} params
 * @param {(d: object) => void} params.mergeAuthMeResponse - fusion de la réponse `/api/auth/me`.
 */
export function useAuthMeHydration({ mergeAuthMeResponse }) {
  useEffect(() => {
    const session = getStoredSession();
    if (!session?.token) return;
    // Compte au départ de la requête : une déconnexion (ou un autre compte) entre-temps rend
    // la réponse caduque — elle ne doit pas rouvrir la session (audit du 19/11, F2).
    const accountAtStart = currentAccountKey();
    api('/api/auth/me')
      .then((d) => {
        if (!accountAtStart || currentAccountKey() !== accountAtStart) return;
        mergeAuthMeResponse(d);
      })
      .catch(() => {
        // Session absente/invalide: on laisse les états locaux existants.
      });
  }, [mergeAuthMeResponse]);
}
