/**
 * Boucle fetch JSON + retry partagée entre `api()` (ForetMap) et `apiGL()` (GL).
 *
 * Ce module ne connaît AUCUN produit : le jeton, la réaction au 401 et la
 * construction du message d'erreur HTTP sont injectés par l'adaptateur
 * (`src/services/api.js` ou `src/gl/services/apiGL.js`). Il compose avec la
 * politique de retry / détection passerelle de `src/services/apiTransport.js`
 * (délais, statuts transitoires, parsing des corps) sans la dupliquer.
 *
 * Isolement produit (interdit ici) : stores de session (`foretmap_session`,
 * `gl_session`), événements produits (`foretmap_teacher_expired`, …) et
 * getters de jeton restent dans les adaptateurs.
 */
import {
  API_FETCH_TIMEOUT_MS,
  assertJsonApiBody,
  isGatewayStyleResponse,
  parseApiBody,
  resolveMaxAttempts,
  resolveTransientRetryDelayMs,
  shouldRetryAfterHttpError,
  shouldRetryAfterNetworkError,
  sleepMs,
  transientRetryDelayMs,
} from '../services/apiTransport.js';
import { emitAppStatus } from './appStatusEvents.js';

/** Message utilisateur commun aux deux produits quand la requête dépasse le timeout. */
export const REQUEST_TIMEOUT_USER_MESSAGE = 'Délai d’attente dépassé pour la requête réseau.';

let retryStatusSeq = 0;

/**
 * Publie l'état de reconnexion d'UNE requête vers le bandeau sticky
 * (`AppStatusSticky`). Aucun événement n'est émis tant qu'aucun réessai n'a eu
 * lieu : le trafic nominal reste silencieux.
 */
function createRetryStatusReporter() {
  let id = null;
  return {
    retrying(attempt, maxAttempts) {
      if (!id) id = `api-retry-${++retryStatusSeq}`;
      emitAppStatus({
        id,
        kind: 'retrying',
        message: 'Serveur momentanément indisponible — reconnexion en cours…',
        attempt: Math.min(attempt + 2, maxAttempts),
        maxAttempts,
      });
    },
    resolveOk() {
      if (!id) return;
      emitAppStatus({ id, kind: 'recovered', message: 'Connexion au serveur rétablie ✓' });
    },
    resolveFailed() {
      // L'erreur finale est affichée par l'appelant (toast / formulaire) :
      // on retire seulement l'indicateur « reconnexion en cours ».
      if (!id) return;
      emitAppStatus({ id, kind: 'clear' });
    },
  };
}

/**
 * Exécute une requête JSON avec retries (réseau + passerelle 502/503/504).
 *
 * @param {string} path chemin API (résolu via `resolveUrl`)
 * @param {{ method?: string, body?: any }} [request]
 * @param {object} [options] crochets injectés par produit :
 * @param {(path: string) => string} [options.resolveUrl] résolution d'URL (ex: `withAppBase`)
 * @param {() => string|null} [options.getToken] getter de jeton produit (jamais partagé)
 * @param {(err: Error) => Error|null|undefined} [options.onNetworkError]
 *   mapping produit de l'erreur réseau finale (après épuisement des retries) ;
 *   retourne l'Error à lever, ou null/undefined pour relancer l'erreur brute
 * @param {(ctx: { res: Response, errBody: object, token: string|null }) => void} [options.onUnauthorized]
 *   appelé sur tout 401 non réessayé ; peut lever une erreur produit
 *   (compte supprimé, session expirée…) ou se limiter à des effets de bord
 * @param {(ctx: { res: Response, errBody: object, token: string|null, sawGatewayResponse: boolean }) => Error} options.buildHttpError
 *   construit l'Error produit pour toute réponse HTTP non-ok non réessayée
 * @returns {Promise<any>} corps JSON parsé (ou null pour 204/205)
 */
export async function fetchJsonWithRetry(path, request = {}, options = {}) {
  const retryStatus = createRetryStatusReporter();
  try {
    const result = await runFetchJsonLoop(path, request, options, retryStatus);
    retryStatus.resolveOk();
    return result;
  } catch (err) {
    retryStatus.resolveFailed();
    throw err;
  }
}

async function runFetchJsonLoop(path, { method = 'GET', body } = {}, options = {}, retryStatus) {
  const {
    resolveUrl = (p) => p,
    getToken = () => null,
    onNetworkError,
    onUnauthorized,
    buildHttpError,
  } = options;

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const token = getToken() || null;
  if (token) headers.Authorization = `Bearer ${token}`;
  const maxAttempts = resolveMaxAttempts(method, body);
  // Ne pas utiliser `body ? …` : `0` ou `false` seraient omis à tort ; `{}` reste un corps JSON valide.
  const hasBody = body !== undefined && body !== null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_FETCH_TIMEOUT_MS);
    let res;
    let sawGatewayResponse = false;
    try {
      res = await fetch(resolveUrl(path), {
        method,
        headers,
        body: hasBody ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err?.name === 'AbortError') {
        throw new Error(REQUEST_TIMEOUT_USER_MESSAGE);
      }
      if (
        shouldRetryAfterNetworkError(method, body, attempt, maxAttempts) &&
        err instanceof TypeError
      ) {
        retryStatus.retrying(attempt, maxAttempts);
        await sleepMs(transientRetryDelayMs(attempt));
        continue;
      }
      if (typeof onNetworkError === 'function') {
        const mapped = onNetworkError(err);
        if (mapped) throw mapped;
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    if (res.ok) {
      const okBody = await parseApiBody(res);
      assertJsonApiBody(okBody, { ok: true });
      return okBody;
    }

    const errBody = (await parseApiBody(res)) || {};
    if (isGatewayStyleResponse(res, errBody)) {
      sawGatewayResponse = true;
    }

    if (shouldRetryAfterHttpError(method, body, res, errBody, attempt, maxAttempts)) {
      retryStatus.retrying(attempt, maxAttempts);
      await sleepMs(resolveTransientRetryDelayMs(attempt, res));
      continue;
    }

    if (res.status === 401 && typeof onUnauthorized === 'function') {
      onUnauthorized({ res, errBody, token });
    }

    throw buildHttpError({ res, errBody, token, sawGatewayResponse });
  }

  throw new Error('Erreur serveur');
}
