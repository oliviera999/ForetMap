/**
 * Transport du Plan Lyautey (lot 4) — produit **sans session** : aucun jeton, aucun cookie,
 * aucune redirection d'authentification. On réutilise le transport partagé
 * (`fetchJsonWithRetry` : réessais réseau et passerelle, message utilisateur unique) sans
 * les crochets de session de ForetMap ni de G&L.
 */
import { withAppBase } from '../shared/appBase.js';
import { buildApiHttpErrorMessage } from '../shared/apiTransport.js';
import { fetchJsonWithRetry } from '../shared/fetchJsonWithRetry.js';
import { reportUsage } from '../shared/usage/reportUsage.js';

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

/**
 * Charge publique du plan (carte, réglages, catégories, lieux, parcours).
 * `code` : laissez-passer porté par un lien profond (`?code=`), pour que les QR codes
 * internes ouvrent le plan sans saisie quand l'accès est restreint (lot 8).
 */
export async function fetchPlanContent(mapId = '', code = '') {
  const params = new URLSearchParams();
  if (mapId) params.set('map_id', mapId);
  if (code) params.set('code', code);
  const suffix = params.toString() ? `?${params}` : '';
  return planApi(`/api/plan/content${suffix}`);
}

/** Saisie du code d'accès (lot 8) : pose le laissez-passer côté serveur. */
export async function submitPlanAccessCode(code) {
  return planApi('/api/plan/access', 'POST', { code });
}

/**
 * Compteur d'usage anonyme du plan (`POST /api/usage`) — l'envoi lui-même est partagé par les
 * trois produits depuis le lot 8 (`src/shared/usage/reportUsage.js`).
 * @param {string} event événement de la liste blanche produit (`lib/usage.js`).
 * @param {string} [key] clé libre bornée (identifiant de lieu, terme cherché…).
 */
export function reportPlanUsage(event, key = '') {
  reportUsage('plan', event, key, withAppBase);
}
