/**
 * Transport du Plan Lyautey (lot 4) — produit **sans session** : aucun jeton, aucun cookie,
 * aucune redirection d'authentification. On réutilise le transport partagé
 * (`fetchJsonWithRetry` : réessais réseau et passerelle, message utilisateur unique) sans
 * les crochets de session de ForetMap ni de G&L.
 */
import { withAppBase } from '../shared/appBase.js';
import { buildApiHttpErrorMessage } from '../shared/apiTransport.js';
import { fetchJsonWithRetry } from '../shared/fetchJsonWithRetry.js';

/** @param {string} path chemin API (`/api/plan/...`). */
export async function planApi(path, method = 'GET', body) {
  return fetchJsonWithRetry(
    path,
    { method, body },
    {
      resolveUrl: withAppBase,
      buildHttpError: ({ res, errBody, sawGatewayResponse }) => {
        const { errMsg } = buildApiHttpErrorMessage({
          res,
          errBody,
          authToken: null,
          sawGatewayResponse,
        });
        const ex = new Error(errMsg);
        ex.status = res.status;
        ex.body = errBody;
        return ex;
      },
    },
  );
}

/** Charge publique du plan (carte, réglages, catégories, lieux). */
export async function fetchPlanContent(mapId = '') {
  const suffix = mapId ? `?map_id=${encodeURIComponent(mapId)}` : '';
  return planApi(`/api/plan/content${suffix}`);
}

/**
 * Compteur d'usage anonyme (`POST /api/usage`, lot 1) : envoi « au fil de l'eau », sans
 * attendre la réponse et sans jamais interrompre l'utilisateur si l'appel échoue.
 * `sendBeacon` quand le navigateur le propose (survit à la fermeture d'onglet).
 * @param {string} event événement de la liste blanche produit (`lib/usage.js`).
 * @param {string} [key] clé libre bornée (identifiant de lieu, terme vide…).
 */
export function reportPlanUsage(event, key = '') {
  const payload = JSON.stringify({ product: 'plan', event, key });
  const url = withAppBase('/api/usage');
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
      return;
    }
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch (_) {
    // Le compteur ne doit jamais gêner l'usage du plan.
  }
}
