import { dispatchGlSessionChanged } from './glSessionEvents.js';
import { GL_VOYAGEUR_GAIN_EVENT } from './glVoyageurEvents.js';
import { GL_EQUIPE_ETAT_EVENT, CODES_EQUIPE_ETAT } from './glEquipeEtatEvents.js';
import { withAppBase } from '../../shared/appBase.js';
import {
  buildApiHttpErrorMessage,
  gatewayUnavailableUserMessage,
} from '../../shared/apiTransport.js';
import { fetchJsonWithRetry } from '../../shared/fetchJsonWithRetry.js';
import { networkFailureMessageFor } from '../../shared/networkFailureMessages.js';
import { isGlStaffAuth } from '../utils/glStaffView.js';
import { sansIdRequete } from '../utils/glErreurTexte.js';
import { GL_PANNE_RESEAU_EQUIPE } from '../constants/glPanneReseau.js';

const GL_SESSION_KEY = 'gl_session';
/**
 * Session d'onglet : gardée dans `sessionStorage`, elle disparaît à la fermeture de l'onglet et
 * ne recouvre jamais la session d'un compte (`localStorage`, partagé entre onglets) — elle passe
 * seulement devant, le temps de l'onglet. Deux sessions vivent ainsi :
 * - la session d'équipe d'une tablette de classe (« Tenir à deux », lot 2) ;
 * - la session de projection (lien du vidéoprojecteur), souvent ouverte sur le poste même du
 *   prof : rangée avec son compte, elle le remplaçait dans tous ses onglets.
 * La clé garde son nom d'origine pour ne pas perdre les sessions d'équipe en cours.
 */
const GL_TEAM_SESSION_KEY = 'gl_team_session';

/** Session qui ne vaut que pour l'onglet (équipe ou projection), jamais pour le navigateur. */
function isTabSession(next) {
  return !!(next?.auth?.teamSession || next?.auth?.projection);
}

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
  // Une session d'onglet (nouvelle, ou en cours et simplement complétée) reste dans l'onglet.
  if (storage && (isTabSession(next) || (team && !next?.token))) {
    storage.setItem(GL_TEAM_SESSION_KEY, JSON.stringify({ ...(team || {}), ...(next || {}) }));
    dispatchGlSessionChanged();
    return;
  }
  // Une connexion avec un compte remplace la session d'onglet (équipe ou projection).
  if (team && storage) storage.removeItem(GL_TEAM_SESSION_KEY);
  const current = readFrom(localStorage, GL_SESSION_KEY) || {};
  const merged = { ...current, ...(next || {}) };
  localStorage.setItem(GL_SESSION_KEY, JSON.stringify(merged));
  dispatchGlSessionChanged();
}

export function clearGlSession() {
  const storage = tabStorage();
  // Quitter une session d'onglet (équipe, projection) ne déconnecte pas le compte éventuellement
  // ouvert derrière.
  if (storage && readTeamSession()) storage.removeItem(GL_TEAM_SESSION_KEY);
  else localStorage.removeItem(GL_SESSION_KEY);
  dispatchGlSessionChanged();
}

/**
 * Plusieurs appareils par équipe (ensemble unifié, M13) — **version d'état**. Chaque équipe en
 * partie porte un compteur qui avance à chaque geste. L'app retient la dernière version lue
 * (bloc `tenir.equipe` de l'état de la partie, ou `etatVersion` rendu par un geste) et la renvoie
 * avec le geste suivant (`X-GL-Etat-Version`). Périmée, le serveur refuse sans perte (409
 * `ETAT_PERIME`) et l'écran se recharge. Gardée en mémoire seulement, par partie.
 */
const etatVersions = new Map();
const EN_TETE_VERSION = 'X-GL-Etat-Version';
const CHEMIN_DE_PARTIE = /^\/api\/gl\/games\/(\d+)\//;

function noterEtatEquipe(etat) {
  const gameId = Number(etat?.gameId);
  const version = Number(etat?.version);
  if (!(gameId > 0) || !Number.isInteger(version) || version < 0) return;
  etatVersions.set(gameId, version);
}

/** Dernière version d'état connue pour une partie, ou `null`. */
export function getGlEtatVersion(gameId) {
  const version = etatVersions.get(Number(gameId));
  return version == null ? null : version;
}

/** Oublie les versions retenues (déconnexion, tests). */
export function resetGlEtatVersions() {
  etatVersions.clear();
}

function etatHeaders(path, method) {
  if (String(method || 'GET').toUpperCase() === 'GET') return undefined;
  const match = CHEMIN_DE_PARTIE.exec(String(path));
  const version = match ? getGlEtatVersion(match[1]) : null;
  return version == null ? undefined : { [EN_TETE_VERSION]: String(version) };
}

/**
 * Prévient les écrans qu'un geste a été refusé pour cause d'état périmé ou de main ailleurs.
 * Sur `ETAT_PERIME`, la version que le serveur rend est retenue : l'écran recharge, et le geste
 * suivant part de l'état courant. `silencieux` : la réponse à une question déjà à l'écran sera
 * renvoyée une fois (`utils/glReponseSansPerte.js`) — l'élève n'en voit rien.
 */
function announceEquipeEtat(errBody, { silencieux = false } = {}) {
  if (errBody?.code === 'ETAT_PERIME') noterEtatEquipe(errBody.etatVersion);
  if (silencieux && errBody?.code === 'ETAT_PERIME') return;
  if (!CODES_EQUIPE_ETAT.includes(errBody?.code) || typeof window === 'undefined') return;
  try {
    window.dispatchEvent(
      new CustomEvent(GL_EQUIPE_ETAT_EVENT, {
        detail: {
          code: errBody.code,
          message: errBody.error || '',
          gameId: Number(errBody.etatVersion?.gameId) || null,
        },
      }),
    );
  } catch (_) {
    // noop
  }
}

function glDevUnavailableMessage() {
  return 'Serveur indisponible — lancez l’API ForetMap (port 3000) ou vérifiez NODE_ENV et le fichier .env.';
}

/** Code d'une erreur levée parce que le serveur n'a pas pu être joint (panne réseau). */
export const GL_PANNE_RESEAU_CODE = 'GL_PANNE_RESEAU';

export { GL_PANNE_RESEAU_EQUIPE };

/**
 * Phrase affichée quand le serveur ne répond pas, après les nouvelles tentatives (écrans de
 * séance, K8) — à la place du « Failed to fetch » du navigateur. Selon la session : le prof
 * reçoit les pistes de diagnostic, l'élève une phrase courte au « tu », l'équipe la même au
 * « vous », le visiteur sans compte celle du redémarrage.
 * @param {{ session?: object|null, dev?: boolean }} [options] injectables pour les tests
 */
export function glNetworkFailureMessage({
  session = readSession(),
  dev = import.meta.env.DEV,
} = {}) {
  if (dev) return glDevUnavailableMessage();
  if (isTabSession(session)) return GL_PANNE_RESEAU_EQUIPE;
  return networkFailureMessageFor({
    staff: isGlStaffAuth(session?.auth),
    publicAudience: !session?.token,
  });
}

/** Erreur réseau G&L : phrase française, cause d'origine gardée pour le diagnostic. */
function glNetworkFailureError(cause) {
  const error = new Error(glNetworkFailureMessage(), { cause });
  error.code = GL_PANNE_RESEAU_CODE;
  error.network = true;
  return error;
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

export async function apiGL(path, method = 'GET', body = null, options = {}) {
  const payload = await apiGLRaw(path, method, body, getGlToken, options);
  // « +1 » immédiat (audit expérience joueur, S1) : un seul point d'écoute pour tous les
  // gestes qui font grandir le voyageur (acquis, première bonne réponse…).
  announceVoyageurGain(payload);
  // Version d'état de l'équipe : lue dans l'état de la partie, ou rendue par un geste.
  if (payload && typeof payload === 'object') {
    noterEtatEquipe(payload.etatVersion);
    noterEtatEquipe(payload.tenir?.equipe);
  }
  return payload;
}

/**
 * Lecture avec un jeton donné, sans toucher à la session de l'onglet : une tablette qui attend
 * d'être acceptée dans son équipe lit l'état de sa demande avec le jeton de cette demande.
 */
export async function apiGLAvecJeton(path, jeton) {
  return apiGLRaw(path, 'GET', null, () => jeton);
}

async function apiGLRaw(path, method, body, getToken = getGlToken, options = {}) {
  return fetchJsonWithRetry(
    path,
    { method, body, headers: etatHeaders(path, method) },
    {
      resolveUrl: withAppBase,
      getToken,
      onNetworkError: glNetworkFailureError,
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
        let requestId = '';
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
            requestId = built.reqId || '';
            // L'identifiant de requête sert au diagnostic : seul le prof le garde dans le
            // texte (la console le montre en petit) ; un élève ou une équipe ne le lit jamais.
            if (!isGlStaffAuth(readSession()?.auth)) message = sansIdRequete(message);
          }
        }
        const err = new Error(message);
        if (requestId) err.requestId = requestId;
        err.status = res.status;
        err.body = errBody;
        err.code = errBody.code || null;
        announceEquipeEtat(errBody, { silencieux: options.perimeSilencieux === true });
        return err;
      },
    },
  );
}
