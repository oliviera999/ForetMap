'use strict';

/**
 * Client Web Services Moodle (REST, `moodlewsrestformat=json`) — section 7 du chantier Moodle.
 *
 * Un seul point d'entrée, `call(wsfunction, params, { timeoutMs, signal })`, et des
 * enveloppes nommées pour les fonctions de la section 7.2.
 *
 * Pièges couverts ici, à ne pas re-découvrir ailleurs :
 *  - **Moodle répond `HTTP 200` même en erreur** : le corps est alors un objet portant
 *    `exception`, `errorcode`, `message`. Détecté → `MoodleApiError` (jamais de réessai) ;
 *  - les paramètres structurés se sérialisent en `cohortids[0]=12`,
 *    `members[0][groupid]=7` : `encodeMoodleParams` est testé unitairement ;
 *  - réessai (1 s, 4 s) **uniquement** sur erreur réseau / `HTTP 5xx` ;
 *  - lots de 100 identifiants, **en série** (serveur mutualisé) ;
 *  - **aucun secret dans les journaux** : on logge `wsfunction`, la taille du lot, la durée et
 *    `errorcode` — jamais le corps de la requête.
 */

const logger = require('../logger');
const { nodeHttpFetch } = require('../nodeHttpFetch');
const { readMoodleEnv } = require('./config');

const BATCH_SIZE = 100;
const RETRY_DELAYS_MS = Object.freeze([1000, 4000]);

class MoodleApiError extends Error {
  constructor(wsfunction, body) {
    const errorcode = String(body?.errorcode || 'unknown');
    super(`Moodle ${wsfunction}: ${errorcode}${body?.message ? ` — ${body.message}` : ''}`);
    this.name = 'MoodleApiError';
    this.wsfunction = wsfunction;
    this.errorcode = errorcode;
    this.exception = body?.exception ? String(body.exception) : null;
    this.moodleMessage = body?.message ? String(body.message) : null;
    this.debuginfo = body?.debuginfo ? String(body.debuginfo) : null;
    this.retryable = false;
    this.status = 502;
    this.expose = true;
    this.code = 'MOODLE_API';
  }
}

class MoodleTransportError extends Error {
  constructor(wsfunction, message, { status = null, cause = null } = {}) {
    super(`Moodle ${wsfunction}: ${message}`);
    this.name = 'MoodleTransportError';
    this.wsfunction = wsfunction;
    this.upstreamStatus = status;
    this.status = 502;
    this.expose = true;
    this.code = 'MOODLE_TRANSPORT';
    this.cause = cause;
    this.retryable = true;
  }
}

function isWasmMemoryError(error) {
  const message = String(error?.message || error || '');
  return /WebAssembly|Cannot allocate Wasm memory/i.test(message);
}

function describeFetchFailure(error) {
  if (error?.name === 'AbortError') return 'délai dépassé';
  if (isWasmMemoryError(error)) {
    return 'mémoire Wasm insuffisante (limite CloudLinux) — transport http natif requis';
  }
  return 'erreur réseau';
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Aplatit un objet de paramètres au format Moodle :
 * `{ cohortids: [12, 13] }` → `[['cohortids[0]', '12'], ['cohortids[1]', '13']]`,
 * `{ members: [{ groupid: 7, userid: 42 }] }` → `members[0][groupid]=7`, `members[0][userid]=42`.
 * Les `null` / `undefined` sont omis ; les booléens deviennent `1` / `0`.
 */
function encodeMoodleParams(params, prefix = '', out = []) {
  if (params == null) return out;
  if (Array.isArray(params)) {
    params.forEach((item, index) => encodeMoodleParams(item, `${prefix}[${index}]`, out));
    return out;
  }
  if (isPlainObject(params)) {
    for (const [key, value] of Object.entries(params)) {
      const nextPrefix = prefix ? `${prefix}[${key}]` : key;
      encodeMoodleParams(value, nextPrefix, out);
    }
    return out;
  }
  if (!prefix) throw new TypeError('encodeMoodleParams attend un objet à la racine');
  if (typeof params === 'boolean') out.push([prefix, params ? '1' : '0']);
  else out.push([prefix, String(params)]);
  return out;
}

function toFormBody(pairs) {
  const body = new URLSearchParams();
  for (const [key, value] of pairs) body.append(key, value);
  return body;
}

function isMoodleErrorBody(body) {
  return isPlainObject(body) && ('exception' in body || 'errorcode' in body);
}

function chunk(items, size = BATCH_SIZE) {
  const list = Array.isArray(items) ? items : [];
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {object} options
 * @param {string} options.baseUrl `https://olution.info`, sans barre oblique finale
 * @param {string} options.token jeton Web Services
 * @param {number} [options.timeoutMs]
 * @param {Function} [options.fetchImpl] `fetch` injectable (tests). Défaut : `nodeHttpFetch`
 *   (`http`/`https` natifs) — pas `globalThis.fetch` / undici, qui instancie un Wasm llhttp
 *   et explose en OOM sur CloudLinux (espace d'adressage 4 Gio).
 * @param {number[]} [options.retryDelaysMs] délais de réessai (tests : `[]` ou `[0, 0]`)
 * @param {object} [options.log] logger Pino-compatible
 */
function createMoodleClient({
  baseUrl,
  token,
  timeoutMs = 20000,
  fetchImpl = nodeHttpFetch,
  retryDelaysMs = RETRY_DELAYS_MS,
  log = logger,
} = {}) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  if (!base) throw new Error('createMoodleClient : baseUrl manquant');
  if (!token) throw new Error('createMoodleClient : jeton manquant');
  if (typeof fetchImpl !== 'function') throw new Error('createMoodleClient : fetch indisponible');
  const endpoint = `${base}/webservice/rest/server.php`;

  async function once(wsfunction, params, { timeoutMs: callTimeout, signal } = {}) {
    const pairs = [
      ['wstoken', token],
      ['wsfunction', wsfunction],
      ['moodlewsrestformat', 'json'],
      ...encodeMoodleParams(params || {}),
    ];
    const controller = new AbortController();
    const effectiveTimeout = Number(callTimeout) > 0 ? Number(callTimeout) : timeoutMs;
    const timer = setTimeout(() => controller.abort(), effectiveTimeout);
    if (typeof timer.unref === 'function') timer.unref();
    const onOuterAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', onOuterAbort, { once: true });
    }
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: toFormBody(pairs),
        signal: controller.signal,
      });
    } catch (error) {
      throw new MoodleTransportError(wsfunction, describeFetchFailure(error), {
        cause: error,
      });
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onOuterAbort);
    }
    if (response.status >= 500) {
      throw new MoodleTransportError(wsfunction, `HTTP ${response.status}`, {
        status: response.status,
      });
    }
    let body = null;
    const text = await response.text();
    if (text.trim()) {
      try {
        body = JSON.parse(text);
      } catch {
        const error = new MoodleTransportError(wsfunction, 'réponse non JSON', {
          status: response.status,
        });
        error.retryable = false;
        throw error;
      }
    }
    if (isMoodleErrorBody(body)) throw new MoodleApiError(wsfunction, body);
    if (response.status >= 400) {
      const error = new MoodleTransportError(wsfunction, `HTTP ${response.status}`, {
        status: response.status,
      });
      error.retryable = false;
      throw error;
    }
    return body;
  }

  /**
   * Appel avec réessai borné sur erreur réseau / 5xx. Une `MoodleApiError` (jeton invalide,
   * capacité manquante…) est un problème de configuration : renvoyée telle quelle, sans réessai.
   */
  async function call(wsfunction, params = {}, options = {}) {
    const startedAt = Date.now();
    const batchSize = countBatchItems(params);
    let attempt = 0;
    for (;;) {
      try {
        const result = await once(wsfunction, params, options);
        log.debug(
          { wsfunction, batchSize, durationMs: Date.now() - startedAt, attempt },
          'Appel Moodle réussi',
        );
        return result;
      } catch (error) {
        const canRetry = error?.retryable === true && attempt < retryDelaysMs.length;
        log[canRetry ? 'warn' : 'error'](
          {
            wsfunction,
            batchSize,
            durationMs: Date.now() - startedAt,
            attempt,
            errorcode: error?.errorcode || null,
            status: error?.upstreamStatus ?? null,
            retry: canRetry,
          },
          canRetry ? 'Appel Moodle en échec, nouvel essai' : 'Appel Moodle en échec',
        );
        if (!canRetry) throw error;
        await sleep(retryDelaysMs[attempt]);
        attempt += 1;
      }
    }
  }

  function countBatchItems(params) {
    if (!isPlainObject(params)) return 0;
    let max = 0;
    for (const value of Object.values(params)) {
      if (Array.isArray(value)) max = Math.max(max, value.length);
    }
    return max;
  }

  /** Appelle `fn(lot)` pour chaque tranche de 100 identifiants, en série, et concatène. */
  async function inBatches(items, fn) {
    const out = [];
    for (const batch of chunk(items)) {
      const result = await fn(batch);
      if (Array.isArray(result)) out.push(...result);
      else if (result != null) out.push(result);
    }
    return out;
  }

  // --- Lecture -------------------------------------------------------------------------------

  const siteInfo = () => call('core_webservice_get_site_info');

  const getCohorts = (cohortIds = []) =>
    call('core_cohort_get_cohorts', cohortIds.length ? { cohortids: cohortIds } : {});

  const searchCohorts = (query = '', { limitnum = 500 } = {}) =>
    call('core_cohort_search_cohorts', {
      query,
      context: { contextid: 1 },
      includes: 'all',
      limitfrom: 0,
      limitnum,
    });

  /** `[{ cohortid, userids: [] }]`, tous lots confondus. */
  const getCohortMembers = (cohortIds) =>
    inBatches(cohortIds, (batch) => call('core_cohort_get_cohort_members', { cohortids: batch }));

  /** Détails utilisateurs par identifiant, par lots de 100 (`field: 'id'`). */
  const getUsersByIds = (userIds) =>
    inBatches(userIds, (batch) =>
      call('core_user_get_users_by_field', { field: 'id', values: batch.map(String) }),
    );

  /** `{ courses: [...] }` → tableau de cours. */
  const getCoursesByIds = async (courseIds) => {
    const ids = [...new Set((courseIds || []).map((id) => Number(id)).filter(Number.isFinite))];
    if (!ids.length) return [];
    const result = await call('core_course_get_courses_by_field', {
      field: 'ids',
      value: ids.join(','),
    });
    return Array.isArray(result?.courses) ? result.courses : [];
  };

  const getCourseGroups = (courseId) =>
    call('core_group_get_course_groups', { courseid: Number(courseId) });

  /** `[{ groupid, userids: [] }]`. */
  const getGroupMembers = (groupIds) =>
    inBatches(groupIds, (batch) => call('core_group_get_group_members', { groupids: batch }));

  const getEnrolledUsers = (courseId) =>
    call('core_enrol_get_enrolled_users', { courseid: Number(courseId) });

  // --- Écriture (bornée par I-7 : l'appelant vérifie le préfixe `FM#` / la politique) ----------

  const createGroups = (groups) => call('core_group_create_groups', { groups });
  const updateGroups = (groups) => call('core_group_update_groups', { groups });
  const deleteGroups = (groupIds) => call('core_group_delete_groups', { groupids: groupIds });
  const addGroupMembers = (members) =>
    inBatches(members, (batch) => call('core_group_add_group_members', { members: batch }));
  const deleteGroupMembers = (members) =>
    inBatches(members, (batch) => call('core_group_delete_group_members', { members: batch }));
  const addCohortMembers = (members) =>
    inBatches(members, (batch) =>
      call('core_cohort_add_cohort_members', {
        members: batch.map(({ cohortid, userid }) => ({
          cohorttype: { type: 'id', value: String(cohortid) },
          usertype: { type: 'id', value: String(userid) },
        })),
      }),
    );
  const deleteCohortMembers = (members) =>
    inBatches(members, (batch) => call('core_cohort_delete_cohort_members', { members: batch }));

  return {
    endpoint,
    baseUrl: base,
    call,
    siteInfo,
    getCohorts,
    searchCohorts,
    getCohortMembers,
    getUsersByIds,
    getCoursesByIds,
    getCourseGroups,
    getGroupMembers,
    getEnrolledUsers,
    createGroups,
    updateGroups,
    deleteGroups,
    addGroupMembers,
    deleteGroupMembers,
    addCohortMembers,
    deleteCohortMembers,
  };
}

/** Client depuis `.env`, ou `null` si la configuration est absente / coupée. */
function createMoodleClientFromEnv(env = process.env, overrides = {}) {
  const cfg = readMoodleEnv(env);
  if (!cfg.configured) return null;
  return createMoodleClient({
    baseUrl: cfg.baseUrl,
    token: cfg.token,
    timeoutMs: cfg.timeoutMs,
    ...overrides,
  });
}

module.exports = {
  BATCH_SIZE,
  RETRY_DELAYS_MS,
  MoodleApiError,
  MoodleTransportError,
  isWasmMemoryError,
  describeFetchFailure,
  encodeMoodleParams,
  isMoodleErrorBody,
  chunk,
  createMoodleClient,
  createMoodleClientFromEnv,
};
