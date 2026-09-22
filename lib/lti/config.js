'use strict';

/**
 * Secrets LTI 1.3 lus dans `.env` (section 21.5 : jamais un réglage admin, I-9).
 *
 * Aucune variable n'est obligatoire au démarrage. Sans elles, les routes `/api/lti/*`
 * répondent `503 { error: 'Entrée depuis le cours non configurée' }`.
 *
 * Sur cPanel / nodevenv, une PEM dans `LTI_TOOL_PRIVATE_KEY` casse souvent l'`export`
 * shell (retours à la ligne / `\n`). Préférer `LTI_TOOL_PRIVATE_KEY_FILE` (chemin vers
 * un fichier PEM hors webroot) ou `LTI_TOOL_PRIVATE_KEY_B64` (PEM entière en base64).
 */

const fs = require('fs');
const path = require('path');

const NOT_CONFIGURED_MESSAGE = 'Entrée depuis le cours non configurée';
const PROVIDER = 'lti';

function trim(value) {
  return String(value ?? '').trim();
}

/**
 * Normalise une PEM collée depuis cPanel / un panneau d'env : guillemets conservés
 * dans la valeur, et séquences littérales `\n` (deux caractères) au lieu de vrais
 * retours à la ligne — sinon `importPKCS8` échoue (« Invalid character »).
 */
function normalizeToolPrivateKey(value) {
  let raw = String(value ?? '').trim();
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1).trim();
  }
  if (raw.includes('\\n')) {
    raw = raw.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
  }
  return raw.trim();
}

function normalizeUrl(value) {
  const raw = trim(value);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    return url.toString().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

/**
 * Charge la clé privée outil : fichier > base64 > variable PEM (dans cet ordre).
 * @returns {{ pem: string, source: 'file'|'b64'|'env'|'', error: string|null }}
 */
function loadToolPrivateKey(env = process.env) {
  const filePath = trim(env.LTI_TOOL_PRIVATE_KEY_FILE);
  if (filePath) {
    const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    try {
      const pem = normalizeToolPrivateKey(fs.readFileSync(resolved, 'utf8'));
      if (!pem) return { pem: '', source: 'file', error: `Fichier clé LTI vide : ${resolved}` };
      return { pem, source: 'file', error: null };
    } catch (err) {
      return {
        pem: '',
        source: 'file',
        error: `Lecture LTI_TOOL_PRIVATE_KEY_FILE impossible (${resolved}) : ${err.message}`,
      };
    }
  }

  const b64 = trim(env.LTI_TOOL_PRIVATE_KEY_B64);
  if (b64) {
    try {
      const decoded = Buffer.from(b64, 'base64').toString('utf8');
      const pem = normalizeToolPrivateKey(decoded);
      if (!pem.startsWith('-----BEGIN ')) {
        return {
          pem: '',
          source: 'b64',
          error: 'LTI_TOOL_PRIVATE_KEY_B64 ne décode pas une PEM PKCS#8',
        };
      }
      return { pem, source: 'b64', error: null };
    } catch (err) {
      return {
        pem: '',
        source: 'b64',
        error: `LTI_TOOL_PRIVATE_KEY_B64 invalide : ${err.message}`,
      };
    }
  }

  const fromEnv = normalizeToolPrivateKey(env.LTI_TOOL_PRIVATE_KEY);
  if (!fromEnv) return { pem: '', source: '', error: null };
  return { pem: fromEnv, source: 'env', error: null };
}

function readLtiEnv(env = process.env) {
  const issuer = normalizeUrl(env.LTI_ISSUER);
  const clientId = trim(env.LTI_CLIENT_ID);
  const deploymentId = trim(env.LTI_DEPLOYMENT_ID);
  const platformAuthUrl = normalizeUrl(env.LTI_PLATFORM_AUTH_URL);
  const platformJwksUrl = normalizeUrl(env.LTI_PLATFORM_JWKS_URL);
  const key = loadToolPrivateKey(env);
  const toolPrivateKey = key.pem;
  const toolKid = trim(env.LTI_TOOL_KID) || 'foretmap-lti';
  const configured = Boolean(
    issuer && clientId && deploymentId && platformAuthUrl && platformJwksUrl && toolPrivateKey,
  );
  return {
    issuer,
    clientId,
    deploymentId,
    platformAuthUrl,
    platformJwksUrl,
    toolPrivateKey,
    toolPrivateKeySource: key.source,
    toolPrivateKeyError: key.error,
    toolKid,
    configured,
  };
}

function notConfiguredError() {
  const err = new Error(NOT_CONFIGURED_MESSAGE);
  err.status = 503;
  err.code = 'LTI_NOT_CONFIGURED';
  return err;
}

module.exports = {
  PROVIDER,
  NOT_CONFIGURED_MESSAGE,
  readLtiEnv,
  normalizeToolPrivateKey,
  loadToolPrivateKey,
  notConfiguredError,
};
