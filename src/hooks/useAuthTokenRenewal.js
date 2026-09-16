import { useEffect } from 'react';
import { api, getAuthClaims } from '../services/api';

/**
 * Renouvellement glissant de la session (côté client).
 *
 * Le jeton vit `security.jwt_ttl_base_seconds` (1 h 30 par défaut) et **rien ne le
 * prolongeait** : une session active mourait en plein travail, `/api/auth/me` ne ré-émettant
 * qu'en cas de changement de rôle ou de permissions. Le serveur sait désormais ré-émettre un
 * jeton entré dans son dernier tiers de vie (`lib/auth/slidingSession.js`) — encore
 * faut-il l'interroger : le cycle de synchronisation n'appelle `/api/auth/me` que lorsque
 * le domaine `authMe` a bougé (`useAppDataSync`), ce qui peut ne jamais arriver.
 *
 * Ce hook comble exactement ce trou : il surveille l'échéance du jeton et appelle
 * `/api/auth/me` quand elle approche. La réponse passe par `mergeAuthMeResponse`, qui sait
 * déjà stocker `refreshedToken`.
 */

/** Part de la durée de vie en dessous de laquelle on demande une ré-émission (dernier tiers). */
const RENEW_RATIO = 1 / 3;
/** Cadence de surveillance : large devant la fenêtre de renouvellement (30 min par défaut). */
const CHECK_INTERVAL_MS = 60_000;

/**
 * Le jeton courant est-il entré dans sa fenêtre de renouvellement ?
 * Miroir front de `shouldRenewAuthToken` côté serveur, sans le plafond absolu : c'est le
 * serveur qui arbitre, le client se contente de demander au bon moment.
 *
 * @param {object|null} claims Claims JWT décodés (`iat`, `exp`).
 * @param {number} [nowMs] Instant de référence en millisecondes (tests).
 * @returns {boolean}
 */
export function shouldAskTokenRenewal(claims, nowMs = Date.now()) {
  const exp = Number(claims?.exp || 0);
  const iat = Number(claims?.iat || 0);
  if (!Number.isFinite(exp) || !Number.isFinite(iat) || exp <= iat) return false;
  const now = Math.floor(nowMs / 1000);
  const remaining = exp - now;
  // Déjà expiré : la prochaine requête rendra 401, inutile de demander une prolongation.
  if (remaining <= 0) return false;
  return remaining <= (exp - iat) * RENEW_RATIO;
}

/**
 * @param {object} params
 * @param {boolean} params.enabled Session établie (élève ou prof) — sinon rien à prolonger.
 * @param {(data: object, options?: object) => void} params.mergeAuthMeResponse Fusion `/api/auth/me`.
 */
export function useAuthTokenRenewal({ enabled, mergeAuthMeResponse }) {
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let inFlight = false;

    const maybeRenew = async () => {
      if (cancelled || inFlight) return;
      if (!shouldAskTokenRenewal(getAuthClaims())) return;
      inFlight = true;
      try {
        const data = await api('/api/auth/me');
        if (!cancelled) mergeAuthMeResponse(data);
      } catch (_) {
        // Coupure réseau ou redémarrage serveur : on retentera au prochain tick. Une
        // session expirée, elle, est traitée par le 401 de `api()` (déconnexion propre).
      } finally {
        inFlight = false;
      }
    };

    const onVisibility = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') maybeRenew();
    };

    const timer = setInterval(maybeRenew, CHECK_INTERVAL_MS);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }
    // Un onglet rouvert après une longue mise en veille peut déjà être dans la fenêtre.
    maybeRenew();

    return () => {
      cancelled = true;
      clearInterval(timer);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, [enabled, mergeAuthMeResponse]);
}
