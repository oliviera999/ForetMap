import { safeLocalStorageGetItem, safeLocalStorageRemoveItem } from '../utils/browserStorage.js';
import { buildApiHttpErrorMessage } from './apiTransport.js';
import { fetchJsonWithRetry } from '../shared/fetchJsonWithRetry.js';

/**
 * Préfixe de base de l'app (Vite `base`) sans slash final.
 *
 * Pourquoi:
 * - En déploiement "sous-dossier" (ex: https://domaine.tld/foretmap/),
 *   les appels absolus "/api/..." pointent vers la racine du domaine et
 *   peuvent être réécrits vers l'accueil (symptôme: retour page d'accueil sans message).
 * - `import.meta.env.BASE_URL` est toujours suffixé par "/".
 */
export const API = String(import.meta.env?.BASE_URL || '/').replace(/\/+$/, '');

export function withAppBase(path) {
  const raw = String(path || '');
  if (!raw) return API || '/';
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  const normalized = raw.startsWith('/') ? raw : `/${raw}`;
  // Quand API === '' (base '/'), on retombe sur une URL absolue classique.
  return `${API}${normalized}` || normalized;
}
const SESSION_KEY = 'foretmap_session';
const LEGACY_STUDENT_KEY = 'foretmap_student';

const STUDENT_SESSION_FIELDS = [
  'id',
  'first_name',
  'last_name',
  'pseudo',
  'email',
  'avatar_path',
  'avatarPath',
  'authToken',
  'elevationStudentToken',
  'affiliation',
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
  'elevatedPermissions',
  'elevated',
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

export function saveLegacyStudentSnapshot(student) {
  const compact = compactStudentForStorage(student);
  if (!compact) {
    safeLocalStorageRemoveItem(LEGACY_STUDENT_KEY);
    return true;
  }
  return safeSetLocalStorageItem(LEGACY_STUDENT_KEY, JSON.stringify(compact), {
    allowDropLegacyStudent: false,
  });
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
  return pickStoredToken(student.authToken) || pickStoredToken(student.elevationStudentToken);
}

export function getAuthToken() {
  try {
    const raw = safeLocalStorageGetItem(SESSION_KEY, null);
    if (raw) {
      const parsed = JSON.parse(raw);
      const token = pickStoredToken(parsed?.token);
      if (token) return token;
    }
  } catch (_) {}
  return (
    pickStoredToken(safeLocalStorageGetItem('foretmap_auth_token', null)) ||
    getLegacyStudentToken() ||
    pickStoredToken(safeLocalStorageGetItem('foretmap_teacher_token', null))
  );
}

export function getStoredSession() {
  try {
    const raw = safeLocalStorageGetItem(SESSION_KEY, null);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
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

export function saveStoredSession(next) {
  const current = getStoredSession() || {};
  const merged = { ...current, ...(next || {}) };
  if (Object.prototype.hasOwnProperty.call(merged, 'student')) {
    merged.student = compactStudentForStorage(merged.student);
  }
  let persisted = merged;
  let writeOk = safeSetLocalStorageItem(SESSION_KEY, JSON.stringify(persisted));
  if (!writeOk && persisted.student) {
    // En cas de quota serré, garder au moins token + user.
    persisted = { ...persisted, student: null };
    writeOk = safeSetLocalStorageItem(SESSION_KEY, JSON.stringify(persisted), {
      allowDropLegacyStudent: false,
    });
  }
  if (!writeOk) return;
  if (persisted.student) saveLegacyStudentSnapshot(persisted.student);
  else safeLocalStorageRemoveItem(LEGACY_STUDENT_KEY);
  dispatchSessionChanged();
}

export function clearStoredSession() {
  safeLocalStorageRemoveItem(SESSION_KEY);
  safeLocalStorageRemoveItem('foretmap_auth_token');
  safeLocalStorageRemoveItem('foretmap_teacher_token');
  safeLocalStorageRemoveItem(LEGACY_STUDENT_KEY);
  dispatchSessionChanged();
}

export function getAuthClaims() {
  const token = getAuthToken();
  return token ? decodeJwtPayload(token) : null;
}

/** Indique si le JWT ForetMap porte le flag `elevated` (droits étendus après PIN). */
export function isElevatedJwt(token) {
  return !!decodeJwtPayload(token)?.elevated;
}

/** Message navigateur (Chrome « Failed to fetch », Firefox « NetworkError… », etc.) */
export function isLikelyNetworkTransportFailure(err) {
  if (!err) return false;
  if (err.name === 'AbortError') return false;
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

function networkFailureUserMessage() {
  // En build prod, ne pas afficher les consignes « Vite + port 3000 » (inadaptées sur serveur distant).
  if (import.meta.env.DEV) {
    return (
      'Impossible de contacter le serveur. En développement local, lancez l’API sur le port 3000 ' +
      '(`npm run dev` à la racine du projet) en parallèle du client Vite (`npm run dev:client`), ' +
      'puis ouvrez l’URL affichée par Vite (souvent http://localhost:5173). ' +
      'Sans l’API, toute inscription ou connexion échoue ainsi.'
    );
  }
  return (
    'Impossible de contacter le serveur. Vérifiez votre connexion, rechargez la page ou réessayez plus tard. ' +
    'Si le problème continue, le site peut être en maintenance ou la passerelle réseau indisponible : ' +
    'contactez l’administrateur de la plateforme.'
  );
}

/**
 * Adaptateur ForetMap au-dessus de la boucle partagée `fetchJsonWithRetry`
 * (`src/shared/fetchJsonWithRetry.js`) : injecte le jeton ForetMap, la
 * déconnexion locale + l'événement `foretmap_teacher_expired` sur session
 * expirée, et le format d'erreur ForetMap (requestId, rateLimited).
 */
export async function api(path, method = 'GET', body) {
  return fetchJsonWithRetry(
    path,
    { method, body },
    {
      resolveUrl: withAppBase,
      getToken: getAuthToken,
      onNetworkError: (err) =>
        isLikelyNetworkTransportFailure(err) ? new Error(networkFailureUserMessage()) : null,
      onUnauthorized: ({ errBody, token }) => {
        if (errBody.deleted) throw new AccountDeletedError();
        if (!token) return;
        const errText = String(errBody.error || '').toLowerCase();
        const sessionExpired =
          errText.includes('token invalide') ||
          errText.includes('expiré') ||
          errText.includes('expired') ||
          // DÉRIVE historique (préservée) : ForetMap reconnaît aussi le code
          // structuré `jwt_expired`, contrairement à apiGL() qui ne se fie
          // qu'au texte du message. Ne pas aligner sans lot dédié.
          errBody.code === 'jwt_expired';
        if (sessionExpired) {
          clearStoredSession();
          window.dispatchEvent(new CustomEvent('foretmap_teacher_expired'));
        }
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
