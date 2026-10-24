import {
  safeLocalStorageGetItem,
  safeLocalStorageRemoveItem,
} from '../shared/platform/browserStorage.js';
import { buildApiHttpErrorMessage } from '../shared/apiTransport.js';
import { fetchJsonWithRetry } from '../shared/fetchJsonWithRetry.js';
// `API` et `withAppBase` ont été extraits vers le module partagé neutre
// `src/shared/appBase.js` (purs, sans session). On les ré-exporte ici pour
// préserver la compatibilité des importateurs ForetMap existants.
import { API, withAppBase } from '../shared/appBase.js';
import { configureReachabilityProbe } from '../shared/networkStatus.js';
import {
  PASSWORD_CHANGE_REQUIRED_CODE,
  PASSWORD_CHANGE_REQUIRED_EVENT,
} from '../utils/passwordChangeRequired.js';

export { API, withAppBase };

configureReachabilityProbe(withAppBase('/api/health'));

/**
 * Seul emplacement du jeton de session (audit RGPD du 28/09/2026, S-5). Les anciennes clés
 * (`foretmap_auth_token`, `foretmap_teacher_token`, `foretmap_student`) dupliquaient le jeton
 * trois fois : elles ne sont plus écrites, seulement lues une fois pour migrer une session
 * ouverte avant la mise à jour, puis effacées.
 */
const SESSION_KEY = 'foretmap_session';
const LEGACY_STUDENT_KEY = 'foretmap_student';
const LEGACY_TOKEN_KEYS = ['foretmap_auth_token', 'foretmap_teacher_token'];

const STUDENT_SESSION_FIELDS = [
  'id',
  'first_name',
  'last_name',
  'pseudo',
  'email',
  'avatar_path',
  'avatarPath',
  // URL signée de l'avatar par défaut (serveur) : reprise au rechargement, renouvelée par la
  // validation de session.
  'default_avatar_url',
  'authToken',
  'taskEnrollment',
  'forumParticipate',
  'forum_participate',
  'contextCommentParticipate',
  'context_comment_participate',
  'preview_mode',
  'display_name',
  'user_type',
];

const STUDENT_AUTH_FIELDS = [
  'canonicalUserId',
  'userId',
  'userType',
  'roleDisplayName',
  'roleSlug',
  'permissions',
  'nativePrivileged',
  'impersonating',
];

function isQuotaExceededError(err) {
  if (!err) return false;
  return (
    err.name === 'QuotaExceededError' ||
    err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    err.code === 22 ||
    err.code === 1014
  );
}

function safeSetLocalStorageItem(key, value, { allowDropLegacyStudent = true } = {}) {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    if (!isQuotaExceededError(err)) return false;
    if (allowDropLegacyStudent && key !== LEGACY_STUDENT_KEY) {
      try {
        safeLocalStorageRemoveItem(LEGACY_STUDENT_KEY);
        localStorage.setItem(key, value);
        return true;
      } catch (_) {
        return false;
      }
    }
    return false;
  }
}

export function compactStudentForStorage(student) {
  if (!student || typeof student !== 'object') return null;
  const compact = {};
  for (const field of STUDENT_SESSION_FIELDS) {
    if (student[field] !== undefined) compact[field] = student[field];
  }
  if (student.auth && typeof student.auth === 'object') {
    const authCompact = {};
    for (const field of STUDENT_AUTH_FIELDS) {
      if (student.auth[field] !== undefined) authCompact[field] = student.auth[field];
    }
    if (Object.keys(authCompact).length > 0) compact.auth = authCompact;
  }
  return compact;
}

function dispatchSessionChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('foretmap_session_changed'));
}

export class AccountDeletedError extends Error {
  constructor() {
    super('Compte supprimé');
    this.deleted = true;
  }
}

function decodeJwtPayload(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json);
  } catch (_) {
    return null;
  }
}

function readLegacyStudentSnapshot() {
  try {
    const raw = safeLocalStorageGetItem(LEGACY_STUDENT_KEY, null);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function pickStoredToken(value) {
  const token = typeof value === 'string' ? value.trim() : '';
  return token || null;
}

function getLegacyStudentToken(student = readLegacyStudentSnapshot()) {
  if (!student || typeof student !== 'object') return null;
  return pickStoredToken(student.authToken);
}

/**
 * Choisit le jeton le plus récent entre un jeton proposé (réponse de connexion, prise de
 * contrôle…) et le jeton courant de la session, en comparant leur `iat` (CDG-28) : un
 * renouvellement glissant (`refreshedToken`) ne doit jamais être écrasé par le jeton
 * d'origine encore porté par `student.authToken`. Sans `iat` lisible des deux côtés, le
 * jeton proposé l'emporte (il vient d'être émis par le serveur).
 */
export function pickNewestAuthToken(candidate, current) {
  const next = pickStoredToken(candidate);
  const cur = pickStoredToken(current);
  if (!next) return cur;
  if (!cur || next === cur) return next;
  const nextIat = Number(decodeJwtPayload(next)?.iat);
  const curIat = Number(decodeJwtPayload(cur)?.iat);
  if (Number.isFinite(nextIat) && Number.isFinite(curIat) && curIat > nextIat) return cur;
  return next;
}

function hasLegacySessionKeys() {
  return (
    safeLocalStorageGetItem(LEGACY_STUDENT_KEY, null) != null ||
    LEGACY_TOKEN_KEYS.some((key) => safeLocalStorageGetItem(key, null) != null)
  );
}

function removeLegacySessionKeys() {
  safeLocalStorageRemoveItem(LEGACY_STUDENT_KEY);
  for (const key of LEGACY_TOKEN_KEYS) safeLocalStorageRemoveItem(key);
}

function readRawSession() {
  try {
    const raw = safeLocalStorageGetItem(SESSION_KEY, null);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

function buildSessionFromLegacyKeys() {
  const student = readLegacyStudentSnapshot();
  const token =
    pickStoredToken(safeLocalStorageGetItem('foretmap_auth_token', null)) ||
    getLegacyStudentToken(student) ||
    pickStoredToken(safeLocalStorageGetItem('foretmap_teacher_token', null));
  if (!token && !student) return null;
  return {
    token: token || null,
    user: student
      ? {
          id: student.id,
          userType: 'student',
          displayName:
            student.pseudo ||
            `${student.first_name || ''} ${student.last_name || ''}`.trim() ||
            'Utilisateur',
          email: student.email || null,
          avatar_path: student.avatar_path ?? student.avatarPath ?? null,
        }
      : null,
    student: student || null,
  };
}

/** Le jeton n'est rangé qu'une fois (`session.token`), jamais recopié dans la fiche élève. */
function toPersistedSession(session) {
  if (!session || typeof session !== 'object') return session;
  if (!session.student || typeof session.student !== 'object') return session;
  const { authToken: _dropped, ...student } = session.student;
  return { ...session, student };
}

/**
 * Migration douce : une session ouverte avant la clé unique est recopiée dans
 * `foretmap_session` (si celle-ci n'a pas déjà de jeton), puis les anciennes clés sont
 * effacées. Sans effet quand il n'y a plus rien à migrer.
 */
export function migrateLegacySessionStorage() {
  if (!hasLegacySessionKeys()) return false;
  const current = readRawSession();
  if (!pickStoredToken(current?.token)) {
    const legacy = buildSessionFromLegacyKeys();
    if (legacy) {
      const merged = { ...legacy, ...(current || {}), token: legacy.token };
      if (!current?.student && legacy.student) merged.student = legacy.student;
      if (
        !safeSetLocalStorageItem(SESSION_KEY, JSON.stringify(toPersistedSession(merged)), {
          allowDropLegacyStudent: false,
        })
      ) {
        return false;
      }
    }
  } else {
    const persisted = toPersistedSession(current);
    if (persisted !== current) safeSetLocalStorageItem(SESSION_KEY, JSON.stringify(persisted));
  }
  removeLegacySessionKeys();
  return true;
}

export function getAuthToken() {
  migrateLegacySessionStorage();
  return pickStoredToken(readRawSession()?.token);
}

/**
 * Session stockée. La fiche élève renvoyée porte `authToken` (recopié depuis `token`) pour
 * les appelants qui le lisent là, sans que le jeton soit stocké deux fois.
 */
export function getStoredSession() {
  migrateLegacySessionStorage();
  const session = readRawSession();
  if (!session) return null;
  const token = pickStoredToken(session.token);
  if (token && session.student && typeof session.student === 'object') {
    return { ...session, student: { ...session.student, authToken: token } };
  }
  return session;
}

export function saveStoredSession(next) {
  const current = getStoredSession() || {};
  const merged = { ...current, ...(next || {}) };
  // Une session enseignant remplace toute session élève encore stockée (et inversement) :
  // sinon, au rechargement, `POST /api/students/register` partait avec un jeton prof → 403 et
  // toast « Connexion instable » à chaque chargement (CDG-29).
  if (
    next?.user?.userType === 'teacher' &&
    !Object.prototype.hasOwnProperty.call(next, 'student')
  ) {
    merged.student = null;
  }
  if (Object.prototype.hasOwnProperty.call(merged, 'student')) {
    merged.student = compactStudentForStorage(merged.student);
  }
  let persisted = toPersistedSession(merged);
  let writeOk = safeSetLocalStorageItem(SESSION_KEY, JSON.stringify(persisted));
  if (!writeOk && persisted.student) {
    // En cas de quota serré, garder au moins token + user.
    persisted = { ...persisted, student: null };
    writeOk = safeSetLocalStorageItem(SESSION_KEY, JSON.stringify(persisted), {
      allowDropLegacyStudent: false,
    });
  }
  if (!writeOk) return;
  removeLegacySessionKeys();
  dispatchSessionChanged();
}

/** Lectures publiques de la visite, gardées hors ligne même sans session. */
const PUBLIC_CACHED_API_RE = /\/api\/(?:maps|visit\/content)$/;

/**
 * Paramètre que le service worker ajoute à la clé d'une réponse lue AVEC un jeton
 * (`cacheKeyFor`, src/shared/pwa/swTemplate.js) : la copie appartient à un compte, même
 * pour la visite ou les cartes, dont la réponse dépend du lecteur (lieux réservés).
 */
const SW_ACCOUNT_PARTITION_PARAM = '__fm_sw_user';

/**
 * Retire du cache du service worker les réponses d'API liées à une session (tâches, fiches,
 * repères…). Sur une tablette partagée, elles restaient lisibles hors ligne par l'élève
 * suivant (audit du 25/09/2026, piste D). Les lectures publiques de la visite et les fichiers
 * statiques sont conservés — sauf leurs copies propres à un compte (`__fm_sw_user`, #553).
 * Meilleur effort : ne rejette jamais.
 * @returns {Promise<number>} nombre de réponses retirées
 */
export async function purgeCachedApiResponses() {
  try {
    if (typeof caches === 'undefined' || typeof caches.keys !== 'function') return 0;
    let removed = 0;
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        let url;
        try {
          url = new URL(request.url);
        } catch {
          continue;
        }
        if (!url.pathname.includes('/api/')) continue;
        const perAccount = url.searchParams.has(SW_ACCOUNT_PARTITION_PARAM);
        if (PUBLIC_CACHED_API_RE.test(url.pathname) && !perAccount) continue;
        if (await cache.delete(request)) removed += 1;
      }
    }
    return removed;
  } catch {
    return 0; // Cache Storage indisponible (navigation privée, contexte non sécurisé)
  }
}

export function clearStoredSession() {
  safeLocalStorageRemoveItem(SESSION_KEY);
  removeLegacySessionKeys();
  void purgeCachedApiResponses();
  dispatchSessionChanged();
}

export function getAuthClaims() {
  const token = getAuthToken();
  return token ? decodeJwtPayload(token) : null;
}

/**
 * Identifiant du compte connecté, ou chaîne vide. C'est la clé des files hors ligne
 * (`utils/offlineActionQueue.js`) : sur une tablette partagée, une écriture n'est rejouée que
 * sous le compte de son auteur.
 */
export function getAuthUserId() {
  const claims = getAuthClaims();
  const id = claims?.canonicalUserId ?? claims?.userId;
  return id == null ? '' : String(id);
}

/** Code porté par l'erreur (`err.code`) : distinguer la panne réseau sans lire le texte. */
export const NETWORK_FAILURE_CODE = 'NETWORK_UNREACHABLE';

/**
 * Panne de transport : erreur brute du navigateur (Chrome « Failed to fetch », Firefox
 * « NetworkError… », etc.) **ou** erreur déjà convertie par `api()` (`err.code`). Sans ce
 * second cas, la file hors ligne de la visite ne se déclenchait jamais : `api()` remplace le
 * message du navigateur par un texte pour l'élève (audit du 25/09/2026, piste D).
 */
export function isLikelyNetworkTransportFailure(err) {
  if (!err) return false;
  if (err.name === 'AbortError') return false;
  if (err.code === NETWORK_FAILURE_CODE) return true;
  if (err.offline === true) return true;
  // Délai dépassé sur un réseau qui n'est pas (encore) jugé inutilisable : une barre de réseau.
  if (err.timeout === true) return true;
  const msg = String(err.message || err || '').toLowerCase();
  if (err instanceof TypeError && typeof fetch !== 'undefined') {
    return (
      msg.includes('failed to fetch') ||
      msg.includes('networkerror') ||
      msg.includes('network request failed') ||
      msg.includes('chargement') ||
      msg.includes('load failed')
    );
  }
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror when attempting to fetch') ||
    msg.includes('network request failed')
  );
}

/**
 * Serveur injoignable, message pour un ÉLÈVE (audit du 25/09/2026, § 1.4.6) : court, tutoyé,
 * concret. L'ancien texte comptait 37 mots et parlait de « passerelle réseau » et
 * d'« administrateur de la plateforme » à des élèves de 11 ans sur le terrain.
 */
export const NETWORK_FAILURE_USER_MESSAGE =
  'Pas de réseau pour l’instant. Réessaie dans un moment ; si ça dure, préviens ton professeur.';

/**
 * Même situation, pour un compte personnel (prof, admin) : c'est lui qu'on prévient, il
 * reçoit donc les pistes de diagnostic que le message élève ne porte plus.
 */
export const NETWORK_FAILURE_STAFF_MESSAGE =
  'Pas de réseau pour l’instant : le serveur ne répond pas. Réessayez dans un moment ; si ça ' +
  'dure, vérifiez la connexion de l’établissement — le site peut aussi être en maintenance.';

/** Compte personnel (`userType: 'teacher'`, prof comme admin) ; élève ou visiteur sinon. */
function isStaffSession() {
  return getAuthClaims()?.userType === 'teacher';
}

/**
 * Texte affiché quand le serveur ne répond pas, après épuisement des nouvelles tentatives.
 * @param {{ dev?: boolean, staff?: boolean }} [options] injectables pour les tests
 */
export function networkFailureUserMessage({
  dev = import.meta.env.DEV,
  staff = isStaffSession(),
} = {}) {
  // En build prod, ne pas afficher les consignes « Vite + port 3000 » (inadaptées sur serveur distant).
  if (dev) {
    return (
      'Impossible de contacter le serveur. En développement local, lancez l’API sur le port 3000 ' +
      '(`npm run dev` à la racine du projet) en parallèle du client Vite (`npm run dev:client`), ' +
      'puis ouvrez l’URL affichée par Vite (souvent http://localhost:5173). ' +
      'Sans l’API, toute inscription ou connexion échoue ainsi.'
    );
  }
  return staff ? NETWORK_FAILURE_STAFF_MESSAGE : NETWORK_FAILURE_USER_MESSAGE;
}

/**
 * Erreur levée par `api()` sur panne réseau. Le message reste court ; le détail technique
 * (erreur d'origine du navigateur, causes possibles) voyage sur l'erreur elle-même —
 * `err.code`, `err.detail`, `err.cause` — pour un diagnostic ou un futur panneau d'aide.
 * @param {unknown} cause erreur brute de `fetch` (`TypeError: Failed to fetch`…)
 * @param {{ dev?: boolean, staff?: boolean }} [options]
 */
export function createNetworkFailureError(cause, options) {
  const error = new Error(networkFailureUserMessage(options), { cause });
  error.code = NETWORK_FAILURE_CODE;
  const origin = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause ?? '');
  error.detail =
    `Serveur injoignable après les nouvelles tentatives (${origin || 'erreur réseau'}). ` +
    'Causes possibles : réseau coupé, site en maintenance, passerelle réseau indisponible.';
  return error;
}

/**
 * En-tête qui demande au service worker de garder aussi la réponse dans sa copie « sortie
 * terrain », conservée d'une mise à jour de l'application à l'autre (`fieldTripPrep.js`).
 */
export const TERRAIN_COPY_HEADER = 'X-Foretmap-Terrain';
let terrainCaptureDepth = 0;

/**
 * Pendant `fn`, toutes les lectures de l'API sont aussi copiées pour la sortie terrain :
 * « Préparer la sortie terrain » relance simplement le chargement normal des données sous ce
 * mode, sans recopier ici les adresses exactes qu'utilise chaque écran.
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withTerrainCapture(fn) {
  terrainCaptureDepth += 1;
  try {
    return await fn();
  } finally {
    terrainCaptureDepth -= 1;
  }
}

/**
 * Adaptateur ForetMap au-dessus de la boucle partagée `fetchJsonWithRetry`
 * (`src/shared/fetchJsonWithRetry.js`) : injecte le jeton ForetMap, la
 * déconnexion locale + l'événement `foretmap_teacher_expired` sur session
 * expirée, et le format d'erreur ForetMap (requestId, rateLimited).
 *
 * @param {{ headers?: Record<string, string> }} [requestOptions] en-têtes supplémentaires
 *   (ex. `X-Foretmap-Queued-At` des écritures rejouées depuis une file hors ligne)
 */
export async function api(path, method = 'GET', body, requestOptions = {}) {
  const terrain = terrainCaptureDepth > 0 && String(method).toUpperCase() === 'GET';
  return fetchJsonWithRetry(
    path,
    {
      method,
      body,
      headers: {
        ...(terrain ? { [TERRAIN_COPY_HEADER]: '1' } : {}),
        ...(requestOptions?.headers || {}),
      },
    },
    {
      resolveUrl: withAppBase,
      getToken: getAuthToken,
      onNetworkError: (err) =>
        isLikelyNetworkTransportFailure(err) ? createNetworkFailureError(err) : null,
      onUnauthorized: ({ errBody, token }) => {
        const deleted = !!errBody.deleted;
        const errText = String(errBody.error || '').toLowerCase();
        const sessionRevoked =
          deleted ||
          // Compte supprimé, désactivé ou mot de passe changé (`middleware/requireTeacher.js`).
          errBody.code === 'SESSION_REVOKED' ||
          errText.includes('token invalide') ||
          errText.includes('expiré') ||
          errText.includes('expired') ||
          // DÉRIVE historique (préservée) : ForetMap reconnaît aussi le code
          // structuré `jwt_expired`, contrairement à apiGL() qui ne se fie
          // qu'au texte du message. Ne pas aligner sans lot dédié.
          errBody.code === 'jwt_expired';
        if (token && sessionRevoked) {
          // Fermeture de la session côté client (élève comme prof) : `useSessionWindowSync`
          // écoute cet événement et passe par `forceLogout` (CDG-27).
          clearStoredSession();
          window.dispatchEvent(
            new CustomEvent('foretmap_teacher_expired', {
              detail: { deleted, reason: errBody.reason || null },
            }),
          );
        }
        if (deleted) throw new AccountDeletedError();
      },
      buildHttpError: ({ res, errBody, token, sawGatewayResponse }) => {
        const { errMsg, reqId } = buildApiHttpErrorMessage({
          res,
          errBody,
          authToken: token,
          sawGatewayResponse,
        });
        const ex = new Error(errMsg);
        ex.status = res.status;
        ex.body = errBody;
        if (reqId) ex.requestId = reqId;
        if (res.status === 429) ex.rateLimited = true;
        if (res.status === 403 && errBody.code === PASSWORD_CHANGE_REQUIRED_CODE) {
          // Mot de passe provisoire ou compromis à changer : la session n'est pas close (elle
          // sert au changement), mais le shell ouvre « Mon profil » (`usePasswordChangeRequired`).
          ex.code = PASSWORD_CHANGE_REQUIRED_CODE;
          window.dispatchEvent(new CustomEvent(PASSWORD_CHANGE_REQUIRED_EVENT));
        }
        return ex;
      },
    },
  );
}

export async function listContextComments({ contextType, contextId, page = 1, pageSize = 10 }) {
  const qs = new URLSearchParams({
    contextType: String(contextType || ''),
    contextId: String(contextId || ''),
    page: String(page),
    page_size: String(pageSize),
  });
  return api(`/api/context-comments?${qs.toString()}`);
}

/**
 * Résumé groupé (total + newestId) pour une liste de contextes.
 * @param {{ contextType: string, contextIds: Array<string|number> }} opts
 */
export async function getContextCommentCounts({ contextType, contextIds }) {
  const ids = (Array.isArray(contextIds) ? contextIds : [])
    .map((id) => String(id ?? '').trim())
    .filter(Boolean);
  const qs = new URLSearchParams({
    contextType: String(contextType || ''),
    contextIds: ids.join(','),
  });
  return api(`/api/context-comments/counts?${qs.toString()}`);
}

export async function createContextComment({ contextType, contextId, body, images }) {
  const payload = { contextType, contextId };
  if (body !== undefined && body !== null && String(body).length > 0) payload.body = body;
  if (Array.isArray(images) && images.length > 0) payload.images = images;
  return api('/api/context-comments', 'POST', payload);
}

export async function deleteContextComment(commentId) {
  return api(`/api/context-comments/${encodeURIComponent(commentId)}`, 'DELETE');
}

export async function reportContextComment(commentId, reason) {
  return api(`/api/context-comments/${encodeURIComponent(commentId)}/report`, 'POST', { reason });
}

export async function toggleForumPostReaction(postId, emoji) {
  return api(`/api/forum/posts/${encodeURIComponent(postId)}/reactions`, 'POST', { emoji });
}

export async function toggleContextCommentReaction(commentId, emoji) {
  return api(`/api/context-comments/${encodeURIComponent(commentId)}/reactions`, 'POST', { emoji });
}
