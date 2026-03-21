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
 */

const { URL } = require('url');
const http = require('http');
const https = require('https');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--base-url') args.baseUrl = argv[i + 1];
    if (a === '--timeout-ms') args.timeoutMs = argv[i + 1];
  }
  return {
    baseUrl: args.baseUrl || process.env.DEPLOY_BASE_URL || 'http://localhost:3000',
    timeoutMs: Number.isFinite(parseInt(args.timeoutMs, 10)) ? parseInt(args.timeoutMs, 10) : 10000,
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
        headers: { Accept: 'application/json' },
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
          resolve({ ok: status >= 200 && status < 300, status, body });
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

async function checkEndpoint(baseUrl, path, timeoutMs, required = true) {
  const full = new URL(path, baseUrl).toString();
  try {
    const res = await requestJsonWithTimeout(full, timeoutMs);
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

async function main() {
  const { baseUrl, timeoutMs } = parseArgs(process.argv.slice(2));
  console.log(`[post-deploy-check] baseUrl=${baseUrl} timeoutMs=${timeoutMs}`);

  const checks = [
    await checkEndpoint(baseUrl, '/api/health', timeoutMs, true),
    await checkEndpoint(baseUrl, '/api/health/db', timeoutMs, true),
    await checkEndpoint(baseUrl, '/api/version', timeoutMs, false),
  ];

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

module.exports = { parseArgs, requestJsonWithTimeout, checkEndpoint };
