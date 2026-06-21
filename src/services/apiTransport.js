/**
 * Politique de retry et détection « passerelle » (502/503/504 HTML) partagée par api() et apiGL().
 */

export const API_FETCH_TIMEOUT_MS = 40000;

/** Réponses « passerelle / origine temporairement indisponible ». */
export const TRANSIENT_HTTP_STATUSES = new Set([502, 503, 504]);

const MAX_IDEMPOTENT_GET_ATTEMPTS = 4;
const MAX_GATEWAY_MUTATION_ATTEMPTS = 4;
/** Réessais réseau (TypeError) pour POST/PUT/PATCH/DELETE — hors GET idempotent. */
const MAX_MUTATION_NETWORK_ATTEMPTS = 3;

export function isHtmlLikeApiPayload(raw) {
  const s = String(raw || '')
    .trimStart()
    .toLowerCase();
  return s.startsWith('<!doctype') || s.startsWith('<html') || s.startsWith('<!');
}

/**
 * Réponse 502/503/504 typique d’un proxy / Passenger (HTML ou JSON de indisponibilité transitoire).
 * Les 503 JSON métier (forum désactivé, etc.) ne sont pas considérés comme passerelle.
 */
export function isGatewayStyleResponse(res, parsedBody) {
  const status = res?.status ?? 0;
  if (!TRANSIENT_HTTP_STATUSES.has(status)) return false;
  const ct = String(
    res.headers?.get?.('content-type') || res.headers?.get?.('Content-Type') || '',
  ).toLowerCase();
  if (parsedBody?.error && typeof parsedBody.error === 'string') {
    const code = String(parsedBody.code || '').trim();
    if (code === 'SERVICE_RESTARTING' || code === 'SERVICE_NOT_READY') return true;
    if (ct.includes('application/json')) return false;
  }
  if (ct.includes('application/json')) return false;
  return ct.includes('text/html') || isHtmlLikeApiPayload(parsedBody?.raw);
}

export function isIdempotentGet(method, body) {
  return String(method || 'GET').toUpperCase() === 'GET' && (body === undefined || body === null);
}

export function resolveMaxAttempts(method, body) {
  if (isIdempotentGet(method, body)) return MAX_IDEMPOTENT_GET_ATTEMPTS;
  return MAX_GATEWAY_MUTATION_ATTEMPTS;
}

export function shouldRetryAfterNetworkError(method, body, attempt, maxAttempts) {
  if (attempt >= maxAttempts - 1) return false;
  if (isIdempotentGet(method, body)) return true;
  const mutationMax = Math.min(MAX_MUTATION_NETWORK_ATTEMPTS, maxAttempts);
  return attempt < mutationMax - 1;
}

export function shouldRetryAfterHttpError(method, body, res, parsedBody, attempt, maxAttempts) {
  if (attempt >= maxAttempts - 1) return false;
  if (isIdempotentGet(method, body)) {
    return TRANSIENT_HTTP_STATUSES.has(res.status);
  }
  return isGatewayStyleResponse(res, parsedBody);
}

export function transientRetryDelayMs(attemptIndex) {
  const bases = [400, 1200, 2800];
  const base = bases[Math.min(attemptIndex, bases.length - 1)];
  return base + Math.floor(Math.random() * 250);
}

export function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function gatewayUnavailableUserMessage() {
  return 'Service momentanément indisponible (redémarrage ou surcharge réseau). Réessayez dans quelques secondes.';
}

/** Tente de parser un corps texte qui ressemble à du JSON (sans en-tête Content-Type). */
export function tryParseJsonText(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed || !(trimmed.startsWith('{') || trimmed.startsWith('['))) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed != null && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

export function isParsedApiJsonObject(body) {
  if (body == null || typeof body !== 'object') return false;
  if (body.parseError || body.raw != null) return false;
  return true;
}

export function unexpectedApiBodyUserMessage({ ok, looksHtml } = {}) {
  if (looksHtml) {
    return ok
      ? 'Impossible de charger le contenu — le serveur a renvoyé une page HTML (vérifiez l’API / le proxy).'
      : 'Réponse serveur illisible — page HTML reçue à la place du JSON.';
  }
  return ok
    ? 'Impossible de charger le contenu — réponse serveur inattendue (JSON invalide). Réessayez ou contactez l’administrateur.'
    : 'Réponse serveur illisible (JSON invalide). Réessayez.';
}

export function normalizeApiErrorMessage(message, status) {
  const msg = String(message || '').trim();
  if (!msg) return msg;
  if (/unexpected token.*json|json.*position|not valid json|in json at/i.test(msg)) {
    return status >= 500
      ? 'Le serveur ou la passerelle a renvoyé une réponse illisible (JSON invalide). Réessayez plus tard ou contactez l’administrateur.'
      : 'Requête ou réponse invalide. Rechargez la page puis réessayez.';
  }
  return msg;
}

export async function parseApiBody(res) {
  if (!res || res.status === 204 || res.status === 205) return null;
  const contentType = String(res.headers?.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/json')) {
    try {
      return await res.json();
    } catch (err) {
      return { raw: String(err?.message || 'JSON invalide'), parseError: true };
    }
  }
  const text = await res.text().catch(() => '');
  if (!text) return null;
  const parsed = tryParseJsonText(text);
  if (parsed != null) return parsed;
  return { raw: text };
}

export function assertJsonApiBody(body, { ok } = {}) {
  if (body == null) return;
  if (isParsedApiJsonObject(body)) return;
  const looksHtml = isHtmlLikeApiPayload(body.raw);
  throw new Error(unexpectedApiBodyUserMessage({ ok, looksHtml }));
}

/**
 * Construit le message d’erreur HTTP pour le client ForetMap.
 * @param {{ res: Response, errBody: object, authToken?: string|null, sawGatewayResponse?: boolean }} ctx
 */
export function buildApiHttpErrorMessage(ctx) {
  const { res, errBody, authToken, sawGatewayResponse } = ctx;
  const reqId =
    (typeof res.headers?.get === 'function' &&
      (res.headers.get('X-Request-Id') || res.headers.get('x-request-id'))) ||
    '';
  let errMsg =
    typeof errBody.error === 'string' && errBody.error.trim() ? errBody.error.trim() : '';
  if (res.status === 401 && !authToken && /^token requis$/i.test(errMsg)) {
    errMsg = 'Session locale incomplète : reconnecte-toi pour continuer.';
  }
  if (!errMsg) {
    if (errBody.parseError) {
      errMsg = normalizeApiErrorMessage(errBody.raw, res.status);
    } else if (errBody.raw != null && String(errBody.raw).length > 0) {
      const htmlLike = isHtmlLikeApiPayload(errBody.raw);
      if (htmlLike && res.status >= 500 && sawGatewayResponse) {
        errMsg = gatewayUnavailableUserMessage();
      } else if (htmlLike) {
        errMsg =
          res.status >= 500
            ? gatewayUnavailableUserMessage()
            : `Réponse inattendue du serveur (HTTP ${res.status}) — page HTML reçue à la place du JSON.`;
      } else {
        errMsg =
          res.status >= 500
            ? `Le serveur a répondu par une page ou un texte inattendu (HTTP ${res.status}), pas par du JSON — souvent une mauvaise URL d’API, un proxy ou une panne temporaire.`
            : `Réponse inattendue du serveur (HTTP ${res.status}).`;
      }
    } else {
      errMsg =
        res.status >= 500 ? `Erreur serveur (HTTP ${res.status})` : `Erreur (HTTP ${res.status})`;
    }
  }
  errMsg = normalizeApiErrorMessage(errMsg, res.status);
  if (errBody.debugDetail && typeof errBody.debugDetail === 'string') {
    errMsg = `${errMsg} — ${errBody.debugDetail}`;
  }
  if (reqId) {
    errMsg = `${errMsg} [requête ${reqId}]`;
  }
  return { errMsg, reqId };
}
