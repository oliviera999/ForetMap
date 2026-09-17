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
import { PLAN_VARIANT } from './utils/planVariants.js';

/**
 * @param {string} path chemin API (`/api/plan/...`, `/api/staff-plan/...`).
 * @param {string} [method]
 * @param {unknown} [body]
 * @param {() => string|null} [getToken] jeton à signer — seul le plan des personnels en a un.
 */
export async function planApi(path, method = 'GET', body, getToken = null) {
  return fetchJsonWithRetry(
    path,
    { method, body },
    {
      resolveUrl: withAppBase,
      ...(getToken ? { getToken } : {}),
      buildHttpError: ({ res, errBody, sawGatewayResponse }) => {
        const { errMsg } = buildApiHttpErrorMessage({
          res,
          errBody,
          authToken: getToken ? getToken() : null,
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
 * Charge du plan (carte, réglages, catégories, lieux, parcours), pour la variante demandée
 * (`src/plan/utils/planVariants.js` : plan public ou plan des personnels).
 * `code` : laissez-passer porté par un lien profond (`?code=`), pour que les QR codes
 * internes ouvrent le plan sans saisie quand l'accès est restreint (lot 8).
 */
export async function fetchPlanContent(mapId = '', code = '', variant = PLAN_VARIANT) {
  const params = new URLSearchParams();
  if (mapId) params.set('map_id', mapId);
  if (code) params.set('code', code);
  const suffix = params.toString() ? `?${params}` : '';
  return planApi(`${variant.apiBase}/content${suffix}`, 'GET', undefined, variant.getToken);
}

/** Saisie du code d'accès (lot 8) : pose le laissez-passer côté serveur. */
export async function submitPlanAccessCode(code, variant = PLAN_VARIANT) {
  return planApi(`${variant.apiBase}/access`, 'POST', { code });
}

/**
 * Message « je signale / je propose » attaché à un lieu : un commentaire de contexte
 * (`context_comments`, `context_type` `zone` ou `marker`). Réutiliser cette table plutôt que
 * d'inventer une boîte de réception met le message **sous le lieu concerné**, là où un
 * administrateur le retrouve avec son contexte — et lui donne d'emblée la modération, les
 * photos et le signalement déjà en place.
 */
export async function submitPlaceSuggestion({ contextType, contextId, body }, variant) {
  return planApi(
    '/api/context-comments',
    'POST',
    { contextType, contextId, body },
    variant?.getToken,
  );
}

/**
 * Coquille d'accueil du plan des personnels : titre et disponibilité du code, servis avant
 * toute authentification. Le plan public n'en a pas besoin — sa charge est publique.
 */
export async function fetchPlanShellSettings(variant = PLAN_VARIANT) {
  return planApi(`${variant.apiBase}/settings`);
}

/**
 * Compteur d'usage anonyme du plan (`POST /api/usage`) — l'envoi lui-même est partagé par les
 * trois produits depuis le lot 8 (`src/shared/usage/reportUsage.js`).
 * @param {string} event événement de la liste blanche produit (`lib/usage.js`).
 * @param {string} [key] clé libre bornée (identifiant de lieu, terme cherché…).
 */
export function reportPlanUsage(event, key = '', variant = PLAN_VARIANT) {
  reportUsage(variant.usageProduct, event, key, withAppBase);
}
