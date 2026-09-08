'use strict';

/**
 * Configuration du lien Moodle lue dans l'environnement (section 6.1 du chantier Moodle).
 *
 * Aucune variable n'est obligatoire (`lib/env.js` n'en fait pas une condition de démarrage) :
 * leur absence désactive proprement la fonctionnalité — les routes répondent
 * `503 { error: 'Intégration Moodle non configurée' }`. Le jeton reste ici et nulle part
 * ailleurs (I-9) : jamais en base, ni en réglage, ni en journal, ni en réponse d'API.
 */

const DEFAULT_TIMEOUT_MS = 20000;
const PROVIDER = 'moodle';
const NOT_CONFIGURED_MESSAGE = 'Intégration Moodle non configurée';

function normalizeBaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let url;
  try {
    url = new URL(raw);
  } catch {
    return '';
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
  // Sans barre oblique finale, ni chemin parasite : l'issuer est l'origine du site (+ chemin
  // d'installation si Moodle vit dans un sous-dossier).
  const pathname = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${pathname}`;
}

function parseTimeout(value) {
  const n = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(n) || n < 1000 || n > 300000) return DEFAULT_TIMEOUT_MS;
  return n;
}

/**
 * Lit la configuration. `env` est injectable pour les tests.
 * @returns {{ baseUrl: string, token: string, timeoutMs: number, killSwitchOff: boolean, configured: boolean }}
 */
function readMoodleEnv(env = process.env) {
  const baseUrl = normalizeBaseUrl(env.MOODLE_BASE_URL);
  const token = String(env.MOODLE_WS_TOKEN || '').trim();
  const timeoutMs = parseTimeout(env.MOODLE_WS_TIMEOUT_MS);
  const killSwitchOff = String(env.MOODLE_SYNC_ENABLED ?? '').trim() === '0';
  return {
    baseUrl,
    token,
    timeoutMs,
    killSwitchOff,
    configured: Boolean(baseUrl && token) && !killSwitchOff,
  };
}

function isMoodleConfigured(env = process.env) {
  return readMoodleEnv(env).configured;
}

/** Issuer des identités externes : l'URL du site, telle que normalisée. */
function getMoodleIssuer(env = process.env) {
  return readMoodleEnv(env).baseUrl;
}

/** Erreur `503` prête pour `asyncHandler`. */
function notConfiguredError() {
  const error = new Error(NOT_CONFIGURED_MESSAGE);
  error.status = 503;
  error.code = 'MOODLE_NOT_CONFIGURED';
  return error;
}

module.exports = {
  PROVIDER,
  DEFAULT_TIMEOUT_MS,
  NOT_CONFIGURED_MESSAGE,
  normalizeBaseUrl,
  readMoodleEnv,
  isMoodleConfigured,
  getMoodleIssuer,
  notConfiguredError,
};
