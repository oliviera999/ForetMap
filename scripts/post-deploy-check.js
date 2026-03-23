#!/usr/bin/env node
/**
 * Vérification post-déploiement ForetMap.
 *
 * Contrôles:
 * - GET /api/health (app up)
 * - GET /api/health/db (BDD up)
 * - GET /api/version (optionnel, mais recommandé)
 *
 * Usage:
 *   node scripts/post-deploy-check.js --base-url https://foretmap.olution.info
 *   node scripts/post-deploy-check.js --base-url http://localhost:3000 --timeout-ms 8000
 *   node scripts/post-deploy-check.js --base-url https://foretmap.olution.info --image-check-path /api/zones/zone_1/photos/1/data
 */

const { URL } = require('url');
const http = require('http');
const https = require('https');
const CHECK_USER_AGENT = 'ForetMap-DeployCheck/1.0';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--base-url') args.baseUrl = argv[i + 1];
    if (a === '--timeout-ms') args.timeoutMs = argv[i + 1];
    if (a === '--image-check-path') args.imageCheckPath = argv[i + 1];
  }
  return {
    baseUrl: args.baseUrl || process.env.DEPLOY_BASE_URL || 'http://localhost:3000',
    timeoutMs: Number.isFinite(parseInt(args.timeoutMs, 10)) ? parseInt(args.timeoutMs, 10) : 10000,
    imageCheckPath: args.imageCheckPath || process.env.DEPLOY_IMAGE_CHECK_PATH || '',
  };
}

function requestJsonWithTimeout(urlString, timeoutMs) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const client = url.protocol === 'https:' ? https : http;

    const req = client.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': CHECK_USER_AGENT,
        },
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          let body = {};
          try {
            body = raw ? JSON.parse(raw) : {};
          } catch (_) {
            body = {};
          }
          const status = typeof res.statusCode === 'number' ? res.statusCode : 0;
          resolve({
            ok: status >= 200 && status < 300,
            status,
            body,
            headers: res.headers || {},
          });
        });
      }
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`timeout après ${timeoutMs}ms`));
    });
    req.on('error', reject);
    req.end();
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(rawValue) {
  if (!rawValue) return 0;
  const asNumber = Number.parseInt(String(rawValue).trim(), 10);
  if (Number.isFinite(asNumber) && asNumber >= 0) return asNumber * 1000;
  const asDateMs = Date.parse(String(rawValue));
  if (Number.isFinite(asDateMs)) {
    const delta = asDateMs - Date.now();
    return delta > 0 ? delta : 0;
  }
  return 0;
}

async function requestJsonWithRetry(urlString, timeoutMs, maxAttempts = 3) {
  let last = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const out = await requestJsonWithTimeout(urlString, timeoutMs);
    last = out;
    if (out.status !== 429 || attempt >= maxAttempts) return out;
    const retryAfterHeader = out.headers && (out.headers['retry-after'] || out.headers['Retry-After']);
    const retryAfterMs = parseRetryAfterMs(retryAfterHeader);
    const backoffMs = Math.min(4000, 500 * attempt);
    await wait(retryAfterMs > 0 ? retryAfterMs : backoffMs);
  }
  return last;
}

async function checkEndpoint(baseUrl, path, timeoutMs, required = true) {
  const full = new URL(path, baseUrl).toString();
  try {
    const res = await requestJsonWithRetry(full, timeoutMs);
    const pass = res.ok;
    const label = pass ? 'OK' : 'FAIL';
    console.log(`${label} ${path} -> HTTP ${res.status}`);
    return {
      path,
      required,
      pass,
      status: res.status,
      body: res.body,
    };
  } catch (err) {
    console.log(`FAIL ${path} -> ${err.name || 'Error'}: ${err.message || err}`);
    return {
      path,
      required,
      pass: false,
      status: 0,
      body: { error: err.message || String(err) },
    };
  }
}

async function checkImageEndpoint(baseUrl, path, timeoutMs) {
  const full = new URL(path, baseUrl).toString();
  try {
    const res = await requestJsonWithRetry(full, timeoutMs);
    const pass = res.status === 200 || res.status === 404;
    const label = pass ? 'OK' : 'FAIL';
    console.log(`${label} ${path} -> HTTP ${res.status}${res.status === 404 ? ' (ressource absente, check optionnel)' : ''}`);
    return {
      path,
      required: false,
      pass,
      status: res.status,
      body: res.body,
    };
  } catch (err) {
    console.log(`FAIL ${path} -> ${err.name || 'Error'}: ${err.message || err}`);
    return {
      path,
      required: false,
      pass: false,
      status: 0,
      body: { error: err.message || String(err) },
    };
  }
}

async function main() {
  const { baseUrl, timeoutMs, imageCheckPath } = parseArgs(process.argv.slice(2));
  console.log(`[post-deploy-check] baseUrl=${baseUrl} timeoutMs=${timeoutMs}`);

  const checks = [
    await checkEndpoint(baseUrl, '/api/health', timeoutMs, true),
    await checkEndpoint(baseUrl, '/api/health/db', timeoutMs, true),
    await checkEndpoint(baseUrl, '/api/version', timeoutMs, false),
  ];
  if (imageCheckPath) {
    checks.push(await checkImageEndpoint(baseUrl, imageCheckPath, timeoutMs));
  }

  const requiredFails = checks.filter((c) => c.required && !c.pass);
  const optionalFails = checks.filter((c) => !c.required && !c.pass);

  if (requiredFails.length > 0) {
    console.log(`[post-deploy-check] ECHEC: ${requiredFails.length} contrôle(s) requis en erreur.`);
    process.exit(1);
  }

  if (optionalFails.length > 0) {
    console.log(`[post-deploy-check] PARTIEL: ${optionalFails.length} contrôle(s) optionnel(s) en erreur.`);
  } else {
    console.log('[post-deploy-check] SUCCES: contrôles requis OK.');
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[post-deploy-check] erreur fatale:', err.message || err);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  requestJsonWithTimeout,
  requestJsonWithRetry,
  parseRetryAfterMs,
  checkEndpoint,
  checkImageEndpoint,
};
