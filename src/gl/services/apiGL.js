import { withAppBase } from '../../services/api.js';
import {
  API_FETCH_TIMEOUT_MS,
  assertJsonApiBody,
  buildApiHttpErrorMessage,
  gatewayUnavailableUserMessage,
  isGatewayStyleResponse,
  parseApiBody,
  resolveMaxAttempts,
  shouldRetryAfterHttpError,
  shouldRetryAfterNetworkError,
  sleepMs,
  transientRetryDelayMs,
} from '../../services/apiTransport.js';

const GL_SESSION_KEY = 'gl_session';

function readSession() {
  try {
    const raw = localStorage.getItem(GL_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export function getGlSession() {
  return readSession();
}

export function getGlToken() {
  return readSession()?.token || null;
}

export function saveGlSession(next) {
  const current = readSession() || {};
  const merged = { ...current, ...(next || {}) };
  localStorage.setItem(GL_SESSION_KEY, JSON.stringify(merged));
}

export function clearGlSession() {
  localStorage.removeItem(GL_SESSION_KEY);
}

function glDevUnavailableMessage() {
  return 'Serveur indisponible — lancez l’API ForetMap (port 3000) ou vérifiez NODE_ENV et le fichier .env.';
}

export async function apiGL(path, method = 'GET', body = null) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const token = getGlToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const maxAttempts = resolveMaxAttempts(method, body);
  const hasBody = body !== undefined && body !== null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_FETCH_TIMEOUT_MS);
    let res;
    let sawGatewayResponse = false;
    try {
      res = await fetch(withAppBase(path), {
        method,
        headers,
        body: hasBody ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err?.name === 'AbortError') {
        throw new Error('Délai d’attente dépassé pour la requête réseau.');
      }
      if (
        shouldRetryAfterNetworkError(method, body, attempt, maxAttempts) &&
        err instanceof TypeError
      ) {
        await sleepMs(transientRetryDelayMs(attempt));
        continue;
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
      await sleepMs(transientRetryDelayMs(attempt));
      continue;
    }

    if (res.status === 401 && token) {
      const errText = String(errBody.error || '').toLowerCase();
      const sessionExpired =
        errText.includes('token invalide') ||
        errText.includes('expiré') ||
        errText.includes('expired');
      if (sessionExpired) {
        clearGlSession();
        const expiredErr = new Error('Session expirée — reconnectez-vous à Gnomes & Licornes.');
        expiredErr.status = 401;
        expiredErr.body = errBody;
        expiredErr.sessionExpired = true;
        throw expiredErr;
      }
    }

    const contentType = String(res.headers.get('content-type') || '').toLowerCase();
    const isJson = contentType.includes('application/json');
    let message = typeof errBody.error === 'string' && errBody.error ? errBody.error : '';
    if (!message) {
      if (sawGatewayResponse || (res.status >= 500 && !isJson)) {
        message = import.meta.env.DEV ? glDevUnavailableMessage() : gatewayUnavailableUserMessage();
      } else {
        const built = buildApiHttpErrorMessage({
          res,
          errBody,
          authToken: token,
          sawGatewayResponse,
        });
        message = built.errMsg || `Erreur HTTP ${res.status}`;
      }
    }
    const err = new Error(message);
    err.status = res.status;
    err.body = errBody;
    throw err;
  }

  throw new Error('Erreur serveur');
}
