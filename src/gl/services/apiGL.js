import { dispatchGlSessionChanged } from './glSessionEvents.js';
import { GL_VOYAGEUR_GAIN_EVENT } from './glVoyageurEvents.js';
import { withAppBase } from '../../shared/appBase.js';
import {
  buildApiHttpErrorMessage,
  gatewayUnavailableUserMessage,
} from '../../shared/apiTransport.js';
import { fetchJsonWithRetry } from '../../shared/fetchJsonWithRetry.js';

const GL_SESSION_KEY = 'gl_session';
/**
 * Session d'équipe d'une tablette de classe (« Tenir à deux », lot 2) : gardée dans
 * `sessionStorage`, elle disparaît à la fermeture de l'onglet et ne recouvre jamais la session
 * d'un compte (`localStorage`) — elle passe seulement devant, le temps de l'onglet.
 */
const GL_TEAM_SESSION_KEY = 'gl_team_session';

function readFrom(storage, key) {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function tabStorage() {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch (_) {
    return null;
  }
}

function readTeamSession() {
  const storage = tabStorage();
  return storage ? readFrom(storage, GL_TEAM_SESSION_KEY) : null;
}

function readSession() {
  return readTeamSession() || readFrom(localStorage, GL_SESSION_KEY);
}

export function getGlSession() {
  return readSession();
}

export function getGlToken() {
  return readSession()?.token || null;
}

export function saveGlSession(next) {
  const team = readTeamSession();
  const storage = tabStorage();
  // Une session d'équipe (nouvelle, ou en cours et simplement complétée) reste dans l'onglet.
  if (storage && (next?.auth?.teamSession || (team && !next?.token))) {
    storage.setItem(GL_TEAM_SESSION_KEY, JSON.stringify({ ...(team || {}), ...(next || {}) }));
    dispatchGlSessionChanged();
    return;
  }
  // Une connexion avec un compte remplace la session d'équipe de l'onglet.
  if (team && storage) storage.removeItem(GL_TEAM_SESSION_KEY);
  const current = readFrom(localStorage, GL_SESSION_KEY) || {};
  const merged = { ...current, ...(next || {}) };
  localStorage.setItem(GL_SESSION_KEY, JSON.stringify(merged));
  dispatchGlSessionChanged();
}

export function clearGlSession() {
  const storage = tabStorage();
  // Quitter une session d'équipe ne déconnecte pas le compte éventuellement ouvert derrière.
  if (storage && readTeamSession()) storage.removeItem(GL_TEAM_SESSION_KEY);
  else localStorage.removeItem(GL_SESSION_KEY);
  dispatchGlSessionChanged();
}

function glDevUnavailableMessage() {
  return 'Serveur indisponible — lancez l’API ForetMap (port 3000) ou vérifiez NODE_ENV et le fichier .env.';
}

/**
 * Adaptateur GL au-dessus de la boucle partagée `fetchJsonWithRetry`
 * (`src/shared/fetchJsonWithRetry.js`) : injecte le jeton GL, la purge de
 * `gl_session` + erreur `sessionExpired` sur 401 expiré, et les messages GL.
 */

function announceVoyageurGain(payload) {
  const gain = payload && typeof payload === 'object' ? payload.voyageurGain : null;
  if (!gain || typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(GL_VOYAGEUR_GAIN_EVENT, { detail: gain }));
  } catch (_) {
    // noop
  }
}

export async function apiGL(path, method = 'GET', body = null) {
  const payload = await apiGLRaw(path, method, body);
  // « +1 » immédiat (audit expérience joueur, S1) : un seul point d'écoute pour tous les
  // gestes qui font grandir le voyageur (acquis, première bonne réponse…).
  announceVoyageurGain(payload);
  return payload;
}

async function apiGLRaw(path, method, body) {
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
        // Session d'équipe terminée (déconnectée par le prof, lien régénéré, partie close) :
        // la tablette revient à l'accueil avec le message du serveur.
        if (errBody.code === 'TEAM_SESSION_TERMINEE') {
          clearGlSession();
          const endedErr = new Error(
            errBody.error || 'Cette tablette n’est plus connectée : scannez de nouveau le code.',
          );
          endedErr.status = 401;
          endedErr.body = errBody;
          endedErr.sessionExpired = true;
          endedErr.teamSessionEnded = true;
          throw endedErr;
        }
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
