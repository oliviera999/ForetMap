import { withAppBase } from '../../shared/appBase.js';
import {
  buildApiHttpErrorMessage,
  gatewayUnavailableUserMessage,
} from '../../services/apiTransport.js';
import { fetchJsonWithRetry } from '../../shared/fetchJsonWithRetry.js';

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

/**
 * Adaptateur GL au-dessus de la boucle partagée `fetchJsonWithRetry`
 * (`src/shared/fetchJsonWithRetry.js`) : injecte le jeton GL, la purge de
 * `gl_session` + erreur `sessionExpired` sur 401 expiré, et les messages GL.
 */
export async function apiGL(path, method = 'GET', body = null) {
  return fetchJsonWithRetry(
    path,
    { method, body },
    {
      resolveUrl: withAppBase,
      getToken: getGlToken,
      onUnauthorized: ({ errBody, token }) => {
        if (!token) return;
        const errText = String(errBody.error || '').toLowerCase();
        // DÉRIVE historique (préservée) : contrairement à api() (ForetMap),
        // apiGL() ne reconnaît PAS le code structuré `jwt_expired` — seule la
        // formulation textuelle déclenche la purge. Ne pas aligner sans lot dédié.
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
      },
      buildHttpError: ({ res, errBody, token, sawGatewayResponse }) => {
        const contentType = String(res.headers.get('content-type') || '').toLowerCase();
        const isJson = contentType.includes('application/json');
        let message = typeof errBody.error === 'string' && errBody.error ? errBody.error : '';
        if (!message) {
          if (sawGatewayResponse || (res.status >= 500 && !isJson)) {
            message = import.meta.env.DEV
              ? glDevUnavailableMessage()
              : gatewayUnavailableUserMessage();
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
        return err;
      },
    },
  );
}
