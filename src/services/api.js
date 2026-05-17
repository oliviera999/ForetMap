import {
  safeLocalStorageGetItem,
  safeLocalStorageRemoveItem,
} from '../utils/browserStorage.js';

/**
 * Préfixe de base de l'app (Vite `base`) sans slash final.
 *
 * Pourquoi:
 * - En déploiement "sous-dossier" (ex: https://domaine.tld/foretmap/),
 *   les appels absolus "/api/..." pointent vers la racine du domaine et
 *   peuvent être réécrits vers l'accueil (symptôme: retour page d'accueil sans message).
 * - `import.meta.env.BASE_URL` est toujours suffixé par "/".
 */
export const API = String(import.meta.env.BASE_URL || '/').replace(/\/+$/, '');

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
  return err.name === 'QuotaExceededError'
    || err.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || err.code === 22
    || err.code === 1014;
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

export function getAuthToken() {
  try {
    const raw = safeLocalStorageGetItem(SESSION_KEY, null);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.token) return parsed.token;
    }
  } catch (_) {}
  return safeLocalStorageGetItem('foretmap_auth_token', null) || safeLocalStorageGetItem('foretmap_teacher_token', null);
}

export function getStoredSession() {
  try {
    const raw = safeLocalStorageGetItem(SESSION_KEY, null);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  const token = safeLocalStorageGetItem('foretmap_auth_token', null) || safeLocalStorageGetItem('foretmap_teacher_token', null);
  const studentRaw = safeLocalStorageGetItem(LEGACY_STUDENT_KEY, null);
  let student = null;
  try { student = studentRaw ? JSON.parse(studentRaw) : null; } catch (_) {}
  if (!token && !student) return null;
  return {
    token: token || null,
    user: student ? {
      id: student.id,
      userType: 'student',
      displayName: student.pseudo || `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Utilisateur',
      email: student.email || null,
      avatar_path: student.avatar_path ?? student.avatarPath ?? null,
    } : null,
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

async function parseApiBody(res) {
  if (!res || res.status === 204 || res.status === 205) return null;
  const contentType = String(res.headers?.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/json')) {
    return res.json().catch(() => null);
  }
  const text = await res.text().catch(() => '');
  return text ? { raw: text } : null;
}

const API_FETCH_TIMEOUT_MS = 40000;

/** Réponses « passerelle / origine temporairement indisponible » — réessai GET idempotent côté client. */
const TRANSIENT_HTTP_STATUSES = new Set([502, 503, 504]);

function transientGetRetryDelayMs(attemptIndex) {
  const bases = [400, 1200, 2800];
  const base = bases[Math.min(attemptIndex, bases.length - 1)];
  return base + Math.floor(Math.random() * 250);
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Message navigateur (Chrome « Failed to fetch », Firefox « NetworkError… », etc.) */
export function isLikelyNetworkTransportFailure(err) {
  if (!err) return false;
  if (err.name === 'AbortError') return false;
  const msg = String(err.message || err || '').toLowerCase();
  if (err instanceof TypeError && typeof fetch !== 'undefined') {
    return (
      msg.includes('failed to fetch')
      || msg.includes('networkerror')
      || msg.includes('network request failed')
      || msg.includes('chargement')
      || msg.includes('load failed')
    );
  }
  return (
    msg.includes('failed to fetch')
    || msg.includes('networkerror when attempting to fetch')
    || msg.includes('network request failed')
  );
}

function networkFailureUserMessage() {
  // En build prod, ne pas afficher les consignes « Vite + port 3000 » (inadaptées sur serveur distant).
  if (import.meta.env.DEV) {
    return (
      'Impossible de contacter le serveur. En développement local, lancez l’API sur le port 3000 '
      + '(`npm run dev` à la racine du projet) en parallèle du client Vite (`npm run dev:client`), '
      + 'puis ouvrez l’URL affichée par Vite (souvent http://localhost:5173). '
      + 'Sans l’API, toute inscription ou connexion échoue ainsi.'
    );
  }
  return (
    'Impossible de contacter le serveur. Vérifiez votre connexion, rechargez la page ou réessayez plus tard. '
    + 'Si le problème continue, le site peut être en maintenance ou la passerelle réseau indisponible : '
    + 'contactez l’administrateur de la plateforme.'
  );
}

function isIdempotentGet(method, body) {
  return String(method || 'GET').toUpperCase() === 'GET' && (body === undefined || body === null);
}

export async function api(path, method = 'GET', body) {
  const headers = { 'Content-Type': 'application/json' };
  const authToken = getAuthToken();
  if (authToken) headers.Authorization = 'Bearer ' + authToken;
  const allowTransientRetry = isIdempotentGet(method, body);
  const maxAttempts = allowTransientRetry ? 4 : 1;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_FETCH_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(withAppBase(path), {
        method,
        headers,
        // Ne pas utiliser `body ? …` : `0` ou `false` seraient omis à tort ; `{}` reste un corps JSON valide.
        body: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      const isAbort = err && err.name === 'AbortError';
      if (isAbort) {
        throw new Error('Délai d’attente dépassé pour la requête réseau.');
      }
      if (allowTransientRetry && !isAbort && err instanceof TypeError && attempt < maxAttempts - 1) {
        await sleepMs(transientGetRetryDelayMs(attempt));
        continue;
      }
      if (isLikelyNetworkTransportFailure(err)) {
        throw new Error(networkFailureUserMessage());
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    if (res.ok) {
      return parseApiBody(res);
    }

    if (allowTransientRetry && TRANSIENT_HTTP_STATUSES.has(res.status) && attempt < maxAttempts - 1) {
      await sleepMs(transientGetRetryDelayMs(attempt));
      continue;
    }

    const errBody = (await parseApiBody(res)) || {};
    if (res.status === 401 && errBody.deleted) throw new AccountDeletedError();
    if (res.status === 401 && authToken) {
      const errText = String(errBody.error || '').toLowerCase();
      const sessionExpired =
        errText.includes('token invalide')
        || errText.includes('expiré')
        || errText.includes('expired')
        || errBody.code === 'jwt_expired';
      if (sessionExpired) {
        clearStoredSession();
        window.dispatchEvent(new CustomEvent('foretmap_teacher_expired'));
      }
    }
    const reqId = (typeof res.headers?.get === 'function' && (res.headers.get('X-Request-Id') || res.headers.get('x-request-id'))) || '';
    let errMsg = typeof errBody.error === 'string' && errBody.error.trim() ? errBody.error.trim() : '';
    if (!errMsg) {
      if (errBody.raw != null && String(errBody.raw).length > 0) {
        errMsg = res.status >= 500
          ? `Le serveur a répondu par une page ou un texte inattendu (HTTP ${res.status}), pas par du JSON — souvent une mauvaise URL d’API, un proxy ou une panne temporaire.`
          : `Réponse inattendue du serveur (HTTP ${res.status}).`;
      } else {
        errMsg = res.status >= 500 ? `Erreur serveur (HTTP ${res.status})` : `Erreur (HTTP ${res.status})`;
      }
    }
    if (errBody.debugDetail && typeof errBody.debugDetail === 'string') {
      errMsg = `${errMsg} — ${errBody.debugDetail}`;
    }
    if (reqId) {
      errMsg = `${errMsg} [requête ${reqId}]`;
    }
    const ex = new Error(errMsg);
    ex.status = res.status;
    ex.body = errBody;
    if (reqId) ex.requestId = reqId;
    if (res.status === 429) ex.rateLimited = true;
    throw ex;
  }

  throw new Error('Erreur serveur');
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
